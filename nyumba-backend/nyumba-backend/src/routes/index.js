const express = require('express');
const { body, param, query } = require('express-validator');
const rateLimit = require('express-rate-limit');

const { authenticate, authorize } = require('../middleware/auth');
const { validateRequest }         = require('../middleware/errorHandler');

const authController       = require('../controllers/authController');
const propertiesController = require('../controllers/propertiesController');
const paymentsController   = require('../controllers/paymentsController');
const complaintsController = require('../controllers/complaintsController');
const messagesController   = require('../controllers/messagesController');
const adminController      = require('../controllers/adminController');

const router = express.Router();

// ─── Rate limiters ─────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 10,
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 min
  max: 5,
  message: { error: 'Too many payment requests. Slow down.' },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
});

router.use(generalLimiter);

// ─── Health check ──────────────────────────────────────────────────────────
router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ─── Auth routes ───────────────────────────────────────────────────────────

router.post('/auth/register',
  authLimiter,
  [
    body('name').trim().isLength({ min: 2, max: 200 }).withMessage('Name must be 2–200 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('phone').matches(/^\+256[0-9]{9}$/).withMessage('Phone must be Uganda format: +256XXXXXXXXX'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').isIn(['landlord', 'tenant']).withMessage('Role must be landlord or tenant'),
    body('landlordCode').if(body('role').equals('tenant')).notEmpty().withMessage('Landlord code required for tenants'),
  ],
  validateRequest,
  authController.register
);

router.post('/auth/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validateRequest,
  authController.login
);

router.post('/auth/refresh',
  [body('refreshToken').notEmpty()],
  validateRequest,
  authController.refreshToken
);

router.post('/auth/logout',
  authenticate,
  authController.logout
);

router.get('/auth/me', authenticate, authController.getMe);

// ─── Properties routes ─────────────────────────────────────────────────────

router.get('/properties',
  authenticate,
  propertiesController.listProperties
);

router.get('/properties/:id',
  authenticate,
  param('id').isUUID(),
  validateRequest,
  propertiesController.getProperty
);

router.post('/properties',
  authenticate,
  authorize('landlord', 'admin'),
  [
    body('name').trim().notEmpty().withMessage('Property name required'),
    body('address').trim().notEmpty().withMessage('Address required'),
    body('monthlyRent').isInt({ min: 1000 }).withMessage('Monthly rent must be at least 1000 UGX'),
    body('tenantPhone').optional().matches(/^\+256[0-9]{9}$/).withMessage('Tenant phone must be Uganda format'),
  ],
  validateRequest,
  propertiesController.createProperty
);

router.patch('/properties/:id',
  authenticate,
  authorize('landlord', 'admin'),
  [
    param('id').isUUID(),
    body('status').optional().isIn(['Paid', 'Overdue', 'Partially Paid', 'Vacant']),
    body('monthlyRent').optional().isInt({ min: 1000 }),
  ],
  validateRequest,
  propertiesController.updateProperty
);

router.delete('/properties/:id',
  authenticate,
  authorize('landlord', 'admin'),
  param('id').isUUID(),
  validateRequest,
  propertiesController.deleteProperty
);

// ─── Payment routes ────────────────────────────────────────────────────────

router.post('/payments/initiate',
  authenticate,
  paymentLimiter,
  [
    body('propertyId').optional().isUUID(),
    body('provider').isIn(['MTN Mobile Money', 'Airtel Money', 'Bank Transfer']),
    body('senderPhone').optional().matches(/^\+?[0-9]{10,13}$/),
    body('type').optional().isIn(['Rent Payment', 'Subscription Fee', 'Message Billing']),
  ],
  validateRequest,
  paymentsController.initiatePayment
);

// Public webhook endpoints — no auth (called by MTN/Airtel servers directly)
router.post('/payments/mtn/callback',   paymentsController.mtnCallback);
router.post('/payments/airtel/callback', paymentsController.airtelCallback);

router.get('/payments/:transactionId/status',
  authenticate,
  param('transactionId').isUUID(),
  validateRequest,
  paymentsController.getPaymentStatus
);

router.get('/payments',
  authenticate,
  paymentsController.listFinancials
);

router.post('/payments/sync',
  authenticate,
  [
    body('records').isArray({ min: 1 }).withMessage('records array required'),
    body('records.*.amount').isInt({ min: 1 }),
    body('records.*.provider').isIn(['MTN Mobile Money', 'Airtel Money', 'Bank Transfer']),
  ],
  validateRequest,
  paymentsController.syncOfflinePayments
);

// ─── Subscription payment (landlord pays platform fee) ─────────────────────

router.post('/subscriptions/pay',
  authenticate,
  authorize('landlord'),
  paymentLimiter,
  [
    body('provider').isIn(['MTN Mobile Money', 'Airtel Money']).withMessage('Provider required'),
  ],
  validateRequest,
  async (req, res, next) => {
    // Determine subscription price for this landlord, then delegate to payments
    try {
      const { query: dbQuery } = require('../config/database');
      const landlordRes = await dbQuery(
        `SELECT l.id, l.units_count,
                st.price_per_month, st.name as tier_name
         FROM landlords l
         LEFT JOIN subscription_tiers st ON st.id = l.subscription_id
         WHERE l.user_id = $1`,
        [req.user.id]
      );
      if (!landlordRes.rows.length) {
        return res.status(404).json({ error: 'Landlord profile not found' });
      }
      const landlord = landlordRes.rows[0];
      if (!landlord.price_per_month || landlord.price_per_month === 0) {
        return res.json({ message: 'You are on the Free Trial — no payment needed' });
      }

      // Inject amount and type then call initiatePayment
      req.body.amount = landlord.price_per_month;
      req.body.type   = 'Subscription Fee';
      req.body.propertyId = null;

      await paymentsController.initiatePayment(req, res, next);
    } catch (err) {
      next(err);
    }
  }
);

// ─── Complaints routes ─────────────────────────────────────────────────────

router.get('/complaints',
  authenticate,
  complaintsController.listComplaints
);

router.post('/complaints',
  authenticate,
  authorize('tenant', 'admin'),
  [
    body('propertyId').isUUID(),
    body('title').trim().isLength({ min: 5, max: 500 }),
    body('description').trim().isLength({ min: 10 }),
    body('category').isIn(['Plumbing', 'Electricity', 'Water', 'Rent Issue', 'Other']),
    body('priority').optional().isIn(['Low', 'Medium', 'High']),
  ],
  validateRequest,
  complaintsController.createComplaint
);

router.patch('/complaints/:id',
  authenticate,
  authorize('landlord', 'admin'),
  [
    param('id').isUUID(),
    body('status').optional().isIn(['Received', 'In Progress', 'Settled']),
    body('priority').optional().isIn(['Low', 'Medium', 'High']),
  ],
  validateRequest,
  complaintsController.updateComplaint
);

router.post('/complaints/sync',
  authenticate,
  [body('complaints').isArray({ min: 1 })],
  validateRequest,
  complaintsController.syncOfflineComplaints
);

// ─── Messages / SMS routes ─────────────────────────────────────────────────

router.get('/messages',
  authenticate,
  messagesController.listMessages
);

router.post('/messages/reminder',
  authenticate,
  authorize('landlord', 'admin'),
  [body('propertyId').optional().isUUID()],
  validateRequest,
  messagesController.sendReminder
);

router.post('/messages/broadcast',
  authenticate,
  authorize('landlord', 'admin'),
  [body('text').trim().isLength({ min: 5, max: 160 }).withMessage('Message must be 5–160 characters')],
  validateRequest,
  messagesController.sendBroadcast
);

router.get('/messages/billing',
  authenticate,
  authorize('landlord'),
  messagesController.getSmsBilling
);

router.post('/messages/billing/settle',
  authenticate,
  authorize('landlord'),
  [body('receiptNo').notEmpty()],
  validateRequest,
  messagesController.settleSmsBilling
);

// ─── Admin routes ──────────────────────────────────────────────────────────

router.get('/admin/dashboard',
  authenticate,
  authorize('admin'),
  adminController.getDashboard
);

router.get('/admin/tiers',
  authenticate,
  authorize('admin'),
  adminController.listTiers
);

router.put('/admin/tiers',
  authenticate,
  authorize('admin'),
  [
    body('tiers').isArray({ min: 1 }),
    body('tiers.*.name').notEmpty(),
    body('tiers.*.minUnits').isInt({ min: 0 }),
    body('tiers.*.maxUnits').isInt({ min: 1 }),
    body('tiers.*.pricePerMonth').isInt({ min: 0 }),
  ],
  validateRequest,
  adminController.updateTiers
);

router.get('/admin/users',
  authenticate,
  authorize('admin'),
  adminController.listUsers
);

router.patch('/admin/users/:id',
  authenticate,
  authorize('admin'),
  [param('id').isUUID(), body('isActive').isBoolean()],
  validateRequest,
  adminController.updateUser
);

router.get('/admin/logs',
  authenticate,
  authorize('admin'),
  adminController.getAuditLogs
);

router.get('/admin/payout-settings',
  authenticate,
  authorize('admin'),
  adminController.getPayoutSettings
);

module.exports = router;

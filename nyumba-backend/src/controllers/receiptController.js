const { query } = require('../config/database');
const { createError } = require('../middleware/errorHandler');

async function listReceipts(req, res, next) {
  try {
    const { user } = req;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const owner = user.role === 'admin' ? '' :
      'AND (fr.created_by = $1 OR fr.landlord_id IN (SELECT id FROM landlords WHERE user_id = $1))';
    const params = user.role === 'admin' ? [limit, offset] : [user.id, limit, offset];
    const start = user.role === 'admin' ? 1 : 2;
    const result = await query(
      `SELECT fr.* FROM financial_records fr
       WHERE fr.receipt_no IS NOT NULL AND fr.is_archived = FALSE ${owner}
       ORDER BY fr.created_at DESC LIMIT $${start} OFFSET $${start + 1}`, params);
    res.json({ receipts: result.rows });
  } catch (err) { next(err); }
}

async function archiveReceipt(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE financial_records fr SET is_archived = TRUE, archived_at = NOW(), archived_by = $1
       WHERE fr.id = $2 AND ( $3 = 'admin' OR fr.landlord_id IN
         (SELECT id FROM landlords WHERE user_id = $1) )
       RETURNING fr.id, fr.receipt_no`, [req.user.id, id, req.user.role]);
    if (!result.rows.length) throw createError('Receipt not found or access denied', 404);
    await query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id)
       VALUES ($1, 'RECEIPT_ARCHIVED', 'financial_record', $2)`, [req.user.id, id]);
    res.json({ message: 'Receipt hidden; audit and financial history preserved', receipt: result.rows[0] });
  } catch (err) { next(err); }
}

module.exports = { listReceipts, archiveReceipt };

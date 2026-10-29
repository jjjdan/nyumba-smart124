# Nyumba Smart — Backend API

Production REST API for the Nyumba Smart Uganda rental management platform. Built with Node.js, Express, and PostgreSQL.

---

## Architecture

```
src/
├── config/
│   ├── database.js       # PostgreSQL pool + transaction helper
│   └── schema.sql        # Full DB schema (run once to migrate)
├── middleware/
│   ├── auth.js           # JWT verify + role-based authorize()
│   └── errorHandler.js   # Global error handler + validation helper
├── controllers/
│   ├── authController.js         # Register, login, refresh, logout
│   ├── propertiesController.js   # Rental unit CRUD
│   ├── paymentsController.js     # MoMo initiation, callbacks, offline sync
│   ├── complaintsController.js   # Repair tickets + offline sync
│   ├── messagesController.js     # SMS reminders, broadcasts, billing
│   └── adminController.js        # Dashboard, tiers, user management
├── services/
│   ├── momoService.js    # MTN MoMo Uganda + Airtel Money Uganda APIs
│   └── smsService.js     # Africa's Talking SMS (Uganda)
└── routes/
    └── index.js          # All routes wired with validation + rate limiting
```

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your actual credentials
```

### 3. Create PostgreSQL database
```bash
createdb nyumba_smart
```

### 4. Run migrations
```bash
npm run db:migrate
# or manually:
psql $DATABASE_URL -f src/config/schema.sql
```

### 5. Create the admin account
```bash
# Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD in .env first
npm run db:seed-admin
```
Log into the frontend's "Admin" tab with this email/password — there is no
passkey bypass anymore.

### 6. Start server
```bash
# Development (auto-restarts on change)
npm run dev

# Production
npm start
```

---

## Running the full app behind a single tunnel (Path B)

For external testing (e.g. via ngrok) without juggling two tunnels, the
backend can serve the frontend's built files directly — one process, one
port, one tunnel.

**Folder layout required:** `nyumba-smart` and `nyumba-backend` must be
sibling folders (both inside the same parent directory):
```
your-project/
├── nyumba-smart/        (frontend)
└── nyumba-backend/       (this backend)
```

**1. Build the frontend:**
```bash
cd nyumba-smart
npm run build
```
This produces `nyumba-smart/dist/`.

**2. Start the backend as usual:**
```bash
cd nyumba-backend
npm run dev
```
On boot it checks for `../nyumba-smart/dist/index.html`. If found, it logs:
```
Frontend:    serving from /path/to/nyumba-smart/dist
```
and serves the whole app — frontend and API together — from `http://localhost:3001`.

If the frontend hasn't been built yet, it falls back to API-only mode
(the JSON root route) automatically — nothing crashes.

**3. Tunnel just one port:**
```bash
ngrok http 3001
```
Visit the ngrok URL — it now serves the full app, API included. No need
to tunnel the frontend dev server separately, and no `VITE_API_URL`
juggling between two ngrok URLs.

**Tradeoff:** this mode serves a static build, not the live dev server —
so frontend code changes require re-running `npm run build` in
`nyumba-smart` before they show up. For active frontend development with
hot-reload, run the two dev servers separately instead (see the standard
setup above) and tunnel both, or just use `localhost`.

---

## API Reference

All authenticated routes require: `Authorization: Bearer <accessToken>`

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register landlord or tenant |
| POST | `/api/auth/login` | Login, get tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Revoke refresh token |
| GET  | `/api/auth/me` | Current user info |

**Register body:**
```json
{
  "name": "Julian Karuma",
  "email": "julian@gmail.com",
  "phone": "+256772112233",
  "password": "securepassword",
  "role": "landlord"
}
```
For tenants, also include `"landlordCode": "LL-KARUMA"`.

---

### Properties

| Method | Path | Auth |
|--------|------|------|
| GET    | `/api/properties` | Any |
| GET    | `/api/properties/:id` | Any |
| POST   | `/api/properties` | Landlord/Admin |
| PATCH  | `/api/properties/:id` | Landlord/Admin |
| DELETE | `/api/properties/:id` | Landlord/Admin |

---

### Payments

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/payments/initiate` | Fire MoMo push payment |
| GET  | `/api/payments/:id/status` | Poll payment status |
| GET  | `/api/payments` | List transaction history |
| POST | `/api/payments/sync` | Upload offline payment records |
| POST | `/api/payments/mtn/callback` | **Public** — MTN webhook |
| POST | `/api/payments/airtel/callback` | **Public** — Airtel webhook |
| POST | `/api/subscriptions/pay` | Landlord pays platform subscription |

**Initiate payment body:**
```json
{
  "propertyId": "uuid",
  "provider": "MTN Mobile Money",
  "senderPhone": "+256772112233",
  "type": "Rent Payment"
}
```

**Offline sync body:**
```json
{
  "records": [
    {
      "localId": "device-local-id",
      "propertyId": "uuid",
      "amount": 350000,
      "provider": "MTN Mobile Money",
      "senderPhone": "+256772112233",
      "type": "Rent Payment"
    }
  ]
}
```

---

### Complaints

| Method | Path | Auth |
|--------|------|------|
| GET    | `/api/complaints` | Any |
| POST   | `/api/complaints` | Tenant/Admin |
| PATCH  | `/api/complaints/:id` | Landlord/Admin |
| POST   | `/api/complaints/sync` | Any (offline sync) |

---

### Messages / SMS

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/messages` | List messages for current user |
| POST | `/api/messages/reminder` | Send overdue reminder(s) |
| POST | `/api/messages/broadcast` | Broadcast custom SMS |
| GET  | `/api/messages/billing` | Get SMS bill balance |
| POST | `/api/messages/billing/settle` | Mark SMS bill as paid |

---

### Admin (admin role only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/dashboard` | Platform metrics |
| GET | `/api/admin/tiers` | List subscription tiers |
| PUT | `/api/admin/tiers` | Update pricing tiers |
| GET | `/api/admin/users` | List all users |
| PATCH | `/api/admin/users/:id` | Activate/deactivate user |
| GET | `/api/admin/logs` | Audit trail |
| GET | `/api/admin/payout-settings` | Platform payout details |

---

## Payment Flow

```
Frontend                    Backend                 MTN/Airtel
   │                           │                        │
   │── POST /payments/initiate ─►                        │
   │                           │── requestToPay ────────►│
   │◄── { transactionId, ... } │                        │
   │                           │          (customer approves USSD)
   │                           │◄─────── callback ───────│
   │                           │  UPDATE status='Cleared' │
   │                           │  UPDATE property='Paid'  │
   │                           │  Send confirmation SMS   │
   │── GET /payments/:id/status ►                        │
   │◄── { status: 'Cleared' }  │                        │
```

### Webhook Setup

Register your callback URLs in the MTN and Airtel developer portals:
- MTN: `https://your-domain.com/api/payments/mtn/callback`
- Airtel: `https://your-domain.com/api/payments/airtel/callback`

These endpoints are public (no JWT required) — they're called by the payment gateways.

---

## Offline-First Sync

The mobile app can collect payments and complaints offline. When reconnected:

1. App calls `POST /api/payments/sync` with queued payment records
2. App calls `POST /api/complaints/sync` with queued complaint records
3. Backend processes each record, marks properties as Paid, returns sync results

---

## Environment Variables

See `.env.example` for the full list. Key ones:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Long random string for signing access tokens |
| `MTN_MOMO_*` | MTN MoMo Uganda credentials (from momodeveloper.mtn.com) |
| `AIRTEL_MONEY_*` | Airtel Money Uganda credentials (from developers.airtel.africa) |
| `AT_API_KEY` | Africa's Talking API key for SMS |

---

## Getting Payment Gateway Credentials

### MTN MoMo Uganda
1. Register at https://momodeveloper.mtn.com
2. Subscribe to the **Collection** product
3. Generate API User and API Key in the sandbox
4. Set `MTN_MOMO_ENVIRONMENT=sandbox` for testing, `MTN_MOMO_ENVIRONMENT=mtncongo` or `mtnuganda` for production

### Airtel Money Uganda
1. Register at https://developers.airtel.africa
2. Create an app and get Client ID + Secret
3. Switch to production credentials when going live

### Africa's Talking (SMS)
1. Register at https://africastalking.com
2. Create an app, use `sandbox` username for testing
3. Top up credit and go live with your real username

---

## Security Notes

- Passwords hashed with bcrypt (cost factor 12)
- JWTs expire in 7 days; refresh tokens in 30 days
- Refresh tokens are stored as bcrypt hashes (not plain text)
- Rate limiting: 10 auth attempts per 15 min, 5 payments per 1 min
- Webhook endpoints are public but validate gateway reference IDs
- Admin passkey from the frontend prototype is **gone** — use proper JWT admin role
- All inputs sanitized and validated via express-validator
- SQL injection protected via parameterized queries throughout

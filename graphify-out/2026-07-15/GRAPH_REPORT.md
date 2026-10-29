# Graph Report - /home/jordan/Downloads/nyumba-smart  (2026-07-14)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 446 nodes · 778 edges · 23 communities (22 shown, 1 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 104 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- query
- query
- index.js
- dependencies
- dependencies
- dependencies
- index.js
- client.ts
- compilerOptions
- server.js
- payments.ts
- App.tsx
- momoService.js
- momoService.js
- messages.ts
- types.ts
- admin.ts
- complaints.ts
- properties.ts
- smsService.js
- smsService.js
- vite-env.d.ts

## God Nodes (most connected - your core abstractions)
1. `query()` - 47 edges
2. `query()` - 47 edges
3. `createError()` - 28 edges
4. `createError()` - 28 edges
5. `withTransaction()` - 17 edges
6. `withTransaction()` - 17 edges
7. `compilerOptions` - 15 edges
8. `register()` - 7 edges
9. `register()` - 7 edges
10. `api` - 7 edges

## Surprising Connections (you probably didn't know these)
- `getAuditLogs()` --calls--> `query()`  [EXTRACTED]
  nyumba-backend/nyumba-backend/src/controllers/adminController.js → nyumba-backend/nyumba-backend/src/config/database.js
- `getDashboard()` --calls--> `query()`  [EXTRACTED]
  nyumba-backend/nyumba-backend/src/controllers/adminController.js → nyumba-backend/nyumba-backend/src/config/database.js
- `listTiers()` --calls--> `query()`  [EXTRACTED]
  nyumba-backend/nyumba-backend/src/controllers/adminController.js → nyumba-backend/nyumba-backend/src/config/database.js
- `listUsers()` --calls--> `query()`  [EXTRACTED]
  nyumba-backend/nyumba-backend/src/controllers/adminController.js → nyumba-backend/nyumba-backend/src/config/database.js
- `logout()` --calls--> `query()`  [EXTRACTED]
  nyumba-backend/nyumba-backend/src/controllers/authController.js → nyumba-backend/nyumba-backend/src/config/database.js

## Import Cycles
- None detected.

## Communities (23 total, 1 thin omitted)

### Community 0 - "query"
Cohesion: 0.06
Nodes (66): getPool(), { Pool }, query(), withTransaction(), bcrypt, { query, getPool }, seedAdmin(), { createError } (+58 more)

### Community 1 - "query"
Cohesion: 0.06
Nodes (66): getPool(), { Pool }, query(), withTransaction(), bcrypt, { query, getPool }, seedAdmin(), { createError } (+58 more)

### Community 2 - "index.js"
Cohesion: 0.06
Nodes (33): testConnection(), authenticate(), authorize(), jwt, { query }, adminController, authController, { authenticate, authorize } (+25 more)

### Community 3 - "dependencies"
Cohesion: 0.06
Nodes (30): dependencies, dotenv, express, @google/genai, lucide-react, motion, react, react-dom (+22 more)

### Community 4 - "dependencies"
Cohesion: 0.08
Nodes (25): dependencies, bcryptjs, cors, dotenv, express, express-rate-limit, express-validator, helmet (+17 more)

### Community 5 - "dependencies"
Cohesion: 0.08
Nodes (25): dependencies, bcryptjs, cors, dotenv, express, express-rate-limit, express-validator, helmet (+17 more)

### Community 6 - "index.js"
Cohesion: 0.10
Nodes (19): authenticate(), authorize(), jwt, { query }, adminController, authController, { authenticate, authorize }, authLimiter (+11 more)

### Community 7 - "client.ts"
Cohesion: 0.19
Nodes (14): AuthResponse, login(), logout(), register(), ApiError, apiRequest(), clearTokens(), getAccessToken() (+6 more)

### Community 8 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+8 more)

### Community 9 - "server.js"
Cohesion: 0.14
Nodes (14): testConnection(), app, CANDIDATE_DIST_PATHS, cors, { errorHandler }, express, FRONTEND_DIST, fs (+6 more)

### Community 10 - "payments.ts"
Cohesion: 0.20
Nodes (8): getPaymentStatus(), InitiatePaymentResponse, listFinancials(), mapFinancial(), OfflineRecord, PaymentStatusResponse, pollPaymentStatus(), FinancialRecord

### Community 11 - "App.tsx"
Cohesion: 0.25
Nodes (8): App(), DEFAULT_PRICING_TIERS, loadOfflineQueue(), NOTE: real MoMo pushes a USSD prompt to the CUSTOMER'S OWN PHONE, not, saveOfflineQueue(), UssdPrompt(), UssdPromptProps, useAuth()

### Community 12 - "momoService.js"
Cohesion: 0.38
Nodes (9): airtelGetPaymentStatus(), airtelGetToken(), airtelRequestToPay(), checkPaymentStatus(), initiatePayment(), mtnGetPaymentStatus(), mtnGetToken(), mtnRequestToPay() (+1 more)

### Community 13 - "momoService.js"
Cohesion: 0.38
Nodes (9): airtelGetPaymentStatus(), airtelGetToken(), airtelRequestToPay(), checkPaymentStatus(), initiatePayment(), mtnGetPaymentStatus(), mtnGetToken(), mtnRequestToPay() (+1 more)

### Community 14 - "messages.ts"
Cohesion: 0.22
Nodes (5): api, listMessages(), mapMessage(), SmsBilling, InAppMessage

### Community 15 - "types.ts"
Cohesion: 0.39
Nodes (4): AdminPanelProps, LandingPageProps, DeveloperLog, SubscriptionTier

### Community 16 - "admin.ts"
Cohesion: 0.32
Nodes (4): AdminDashboard, listTiers(), mapTier(), updateTiers()

### Community 17 - "complaints.ts"
Cohesion: 0.39
Nodes (6): createComplaint(), listComplaints(), mapComplaint(), OfflineComplaint, updateComplaint(), Complaint

### Community 18 - "properties.ts"
Cohesion: 0.39
Nodes (6): createProperty(), getProperty(), listProperties(), mapProperty(), updateProperty(), Property

### Community 19 - "smsService.js"
Cohesion: 0.53
Nodes (5): sendBroadcast(), sendOverdueReminder(), sendPaymentConfirmation(), sendSms(), SMS_RATE_UGX

### Community 20 - "smsService.js"
Cohesion: 0.53
Nodes (5): sendBroadcast(), sendOverdueReminder(), sendPaymentConfirmation(), sendSms(), SMS_RATE_UGX

## Knowledge Gaps
- **206 isolated node(s):** `name`, `version`, `description`, `main`, `start` (+201 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `query()` connect `query` to `index.js`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `query()` connect `query` to `server.js`, `index.js`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _207 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `query` be split into smaller, more focused modules?**
  _Cohesion score 0.061052631578947365 - nodes in this community are weakly interconnected._
- **Should `query` be split into smaller, more focused modules?**
  _Cohesion score 0.061052631578947365 - nodes in this community are weakly interconnected._
- **Should `index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06031746031746032 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
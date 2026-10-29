# Graph Report - nyumba-smart  (2026-07-15)

## Corpus Check
- 69 files · ~49,054 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 592 nodes · 937 edges · 38 communities (31 shown, 7 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 115 edges (avg confidence: 0.5)
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
- propertiesController.js
- paystackService.js
- graphify reference: extra exports and benchmark
- database.js
- receiptService.js
- graphify reference: query, path, explain
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- Run and deploy your AI Studio app
- CLAUDE.md
- CLAUDE.md
- extraction-spec.md

## God Nodes (most connected - your core abstractions)
1. `query()` - 49 edges
2. `query()` - 47 edges
3. `createError()` - 32 edges
4. `createError()` - 28 edges
5. `withTransaction()` - 17 edges
6. `withTransaction()` - 16 edges
7. `compilerOptions` - 15 edges
8. `What You Must Do When Invoked` - 12 edges
9. `/graphify` - 10 edges
10. `Nyumba Smart — Backend API` - 10 edges

## Surprising Connections (you probably didn't know these)
- `logout()` --calls--> `query()`  [EXTRACTED]
  nyumba-backend/nyumba-backend/src/controllers/authController.js → nyumba-backend/nyumba-backend/src/config/database.js
- `listFinancials()` --calls--> `query()`  [EXTRACTED]
  nyumba-backend/nyumba-backend/src/controllers/paymentsController.js → nyumba-backend/nyumba-backend/src/config/database.js
- `listProperties()` --calls--> `query()`  [EXTRACTED]
  nyumba-backend/nyumba-backend/src/controllers/propertiesController.js → nyumba-backend/nyumba-backend/src/config/database.js
- `seedAdmin()` --calls--> `query()`  [EXTRACTED]
  nyumba-backend/nyumba-backend/src/config/seedAdmin.js → nyumba-backend/nyumba-backend/src/config/database.js
- `getAuditLogs()` --calls--> `query()`  [EXTRACTED]
  nyumba-backend/nyumba-backend/src/controllers/adminController.js → nyumba-backend/nyumba-backend/src/config/database.js

## Import Cycles
- None detected.

## Communities (38 total, 7 thin omitted)

### Community 0 - "query"
Cohesion: 0.18
Nodes (15): query(), { createError }, getAuditLogs(), getDashboard(), listTiers(), listUsers(), { query, withTransaction }, updateTiers() (+7 more)

### Community 1 - "query"
Cohesion: 0.05
Nodes (78): getPool(), { Pool }, query(), withTransaction(), bcrypt, { query, getPool }, seedAdmin(), { createError } (+70 more)

### Community 2 - "index.js"
Cohesion: 0.10
Nodes (19): authenticate(), authorize(), jwt, { query }, adminController, authController, { authenticate, authorize }, authLimiter (+11 more)

### Community 3 - "dependencies"
Cohesion: 0.06
Nodes (30): dependencies, dotenv, express, @google/genai, lucide-react, motion, react, react-dom (+22 more)

### Community 4 - "dependencies"
Cohesion: 0.08
Nodes (25): dependencies, bcryptjs, cors, dotenv, express, express-rate-limit, express-validator, helmet (+17 more)

### Community 5 - "dependencies"
Cohesion: 0.07
Nodes (26): dependencies, bcryptjs, cors, dotenv, express, express-rate-limit, express-validator, helmet (+18 more)

### Community 6 - "index.js"
Cohesion: 0.10
Nodes (19): authenticate(), authorize(), jwt, { query }, adminController, authController, { authenticate, authorize }, authLimiter (+11 more)

### Community 7 - "client.ts"
Cohesion: 0.05
Nodes (46): AdminDashboard, listTiers(), mapTier(), updateTiers(), AuthResponse, login(), logout(), register() (+38 more)

### Community 8 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+8 more)

### Community 9 - "server.js"
Cohesion: 0.14
Nodes (14): testConnection(), app, CANDIDATE_DIST_PATHS, cors, { errorHandler }, express, FRONTEND_DIST, fs (+6 more)

### Community 10 - "payments.ts"
Cohesion: 0.14
Nodes (9): getPaymentStatus(), InitiatePaymentResponse, listFinancials(), mapFinancial(), OfflineRecord, PaymentSettings, PaymentStatusResponse, pollPaymentStatus() (+1 more)

### Community 11 - "App.tsx"
Cohesion: 0.07
Nodes (26): 1. Install dependencies, 2. Configure environment, 3. Create PostgreSQL database, 4. Run migrations, 5. Create the admin account, 6. Start server, Admin (admin role only), Africa's Talking (SMS) (+18 more)

### Community 12 - "momoService.js"
Cohesion: 0.38
Nodes (9): airtelGetPaymentStatus(), airtelGetToken(), airtelRequestToPay(), checkPaymentStatus(), initiatePayment(), mtnGetPaymentStatus(), mtnGetToken(), mtnRequestToPay() (+1 more)

### Community 13 - "momoService.js"
Cohesion: 0.07
Nodes (26): 1. Install dependencies, 2. Configure environment, 3. Create PostgreSQL database, 4. Run migrations, 5. Create the admin account, 6. Start server, Admin (admin role only), Africa's Talking (SMS) (+18 more)

### Community 14 - "messages.ts"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 15 - "types.ts"
Cohesion: 0.14
Nodes (14): testConnection(), app, cors, { errorHandler }, express, FRONTEND_DIST, frontendBuilt, fs (+6 more)

### Community 16 - "admin.ts"
Cohesion: 0.18
Nodes (14): withTransaction(), airtelCallback(), { createError }, getPaymentStatus(), initiatePayment(), listFinancials(), makeReceiptNo(), momoService (+6 more)

### Community 17 - "complaints.ts"
Cohesion: 0.21
Nodes (13): bcrypt, { createError }, generateAccessToken(), generateRefreshToken(), generateUniqueLandlordCode(), getMe(), jwt, login() (+5 more)

### Community 18 - "properties.ts"
Cohesion: 0.27
Nodes (10): { createError }, getSmsBilling(), listMessages(), { query, withTransaction }, sendBroadcast(), sendReminder(), settleSmsBilling(), SMS_RATE_UGX (+2 more)

### Community 19 - "smsService.js"
Cohesion: 0.53
Nodes (5): sendBroadcast(), sendOverdueReminder(), sendPaymentConfirmation(), sendSms(), SMS_RATE_UGX

### Community 20 - "smsService.js"
Cohesion: 0.48
Nodes (6): sendBroadcast(), sendLandlordPaymentAlert(), sendOverdueReminder(), sendPaymentConfirmation(), sendSms(), SMS_RATE_UGX

### Community 23 - "propertiesController.js"
Cohesion: 0.18
Nodes (9): { createError }, createProperty(), getProperty(), listProperties(), { query, withTransaction }, updateProperty(), errorHandler(), validateRequest() (+1 more)

### Community 24 - "paystackService.js"
Cohesion: 0.40
Nodes (8): chargeMobileMoney(), initializeTransaction(), initiatePayment(), normaliseMsisdn(), paystackFetch(), providerCode(), toMinorUnits(), verifyTransaction()

### Community 25 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 26 - "database.js"
Cohesion: 0.38
Nodes (5): getPool(), { Pool }, bcrypt, { query, getPool }, seedAdmin()

### Community 27 - "receiptService.js"
Cohesion: 0.43
Nodes (6): buildPdf(), ensureDir(), fs, generateRentReceipt(), path, pdfEscape()

### Community 28 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 29 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 30 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 31 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

## Knowledge Gaps
- **298 isolated node(s):** `name`, `version`, `description`, `main`, `start` (+293 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `query()` connect `query` to `server.js`, `index.js`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `query()` connect `query` to `index.js`, `types.ts`, `admin.ts`, `complaints.ts`, `properties.ts`, `propertiesController.js`, `database.js`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _298 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `query` be split into smaller, more focused modules?**
  _Cohesion score 0.05337078651685393 - nodes in this community are weakly interconnected._
- **Should `index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10476190476190476 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
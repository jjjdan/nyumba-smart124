# Nyumba Smart: Free Public Hosting Runbook

This runbook puts Nyumba Smart online without using your personal computer as a
server. It uses free hosted services:

- **GitHub** for the source code
- **Render** for the Node/Express backend
- **Neon** for a hosted PostgreSQL database, if the backend uses PostgreSQL
- **Vercel** for the Vite frontend

The free tiers are suitable for testing and demos. They may sleep when idle,
which means the first request can take several seconds.

## 1. Check the project locally

From the project root:

```powershell
npm install
npm run build
```

Then start the frontend with the script defined in `package.json`:

```powershell
npm run dev
```

In a second terminal, start the backend from `nyumba-backend` using its
development script:

```powershell
Set-Location .\nyumba-backend
npm install
npm run dev
```

Do not continue to deployment until the frontend build succeeds and the backend
starts without an error. Never commit `.env` files, database passwords,
Paystack keys, SMS credentials, or session secrets.

## 2. Put the code on GitHub

Create a **private or public** GitHub repository, then from the project root:

```powershell
git init
git add .
git commit -m "Prepare Nyumba Smart for hosting"
git branch -M main
git remote add origin https://github.com/<your-account>/<your-repository>.git
git push -u origin main
```

Before pushing, confirm that secrets are excluded:

```powershell
git status
```

If the project already has a Git repository, do not run `git init`; add the
remote and push the existing branch instead.

## 3. Create the hosted database

Only do this if `nyumba-backend/src/config/database.js` expects PostgreSQL.

1. Create a free Neon project.
2. Copy its pooled connection string.
3. Keep the connection string private.
4. Run the schema/migrations against the hosted database using the project’s
   documented migration command or Neon SQL editor.
5. Seed only a test administrator account. Use a new password for the hosted
   environment.

If the backend uses another database, use that database provider instead. The
database type must match `database.js`; do not change production code just to
fit a provider.

## 4. Deploy the backend to Render

1. Create a Render account and choose **New → Web Service**.
2. Connect the GitHub repository.
3. Set the service root directory to `nyumba-backend`.
4. Use:

   - **Build command:** `npm install`
   - **Start command:** the production start script from
     `nyumba-backend/package.json` (normally `npm start`)
   - **Environment:** Node

5. Add every required environment variable from the backend source/config:

   - hosted database connection string
   - `PORT` if the code supports it
   - session/JWT secret
   - Paystack public/secret keys, if payments are enabled
   - SMS credentials, if SMS is enabled
   - frontend origin/CORS URL
   - any encryption key required by `src/utils/encryption.js`

   Use test/sandbox payment credentials for a demo. Do not paste secrets into
   this document or into GitHub.

6. Deploy and copy the resulting Render URL, for example:
   `https://nyumba-smart-api.onrender.com`.

7. Verify the backend health route or API endpoint in a browser. If there is no
   health route, check Render logs and call a harmless read-only API endpoint.

The backend must listen on Render’s assigned port, usually with code equivalent
to:

```js
const port = process.env.PORT || 5000;
app.listen(port, "0.0.0.0");
```

Do not hard-code `localhost` for the production server.

## 5. Point the frontend at the hosted backend

The Vite frontend must use an environment variable for its API base URL rather
than a local `localhost` URL. Create a local file named `.env.local` for
testing:

```text
VITE_API_URL=https://nyumba-smart-api.onrender.com
```

Use the variable name already expected by `src/api/client.ts` if it differs.
The exact variable name is important: Vite only exposes variables beginning
with `VITE_`.

Update the Render backend’s CORS/frontend-origin variable to the final Vercel
URL after the frontend is deployed.

## 6. Deploy the frontend to Vercel

1. Create a Vercel account and choose **Add New → Project**.
2. Import the GitHub repository.
3. Set the framework to **Vite**.
4. Keep the project root at the repository root.
5. Use:

   - **Build command:** `npm run build`
   - **Output directory:** `dist`
   - **Install command:** `npm install`

6. Add the production environment variable expected by
   `src/api/client.ts`, for example:

   ```text
   VITE_API_URL=https://nyumba-smart-api.onrender.com
   ```

7. Deploy and copy the Vercel URL.
8. Add that Vercel URL to the backend’s allowed CORS origins on Render.
9. Redeploy the backend if Render does not automatically restart after the
   environment-variable change.

## 7. Test the public app

Test from an incognito browser window and from a phone that is not connected to
the development computer:

1. Landing page loads.
2. Registration/login works.
3. Properties load from the hosted API.
4. Admin login works with the test account.
5. Complaints/messages work.
6. Payment flows remain in sandbox/test mode.
7. Refreshing a deep frontend route does not show a 404.
8. Browser developer tools show no `localhost` API requests.
9. Render logs show no CORS, database, or missing-environment-variable errors.

## 8. Common fixes

### CORS error

Set the backend’s allowed origin to the exact Vercel URL, including `https://`
and excluding a trailing slash if the backend compares strings literally.

### API calls still use localhost

Check `src/api/client.ts`, use its exact Vite variable name in Vercel, and
redeploy the frontend. Vite variables are compiled into the frontend at build
time.

### Database connection fails

Check the hosted connection string, SSL requirements, migrations, and whether
the provider requires a pooled connection. Read the Render logs instead of
printing credentials.

### Render returns a port error

Make sure the server reads `process.env.PORT` and binds to `0.0.0.0`.

### Refreshing a Vercel route returns 404

Add a Vercel SPA rewrite to serve `index.html` for client-side routes, then
redeploy. Only add this if the app actually uses client-side routes.

## 9. Definition of done

Nyumba Smart is publicly testable when:

- Vercel serves the frontend over HTTPS.
- The frontend calls the Render API, not the personal computer.
- Render connects to the hosted database.
- At least one tester succeeds from a separate network.
- No secret is present in Git history or browser-exposed frontend variables.

The URL to share with testers is the Vercel URL. Keep the Render API URL private
from ordinary users unless they need it for debugging.

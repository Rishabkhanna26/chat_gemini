# Mex-End

Astrology lead management + WhatsApp automation.  
Frontend (Next.js) runs on Vercel, backend (Express + WhatsApp Web) runs on a Node server.

## Features
- Multi-admin WhatsApp sessions (one QR + session per admin).
- Lead capture with services/products flows (Hinglish/Hindi/English).
- Full conversation logging in `messages` table.
- Resume flow after inactivity and partial lead save.

## Tech Stack
- **Frontend:** Next.js, React, TailwindCSS
- **Backend:** Express, Socket.IO, whatsapp-web.js
- **DB:** Postgres (Supabase)

## Project Structure
- `app/` – Next.js frontend (App Router)
- `src/` – Express backend + WhatsApp automation
- `db/` – DB scripts
- `lib/` – DB helpers + auth

## Environment Variables
Create `.env` with:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_PROJECT.pooler.supabase.com:6543/postgres
# Use Supabase Session Pooler if your server is IPv4-only.

FRONTEND_ORIGIN=http://localhost:3000
FRONTEND_ORIGINS=http://localhost:3000,http://localhost:3001
PORT=3001

# Optional SMTP (for super admin password email)
SMTP_EMAIL=
SMTP_PASSWORD=

# Optional Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

## Database Setup (Supabase Postgres)
```
npm run setup-db
```
This initializes schema and defaults only. It does not seed dummy/sample data.

## Backend (WhatsApp + API)
```
npm run backend
```
Backend runs on `http://localhost:3001`.

### WhatsApp Flow (Per Admin)
- Each admin has a separate WhatsApp session.
- QR is shown in **Settings → WhatsApp** in the frontend.
- Backend exposes:
  - `GET /whatsapp/status?adminId=123`
  - `POST /whatsapp/start` `{ "adminId": 123 }`
  - `POST /whatsapp/disconnect` `{ "adminId": 123 }`

## Frontend (Next.js)
```
npm run dev
```
Frontend runs on `http://localhost:3000`.

## Deployment Notes
### Recommended Split Deployment
**Frontend:** Vercel (Next.js)  
**Backend:** Render (or any Node host that supports WebSockets + long-running processes)

#### Backend (Render via Docker)
Files you need (already in repo):
- `Dockerfile.backend`
- `.dockerignore`

Render setup (high level):
- Service type: Web Service (Docker)
- Dockerfile path: `Dockerfile.backend` (rename to `Dockerfile` if your host requires it)
- Start command: handled by Docker `CMD` (`npm run backend:start`)
- Attach a **persistent disk** and mount it at `/var/data`
- Set env vars:
  - `DATABASE_URL`
  - `FRONTEND_ORIGIN` and `FRONTEND_ORIGINS` (use your Vercel URL)
  - `PORT` (Render provides this automatically)
  - `WHATSAPP_AUTH_PATH=/var/data/wwebjs_auth`
  - `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` (if your image provides Chromium here)
  - Optional: `REDIS_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `WHATSAPP_USE_LEGACY_AUTOMATION`, `WHATSAPP_AI_GREETING_REQUIRED`, `WHATSAPP_AI_HISTORY_LIMIT`, `WHATSAPP_AI_AUTO_LANGUAGE`

#### Frontend (Vercel)
- No extra files required.
- Set env vars in Vercel:
  - `NEXT_PUBLIC_WHATSAPP_API_BASE=https://<your-backend-domain>`
  - `NEXT_PUBLIC_WHATSAPP_SOCKET_URL=https://<your-backend-domain>`

Ensure `FRONTEND_ORIGIN` / `FRONTEND_ORIGINS` match the deployed frontend URL.

## Message Logging
Every incoming and outgoing WhatsApp message is saved in the `messages` table once the admin session is active.

## Troubleshooting
- If QR does not appear: check backend logs and socket connection.
- If WhatsApp disconnects: reconnect from Settings and scan QR again.

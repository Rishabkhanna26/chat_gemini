# Mex-End

Astrology lead management + WhatsApp automation.  
Frontend (Next.js) runs on Vercel, backend (Express + WhatsApp Web) runs on a Node server.

## Features
- Multi-admin WhatsApp sessions (one QR + session per admin).
- Lead capture with services/products flows (Hinglish/Hindi/English).
- Full conversation logging in `messages` table.
- Resume flow after inactivity and partial lead save.
- **Session State Persistence:** PostgreSQL-backed conversation state storage with optional Redis caching for zero-downtime deployments.

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

# Session State Persistence (Optional)
ENABLE_SESSION_PERSISTENCE=false  # Set to 'true' to enable database-backed session persistence
REDIS_URL=                         # Optional: Redis URL for caching (e.g., redis://localhost:6379)
USER_IDLE_TTL_MS=21600000         # Session idle timeout in ms (default: 6 hours)
CLEANUP_INTERVAL_MS=900000        # Cleanup interval in ms (default: 15 minutes)
CONVERSATION_STATE_RETENTION_DAYS=90  # Data retention period (default: 90 days)
PERSISTENCE_RETRY_ATTEMPTS=3      # Number of retry attempts for failed persistence (default: 3)
PERSISTENCE_BATCH_WINDOW_MS=500   # Batching window for rapid updates in ms (default: 500ms)
CIRCUIT_BREAKER_THRESHOLD=10      # Failures before circuit breaker opens (default: 10)
CIRCUIT_BREAKER_RESET_MS=60000    # Circuit breaker reset timeout in ms (default: 60 seconds)
```

## Database Setup (Supabase Postgres)
```
npm run setup-db
```
This initializes schema and defaults only. It does not seed dummy/sample data.

## Session State Persistence

The system supports persistent session state storage to prevent data loss during server restarts and deployments.

### Overview

By default, conversation states are stored in memory and lost on restart. Enabling persistence stores states in PostgreSQL with optional Redis caching, providing:
- **Zero data loss** during deployments
- **Horizontal scalability** across multiple server instances
- **Disaster recovery** with automatic session restoration
- **Sub-100ms persistence** latency with Redis caching

### Enabling Persistence

1. **Run the database migration:**
   ```bash
   node scripts/run-migration.js up
   ```
   This creates the `conversation_states` table with required indexes.

2. **Enable the feature flag:**
   Set `ENABLE_SESSION_PERSISTENCE=true` in your `.env` file.

3. **Optional: Configure Redis caching:**
   Set `REDIS_URL=redis://localhost:6379` for enhanced performance (80% cache hit rate target).

4. **Restart the backend:**
   ```bash
   npm run backend
   ```

### Migration Process

**Step 1: Backup your database**
```bash
pg_dump $DATABASE_URL > backup.sql
```

**Step 2: Run migration**
```bash
node scripts/run-migration.js up
```

**Step 3: Enable persistence**
Update `.env`:
```
ENABLE_SESSION_PERSISTENCE=true
```

**Step 4: Deploy and monitor**
- Check logs for "Session persistence enabled" message
- Monitor recovery statistics on startup
- Watch for persistence errors in logs

### Rollback Procedure

If you need to disable persistence:

**Option 1: Disable feature flag (keeps data)**
```
ENABLE_SESSION_PERSISTENCE=false
```
Restart backend. Data remains in database but won't be used.

**Option 2: Full rollback (removes table)**
```bash
node scripts/run-migration.js down
```
This drops the `conversation_states` table and all data.

### Redis Setup (Optional)

For production deployments, Redis caching significantly improves performance:

**Local development:**
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

**Production:**
Use a managed Redis service (Redis Cloud, AWS ElastiCache, etc.) and set:
```
REDIS_URL=redis://your-redis-host:6379
```

### Monitoring

The persistence layer logs comprehensive metrics:

**Startup logs:**
- Session recovery statistics (count, duration, failures)
- Persistence mode (enabled/disabled)
- Redis availability status

**Runtime logs:**
- Persistence operations (save/load/delete) with duration
- Warnings for slow operations (>100ms)
- Errors for failed operations with retry attempts
- Circuit breaker state changes

**Metrics tracked:**
- `state_save_duration`: Time to persist state
- `state_load_duration`: Time to load state
- `cache_hit_rate`: Redis cache effectiveness
- `persistence_errors`: Failed operations count

### Troubleshooting

**Sessions not recovering after restart:**
- Check `ENABLE_SESSION_PERSISTENCE=true` is set
- Verify migration ran successfully: `SELECT * FROM conversation_states LIMIT 1;`
- Check logs for recovery errors

**High persistence latency:**
- Enable Redis caching with `REDIS_URL`
- Check database connection pool settings
- Monitor database performance

**Circuit breaker activated:**
- Check database connectivity
- Review error logs for root cause
- System automatically falls back to in-memory storage
- Circuit auto-resets after 60 seconds

**Redis connection failures:**
- System automatically falls back to database-only mode
- Check Redis URL and connectivity
- Redis is optional; system works without it

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
In development, this command now runs a `predev` hook that seeds sample `catalog_items`
(dummy services/products) if they are missing.

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
  - Optional: `REDIS_URL`, `OPENROUTER_API_KEY`, `AI_MODEL`, `OPENROUTER_SITE_URL`, `OPENROUTER_SITE_NAME`, `WHATSAPP_USE_LEGACY_AUTOMATION`, `WHATSAPP_AI_GREETING_REQUIRED`, `WHATSAPP_AI_HISTORY_LIMIT`, `WHATSAPP_AI_AUTO_LANGUAGE`

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

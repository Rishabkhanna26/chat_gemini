# Setup Checklist - Phase 1 Improvements

## 📋 Complete These Steps to Activate Improvements

### ✅ Step 1: Install Dependencies (2 minutes)

```bash
npm install
```

**Verify**: Check that these packages are installed:
- express-rate-limit
- helmet
- compression
- @sentry/node
- winston

---

### ✅ Step 2: Create Logs Directory (30 seconds)

```bash
mkdir -p logs
```

**Verify**: 
```bash
ls -la logs/
```

---

### ✅ Step 3: Configure Environment Variables (5 minutes)

**3.1. Copy example file**:
```bash
cp .env.example .env
```

**3.2. Generate JWT Secret**:
```bash
# Option 1: Using OpenSSL (Linux/Mac)
openssl rand -base64 32

# Option 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**3.3. Edit `.env` file** and update these REQUIRED variables:
```bash
# REQUIRED - Your database URL
DATABASE_URL=postgresql://...

# REQUIRED - Paste the generated secret from step 3.2
JWT_SECRET=paste_your_generated_secret_here

# REQUIRED - Set environment
NODE_ENV=development  # or production

# REQUIRED - Set log level
LOG_LEVEL=info
```

**Verify**:
```bash
# Check JWT_SECRET is set and long enough
grep JWT_SECRET .env | wc -c
# Should be > 40 characters
```

---

### ✅ Step 4: Set Up Sentry (Optional but Recommended, 5 minutes)

**4.1. Sign up for Sentry**:
- Go to https://sentry.io
- Create free account
- Create new project (select Node.js)

**4.2. Get your DSN**:
- Copy the DSN from project settings
- It looks like: `https://xxxxx@sentry.io/xxxxx`

**4.3. Add to `.env`**:
```bash
SENTRY_DSN=https://your-dsn-here@sentry.io/your-project-id
```

**Verify**: DSN should start with `https://` and contain `@sentry.io`

---

### ✅ Step 5: Test the Setup (5 minutes)

**5.1. Start the server**:
```bash
npm run wp
```

**5.2. Check startup logs**:
You should see:
```
✅ PostgreSQL pool initialized
✅ Sentry error tracking initialized (if configured)
✅ Database helpers initialized
Backend running on http://localhost:3001
```

**5.3. Test health endpoint**:
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "healthy",
  "uptime": 123.456,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "memory": {...}
}
```

**5.4. Test rate limiting**:
```bash
# Run this command - should work fine
for i in {1..50}; do curl -s http://localhost:3001/health > /dev/null; done
echo "50 requests completed"

# Run this command - should hit rate limit
for i in {1..150}; do curl -s http://localhost:3001/health; done | grep "Too many"
```

You should see "Too many requests" after ~100 requests.

**5.5. Check logs are working**:
```bash
# Check log files exist
ls -la logs/

# View recent logs
tail -n 20 logs/combined.log
```

**5.6. Test error monitoring** (if Sentry configured):
```bash
# Trigger a 404 error
curl http://localhost:3001/nonexistent

# Check Sentry dashboard - should see the error
```

---

### ✅ Step 6: Verify Security Headers (2 minutes)

```bash
curl -I http://localhost:3001/health
```

**Check for these headers**:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: ...`
- `Content-Security-Policy: ...`
- `RateLimit-Limit: 100`
- `RateLimit-Remaining: ...`

---

### ✅ Step 7: Production Checklist (Before Deploying)

Only complete this when deploying to production:

- [ ] `NODE_ENV=production` in production `.env`
- [ ] `JWT_SECRET` is different in production (never reuse dev secret)
- [ ] `SENTRY_DSN` is configured
- [ ] `DATABASE_URL` points to production database
- [ ] Logs directory exists and is writable
- [ ] Server has enough disk space for logs (5MB x 5 files = 25MB minimum)
- [ ] Firewall allows outbound HTTPS (for Sentry)
- [ ] Tested graceful shutdown (Ctrl+C should log "shutting down gracefully")
- [ ] Verified rate limiting works
- [ ] Verified logging works
- [ ] Set up log rotation (if not using built-in)
- [ ] Set up Sentry alerts
- [ ] Created incident response plan
- [ ] Documented how to check logs
- [ ] Documented how to check Sentry
- [ ] Tested health endpoint from outside network

---

## 🚨 Troubleshooting

### Problem: "Cannot find module 'winston'"

**Solution**:
```bash
npm install
```

---

### Problem: "ENOENT: no such file or directory, open 'logs/error.log'"

**Solution**:
```bash
mkdir -p logs
chmod 755 logs
```

---

### Problem: "JWT_SECRET is not defined"

**Solution**:
1. Check `.env` file exists: `ls -la .env`
2. Check JWT_SECRET is set: `grep JWT_SECRET .env`
3. Generate new secret if missing (see Step 3.2)
4. Restart server

---

### Problem: Rate limiting not working

**Possible causes**:
1. Not enough requests (need >100)
2. Behind a proxy (need to trust proxy)

**Solution for proxy**:
Add to `src/server.js` after `const app = express();`:
```javascript
app.set('trust proxy', 1);
```

---

### Problem: Logs not appearing

**Check**:
```bash
# 1. Directory exists and is writable
ls -la logs/
touch logs/test.txt
rm logs/test.txt

# 2. NODE_ENV is set
echo $NODE_ENV

# 3. LOG_LEVEL allows your log level
grep LOG_LEVEL .env
```

---

### Problem: Sentry not capturing errors

**Check**:
1. SENTRY_DSN is set: `grep SENTRY_DSN .env`
2. DSN format is correct (starts with https://)
3. Internet connection works
4. Check Sentry dashboard for project status

**Test manually**:
Add to server.js temporarily:
```javascript
import { Sentry } from '../config/sentry.js';
Sentry.captureMessage('Test from setup');
```

---

## 📊 Success Criteria

### You're ready to proceed if:

✅ Server starts without errors
✅ Health endpoint responds
✅ Rate limiting works (429 after 100 requests)
✅ Logs are being written to files
✅ Security headers are present
✅ Sentry captures errors (if configured)
✅ Graceful shutdown works (Ctrl+C)

---

## 🎯 What's Next

After completing this checklist:

1. **Read the documentation**:
   - `IMPROVEMENTS_SUMMARY.md` - What was implemented
   - `QUICK_START_IMPROVEMENTS.md` - Detailed usage guide
   - `IMPLEMENTATION_LOG.md` - Technical details

2. **Monitor your application**:
   - Check logs regularly: `tail -f logs/combined.log`
   - Check Sentry dashboard daily
   - Monitor health endpoint
   - Watch for rate limit violations

3. **Plan Phase 2**:
   - Review `PRODUCTION_READINESS_GUIDE.md`
   - Prepare for Session State Persistence
   - Allocate 2 weeks for implementation

---

## 📞 Need Help?

### Check These First:
1. Logs: `tail -f logs/combined.log`
2. Error logs: `tail -f logs/error.log`
3. Sentry dashboard
4. Health endpoint: `curl http://localhost:3001/health`

### Common Issues:
- Missing dependencies → `npm install`
- Missing logs directory → `mkdir -p logs`
- Missing .env → `cp .env.example .env`
- Invalid JWT_SECRET → Generate new one (Step 3.2)

### Still Stuck?
1. Check all steps in this checklist
2. Review error messages carefully
3. Check file permissions
4. Verify environment variables
5. Restart server

---

## ✅ Final Verification

Run this command to verify everything:

```bash
# Create a test script
cat > test-setup.sh << 'EOF'
#!/bin/bash
echo "🧪 Testing Phase 1 Setup..."
echo ""

# Test 1: Dependencies
echo "1. Checking dependencies..."
npm list express-rate-limit helmet winston @sentry/node compression > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "   ✅ Dependencies installed"
else
  echo "   ❌ Dependencies missing - run: npm install"
fi

# Test 2: Logs directory
echo "2. Checking logs directory..."
if [ -d "logs" ]; then
  echo "   ✅ Logs directory exists"
else
  echo "   ❌ Logs directory missing - run: mkdir -p logs"
fi

# Test 3: .env file
echo "3. Checking .env file..."
if [ -f ".env" ]; then
  echo "   ✅ .env file exists"
  
  # Check JWT_SECRET
  if grep -q "JWT_SECRET=" .env && ! grep -q "JWT_SECRET=CHANGE_THIS" .env; then
    echo "   ✅ JWT_SECRET is configured"
  else
    echo "   ❌ JWT_SECRET not configured"
  fi
  
  # Check DATABASE_URL
  if grep -q "DATABASE_URL=" .env && ! grep -q "DATABASE_URL=postgresql://postgres:YOUR_PASSWORD" .env; then
    echo "   ✅ DATABASE_URL is configured"
  else
    echo "   ❌ DATABASE_URL not configured"
  fi
else
  echo "   ❌ .env file missing - run: cp .env.example .env"
fi

# Test 4: Server health (if running)
echo "4. Checking server health..."
curl -s http://localhost:3001/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "   ✅ Server is running and healthy"
else
  echo "   ⚠️  Server not running (this is OK if you haven't started it yet)"
fi

echo ""
echo "🎉 Setup verification complete!"
EOF

chmod +x test-setup.sh
./test-setup.sh
```

---

**Congratulations!** 🎉

If all checks pass, you've successfully completed Phase 1 setup!

Your application now has:
- ✅ Rate limiting and DDoS protection
- ✅ Structured logging
- ✅ Error monitoring
- ✅ Database connection pooling
- ✅ Security headers
- ✅ Health checks
- ✅ Graceful shutdown

**Next**: Begin Phase 2 (Session State Persistence) or deploy to staging for testing.

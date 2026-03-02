# Session State Persistence - Operational Runbook

This runbook provides step-by-step procedures for operating, troubleshooting, and maintaining the session state persistence system.

## Table of Contents

1. [System Overview](#system-overview)
2. [Checking Persistence Status](#checking-persistence-status)
3. [Common Issues and Solutions](#common-issues-and-solutions)
4. [Manual Recovery Procedures](#manual-recovery-procedures)
5. [Performance Investigation](#performance-investigation)
6. [Disabling Persistence (Rollback)](#disabling-persistence-rollback)
7. [Database Maintenance](#database-maintenance)
8. [Redis Operations](#redis-operations)
9. [Emergency Procedures](#emergency-procedures)

---

## System Overview

### Architecture Components

- **SessionStateManager**: Orchestrates persistence operations with retry and circuit breaker
- **StateSerializer**: Converts conversation objects to/from JSON
- **RecoveryManager**: Restores sessions on startup
- **SessionCleanupService**: Periodic cleanup of expired sessions
- **CacheLayer**: Optional Redis caching for performance

### Data Flow

1. User sends WhatsApp message
2. Message processed, conversation state updated
3. State persisted to PostgreSQL (async)
4. State cached in Redis (if enabled)
5. On restart: states recovered from database
6. Periodic cleanup removes expired states

---

## Checking Persistence Status

### 1. Verify Persistence is Enabled

**Check environment variable:**
```bash
echo $ENABLE_SESSION_PERSISTENCE
# Should output: true
```

**Check startup logs:**
```bash
grep "Session persistence enabled" logs/backend.log
```

Expected output:
```
[INFO] Session persistence enabled
[INFO] Redis cache available: true
[INFO] Recovered 127 sessions for admin 1 in 234ms
```

### 2. Check Active Sessions Count

**Query database:**
```sql
SELECT 
  admin_id,
  COUNT(*) as active_sessions,
  MAX(last_activity_at) as most_recent_activity
FROM conversation_states
WHERE last_activity_at > NOW() - INTERVAL '6 hours'
GROUP BY admin_id;
```

**Expected result:**
- Count matches number of active WhatsApp conversations
- Most recent activity is recent (within minutes/hours)

### 3. Verify Persistence Operations

**Check recent persistence logs:**
```bash
grep "persistState" logs/backend.log | tail -20
```

Look for:
- Operation duration (should be <100ms typically)
- No error messages
- Successful completions

### 4. Check Circuit Breaker Status

**Query logs:**
```bash
grep "circuit breaker" logs/backend.log | tail -10
```

**Healthy state:**
- No "circuit breaker opened" messages
- Or "circuit breaker closed" after previous open

**Unhealthy state:**
- "Circuit breaker opened" - system has fallen back to in-memory

### 5. Verify Redis Cache (If Enabled)

**Check Redis connectivity:**
```bash
redis-cli -u $REDIS_URL PING
# Should output: PONG
```

**Check cache entries:**
```bash
redis-cli -u $REDIS_URL KEYS "conversation:*" | wc -l
# Should show number of cached sessions
```

**Check cache hit rate in logs:**
```bash
grep "cache_hit_rate" logs/backend.log | tail -5
```

Target: >80% hit rate for active conversations

---

## Common Issues and Solutions

### Issue 1: Sessions Not Recovering After Restart

**Symptoms:**
- Active conversations lost after restart
- Users have to start over
- Recovery logs show 0 sessions recovered

**Diagnosis:**

1. Check if persistence is enabled:
```bash
echo $ENABLE_SESSION_PERSISTENCE
```

2. Check database table exists:
```sql
SELECT COUNT(*) FROM conversation_states;
```

3. Check recovery logs:
```bash
grep "recoverSessions" logs/backend.log
```

**Solutions:**

**If persistence disabled:**
```bash
# Enable in .env
ENABLE_SESSION_PERSISTENCE=true
# Restart backend
```

**If table doesn't exist:**
```bash
# Run migration
node scripts/run-migration.js up
```

**If sessions expired:**
- Sessions older than USER_IDLE_TTL_MS (default 6 hours) are not recovered
- This is expected behavior
- Check last_activity_at timestamps in database

**If deserialization errors:**
```bash
# Check for corrupted data
grep "deserialization failed" logs/backend.log
```
- Review error details
- May need to manually delete corrupted sessions:
```sql
DELETE FROM conversation_states WHERE id = <corrupted_session_id>;
```

### Issue 2: High Persistence Latency

**Symptoms:**
- Slow message processing
- Logs show persistence duration >100ms
- Users experience delays

**Diagnosis:**

1. Check persistence latency:
```bash
grep "persistState.*duration" logs/backend.log | awk '{print $NF}' | sort -n | tail -20
```

2. Check database performance:
```sql
SELECT 
  query,
  mean_exec_time,
  calls
FROM pg_stat_statements
WHERE query LIKE '%conversation_states%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

3. Check Redis availability:
```bash
redis-cli -u $REDIS_URL PING
```

**Solutions:**

**Enable Redis caching (if not already):**
```bash
# Add to .env
REDIS_URL=redis://your-redis-host:6379
# Restart backend
```

**Optimize database:**
```sql
-- Verify indexes exist
SELECT indexname FROM pg_indexes WHERE tablename = 'conversation_states';

-- Analyze table statistics
ANALYZE conversation_states;

-- Check for bloat
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename = 'conversation_states';
```

**Increase database connection pool:**
```javascript
// In config/database.js
pool: {
  max: 30,  // Increase from 20
  min: 5
}
```

**Check network latency:**
```bash
# Measure latency to database
time psql $DATABASE_URL -c "SELECT 1;"
```

### Issue 3: Circuit Breaker Activated

**Symptoms:**
- Alert: "Circuit breaker opened"
- System falls back to in-memory storage
- Persistence errors in logs

**Diagnosis:**

1. Check circuit breaker status:
```bash
grep "circuit breaker" logs/backend.log | tail -5
```

2. Check recent errors:
```bash
grep "persistence.*error" logs/backend.log | tail -20
```

3. Check database connectivity:
```bash
psql $DATABASE_URL -c "SELECT 1;"
```

**Solutions:**

**If database is down:**
- System will continue operating with in-memory storage
- Fix database connectivity
- Circuit breaker auto-resets after 60 seconds
- Monitor logs for "circuit breaker closed" message

**If database is slow:**
- Check database load and performance
- Consider scaling database resources
- Enable Redis caching to reduce database load

**If persistent errors:**
- Review error messages for root cause
- Check for database locks or deadlocks:
```sql
SELECT * FROM pg_stat_activity WHERE state = 'active';
```
- May need to manually reset circuit breaker by restarting backend

**Manual circuit breaker reset:**
```bash
# Restart backend to reset circuit breaker
pm2 restart backend
# Or
systemctl restart backend
```

### Issue 4: Redis Connection Failures

**Symptoms:**
- Logs show "Redis unavailable"
- Cache hit rate drops to 0%
- System falls back to database-only

**Diagnosis:**

1. Check Redis connectivity:
```bash
redis-cli -u $REDIS_URL PING
```

2. Check Redis logs:
```bash
redis-cli -u $REDIS_URL INFO server
```

3. Check application logs:
```bash
grep "Redis" logs/backend.log | tail -20
```

**Solutions:**

**If Redis is down:**
- System continues operating with database-only mode
- Restart Redis service
- Application will automatically reconnect

**If Redis is out of memory:**
```bash
# Check memory usage
redis-cli -u $REDIS_URL INFO memory

# Check eviction policy
redis-cli -u $REDIS_URL CONFIG GET maxmemory-policy
```

**Solutions:**
- Increase Redis memory limit
- Set eviction policy to `allkeys-lru`
- Reduce cache TTL if needed

**If authentication fails:**
```bash
# Verify REDIS_URL includes password
echo $REDIS_URL
# Should be: redis://:password@host:port
```

### Issue 5: High Cleanup Deletion Rate

**Symptoms:**
- Cleanup logs show unusually high deletion counts
- Sessions being deleted unexpectedly
- Users losing conversation state

**Diagnosis:**

1. Check cleanup statistics:
```bash
grep "cleanup.*deleted" logs/backend.log | tail -10
```

2. Check session age distribution:
```sql
SELECT 
  EXTRACT(EPOCH FROM (NOW() - last_activity_at))/3600 AS hours_ago,
  COUNT(*) as session_count
FROM conversation_states
GROUP BY 1
ORDER BY 1;
```

3. Check USER_IDLE_TTL_MS setting:
```bash
echo $USER_IDLE_TTL_MS
# Default: 21600000 (6 hours)
```

**Solutions:**

**If TTL is too short:**
```bash
# Increase idle timeout in .env
USER_IDLE_TTL_MS=43200000  # 12 hours
# Restart backend
```

**If sessions marked as finalized incorrectly:**
```sql
-- Check finalized sessions
SELECT 
  admin_id,
  phone,
  session_data->>'finalized' as finalized,
  last_activity_at
FROM conversation_states
WHERE (session_data->>'finalized')::boolean = true
LIMIT 10;
```

**If cleanup running too frequently:**
```bash
# Increase cleanup interval in .env
CLEANUP_INTERVAL_MS=1800000  # 30 minutes instead of 15
# Restart backend
```

### Issue 6: Database Table Growing Too Large

**Symptoms:**
- conversation_states table size increasing rapidly
- Slow query performance
- High storage costs

**Diagnosis:**

1. Check table size:
```sql
SELECT 
  pg_size_pretty(pg_total_relation_size('conversation_states')) AS total_size,
  pg_size_pretty(pg_relation_size('conversation_states')) AS table_size,
  pg_size_pretty(pg_indexes_size('conversation_states')) AS indexes_size;
```

2. Check row count:
```sql
SELECT COUNT(*) FROM conversation_states;
```

3. Check old sessions:
```sql
SELECT 
  COUNT(*) as old_sessions
FROM conversation_states
WHERE last_activity_at < NOW() - INTERVAL '7 days';
```

**Solutions:**

**Enable retention policy:**
```bash
# Add to .env
CONVERSATION_STATE_RETENTION_DAYS=30  # Delete sessions older than 30 days
# Restart backend
```

**Manual cleanup of old sessions:**
```sql
-- Delete sessions older than 90 days
DELETE FROM conversation_states
WHERE last_activity_at < NOW() - INTERVAL '90 days';

-- Vacuum table to reclaim space
VACUUM FULL conversation_states;
```

**Optimize table:**
```sql
-- Reindex
REINDEX TABLE conversation_states;

-- Update statistics
ANALYZE conversation_states;
```

---

## Manual Recovery Procedures

### Recover Specific Session

**Scenario:** User reports lost conversation state

**Steps:**

1. Check if session exists in database:
```sql
SELECT 
  id,
  admin_id,
  phone,
  last_activity_at,
  session_data
FROM conversation_states
WHERE phone = '+1234567890'  -- User's phone number
  AND admin_id = 1;           -- Admin ID
```

2. If session exists but not in memory:
```bash
# Restart backend to trigger recovery
pm2 restart backend
```

3. If session doesn't exist:
- Session may have expired (>6 hours idle)
- Check if user was marked as finalized
- User will need to start new conversation

### Recover All Sessions for Admin

**Scenario:** Admin's sessions not loading properly

**Steps:**

1. Check sessions in database:
```sql
SELECT 
  COUNT(*) as session_count,
  MAX(last_activity_at) as most_recent
FROM conversation_states
WHERE admin_id = 1
  AND last_activity_at > NOW() - INTERVAL '6 hours';
```

2. Restart admin's WhatsApp session:
```bash
# Via API
curl -X POST http://localhost:3001/whatsapp/disconnect \
  -H "Content-Type: application/json" \
  -d '{"adminId": 1}'

curl -X POST http://localhost:3001/whatsapp/start \
  -H "Content-Type: application/json" \
  -d '{"adminId": 1}'
```

3. Verify recovery in logs:
```bash
grep "Recovered.*admin.*1" logs/backend.log | tail -1
```

### Manually Persist Active Sessions

**Scenario:** Need to ensure all sessions saved before maintenance

**Steps:**

1. Trigger graceful shutdown (persists all sessions):
```bash
# Send SIGTERM signal
kill -TERM $(pgrep -f "node.*backend")
```

2. Wait for persistence completion:
```bash
tail -f logs/backend.log | grep "All sessions persisted"
```

3. Verify sessions in database:
```sql
SELECT 
  admin_id,
  COUNT(*) as persisted_sessions
FROM conversation_states
WHERE last_activity_at > NOW() - INTERVAL '1 hour'
GROUP BY admin_id;
```

### Restore from Backup

**Scenario:** Data corruption or accidental deletion

**Steps:**

1. Stop backend:
```bash
pm2 stop backend
```

2. Restore conversation_states table:
```bash
# Restore from backup
psql $DATABASE_URL < backup_conversation_states.sql
```

3. Verify restoration:
```sql
SELECT COUNT(*) FROM conversation_states;
```

4. Restart backend:
```bash
pm2 start backend
```

5. Monitor recovery:
```bash
tail -f logs/backend.log | grep "recoverSessions"
```

---

## Performance Investigation

### Identify Slow Persistence Operations

**Query logs for slow operations:**
```bash
grep "persistState" logs/backend.log | \
  awk '{print $(NF-1)}' | \
  awk -F'duration:' '{print $2}' | \
  awk -F'ms' '{if($1>100) print $1}' | \
  sort -n
```

**Check database slow query log:**
```sql
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%conversation_states%'
  AND mean_exec_time > 100
ORDER BY mean_exec_time DESC;
```

### Analyze Cache Performance

**Check cache hit rate:**
```bash
grep "cache_hit_rate" logs/backend.log | \
  awk '{print $NF}' | \
  awk '{sum+=$1; count++} END {print sum/count}'
```

**Check Redis performance:**
```bash
redis-cli -u $REDIS_URL --latency-history
```

**Analyze cache keys:**
```bash
redis-cli -u $REDIS_URL --scan --pattern "conversation:*" | wc -l
```

### Monitor Database Connection Pool

**Check active connections:**
```sql
SELECT 
  COUNT(*) as active_connections,
  state
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state;
```

**Check connection pool metrics in logs:**
```bash
grep "connection pool" logs/backend.log | tail -10
```

### Identify Bottlenecks

**Check system resources:**
```bash
# CPU usage
top -b -n 1 | grep node

# Memory usage
ps aux | grep node | awk '{print $4, $11}'

# Disk I/O
iostat -x 1 5
```

**Check database performance:**
```sql
-- Check for locks
SELECT * FROM pg_locks WHERE NOT granted;

-- Check for long-running queries
SELECT 
  pid,
  now() - query_start AS duration,
  query
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '1 second'
ORDER BY duration DESC;
```

---

## Disabling Persistence (Rollback)

### Temporary Disable (Keep Data)

**Steps:**

1. Update environment variable:
```bash
# In .env file
ENABLE_SESSION_PERSISTENCE=false
```

2. Restart backend:
```bash
pm2 restart backend
```

3. Verify in logs:
```bash
grep "Session persistence" logs/backend.log | tail -1
# Should show: "Session persistence disabled" or no persistence messages
```

4. System now uses in-memory storage only
5. Data remains in database for future re-enablement

### Permanent Disable (Remove Table)

**Steps:**

1. Disable feature flag:
```bash
# In .env file
ENABLE_SESSION_PERSISTENCE=false
```

2. Restart backend:
```bash
pm2 restart backend
```

3. Backup data (optional):
```bash
pg_dump -t conversation_states $DATABASE_URL > conversation_states_backup.sql
```

4. Run rollback migration:
```bash
node scripts/run-migration.js down
```

5. Verify table removed:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'conversation_states';
-- Should return no rows
```

### Re-enable After Disable

**Steps:**

1. If table was dropped, run migration:
```bash
node scripts/run-migration.js up
```

2. Enable feature flag:
```bash
# In .env file
ENABLE_SESSION_PERSISTENCE=true
```

3. Restart backend:
```bash
pm2 restart backend
```

4. Verify in logs:
```bash
grep "Session persistence enabled" logs/backend.log
```

---

## Database Maintenance

### Regular Maintenance Tasks

**Weekly:**

1. Check table size and growth:
```sql
SELECT 
  pg_size_pretty(pg_total_relation_size('conversation_states')) AS size,
  (SELECT COUNT(*) FROM conversation_states) AS row_count;
```

2. Update table statistics:
```sql
ANALYZE conversation_states;
```

3. Check index health:
```sql
SELECT 
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'conversation_states';
```

**Monthly:**

1. Vacuum table:
```sql
VACUUM ANALYZE conversation_states;
```

2. Reindex if needed:
```sql
REINDEX TABLE conversation_states;
```

3. Review retention policy:
```sql
SELECT 
  COUNT(*) as old_sessions,
  MIN(last_activity_at) as oldest_session
FROM conversation_states
WHERE last_activity_at < NOW() - INTERVAL '90 days';
```

### Cleanup Old Data

**Manual cleanup:**
```sql
-- Delete sessions older than retention period
DELETE FROM conversation_states
WHERE last_activity_at < NOW() - INTERVAL '90 days';

-- Vacuum to reclaim space
VACUUM FULL conversation_states;
```

### Backup Procedures

**Backup conversation_states table:**
```bash
# Full backup
pg_dump -t conversation_states $DATABASE_URL > conversation_states_$(date +%Y%m%d).sql

# Compressed backup
pg_dump -t conversation_states $DATABASE_URL | gzip > conversation_states_$(date +%Y%m%d).sql.gz
```

**Restore from backup:**
```bash
# Restore
psql $DATABASE_URL < conversation_states_20240115.sql

# Restore from compressed
gunzip -c conversation_states_20240115.sql.gz | psql $DATABASE_URL
```

---

## Redis Operations

### Check Redis Health

```bash
# Ping Redis
redis-cli -u $REDIS_URL PING

# Get server info
redis-cli -u $REDIS_URL INFO server

# Check memory usage
redis-cli -u $REDIS_URL INFO memory

# Check connected clients
redis-cli -u $REDIS_URL CLIENT LIST
```

### Manage Cache Entries

**View cache keys:**
```bash
# List all conversation keys
redis-cli -u $REDIS_URL KEYS "conversation:*"

# Count cache entries
redis-cli -u $REDIS_URL KEYS "conversation:*" | wc -l
```

**Inspect specific cache entry:**
```bash
# Get value
redis-cli -u $REDIS_URL GET "conversation:1:+1234567890"

# Get TTL
redis-cli -u $REDIS_URL TTL "conversation:1:+1234567890"
```

**Clear cache:**
```bash
# Clear all conversation cache entries
redis-cli -u $REDIS_URL --scan --pattern "conversation:*" | \
  xargs redis-cli -u $REDIS_URL DEL

# Clear entire Redis database (use with caution!)
redis-cli -u $REDIS_URL FLUSHDB
```

### Monitor Redis Performance

```bash
# Monitor commands in real-time
redis-cli -u $REDIS_URL MONITOR

# Check latency
redis-cli -u $REDIS_URL --latency

# Check slow log
redis-cli -u $REDIS_URL SLOWLOG GET 10
```

---

## Emergency Procedures

### Emergency: Database Down

**Immediate Actions:**

1. System automatically falls back to in-memory storage
2. Circuit breaker opens after 10 failures
3. Users can continue conversations (data not persisted)

**Steps:**

1. Verify fallback mode:
```bash
grep "circuit breaker opened" logs/backend.log
```

2. Fix database connectivity
3. Monitor for automatic recovery:
```bash
tail -f logs/backend.log | grep "circuit breaker"
```

4. Circuit auto-resets after 60 seconds
5. Persistence resumes automatically

**If circuit doesn't reset:**
```bash
# Restart backend to force reset
pm2 restart backend
```

### Emergency: High Error Rate

**Immediate Actions:**

1. Check alert details in monitoring dashboard
2. Review recent error logs:
```bash
grep "error" logs/backend.log | tail -50
```

3. Identify error pattern (database, Redis, serialization)

**If database errors:**
- Check database health and connectivity
- Check for locks or deadlocks
- Consider temporarily disabling persistence

**If Redis errors:**
- Redis failures are non-critical
- System falls back to database-only
- Fix Redis when possible

**If serialization errors:**
- Indicates data corruption or code bug
- Review error details
- May need to delete corrupted sessions

### Emergency: System Unresponsive

**Immediate Actions:**

1. Check if persistence is blocking:
```bash
# Check for hung processes
ps aux | grep node

# Check database connections
psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
```

2. If persistence is blocking, disable it:
```bash
# Quick disable
export ENABLE_SESSION_PERSISTENCE=false
pm2 restart backend
```

3. Investigate root cause after system restored

### Emergency: Data Loss

**Immediate Actions:**

1. Stop backend to prevent further changes:
```bash
pm2 stop backend
```

2. Assess extent of data loss:
```sql
SELECT 
  COUNT(*) as total_sessions,
  MAX(last_activity_at) as most_recent
FROM conversation_states;
```

3. If recent backup available, restore:
```bash
psql $DATABASE_URL < conversation_states_backup.sql
```

4. If no backup, check if data recoverable:
```sql
-- Check for soft-deleted data (if applicable)
SELECT * FROM conversation_states WHERE deleted_at IS NOT NULL;
```

5. Restart backend:
```bash
pm2 start backend
```

6. Notify affected users if necessary

---

## Escalation Contacts

**Database Issues:**
- Database Admin: [Contact]
- On-Call DBA: [Contact]

**Redis Issues:**
- DevOps Team: [Contact]
- Redis Support: [Contact]

**Application Issues:**
- Backend Lead: [Contact]
- On-Call Engineer: [Contact]

**Critical Incidents:**
- Incident Commander: [Contact]
- Engineering Manager: [Contact]

---

## Additional Resources

- **README.md** - Setup and configuration
- **DEPLOYMENT_CHECKLIST.md** - Deployment procedures
- **MONITORING_DASHBOARD.md** - Metrics and alerts
- **Design Document** - Architecture details
- **Requirements Document** - Feature specifications

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
|      |        |        |

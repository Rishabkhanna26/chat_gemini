# Session State Persistence - Deployment Checklist

This checklist guides you through deploying the session state persistence feature to production.

## Pre-Deployment

### 1. Database Backup
- [ ] Create full database backup
  ```bash
  pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
  ```
- [ ] Verify backup file created successfully
- [ ] Store backup in secure location
- [ ] Test backup restoration in staging environment (recommended)

### 2. Environment Preparation
- [ ] Review and update `.env` file with persistence configuration
- [ ] Set `ENABLE_SESSION_PERSISTENCE=false` initially (enable after migration)
- [ ] Configure `REDIS_URL` if using Redis caching (optional but recommended)
- [ ] Verify all persistence-related environment variables are set:
  - `USER_IDLE_TTL_MS` (default: 21600000)
  - `CLEANUP_INTERVAL_MS` (default: 900000)
  - `CONVERSATION_STATE_RETENTION_DAYS` (default: 90)
  - `PERSISTENCE_RETRY_ATTEMPTS` (default: 3)
  - `PERSISTENCE_BATCH_WINDOW_MS` (default: 500)
  - `CIRCUIT_BREAKER_THRESHOLD` (default: 10)
  - `CIRCUIT_BREAKER_RESET_MS` (default: 60000)

### 3. Redis Setup (Optional)
- [ ] Provision Redis instance (Redis Cloud, AWS ElastiCache, or self-hosted)
- [ ] Configure Redis authentication and TLS (production)
- [ ] Test Redis connectivity from application server
- [ ] Set `REDIS_URL` in environment variables
- [ ] Verify Redis version >= 6.0

### 4. Code Deployment
- [ ] Deploy latest code to staging environment
- [ ] Run full test suite in staging
- [ ] Verify no breaking changes to existing functionality
- [ ] Test WhatsApp message flow in staging

## Migration Execution

### 5. Database Migration
- [ ] Schedule maintenance window (recommended: low-traffic period)
- [ ] Notify users of potential brief disruption
- [ ] Run migration script:
  ```bash
  node scripts/run-migration.js up
  ```
- [ ] Verify migration success:
  ```sql
  SELECT table_name FROM information_schema.tables 
  WHERE table_name = 'conversation_states';
  ```
- [ ] Verify indexes created:
  ```sql
  SELECT indexname FROM pg_indexes 
  WHERE tablename = 'conversation_states';
  ```
- [ ] Verify foreign key constraint:
  ```sql
  SELECT constraint_name, constraint_type 
  FROM information_schema.table_constraints 
  WHERE table_name = 'conversation_states';
  ```

### 6. Enable Persistence
- [ ] Update environment variable: `ENABLE_SESSION_PERSISTENCE=true`
- [ ] Restart backend application
- [ ] Monitor startup logs for:
  - "Session persistence enabled" message
  - Session recovery statistics
  - Redis connection status (if configured)
- [ ] Verify no startup errors

## Post-Deployment Validation

### 7. Functional Testing
- [ ] Send test WhatsApp message to verify message processing works
- [ ] Verify conversation state persisted to database:
  ```sql
  SELECT admin_id, phone, last_activity_at 
  FROM conversation_states 
  ORDER BY created_at DESC LIMIT 5;
  ```
- [ ] Restart backend and verify session recovery:
  - Check logs for recovery statistics
  - Verify active conversations continue seamlessly
- [ ] Test graceful shutdown (SIGTERM):
  ```bash
  kill -TERM <backend_pid>
  ```
  - Verify all states persisted before exit
  - Check logs for "All sessions persisted" message

### 8. Performance Monitoring
- [ ] Monitor persistence latency metrics:
  - p95 < 100ms (target)
  - p99 < 500ms (target)
- [ ] Monitor cache hit rate (if Redis enabled):
  - Target: 80%+ for active conversations
- [ ] Monitor database connection pool:
  - Check for connection exhaustion
  - Verify pool size adequate for load
- [ ] Monitor error rates:
  - Watch for persistence failures
  - Check circuit breaker activations

### 9. Redis Validation (If Enabled)
- [ ] Verify cache entries created:
  ```bash
  redis-cli KEYS "conversation:*"
  ```
- [ ] Verify TTL set correctly:
  ```bash
  redis-cli TTL "conversation:<admin_id>:<phone>"
  ```
- [ ] Test cache invalidation across instances (multi-instance deployments)
- [ ] Monitor Redis memory usage
- [ ] Verify fallback to database if Redis fails

### 10. Monitoring and Alerting
- [ ] Configure alerts for:
  - Circuit breaker activation
  - High persistence error rate (>5%)
  - Slow persistence operations (>100ms p95)
  - Failed session recovery on startup
  - Database connection failures
- [ ] Verify Sentry integration (if configured):
  - Test error reporting
  - Check error grouping and context
- [ ] Set up dashboard for key metrics (see MONITORING_DASHBOARD.md)

## Rollback Procedure

### If Issues Arise

**Option 1: Disable Persistence (Quick Rollback)**
- [ ] Set `ENABLE_SESSION_PERSISTENCE=false`
- [ ] Restart backend
- [ ] Verify system returns to in-memory mode
- [ ] Data remains in database for future re-enablement

**Option 2: Full Rollback (Remove Table)**
- [ ] Set `ENABLE_SESSION_PERSISTENCE=false`
- [ ] Restart backend
- [ ] Run rollback migration:
  ```bash
  node scripts/run-migration.js down
  ```
- [ ] Verify table dropped:
  ```sql
  SELECT table_name FROM information_schema.tables 
  WHERE table_name = 'conversation_states';
  ```

**Option 3: Database Restore (Critical Issues)**
- [ ] Stop backend application
- [ ] Restore from backup:
  ```bash
  psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
  ```
- [ ] Set `ENABLE_SESSION_PERSISTENCE=false`
- [ ] Restart backend

## Post-Deployment

### 11. Documentation
- [ ] Update internal documentation with deployment date
- [ ] Document any configuration changes made
- [ ] Update runbook with lessons learned
- [ ] Share deployment summary with team

### 12. Cleanup
- [ ] Archive deployment logs
- [ ] Keep database backup for retention period
- [ ] Remove temporary files and scripts
- [ ] Update deployment tracking system

## Multi-Instance Deployment Notes

For horizontal scaling with multiple backend instances:

- [ ] Ensure all instances use same `DATABASE_URL`
- [ ] Ensure all instances use same `REDIS_URL` (if caching enabled)
- [ ] Deploy instances sequentially (rolling deployment)
- [ ] Verify Redis pub/sub working across instances
- [ ] Test conversation continuity across instance restarts
- [ ] Monitor for state conflicts (should be handled by last-write-wins)

## Success Criteria

Deployment is successful when:
- ✅ All active conversations persist through backend restart
- ✅ No increase in error rates or latency
- ✅ Session recovery completes in <5 seconds for 1000 sessions
- ✅ p95 persistence latency <100ms
- ✅ Cache hit rate >80% (if Redis enabled)
- ✅ No data loss during graceful shutdown
- ✅ Circuit breaker not activated under normal load
- ✅ All monitoring alerts configured and working

## Emergency Contacts

- Database Admin: [Contact Info]
- DevOps Lead: [Contact Info]
- On-Call Engineer: [Contact Info]
- Redis Support: [Contact Info]

## Deployment Log

| Date | Version | Deployed By | Status | Notes |
|------|---------|-------------|--------|-------|
|      |         |             |        |       |

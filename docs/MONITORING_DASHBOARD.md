# Session State Persistence - Monitoring Dashboard Configuration

This document defines metrics, alerts, and dashboard configurations for monitoring the session state persistence layer.

## Overview

The persistence layer emits comprehensive metrics and logs to enable real-time monitoring, alerting, and troubleshooting. This guide covers:
- Key metrics to track
- Alert thresholds and conditions
- Dashboard layout recommendations
- Sentry integration
- Log analysis queries

## Key Metrics

### 1. Persistence Latency Metrics

**state_save_duration**
- **Description:** Time taken to persist conversation state to database
- **Type:** Histogram (milliseconds)
- **Target:** p95 < 100ms, p99 < 500ms
- **Alert Threshold:** p95 > 150ms (warning), p95 > 200ms (critical)

**state_load_duration**
- **Description:** Time taken to load conversation state from database/cache
- **Type:** Histogram (milliseconds)
- **Target:** p95 < 50ms (with cache), p95 < 100ms (without cache)
- **Alert Threshold:** p95 > 150ms (warning)

**message_processing_overhead**
- **Description:** Additional latency added by persistence to message processing
- **Type:** Histogram (milliseconds)
- **Target:** < 50ms
- **Alert Threshold:** > 100ms (warning)

### 2. Cache Performance Metrics

**cache_hit_rate**
- **Description:** Percentage of state reads served from Redis cache
- **Type:** Gauge (percentage)
- **Target:** > 80% for active conversations
- **Alert Threshold:** < 60% (warning), < 40% (critical)

**cache_read_duration**
- **Description:** Time taken to read from Redis cache
- **Type:** Histogram (milliseconds)
- **Target:** p99 < 10ms
- **Alert Threshold:** p99 > 50ms (warning)

**cache_availability**
- **Description:** Redis connection health status
- **Type:** Boolean (1 = available, 0 = unavailable)
- **Alert Threshold:** 0 for > 5 minutes (warning)

### 3. Error and Reliability Metrics

**persistence_errors**
- **Description:** Count of failed persistence operations
- **Type:** Counter
- **Target:** < 1% of total operations
- **Alert Threshold:** > 5% error rate over 5 minutes (critical)

**circuit_breaker_state**
- **Description:** Circuit breaker status (CLOSED, OPEN, HALF_OPEN)
- **Type:** Gauge (0 = CLOSED, 1 = OPEN, 2 = HALF_OPEN)
- **Alert Threshold:** 1 (OPEN) - immediate critical alert

**retry_attempts**
- **Description:** Count of retry attempts for failed operations
- **Type:** Counter
- **Alert Threshold:** Sustained high retry rate (>10/min) - warning

**serialization_errors**
- **Description:** Count of state serialization failures
- **Type:** Counter
- **Alert Threshold:** > 0 (investigate immediately)

### 4. Recovery and Cleanup Metrics

**sessions_recovered_count**
- **Description:** Number of sessions recovered on startup
- **Type:** Gauge
- **Alert Threshold:** Unexpected drop (>50% decrease) - warning

**recovery_duration**
- **Description:** Time taken to recover all sessions on startup
- **Type:** Histogram (milliseconds)
- **Target:** < 5 seconds for 1000 sessions
- **Alert Threshold:** > 10 seconds (warning)

**failed_recoveries**
- **Description:** Count of sessions that failed to recover
- **Type:** Counter
- **Alert Threshold:** > 5% of total sessions (warning)

**cleanup_sessions_deleted**
- **Description:** Number of sessions deleted by cleanup service
- **Type:** Counter
- **Alert Threshold:** Unexpected spike (>2x normal) - investigate

**cleanup_duration**
- **Description:** Time taken to run cleanup operation
- **Type:** Histogram (milliseconds)
- **Target:** < 1 second
- **Alert Threshold:** > 5 seconds (warning)

### 5. Database Metrics

**db_connection_pool_active**
- **Description:** Number of active database connections
- **Type:** Gauge
- **Alert Threshold:** > 80% of pool size (warning)

**db_connection_pool_idle**
- **Description:** Number of idle database connections
- **Type:** Gauge
- **Alert Threshold:** 0 idle connections (warning - pool exhausted)

**db_query_duration**
- **Description:** Database query execution time
- **Type:** Histogram (milliseconds)
- **Target:** p95 < 50ms
- **Alert Threshold:** p95 > 100ms (warning)

## Alert Configurations

### Critical Alerts (Immediate Action Required)

**1. Circuit Breaker Activated**
```yaml
alert: CircuitBreakerOpen
condition: circuit_breaker_state == 1
duration: 0s (immediate)
severity: critical
message: "Session persistence circuit breaker is OPEN. System has fallen back to in-memory storage."
action: 
  - Check database connectivity
  - Review error logs for root cause
  - Verify database performance
  - Circuit auto-resets after 60 seconds
```

**2. High Persistence Error Rate**
```yaml
alert: HighPersistenceErrorRate
condition: (persistence_errors / total_operations) > 0.05
duration: 5m
severity: critical
message: "Persistence error rate exceeds 5% over last 5 minutes."
action:
  - Check database health
  - Review error logs
  - Verify network connectivity
  - Check for database locks or deadlocks
```

**3. Database Connection Pool Exhausted**
```yaml
alert: DatabasePoolExhausted
condition: db_connection_pool_idle == 0 AND db_connection_pool_active >= pool_max
duration: 2m
severity: critical
message: "Database connection pool exhausted. New operations may be blocked."
action:
  - Increase pool size if needed
  - Check for connection leaks
  - Review slow queries
```

### Warning Alerts (Investigation Needed)

**4. Slow Persistence Operations**
```yaml
alert: SlowPersistenceOperations
condition: state_save_duration_p95 > 150ms
duration: 10m
severity: warning
message: "p95 persistence latency exceeds 150ms."
action:
  - Enable Redis caching if not already enabled
  - Check database performance
  - Review database indexes
  - Monitor database load
```

**5. Low Cache Hit Rate**
```yaml
alert: LowCacheHitRate
condition: cache_hit_rate < 0.60
duration: 15m
severity: warning
message: "Redis cache hit rate below 60%."
action:
  - Verify Redis is running and accessible
  - Check Redis memory limits
  - Review cache TTL configuration
  - Monitor cache eviction rate
```

**6. High Failed Recovery Rate**
```yaml
alert: HighFailedRecoveryRate
condition: (failed_recoveries / sessions_recovered_count) > 0.05
duration: 0s (on startup)
severity: warning
message: "More than 5% of sessions failed to recover on startup."
action:
  - Review recovery error logs
  - Check for corrupted session data
  - Verify serialization logic
```

**7. Redis Unavailable**
```yaml
alert: RedisUnavailable
condition: cache_availability == 0
duration: 5m
severity: warning
message: "Redis cache is unavailable. System has fallen back to database-only mode."
action:
  - Check Redis service status
  - Verify Redis connectivity
  - Review Redis logs
  - System continues operating without cache
```

## Dashboard Layout

### Dashboard 1: Persistence Overview

**Panel 1: Persistence Latency (Time Series)**
- Metrics: state_save_duration (p50, p95, p99)
- Visualization: Line chart
- Time range: Last 1 hour
- Y-axis: Milliseconds
- Threshold lines: 100ms (target), 150ms (warning)

**Panel 2: Cache Performance (Time Series)**
- Metrics: cache_hit_rate, cache_read_duration_p99
- Visualization: Dual-axis line chart
- Time range: Last 1 hour
- Left Y-axis: Hit rate (%)
- Right Y-axis: Duration (ms)

**Panel 3: Error Rate (Time Series)**
- Metrics: persistence_errors (rate per minute)
- Visualization: Line chart with area fill
- Time range: Last 1 hour
- Y-axis: Errors per minute
- Threshold line: 5% of operations

**Panel 4: Circuit Breaker Status (Single Stat)**
- Metric: circuit_breaker_state
- Visualization: Status indicator
- Values: CLOSED (green), OPEN (red), HALF_OPEN (yellow)

**Panel 5: Active Sessions (Single Stat)**
- Metric: count(conversation_states)
- Visualization: Big number
- Query: `SELECT COUNT(*) FROM conversation_states WHERE last_activity_at > NOW() - INTERVAL '6 hours'`

**Panel 6: Database Connection Pool (Gauge)**
- Metrics: db_connection_pool_active, db_connection_pool_idle
- Visualization: Stacked bar or gauge
- Max value: pool_max (20)

### Dashboard 2: Recovery and Cleanup

**Panel 1: Session Recovery Statistics (Table)**
- Metrics: sessions_recovered_count, failed_recoveries, recovery_duration
- Visualization: Table (last 10 startups)
- Columns: Timestamp, Recovered, Failed, Duration (ms), Success Rate (%)

**Panel 2: Recovery Duration Trend (Time Series)**
- Metric: recovery_duration
- Visualization: Line chart
- Time range: Last 7 days
- Y-axis: Milliseconds
- Threshold line: 5000ms (5 seconds)

**Panel 3: Cleanup Statistics (Time Series)**
- Metrics: cleanup_sessions_deleted, cleanup_duration
- Visualization: Dual-axis line chart
- Time range: Last 24 hours
- Left Y-axis: Sessions deleted
- Right Y-axis: Duration (ms)

**Panel 4: Session Age Distribution (Histogram)**
- Query: `SELECT EXTRACT(EPOCH FROM (NOW() - last_activity_at))/3600 AS hours_ago FROM conversation_states`
- Visualization: Histogram
- X-axis: Hours since last activity
- Y-axis: Count of sessions

### Dashboard 3: Database Performance

**Panel 1: Query Duration (Time Series)**
- Metric: db_query_duration (p50, p95, p99)
- Visualization: Line chart
- Time range: Last 1 hour
- Y-axis: Milliseconds

**Panel 2: Query Rate (Time Series)**
- Metrics: SELECT rate, INSERT rate, UPDATE rate, DELETE rate
- Visualization: Stacked area chart
- Time range: Last 1 hour
- Y-axis: Queries per second

**Panel 3: Table Size (Single Stat)**
- Query: `SELECT pg_size_pretty(pg_total_relation_size('conversation_states'))`
- Visualization: Big number with trend

**Panel 4: Index Usage (Table)**
- Query: `SELECT indexname, idx_scan, idx_tup_read FROM pg_stat_user_indexes WHERE tablename = 'conversation_states'`
- Visualization: Table
- Columns: Index Name, Scans, Tuples Read

## Sentry Integration

### Error Tracking Configuration

**1. Persistence Errors**
```javascript
Sentry.captureException(error, {
  tags: {
    component: 'session-persistence',
    operation: 'persistState',
    admin_id: adminId
  },
  extra: {
    phone: maskPhone(phone),
    retry_attempt: attemptNumber,
    circuit_breaker_state: circuitBreaker.state,
    duration_ms: duration
  },
  level: 'error'
});
```

**2. Circuit Breaker Events**
```javascript
Sentry.captureMessage('Circuit breaker opened', {
  level: 'critical',
  tags: {
    component: 'session-persistence',
    event: 'circuit_breaker_open'
  },
  extra: {
    consecutive_failures: failures,
    threshold: threshold,
    last_error: lastError.message
  }
});
```

**3. Recovery Failures**
```javascript
Sentry.captureException(error, {
  tags: {
    component: 'session-persistence',
    operation: 'recoverSessions',
    admin_id: adminId
  },
  extra: {
    total_sessions: totalCount,
    failed_sessions: failedCount,
    recovery_duration_ms: duration
  },
  level: 'warning'
});
```

### Sentry Alert Rules

**Rule 1: High Error Rate**
- Condition: > 10 persistence errors in 5 minutes
- Action: Send notification to #alerts channel
- Severity: High

**Rule 2: Circuit Breaker Activation**
- Condition: Circuit breaker opened event
- Action: Page on-call engineer
- Severity: Critical

**Rule 3: Serialization Errors**
- Condition: Any serialization error
- Action: Create Jira ticket for investigation
- Severity: Medium

## Log Analysis Queries

### Query 1: Find Slow Persistence Operations
```
component:"session-persistence" operation:"persistState" duration_ms:>100
| stats avg(duration_ms), p95(duration_ms), p99(duration_ms) by admin_id
```

### Query 2: Track Circuit Breaker Events
```
component:"session-persistence" "circuit breaker"
| timechart count by event
```

### Query 3: Analyze Recovery Performance
```
component:"session-persistence" operation:"recoverSessions"
| stats avg(recovery_duration_ms), avg(sessions_recovered_count), avg(failed_recoveries)
```

### Query 4: Identify Persistence Errors by Admin
```
component:"session-persistence" level:error
| stats count by admin_id, error_message
| sort -count
```

### Query 5: Monitor Cache Performance
```
component:"session-persistence" operation:"loadState"
| stats count by cache_hit
| eval hit_rate = (cache_hit_count / total_count) * 100
```

## Monitoring Tools Integration

### Grafana Configuration

**Data Sources:**
- PostgreSQL (for database metrics)
- Redis (for cache metrics)
- Application logs (for error tracking)
- Prometheus/StatsD (for application metrics)

**Dashboard Import:**
```json
{
  "dashboard": {
    "title": "Session State Persistence",
    "tags": ["persistence", "whatsapp", "sessions"],
    "timezone": "browser",
    "refresh": "30s"
  }
}
```

### Prometheus Metrics Export

```javascript
// Example metric definitions
const persistenceDuration = new Histogram({
  name: 'session_persistence_duration_ms',
  help: 'Duration of persistence operations',
  labelNames: ['operation', 'admin_id', 'status'],
  buckets: [10, 25, 50, 100, 250, 500, 1000]
});

const cacheHitRate = new Gauge({
  name: 'session_cache_hit_rate',
  help: 'Cache hit rate percentage',
  labelNames: ['admin_id']
});

const circuitBreakerState = new Gauge({
  name: 'session_circuit_breaker_state',
  help: 'Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)'
});
```

### CloudWatch Metrics (AWS)

```javascript
// Example CloudWatch metric publishing
const cloudwatch = new AWS.CloudWatch();

cloudwatch.putMetricData({
  Namespace: 'WhatsApp/SessionPersistence',
  MetricData: [
    {
      MetricName: 'PersistenceDuration',
      Value: duration,
      Unit: 'Milliseconds',
      Dimensions: [
        { Name: 'Operation', Value: 'persistState' },
        { Name: 'AdminId', Value: adminId }
      ]
    }
  ]
});
```

## Health Check Endpoints

### Endpoint 1: Persistence Health
```
GET /health/persistence

Response:
{
  "status": "healthy",
  "persistence_enabled": true,
  "circuit_breaker_state": "CLOSED",
  "cache_available": true,
  "last_persistence_duration_ms": 45,
  "active_sessions_count": 127
}
```

### Endpoint 2: Metrics Summary
```
GET /metrics/persistence

Response:
{
  "persistence_latency_p95_ms": 78,
  "cache_hit_rate": 0.85,
  "error_rate": 0.002,
  "sessions_recovered_last_startup": 156,
  "cleanup_last_run": "2024-01-15T10:30:00Z",
  "cleanup_sessions_deleted": 23
}
```

## Runbook References

For troubleshooting specific issues, refer to:
- **OPERATIONAL_RUNBOOK.md** - Detailed troubleshooting procedures
- **DEPLOYMENT_CHECKLIST.md** - Deployment and rollback procedures
- **README.md** - Configuration and setup instructions

## Review Schedule

- **Daily:** Review error rates and alert history
- **Weekly:** Analyze performance trends and capacity planning
- **Monthly:** Review and update alert thresholds based on observed patterns
- **Quarterly:** Audit dashboard effectiveness and metric relevance

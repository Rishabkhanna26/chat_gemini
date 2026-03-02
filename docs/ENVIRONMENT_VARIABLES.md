# Environment Variables Reference

This document provides a comprehensive reference for all environment variables used in the session state persistence feature, including where they're used, whether they can be set statically, and best practices.

## Table of Contents

1. [Overview](#overview)
2. [Core Persistence Variables](#core-persistence-variables)
3. [Redis Cache Variables](#redis-cache-variables)
4. [Performance Tuning Variables](#performance-tuning-variables)
5. [Cleanup and Retention Variables](#cleanup-and-retention-variables)
6. [Resilience Variables](#resilience-variables)
7. [Static vs Dynamic Configuration](#static-vs-dynamic-configuration)
8. [Configuration File Reference](#configuration-file-reference)
9. [Best Practices](#best-practices)

---

## Overview

The session state persistence feature uses environment variables for configuration to support:
- **Environment-specific settings** (dev, staging, production)
- **Runtime configuration** without code changes
- **Security** (sensitive values like Redis URLs)
- **Deployment flexibility** (different settings per instance)

### Configuration Loading

Environment variables are loaded in this order:
1. System environment variables
2. `.env` file (via dotenv)
3. Default values in `src/persistence/config.js`

---

## Core Persistence Variables

### ENABLE_SESSION_PERSISTENCE

**Purpose:** Master switch to enable/disable session state persistence

**Used In:**
- `src/persistence/index.js` - Initialization logic
- `src/whatsapp.js` - Persistence hooks

**Type:** Boolean (string)

**Values:**
- `"true"` - Enable persistence (database-backed sessions)
- `"false"` - Disable persistence (in-memory only)

**Default:** `"false"`

**Can Be Static?** ❌ **Must use environment variable**

**Reason:** 
- Needs to change per environment (dev vs production)
- Allows quick disable without code deployment
- Enables gradual rollout and A/B testing

**Example:**
```bash
# .env
ENABLE_SESSION_PERSISTENCE=true
```

**Code Usage:**
```javascript
// src/persistence/config.js
const enabled = process.env.ENABLE_SESSION_PERSISTENCE === 'true';

// src/persistence/index.js
if (config.enabled) {
  // Initialize persistence components
}
```

---

### DATABASE_URL

**Purpose:** PostgreSQL connection string for persistence storage

**Used In:**
- `src/persistence/index.js` - Database pool creation
- `scripts/run-migration.js` - Migration execution

**Type:** String (connection URL)

**Format:** `postgresql://user:password@host:port/database`

**Default:** None (required if persistence enabled)

**Can Be Static?** ❌ **Must use environment variable**

**Reason:**
- Contains sensitive credentials
- Different per environment
- Security best practice (never commit to code)

**Example:**
```bash
# .env
DATABASE_URL=postgresql://postgres:password@localhost:5432/mex_end
```

**Code Usage:**
```javascript
// src/persistence/index.js
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
```

---

## Redis Cache Variables

### REDIS_URL

**Purpose:** Redis connection string for optional caching layer

**Used In:**
- `src/persistence/index.js` - Redis client creation
- `src/persistence/CacheLayer.js` - Cache operations

**Type:** String (connection URL)

**Format:** `redis://[:password@]host:port[/database]`

**Default:** `undefined` (Redis caching disabled)

**Can Be Static?** ❌ **Must use environment variable**

**Reason:**
- Contains sensitive credentials (if password protected)
- Different per environment
- Optional feature (not all environments need Redis)

**Example:**
```bash
# .env
REDIS_URL=redis://:mypassword@localhost:6379/0

# Or without password
REDIS_URL=redis://localhost:6379
```

**Code Usage:**
```javascript
// src/persistence/index.js
let cacheLayer = null;
if (process.env.REDIS_URL) {
  const redisClient = createClient({ url: process.env.REDIS_URL });
  await redisClient.connect();
  cacheLayer = new CacheLayer({ redisClient, logger, config });
}
```

**Notes:**
- If not set, system works without caching (database-only)
- Recommended for production for better performance
- Optional in development

---

## Performance Tuning Variables

### USER_IDLE_TTL_MS

**Purpose:** Time in milliseconds before inactive sessions are considered expired

**Used In:**
- `src/persistence/config.js` - Configuration
- `src/persistence/RecoveryManager.js` - Session recovery filtering
- `src/persistence/SessionCleanupService.js` - Cleanup logic
- `src/persistence/CacheLayer.js` - Cache TTL

**Type:** Number (milliseconds)

**Default:** `21600000` (6 hours)

**Can Be Static?** ✅ **Can be static, but environment variable recommended**

**Reason:**
- May need different values per environment
- Business requirement may change
- Easier to tune without redeployment

**Example:**
```bash
# .env
USER_IDLE_TTL_MS=21600000  # 6 hours
USER_IDLE_TTL_MS=43200000  # 12 hours
USER_IDLE_TTL_MS=3600000   # 1 hour (testing)
```

**Static Alternative:**
```javascript
// src/persistence/config.js
const USER_IDLE_TTL_MS = 21600000; // 6 hours - hardcoded
```

**Code Usage:**
```javascript
// src/persistence/config.js
userIdleTtlMs: parseInt(process.env.USER_IDLE_TTL_MS || '21600000', 10)

// src/persistence/RecoveryManager.js
const cutoffTime = new Date(Date.now() - config.userIdleTtlMs);
const query = `
  SELECT * FROM conversation_states 
  WHERE admin_id = $1 
    AND last_activity_at > $2
`;
```

**Recommendation:** Use environment variable for flexibility

---

### PERSISTENCE_BATCH_WINDOW_MS

**Purpose:** Time window for batching rapid state updates

**Used In:**
- `src/persistence/config.js` - Configuration
- `src/persistence/SessionStateManager.js` - BatchWriter

**Type:** Number (milliseconds)

**Default:** `500` (500ms)

**Can Be Static?** ✅ **Can be static**

**Reason:**
- Performance optimization parameter
- Rarely needs to change
- Same value works for most use cases

**Example:**
```bash
# .env
PERSISTENCE_BATCH_WINDOW_MS=500   # Default
PERSISTENCE_BATCH_WINDOW_MS=1000  # More aggressive batching
PERSISTENCE_BATCH_WINDOW_MS=100   # Less batching, more real-time
```

**Static Alternative:**
```javascript
// src/persistence/config.js
const PERSISTENCE_BATCH_WINDOW_MS = 500; // Hardcoded
```

**Code Usage:**
```javascript
// src/persistence/SessionStateManager.js
class BatchWriter {
  constructor(config) {
    this.batchWindow = config.batchWindowMs;
    this.pendingWrites = new Map();
  }
  
  scheduleBatch(key, data) {
    clearTimeout(this.timers.get(key));
    this.pendingWrites.set(key, data);
    
    const timer = setTimeout(() => {
      this.flushBatch(key);
    }, this.batchWindow);
    
    this.timers.set(key, timer);
  }
}
```

**Recommendation:** Use static value unless you need environment-specific tuning

---

### PERSISTENCE_RETRY_ATTEMPTS

**Purpose:** Number of retry attempts for failed persistence operations

**Used In:**
- `src/persistence/config.js` - Configuration
- `src/persistence/SessionStateManager.js` - Retry logic

**Type:** Number

**Default:** `3`

**Can Be Static?** ✅ **Can be static**

**Reason:**
- Rarely needs to change
- Same retry strategy works for most cases
- Can be tuned if needed for specific environments

**Example:**
```bash
# .env
PERSISTENCE_RETRY_ATTEMPTS=3  # Default
PERSISTENCE_RETRY_ATTEMPTS=5  # More retries for unreliable network
PERSISTENCE_RETRY_ATTEMPTS=1  # Fail fast in testing
```

**Static Alternative:**
```javascript
// src/persistence/config.js
const PERSISTENCE_RETRY_ATTEMPTS = 3; // Hardcoded
```

**Code Usage:**
```javascript
// src/persistence/SessionStateManager.js
async retryWithBackoff(operation, maxAttempts = config.retryAttempts) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const delay = Math.pow(2, attempt - 1) * 100;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

**Recommendation:** Use static value, override with env var only if needed

---

## Cleanup and Retention Variables

### CLEANUP_INTERVAL_MS

**Purpose:** Interval between cleanup service runs

**Used In:**
- `src/persistence/config.js` - Configuration
- `src/persistence/SessionCleanupService.js` - Cleanup scheduling

**Type:** Number (milliseconds)

**Default:** `900000` (15 minutes)

**Can Be Static?** ✅ **Can be static**

**Reason:**
- Operational parameter
- Same interval works for most deployments
- Can be adjusted if cleanup load is too high/low

**Example:**
```bash
# .env
CLEANUP_INTERVAL_MS=900000   # 15 minutes (default)
CLEANUP_INTERVAL_MS=1800000  # 30 minutes (less frequent)
CLEANUP_INTERVAL_MS=300000   # 5 minutes (more frequent, testing)
```

**Static Alternative:**
```javascript
// src/persistence/config.js
const CLEANUP_INTERVAL_MS = 900000; // 15 minutes - hardcoded
```

**Code Usage:**
```javascript
// src/persistence/SessionCleanupService.js
start() {
  this.intervalId = setInterval(() => {
    this.runCleanup();
  }, this.config.cleanupIntervalMs);
}
```

**Recommendation:** Use static value, override with env var for specific needs

---

### CONVERSATION_STATE_RETENTION_DAYS

**Purpose:** Number of days to retain conversation states before deletion

**Used In:**
- `src/persistence/config.js` - Configuration
- `src/persistence/SessionCleanupService.js` - Retention policy

**Type:** Number (days)

**Default:** `90` (90 days)

**Can Be Static?** ⚠️ **Environment variable recommended**

**Reason:**
- Business/compliance requirement
- May differ per environment (shorter in dev/staging)
- GDPR/data retention policies may require changes

**Example:**
```bash
# .env
CONVERSATION_STATE_RETENTION_DAYS=90   # 3 months (default)
CONVERSATION_STATE_RETENTION_DAYS=30   # 1 month (stricter retention)
CONVERSATION_STATE_RETENTION_DAYS=365  # 1 year (longer retention)
CONVERSATION_STATE_RETENTION_DAYS=7    # 1 week (testing/dev)
```

**Static Alternative:**
```javascript
// src/persistence/config.js
const CONVERSATION_STATE_RETENTION_DAYS = 90; // Hardcoded
```

**Code Usage:**
```javascript
// src/persistence/SessionCleanupService.js
async runCleanup() {
  const retentionCutoff = new Date(
    Date.now() - (config.retentionDays * 24 * 60 * 60 * 1000)
  );
  
  await this.db.query(`
    DELETE FROM conversation_states
    WHERE last_activity_at < $1
    LIMIT 1000
  `, [retentionCutoff]);
}
```

**Recommendation:** Use environment variable for compliance flexibility

---

## Resilience Variables

### CIRCUIT_BREAKER_THRESHOLD

**Purpose:** Number of consecutive failures before circuit breaker opens

**Used In:**
- `src/persistence/config.js` - Configuration
- `src/persistence/SessionStateManager.js` - Circuit breaker logic

**Type:** Number

**Default:** `10`

**Can Be Static?** ✅ **Can be static**

**Reason:**
- Resilience parameter
- Same threshold works for most cases
- Rarely needs environment-specific tuning

**Example:**
```bash
# .env
CIRCUIT_BREAKER_THRESHOLD=10  # Default
CIRCUIT_BREAKER_THRESHOLD=5   # More sensitive (fail faster)
CIRCUIT_BREAKER_THRESHOLD=20  # Less sensitive (more tolerant)
```

**Static Alternative:**
```javascript
// src/persistence/config.js
const CIRCUIT_BREAKER_THRESHOLD = 10; // Hardcoded
```

**Code Usage:**
```javascript
// src/persistence/SessionStateManager.js
class CircuitBreaker {
  constructor(threshold) {
    this.threshold = threshold;
    this.consecutiveFailures = 0;
    this.state = 'CLOSED';
  }
  
  recordFailure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.threshold) {
      this.open();
    }
  }
}
```

**Recommendation:** Use static value unless specific tuning needed

---

### CIRCUIT_BREAKER_RESET_MS

**Purpose:** Time before circuit breaker attempts to close after opening

**Used In:**
- `src/persistence/config.js` - Configuration
- `src/persistence/SessionStateManager.js` - Circuit breaker reset logic

**Type:** Number (milliseconds)

**Default:** `60000` (60 seconds)

**Can Be Static?** ✅ **Can be static**

**Reason:**
- Resilience parameter
- Same reset time works for most cases
- Rarely needs environment-specific tuning

**Example:**
```bash
# .env
CIRCUIT_BREAKER_RESET_MS=60000   # 1 minute (default)
CIRCUIT_BREAKER_RESET_MS=30000   # 30 seconds (faster recovery)
CIRCUIT_BREAKER_RESET_MS=120000  # 2 minutes (slower recovery)
```

**Static Alternative:**
```javascript
// src/persistence/config.js
const CIRCUIT_BREAKER_RESET_MS = 60000; // 1 minute - hardcoded
```

**Code Usage:**
```javascript
// src/persistence/SessionStateManager.js
open() {
  this.state = 'OPEN';
  this.openedAt = Date.now();
  
  setTimeout(() => {
    this.halfOpen();
  }, this.config.circuitBreakerResetMs);
}
```

**Recommendation:** Use static value unless specific tuning needed

---

## Static vs Dynamic Configuration

### When to Use Environment Variables

✅ **Use environment variables when:**
- Value contains sensitive data (passwords, API keys)
- Value differs per environment (dev, staging, production)
- Value may need to change without redeployment
- Value is a feature flag (enable/disable)
- Value is environment-specific (URLs, connection strings)
- Compliance or business requirements may change

### When Static Values Are Acceptable

✅ **Use static values when:**
- Value is a constant that never changes
- Value is a performance tuning parameter that's universal
- Value is a technical default that works for all environments
- Changing the value requires code review anyway
- Value has no security implications

### Hybrid Approach (Recommended)

```javascript
// src/persistence/config.js
module.exports = {
  // Must be environment variables (security/environment-specific)
  enabled: process.env.ENABLE_SESSION_PERSISTENCE === 'true',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  
  // Environment variables with sensible defaults (flexibility)
  userIdleTtlMs: parseInt(process.env.USER_IDLE_TTL_MS || '21600000', 10),
  retentionDays: parseInt(process.env.CONVERSATION_STATE_RETENTION_DAYS || '90', 10),
  
  // Static values (rarely change, can be overridden if needed)
  retryAttempts: parseInt(process.env.PERSISTENCE_RETRY_ATTEMPTS || '3', 10),
  batchWindowMs: parseInt(process.env.PERSISTENCE_BATCH_WINDOW_MS || '500', 10),
  circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '10', 10),
  circuitBreakerResetMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_MS || '60000', 10),
  cleanupIntervalMs: parseInt(process.env.CLEANUP_INTERVAL_MS || '900000', 10)
};
```

---

## Configuration File Reference

### src/persistence/config.js

This is the central configuration file that loads all environment variables:

```javascript
/**
 * Session State Persistence Configuration
 * 
 * Loads configuration from environment variables with sensible defaults.
 * All timing values are in milliseconds.
 */

module.exports = {
  // Feature flag - MUST be environment variable
  enabled: process.env.ENABLE_SESSION_PERSISTENCE === 'true',
  
  // Database connection - MUST be environment variable (sensitive)
  databaseUrl: process.env.DATABASE_URL,
  
  // Redis connection - MUST be environment variable (sensitive, optional)
  redisUrl: process.env.REDIS_URL,
  
  // Session timeout - Environment variable recommended
  userIdleTtlMs: parseInt(process.env.USER_IDLE_TTL_MS || '21600000', 10), // 6 hours
  
  // Data retention - Environment variable recommended (compliance)
  retentionDays: parseInt(process.env.CONVERSATION_STATE_RETENTION_DAYS || '90', 10),
  
  // Performance tuning - Can be static, env var for flexibility
  retryAttempts: parseInt(process.env.PERSISTENCE_RETRY_ATTEMPTS || '3', 10),
  retryDelayMs: 100, // Static - base delay for exponential backoff
  batchWindowMs: parseInt(process.env.PERSISTENCE_BATCH_WINDOW_MS || '500', 10),
  
  // Resilience - Can be static, env var for tuning
  circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '10', 10),
  circuitBreakerResetMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_MS || '60000', 10),
  
  // Cleanup - Can be static, env var for operational flexibility
  cleanupIntervalMs: parseInt(process.env.CLEANUP_INTERVAL_MS || '900000', 10), // 15 minutes
  cleanupBatchSize: 1000 // Static - max records per cleanup run
};
```

### Validation

Add validation to ensure required variables are set:

```javascript
// src/persistence/config.js
function validateConfig(config) {
  if (config.enabled) {
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL is required when ENABLE_SESSION_PERSISTENCE=true');
    }
    
    if (config.userIdleTtlMs < 60000) {
      console.warn('USER_IDLE_TTL_MS is very low (<1 minute). This may cause frequent session expiration.');
    }
    
    if (config.retentionDays < 1) {
      throw new Error('CONVERSATION_STATE_RETENTION_DAYS must be at least 1');
    }
  }
  
  return config;
}

module.exports = validateConfig(config);
```

---

## Best Practices

### 1. Environment-Specific .env Files

Create separate .env files for each environment:

```bash
# .env.development
ENABLE_SESSION_PERSISTENCE=false
DATABASE_URL=postgresql://localhost:5432/mex_end_dev
USER_IDLE_TTL_MS=3600000  # 1 hour for faster testing

# .env.staging
ENABLE_SESSION_PERSISTENCE=true
DATABASE_URL=postgresql://staging-db:5432/mex_end_staging
REDIS_URL=redis://staging-redis:6379
USER_IDLE_TTL_MS=21600000  # 6 hours

# .env.production
ENABLE_SESSION_PERSISTENCE=true
DATABASE_URL=postgresql://prod-db:5432/mex_end_prod
REDIS_URL=redis://prod-redis:6379
USER_IDLE_TTL_MS=21600000  # 6 hours
CONVERSATION_STATE_RETENTION_DAYS=90
```

### 2. Never Commit Sensitive Values

```bash
# .gitignore
.env
.env.local
.env.*.local
```

### 3. Document All Variables

Keep `.env.example` updated with all variables and descriptions:

```bash
# .env.example

# Session State Persistence
ENABLE_SESSION_PERSISTENCE=false  # Set to 'true' to enable database-backed sessions
DATABASE_URL=                     # PostgreSQL connection string (required if persistence enabled)
REDIS_URL=                        # Redis connection string (optional, for caching)

# Timing Configuration
USER_IDLE_TTL_MS=21600000        # Session idle timeout in ms (default: 6 hours)
CLEANUP_INTERVAL_MS=900000       # Cleanup interval in ms (default: 15 minutes)

# Data Retention
CONVERSATION_STATE_RETENTION_DAYS=90  # Days to retain old sessions (default: 90)

# Performance Tuning
PERSISTENCE_RETRY_ATTEMPTS=3          # Retry attempts for failed operations (default: 3)
PERSISTENCE_BATCH_WINDOW_MS=500       # Batching window in ms (default: 500)

# Resilience
CIRCUIT_BREAKER_THRESHOLD=10          # Failures before circuit opens (default: 10)
CIRCUIT_BREAKER_RESET_MS=60000        # Circuit reset timeout in ms (default: 60 seconds)
```

### 4. Use Type Conversion

Always convert environment variables to correct types:

```javascript
// ❌ Bad - string comparison
if (process.env.RETRY_ATTEMPTS > 5) { ... }

// ✅ Good - proper type conversion
if (parseInt(process.env.RETRY_ATTEMPTS, 10) > 5) { ... }
```

### 5. Provide Defaults

Always provide sensible defaults for non-critical variables:

```javascript
// ✅ Good - has default
const retryAttempts = parseInt(process.env.PERSISTENCE_RETRY_ATTEMPTS || '3', 10);

// ❌ Bad - no default, may be undefined
const retryAttempts = parseInt(process.env.PERSISTENCE_RETRY_ATTEMPTS, 10);
```

### 6. Log Configuration on Startup

Log the active configuration (without sensitive values) on startup:

```javascript
// src/persistence/index.js
if (config.enabled) {
  logger.info('Session persistence enabled', {
    userIdleTtlMs: config.userIdleTtlMs,
    retentionDays: config.retentionDays,
    redisEnabled: !!config.redisUrl,
    retryAttempts: config.retryAttempts,
    circuitBreakerThreshold: config.circuitBreakerThreshold
  });
}
```

### 7. Use Environment Variable Validation

Validate critical variables early in the application lifecycle:

```javascript
// src/index.js or src/app.js
const { validateEnvironment } = require('./persistence/config');

try {
  validateEnvironment();
} catch (error) {
  console.error('Configuration error:', error.message);
  process.exit(1);
}
```

---

## Summary Table

| Variable | Required? | Can Be Static? | Recommendation | Reason |
|----------|-----------|----------------|----------------|--------|
| `ENABLE_SESSION_PERSISTENCE` | Yes | ❌ No | Env Var | Feature flag, per-environment |
| `DATABASE_URL` | Yes* | ❌ No | Env Var | Sensitive, per-environment |
| `REDIS_URL` | No | ❌ No | Env Var | Sensitive, optional |
| `USER_IDLE_TTL_MS` | No | ✅ Yes | Env Var | Business requirement may change |
| `CLEANUP_INTERVAL_MS` | No | ✅ Yes | Static/Env | Operational flexibility |
| `CONVERSATION_STATE_RETENTION_DAYS` | No | ⚠️ Maybe | Env Var | Compliance requirement |
| `PERSISTENCE_RETRY_ATTEMPTS` | No | ✅ Yes | Static/Env | Rarely changes |
| `PERSISTENCE_BATCH_WINDOW_MS` | No | ✅ Yes | Static/Env | Performance tuning |
| `CIRCUIT_BREAKER_THRESHOLD` | No | ✅ Yes | Static/Env | Rarely changes |
| `CIRCUIT_BREAKER_RESET_MS` | No | ✅ Yes | Static/Env | Rarely changes |

\* Required only if `ENABLE_SESSION_PERSISTENCE=true`

---

## Quick Reference

### Minimal Configuration (Development)

```bash
# .env
ENABLE_SESSION_PERSISTENCE=false
DATABASE_URL=postgresql://localhost:5432/mex_end_dev
```

### Recommended Configuration (Production)

```bash
# .env
ENABLE_SESSION_PERSISTENCE=true
DATABASE_URL=postgresql://user:pass@prod-db:5432/mex_end_prod
REDIS_URL=redis://:password@prod-redis:6379
USER_IDLE_TTL_MS=21600000
CONVERSATION_STATE_RETENTION_DAYS=90
```

### Full Configuration (All Options)

```bash
# .env
ENABLE_SESSION_PERSISTENCE=true
DATABASE_URL=postgresql://user:pass@host:5432/database
REDIS_URL=redis://:password@host:6379
USER_IDLE_TTL_MS=21600000
CLEANUP_INTERVAL_MS=900000
CONVERSATION_STATE_RETENTION_DAYS=90
PERSISTENCE_RETRY_ATTEMPTS=3
PERSISTENCE_BATCH_WINDOW_MS=500
CIRCUIT_BREAKER_THRESHOLD=10
CIRCUIT_BREAKER_RESET_MS=60000
```

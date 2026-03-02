# Implementation Plan: Session State Persistence

## Overview

This implementation plan converts the session-state-persistence design into actionable coding tasks. The implementation adds a PostgreSQL-backed persistence layer to the existing WhatsApp lead management system with minimal changes to the 3,936-line whatsapp.js monolith. The approach uses hook-based integration at 4 specific points, implements 5 core components, and includes comprehensive property-based testing for all 40 correctness properties.

The implementation is organized to build incrementally: database schema → serialization → core persistence → recovery → cleanup → caching → integration hooks → testing. Each task references specific requirements for traceability.

## Tasks

- [x] 1. Set up database schema and migrations
  - [x] 1.1 Create conversation_states table migration script
    - Create migrations/001_create_conversation_states.sql with table definition
    - Include columns: id, admin_id, phone, session_data (JSONB), last_activity_at, created_at, updated_at
    - Add composite unique constraint on (admin_id, phone)
    - Add foreign key constraint on admin_id with CASCADE delete
    - Create indexes: idx_conversation_states_admin_id, idx_conversation_states_last_activity, idx_conversation_states_admin_activity
    - Create GIN index on session_data for JSONB queries
    - Add updated_at trigger function and trigger
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.2 Create rollback migration script
    - Create migrations/001_rollback_conversation_states.sql
    - Drop trigger, function, and table with CASCADE
    - _Requirements: 12.6_

  - [x] 1.3 Write migration execution script
    - Create scripts/run-migration.js to execute SQL migrations
    - Support both up and down migrations
    - Log migration results
    - _Requirements: 12.5_

  - [x] 1.4 Test migration scripts against local PostgreSQL
    - Run migration up, verify table and indexes created
    - Run migration down, verify clean rollback
    - Test foreign key CASCADE behavior
    - _Requirements: 1.7, 12.6_


- [x] 2. Implement StateSerializer component
  - [x] 2.1 Create StateSerializer class with serialize/deserialize methods
    - Create src/persistence/StateSerializer.js
    - Implement serialize(userState) method with Date handling
    - Implement deserialize(jsonString) method with Date restoration
    - Handle undefined → null conversion
    - Exclude functions and circular references with warnings
    - Return null on serialization errors with logging
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8_

  - [x] 2.2 Write property test for round-trip serialization
    - **Property 1: Round-trip serialization preserves state**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.7, 8.1, 8.2**
    - Use fast-check to generate arbitrary user state objects
    - Test all 17 user properties preserved through serialize → deserialize
    - Test Date objects correctly restored
    - Run 100+ iterations
    - _Requirements: 2.7, 15.1_

  - [x] 2.3 Write property test for non-serializable value exclusion
    - **Property 2: Serialization excludes non-serializable values**
    - **Validates: Requirements 2.4**
    - Generate objects with functions and circular references
    - Verify serialization succeeds without errors
    - Verify non-serializable properties excluded from output
    - _Requirements: 2.4_

  - [x] 2.4 Write property test for serialization error handling
    - **Property 3: Serialization errors return null**
    - **Validates: Requirements 2.8**
    - Test malformed objects and deeply nested structures
    - Verify null returned on failure
    - Verify errors logged without crashing
    - _Requirements: 2.8_

  - [x] 2.5 Write unit tests for edge cases
    - Test empty state objects
    - Test states with missing properties
    - Test states with null values
    - Test states with undefined values
    - Test Date serialization edge cases (invalid dates, epoch)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

- [x] 3. Checkpoint - Verify serialization works correctly
  - Ensure all tests pass, ask the user if questions arise.


- [x] 4. Implement SessionStateManager component
  - [x] 4.1 Create SessionStateManager class with core persistence methods
    - Create src/persistence/SessionStateManager.js
    - Implement constructor accepting db, logger, sentry, cacheLayer, config
    - Implement persistState(adminId, phone, userState) with async upsert
    - Implement loadState(adminId, phone) with cache-through pattern
    - Implement deleteState(adminId, phone) with cache invalidation
    - Use parameterized queries for all database operations
    - _Requirements: 3.1, 3.2, 3.3, 13.3, 13.4_

  - [x] 4.2 Add retry logic with exponential backoff
    - Implement retryWithBackoff helper function
    - Configure 3 retry attempts with delays: 100ms, 200ms, 400ms
    - Log retry attempts with context
    - Throw error after exhausting retries
    - _Requirements: 3.4, 3.6_

  - [x] 4.3 Add circuit breaker pattern
    - Implement CircuitBreaker class
    - Track consecutive failures (threshold: 10)
    - Open circuit after threshold exceeded
    - Auto-reset circuit after 60 seconds
    - Log circuit state changes
    - Fall back to in-memory when circuit open
    - _Requirements: 14.4, 14.5, 14.6_

  - [x] 4.4 Add batching for rapid updates
    - Implement BatchWriter class
    - Coalesce updates within 500ms window
    - Flush batches to database
    - Track pending writes per (adminId, phone) key
    - _Requirements: 3.7_

  - [x] 4.5 Add bulk operations for graceful shutdown
    - Implement persistAllStates(adminId, usersMap) method
    - Implement loadAllStates(adminId) method
    - Use Promise.allSettled for parallel operations
    - Log statistics for bulk operations
    - _Requirements: 9.1, 9.3_

  - [x] 4.6 Add metrics and observability
    - Implement getMetrics() method
    - Track: state_save_duration, state_load_duration, persistence_errors
    - Log warnings for operations exceeding 100ms
    - Log errors for failed operations with full context
    - Emit Sentry alerts for persistence failures
    - Mask sensitive data (phone, email) in logs
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.7, 13.2_

  - [x] 4.7 Write property test for state persistence after message processing
    - **Property 4: State persistence after message processing**
    - **Validates: Requirements 3.1, 3.2, 3.3**
    - Generate arbitrary user states and persist them
    - Verify last_activity_at updated
    - Verify async non-blocking behavior
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 4.8 Write property test for retry with exponential backoff
    - **Property 5: Persistence retry with exponential backoff**
    - **Validates: Requirements 3.4, 3.6**
    - Simulate database failures
    - Verify 3 retry attempts with correct delays
    - Verify error logged after exhaustion
    - _Requirements: 3.4, 3.6_

  - [x] 4.9 Write property test for batching rapid updates
    - **Property 6: Batching rapid state updates**
    - **Validates: Requirements 3.7**
    - Generate rapid update sequences within 500ms
    - Verify coalesced into single write
    - Verify most recent state persisted
    - _Requirements: 3.7_

  - [x] 4.10 Write unit tests for SessionStateManager
    - Test persistState with valid states
    - Test loadState with cache hit/miss
    - Test deleteState with cache invalidation
    - Test circuit breaker activation and reset
    - Test bulk operations
    - Test error handling and fallback
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 14.1, 14.4, 14.5_

- [x] 5. Checkpoint - Verify core persistence works
  - Ensure all tests pass, ask the user if questions arise.


- [x] 6. Implement RecoveryManager component
  - [x] 6.1 Create RecoveryManager class with session recovery methods
    - Create src/persistence/RecoveryManager.js
    - Implement constructor accepting db, logger, serializer, config
    - Implement recoverSessions() to load all active sessions
    - Implement recoverSessionsForAdmin(adminId) for single admin
    - Query sessions where last_activity_at within USER_IDLE_TTL_MS
    - Deserialize session_data and restore to sessions Map
    - Group recovered sessions by admin_id
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 6.2 Add error handling for corrupted sessions
    - Skip sessions with deserialization errors
    - Log errors with context (admin_id, phone, error message)
    - Continue loading other sessions without failing startup
    - Track failed recoveries in statistics
    - _Requirements: 4.6, 14.2_

  - [x] 6.3 Add recovery statistics and logging
    - Implement getRecoveryStats() method
    - Track: total_sessions_recovered, failed_recoveries, recovery_duration_ms
    - Log statistics on startup completion
    - _Requirements: 4.5, 10.5_

  - [x] 6.4 Write property test for session recovery
    - **Property 7: Session recovery loads active states**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
    - Persist multiple sessions with varying last_activity_at
    - Recover sessions on simulated startup
    - Verify only active sessions (within TTL) restored
    - Verify sessions grouped by admin_id
    - Verify statistics logged
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 6.5 Write property test for corrupted session handling
    - **Property 8: Recovery skips corrupted sessions**
    - **Validates: Requirements 4.6, 14.2**
    - Insert sessions with invalid JSON in session_data
    - Verify recovery continues without crashing
    - Verify corrupted sessions skipped and logged
    - Verify valid sessions still recovered
    - _Requirements: 4.6, 14.2_

  - [x] 6.6 Write unit tests for RecoveryManager
    - Test recovery with empty database
    - Test recovery with expired sessions (outside TTL)
    - Test recovery with multiple admins
    - Test recovery performance with 1000 sessions
    - _Requirements: 4.1, 4.2, 4.7, 11.3_

- [x] 7. Implement SessionCleanupService component
  - [x] 7.1 Create SessionCleanupService class with periodic cleanup
    - Create src/persistence/SessionCleanupService.js
    - Implement constructor accepting db, logger, config
    - Implement start() to begin periodic cleanup (every 15 minutes)
    - Implement stop() to halt cleanup service
    - Implement runCleanup() to execute cleanup logic
    - _Requirements: 5.1_

  - [x] 7.2 Implement cleanup logic for expired and finalized sessions
    - Delete sessions where last_activity_at > USER_IDLE_TTL_MS
    - Delete sessions where session_data->>'finalized' = true
    - Limit deletions to 1000 records per batch
    - Use indexes for efficient queries
    - _Requirements: 5.2, 5.3, 5.5, 5.6_

  - [x] 7.3 Add cleanup statistics and error handling
    - Implement getCleanupStats() method
    - Track: sessions_deleted, cleanup_duration_ms, errors
    - Log statistics after each cleanup run
    - Log errors and retry on next scheduled run
    - _Requirements: 5.4, 5.7, 10.6_

  - [x] 7.4 Write property test for cleanup of expired sessions
    - **Property 9: Cleanup deletes expired and finalized sessions**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.6**
    - Insert sessions with various last_activity_at timestamps
    - Insert sessions with finalized=true
    - Run cleanup
    - Verify expired sessions deleted
    - Verify finalized sessions deleted
    - Verify active sessions preserved
    - Verify batch limit respected (1000 max)
    - _Requirements: 5.2, 5.3, 5.4, 5.6_

  - [x] 7.5 Write property test for cleanup failure handling
    - **Property 10: Cleanup failures are logged and retried**
    - **Validates: Requirements 5.7**
    - Simulate database errors during cleanup
    - Verify errors logged without crashing
    - Verify cleanup retries on next scheduled run
    - _Requirements: 5.7_

  - [x] 7.6 Write unit tests for SessionCleanupService
    - Test cleanup with no expired sessions
    - Test cleanup with mixed expired/active sessions
    - Test cleanup batch limiting
    - Test start/stop lifecycle
    - _Requirements: 5.1, 5.2, 5.3, 5.6_


- [x] 8. Implement CacheLayer component (optional Redis support)
  - [x] 8.1 Create CacheLayer class with Redis caching methods
    - Create src/persistence/CacheLayer.js
    - Implement constructor accepting redisClient, logger, config
    - Implement get(adminId, phone) for cache reads
    - Implement set(adminId, phone, userState, ttlMs) for cache writes
    - Implement delete(adminId, phone) for cache invalidation
    - Implement invalidate(adminId) to clear all admin sessions
    - Use cache key format: "conversation:{adminId}:{phone}"
    - Set TTL to match USER_IDLE_TTL_MS
    - _Requirements: 6.1, 6.5_

  - [x] 8.2 Add cache read-through and write-through patterns
    - Implement read-through: check cache, load from DB on miss, populate cache
    - Implement write-through: update both cache and database
    - Handle cache misses gracefully
    - _Requirements: 6.2, 6.3, 6.4_

  - [x] 8.3 Add Redis pub/sub for multi-instance cache invalidation
    - Implement publishInvalidation(adminId, phone) to publish to "conversation:invalidate" channel
    - Implement subscribeToInvalidations(callback) to listen for invalidations
    - Handle invalidation messages from other instances
    - _Requirements: 7.6_

  - [x] 8.4 Add Redis failure fallback
    - Implement isAvailable() health check
    - Fall back to direct database access when Redis unavailable
    - Log warnings (not errors) for Redis failures
    - Continue operation without cache
    - _Requirements: 6.6, 14.3_

  - [x] 8.5 Write property test for cache TTL matching configuration
    - **Property 11: Cache TTL matches configuration**
    - **Validates: Requirements 6.1**
    - Set cache entries with various TTLs
    - Verify TTL equals USER_IDLE_TTL_MS
    - _Requirements: 6.1_

  - [x] 8.6 Write property test for cache read-through pattern
    - **Property 12: Cache read-through pattern**
    - **Validates: Requirements 6.2, 6.4**
    - Test cache hit returns cached value
    - Test cache miss loads from database and populates cache
    - _Requirements: 6.2, 6.4_

  - [x] 8.7 Write property test for cache write-through pattern
    - **Property 13: Cache write-through pattern**
    - **Validates: Requirements 6.3**
    - Write state through cache
    - Verify both Redis and database updated
    - Verify consistency between cache and database
    - _Requirements: 6.3_

  - [x] 8.8 Write property test for cache key format consistency
    - **Property 14: Cache key format consistency**
    - **Validates: Requirements 6.5**
    - Generate various adminId and phone combinations
    - Verify all keys follow "conversation:{adminId}:{phone}" format
    - _Requirements: 6.5_

  - [x] 8.9 Write property test for Redis failure fallback
    - **Property 15: Redis failure fallback**
    - **Validates: Requirements 6.6, 14.3**
    - Simulate Redis connection failures
    - Verify fallback to database without errors
    - Verify system continues operating
    - _Requirements: 6.6, 14.3_

  - [x] 8.10 Write unit tests for CacheLayer
    - Test cache operations with Redis available
    - Test cache operations with Redis unavailable
    - Test pub/sub invalidation
    - Test cache hit rate tracking
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_

- [x] 9. Checkpoint - Verify all components work independently
  - Ensure all tests pass, ask the user if questions arise.


- [x] 10. Add integration hooks to whatsapp.js
  - [x] 10.1 Add persistence hook after message processing
    - Locate end of handleIncomingMessage function (approximate line 3900)
    - Add sessionStateManager.persistState() call after user.lastUserMessageAt update
    - Use fire-and-forget pattern (don't await)
    - Catch and log errors without blocking message processing
    - Check ENABLE_SESSION_PERSISTENCE feature flag
    - _Requirements: 3.1, 3.3, 8.3, 8.4, 12.1, 12.2, 12.3_

  - [x] 10.2 Add session recovery hook on server startup
    - Locate startWhatsApp function (approximate line 1415)
    - Add recoveryManager.recoverSessionsForAdmin() call after createSession
    - Restore recovered users to session.users object
    - Log recovery statistics
    - Handle recovery errors gracefully
    - _Requirements: 4.1, 4.3, 4.4, 8.4_

  - [x] 10.3 Add state deletion hook in session cleanup
    - Locate cleanupSessions function (approximate line 43)
    - Add sessionStateManager.deleteState() call before deleting from memory
    - Use fire-and-forget pattern
    - Log deletion errors as warnings
    - _Requirements: 5.2, 8.4_

  - [x] 10.4 Create graceful shutdown handler
    - Create src/shutdown.js with gracefulShutdown function
    - Register SIGTERM and SIGINT handlers
    - Call sessionStateManager.persistAllStates() for all active sessions
    - Use Promise.allSettled for parallel persistence
    - Close database connections
    - Complete within 10 seconds
    - Log sessions that couldn't be persisted
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 10.5 Write property test for state persistence after message processing
    - **Property 4: State persistence after message processing**
    - **Validates: Requirements 3.1, 3.2, 3.3**
    - Simulate message processing flow
    - Verify state persisted asynchronously
    - Verify last_activity_at updated
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 10.6 Write property test for graceful shutdown
    - **Property 24: Graceful shutdown persists all states**
    - **Validates: Requirements 9.1, 9.3, 9.4**
    - Create multiple active sessions
    - Trigger shutdown signal
    - Verify all states persisted before exit
    - Verify completion within 10 seconds
    - _Requirements: 9.1, 9.3, 9.4_

  - [x] 10.7 Write property test for restart recovery
    - **Property 25: Restart restores shutdown states**
    - **Validates: Requirements 9.5, 9.6, 9.7**
    - Persist states during shutdown
    - Simulate server restart
    - Verify all active states restored
    - Verify 100% conversation continuity
    - _Requirements: 9.5, 9.6, 9.7_


- [x] 11. Add configuration and feature flag support
  - [x] 11.1 Add environment variables to .env.example
    - Add ENABLE_SESSION_PERSISTENCE (default: false)
    - Add REDIS_URL (optional)
    - Add USER_IDLE_TTL_MS (default: 21600000 = 6 hours)
    - Add CLEANUP_INTERVAL_MS (default: 900000 = 15 minutes)
    - Add CONVERSATION_STATE_RETENTION_DAYS (default: 90)
    - Add PERSISTENCE_RETRY_ATTEMPTS (default: 3)
    - Add PERSISTENCE_BATCH_WINDOW_MS (default: 500)
    - Add CIRCUIT_BREAKER_THRESHOLD (default: 10)
    - Add CIRCUIT_BREAKER_RESET_MS (default: 60000)
    - _Requirements: 12.1, 12.2, 12.3, 13.6_

  - [x] 11.2 Create persistence configuration module
    - Create src/persistence/config.js
    - Export configuration object with all persistence settings
    - Validate required environment variables
    - Provide sensible defaults
    - Log configuration on startup
    - _Requirements: 12.1, 12.7_

  - [x] 11.3 Initialize persistence components conditionally
    - Create src/persistence/index.js as main entry point
    - Initialize SessionStateManager, RecoveryManager, SessionCleanupService, CacheLayer
    - Check ENABLE_SESSION_PERSISTENCE flag
    - Initialize Redis client only if REDIS_URL provided
    - Export initialized components
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 11.4 Write property test for feature flag behavior
    - **Property 23: Gradual migration support**
    - **Validates: Requirements 8.7, 12.4**
    - Test with ENABLE_SESSION_PERSISTENCE=false (in-memory only)
    - Test with ENABLE_SESSION_PERSISTENCE=true (database persistence)
    - Verify both modes function correctly
    - _Requirements: 8.7, 12.1, 12.2, 12.3, 12.4_


- [x] 12. Implement comprehensive property-based tests
  - [x] 12.1 Write property test for database as single source of truth
    - **Property 16: Database as single source of truth**
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - Simulate multi-instance deployment
    - Verify all instances read/write to database
    - Verify concurrent updates handled via row-level locking
    - Verify last-write-wins based on updated_at
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 12.2 Write property test for single instance per conversation
    - **Property 17: Single instance per user conversation**
    - **Validates: Requirements 7.5**
    - Simulate multiple instances
    - Verify only one instance processes messages for each (adminId, phone)
    - Verify no concurrent modification conflicts
    - _Requirements: 7.5_

  - [x] 12.3 Write property test for cache invalidation across instances
    - **Property 18: Cache invalidation across instances**
    - **Validates: Requirements 7.6**
    - Simulate multi-instance with Redis pub/sub
    - Publish invalidation from one instance
    - Verify all instances receive and process invalidation
    - _Requirements: 7.6_

  - [x] 12.4 Write property test for state consistency across instances
    - **Property 19: State consistency across instances**
    - **Validates: Requirements 7.7**
    - Update state from one instance
    - Query from another instance
    - Verify eventual consistency
    - _Requirements: 7.7_

  - [x] 12.5 Write property test for backward compatible state structure
    - **Property 20: Backward compatible state structure**
    - **Validates: Requirements 8.1**
    - Persist and recover states
    - Verify structure matches session.users[phone] format
    - Verify no changes required to message handling logic
    - _Requirements: 8.1_

  - [x] 12.6 Write property test for in-memory cleanup behavior preserved
    - **Property 21: In-memory cleanup behavior preserved**
    - **Validates: Requirements 8.5**
    - Test cleanup with persistence enabled
    - Verify idle timers cleared
    - Verify users removed from sessions Map
    - Verify behavior identical to in-memory-only mode
    - _Requirements: 8.5_

  - [x] 12.7 Write property test for idle timer functionality preserved
    - **Property 22: Idle timer functionality preserved**
    - **Validates: Requirements 8.6**
    - Test idle timers with persistence enabled
    - Verify timers trigger partial saves and cleanup
    - Verify persistence doesn't interfere with timer behavior
    - _Requirements: 8.6_

  - [x] 12.8 Write property test for comprehensive operation logging
    - **Property 26: Comprehensive operation logging**
    - **Validates: Requirements 10.1**
    - Perform various persistence operations
    - Verify all operations logged with context
    - Verify logs include: adminId, phone (masked), operation type, duration, outcome
    - _Requirements: 10.1_

  - [x] 12.9 Write property test for metrics emission
    - **Property 27: Metrics emission**
    - **Validates: Requirements 10.2**
    - Perform persistence operations
    - Verify metrics emitted: state_save_duration, state_load_duration, cache_hit_rate, persistence_errors
    - _Requirements: 10.2_

  - [x] 12.10 Write property test for slow operation warnings
    - **Property 28: Slow operation warnings**
    - **Validates: Requirements 10.3**
    - Simulate slow persistence operations (>100ms)
    - Verify warnings logged with full context
    - _Requirements: 10.3_

  - [x] 12.11 Write property test for retry exhaustion error logging
    - **Property 29: Retry exhaustion error logging**
    - **Validates: Requirements 10.4**
    - Simulate persistent failures
    - Verify errors logged after retry exhaustion
    - Verify full context and stack trace included
    - _Requirements: 10.4_

  - [x] 12.12 Write property test for recovery statistics logging
    - **Property 30: Recovery statistics logging**
    - **Validates: Requirements 10.5**
    - Perform session recovery
    - Verify statistics logged: total_sessions_recovered, recovery_duration_ms, failed_recoveries
    - _Requirements: 10.5_

  - [x] 12.13 Write property test for cleanup statistics logging
    - **Property 31: Cleanup statistics logging**
    - **Validates: Requirements 10.6**
    - Perform cleanup operations
    - Verify statistics logged: sessions_deleted, cleanup_duration_ms, errors
    - _Requirements: 10.6_

  - [x] 12.14 Write property test for Sentry error reporting
    - **Property 32: Sentry error reporting**
    - **Validates: Requirements 10.7**
    - Simulate persistence errors with Sentry configured
    - Verify errors reported to Sentry with full context
    - _Requirements: 10.7_

  - [x] 12.15 Write property test for sensitive data masking
    - **Property 33: Sensitive data masking in logs**
    - **Validates: Requirements 13.2**
    - Generate logs with sensitive data (email, phone, personal details)
    - Verify sensitive data masked or redacted
    - Verify no PII exposed in logs
    - _Requirements: 13.2_

  - [x] 12.16 Write property test for parameterized query usage
    - **Property 34: Parameterized query usage**
    - **Validates: Requirements 13.3**
    - Inspect all database queries
    - Verify all use parameterized placeholders ($1, $2, etc.)
    - Verify no string concatenation
    - _Requirements: 13.3_

  - [x] 12.17 Write property test for admin isolation enforcement
    - **Property 35: Admin isolation enforcement**
    - **Validates: Requirements 13.4**
    - Attempt to access states across admins
    - Verify all queries include admin_id filter
    - Verify no cross-admin data leakage
    - _Requirements: 13.4_

  - [x] 12.18 Write property test for retention policy enforcement
    - **Property 36: Retention policy enforcement**
    - **Validates: Requirements 13.6**
    - Insert states older than retention period
    - Run cleanup with retention policy enabled
    - Verify old states deleted
    - _Requirements: 13.6_

  - [x] 12.19 Write property test for GDPR cascade deletion
    - **Property 37: GDPR cascade deletion**
    - **Validates: Requirements 13.7**
    - Delete contact from database
    - Verify associated conversation states automatically deleted via CASCADE
    - _Requirements: 13.7_

  - [x] 12.20 Write property test for database failure fallback and retry
    - **Property 38: Database failure fallback and retry**
    - **Validates: Requirements 14.1, 14.6**
    - Simulate database connection failure
    - Verify fallback to in-memory storage
    - Verify retry every 30 seconds
    - Verify automatic resume when connection restored
    - _Requirements: 14.1, 14.6_

  - [x] 12.21 Write property test for circuit breaker activation
    - **Property 39: Circuit breaker activation**
    - **Validates: Requirements 14.4, 14.5**
    - Simulate 10 consecutive failures
    - Verify circuit breaker opens
    - Verify switch to in-memory-only mode
    - Verify critical alert logged
    - Verify auto-close after 60 seconds
    - _Requirements: 14.4, 14.5_

  - [x] 12.22 Write property test for system availability during degradation
    - **Property 40: System availability during degradation**
    - **Validates: Requirements 14.7**
    - Simulate various degradation scenarios (database slow, Redis unavailable, circuit open)
    - Verify system maintains availability
    - Verify fallback to in-memory storage
    - Verify zero downtime
    - _Requirements: 14.7_


- [x] 13. Write integration tests
  - [x] 13.1 Write integration test for full message flow with persistence
    - Simulate complete message processing flow
    - Verify state persisted to database
    - Verify state recoverable on restart
    - Use real PostgreSQL (Docker container)
    - _Requirements: 3.1, 4.1, 15.2_

  - [x] 13.2 Write integration test for server restart with recovery
    - Create active sessions and persist states
    - Simulate server shutdown and restart
    - Verify all active sessions recovered
    - Verify conversation continuity
    - _Requirements: 4.1, 9.5, 9.6, 15.2_

  - [x] 13.3 Write integration test for graceful shutdown
    - Create multiple active sessions
    - Trigger SIGTERM signal
    - Verify all states persisted before exit
    - Verify completion within 10 seconds
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 13.4 Write integration test for Redis caching
    - Test cache hit/miss scenarios with real Redis
    - Test fallback when Redis unavailable
    - Test pub/sub invalidation across instances
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 7.6, 15.6_

  - [x] 13.5 Write integration test for database schema and constraints
    - Run migration scripts
    - Verify table, indexes, and constraints created
    - Test foreign key CASCADE behavior
    - Test unique constraint on (admin_id, phone)
    - Test updated_at trigger
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 13.6 Write integration test for concurrent writes
    - Simulate multiple instances writing to same session
    - Verify row-level locking prevents corruption
    - Verify last-write-wins based on updated_at
    - _Requirements: 7.2, 7.3_

- [x] 14. Checkpoint - Verify integration tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 15. Write load and performance tests
  - [x] 15.1 Write load test for concurrent conversations
    - Simulate 100 concurrent conversations with 10 messages each
    - Verify p95 persistence latency < 100ms
    - Verify p99 persistence latency < 500ms
    - Verify message processing overhead < 50ms
    - Use Artillery or k6
    - _Requirements: 11.1, 11.2, 11.4, 11.6, 15.3_

  - [x] 15.2 Write load test for session recovery performance
    - Create 1000 active sessions in database
    - Measure recovery time on startup
    - Verify recovery completes in < 5 seconds
    - _Requirements: 4.7, 11.3, 15.4_

  - [x] 15.3 Write load test for sustained message throughput
    - Simulate sustained load: 50 messages/second for 5 minutes
    - Verify system maintains performance targets
    - Verify no memory leaks or degradation
    - _Requirements: 11.4, 11.7_

  - [x] 15.4 Write load test for cache performance
    - Simulate 500 active conversations with Redis enabled
    - Measure cache hit rate (target: 80%)
    - Verify cache reads < 10ms for p99
    - _Requirements: 6.7, 11.5_

  - [x] 15.5 Write load test for cleanup performance
    - Insert 10,000 expired sessions
    - Run cleanup service
    - Verify batch limiting (1000 per run)
    - Verify cleanup completes efficiently
    - _Requirements: 5.5, 5.6_

- [x] 16. Write chaos engineering tests
  - [x] 16.1 Write chaos test for database connection loss
    - Simulate database connection loss during message processing
    - Verify system continues operating with in-memory fallback
    - Verify automatic reconnection and persistence resume
    - _Requirements: 14.1, 14.6, 15.7_

  - [x] 16.2 Write chaos test for Redis connection loss
    - Simulate Redis connection loss with active cache
    - Verify fallback to direct database access
    - Verify system continues operating
    - _Requirements: 6.6, 14.3, 15.7_

  - [x] 16.3 Write chaos test for server crash with unsaved state
    - Simulate server crash (SIGKILL) with active sessions
    - Verify last persisted states recoverable
    - Verify graceful degradation
    - _Requirements: 9.1, 9.5, 15.7_

  - [x] 16.4 Write chaos test for network partition
    - Simulate network partition between app and database
    - Verify circuit breaker activates
    - Verify fallback to in-memory storage
    - Verify recovery when partition heals
    - _Requirements: 14.4, 14.5, 14.6, 15.7_

  - [x] 16.5 Write chaos test for corrupted session data
    - Insert sessions with corrupted JSON in database
    - Verify recovery skips corrupted sessions
    - Verify system continues operating
    - _Requirements: 4.6, 14.2, 15.7_

- [x] 17. Final checkpoint - Run full test suite
  - Ensure all tests pass, ask the user if questions arise.


- [x] 18. Documentation and deployment preparation
  - [x] 18.1 Update README with persistence feature documentation
    - Document ENABLE_SESSION_PERSISTENCE feature flag
    - Document all environment variables
    - Document migration process
    - Document rollback procedure
    - Document Redis setup (optional)
    - _Requirements: 12.1, 12.5, 12.6_

  - [x] 18.2 Create deployment checklist
    - Database migration steps
    - Environment variable configuration
    - Redis setup (if using cache)
    - Rollback procedure
    - Monitoring and alerting setup
    - _Requirements: 12.5, 12.6_

  - [x] 18.3 Create monitoring dashboard configuration
    - Define metrics to track: persistence latency, cache hit rate, errors, recovery time
    - Create alerts for circuit breaker activation, high error rates, slow operations
    - Document Sentry integration
    - _Requirements: 10.2, 10.7_

  - [x] 18.4 Write operational runbook
    - Troubleshooting guide for common issues
    - How to check persistence status
    - How to manually recover sessions
    - How to disable persistence (rollback)
    - How to investigate performance issues
    - _Requirements: 10.1, 12.7_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties (40 total)
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end flows with real database
- Load tests validate performance targets under realistic conditions
- Chaos tests validate resilience and error recovery
- Implementation uses JavaScript (Node.js) as specified in design document
- All database operations use parameterized queries for security
- All logging masks sensitive data (phone numbers, emails)
- Feature flag (ENABLE_SESSION_PERSISTENCE) enables gradual rollout
- Redis caching is optional for enhanced performance
- Circuit breaker pattern ensures graceful degradation
- Graceful shutdown ensures zero data loss during deployments

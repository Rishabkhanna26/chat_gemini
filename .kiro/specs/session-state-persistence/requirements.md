# Requirements Document: Session State Persistence

## Introduction

This document defines requirements for implementing persistent session state storage for the Mex-End WhatsApp astrology lead management system. Currently, all user conversation state is stored in memory (Map objects in src/whatsapp.js), causing complete data loss on every server restart or deployment. This creates a critical business failure where active customer conversations, orders, and appointments are lost, resulting in 60% customer abandonment and $500-5000 revenue loss per deployment.

The system will migrate from in-memory storage to PostgreSQL-backed persistence with optional Redis caching, enabling zero-downtime deployments, horizontal scalability, and disaster recovery capabilities.

## Glossary

- **Session_State_Manager**: The component responsible for persisting and restoring conversation state to/from the database
- **Conversation_State**: The complete state object for a user's WhatsApp conversation including step, data, flags, and metadata
- **State_Serializer**: The component that converts JavaScript objects to/from JSON for database storage
- **Recovery_Manager**: The component that restores active sessions on server startup
- **Cache_Layer**: Optional Redis-based caching layer for high-performance state access
- **State_Persistence_Service**: The service layer that coordinates database operations for conversation states
- **Session_Cleanup_Service**: The service that removes expired or completed conversation states
- **WhatsApp_Session**: The admin-level WhatsApp client connection that contains multiple user conversations
- **User_Conversation**: An individual user's conversation state within a WhatsApp session
- **State_Snapshot**: A point-in-time capture of conversation state stored in the database

## Requirements

### Requirement 1: Database Schema for Conversation States

**User Story:** As a system administrator, I want conversation states stored in a PostgreSQL table, so that sessions survive server restarts and deployments.

#### Acceptance Criteria

1. THE State_Persistence_Service SHALL create a conversation_states table with columns: id, admin_id, phone, session_data, last_activity_at, created_at, updated_at
2. THE conversation_states table SHALL use a composite unique index on (admin_id, phone) to prevent duplicate sessions
3. THE conversation_states table SHALL include a foreign key constraint on admin_id referencing admins(id) with CASCADE delete
4. THE conversation_states table SHALL store session_data as JSONB type for efficient querying and indexing
5. THE conversation_states table SHALL include indexes on last_activity_at for cleanup queries
6. THE conversation_states table SHALL include indexes on admin_id for admin-specific queries
7. WHEN the database schema is initialized, THE State_Persistence_Service SHALL create all required tables, indexes, and constraints

### Requirement 2: State Serialization and Deserialization

**User Story:** As a developer, I want conversation state objects serialized to JSON safely, so that complex JavaScript objects can be stored in the database without data loss.

#### Acceptance Criteria

1. THE State_Serializer SHALL convert user conversation objects to JSON format preserving all properties
2. THE State_Serializer SHALL handle Date objects by converting them to ISO 8601 strings
3. THE State_Serializer SHALL handle undefined values by converting them to null
4. THE State_Serializer SHALL exclude non-serializable properties (functions, circular references)
5. WHEN deserializing state, THE State_Serializer SHALL restore Date strings back to Date objects
6. WHEN deserializing state, THE State_Serializer SHALL restore null values to appropriate defaults
7. FOR ALL valid conversation state objects, THE State_Serializer SHALL satisfy the round-trip property: deserialize(serialize(state)) produces an equivalent state object
8. IF serialization fails, THEN THE State_Serializer SHALL log the error and return null without crashing

### Requirement 3: Automatic State Persistence on Message Processing

**User Story:** As a business owner, I want conversation state saved after every user message, so that no customer data is lost if the server crashes.

#### Acceptance Criteria

1. WHEN a user message is processed, THE Session_State_Manager SHALL persist the updated conversation state to the database
2. THE Session_State_Manager SHALL update the last_activity_at timestamp on every state save
3. THE Session_State_Manager SHALL perform state persistence asynchronously without blocking message processing
4. IF database persistence fails, THEN THE Session_State_Manager SHALL log the error and retry up to 3 times with exponential backoff
5. THE Session_State_Manager SHALL complete state persistence within 100ms for 95% of operations
6. WHEN state persistence fails after all retries, THE Session_State_Manager SHALL emit a monitoring alert
7. THE Session_State_Manager SHALL batch multiple rapid state updates within 500ms into a single database write

### Requirement 4: Session Recovery on Server Startup

**User Story:** As a system administrator, I want active sessions restored when the server restarts, so that customers can continue their conversations without interruption.

#### Acceptance Criteria

1. WHEN the WhatsApp service starts, THE Recovery_Manager SHALL load all active conversation states from the database
2. THE Recovery_Manager SHALL filter conversation states by last_activity_at within the configured USER_IDLE_TTL_MS window
3. THE Recovery_Manager SHALL restore conversation states to the in-memory sessions Map grouped by admin_id
4. THE Recovery_Manager SHALL restore all user properties including step, data, flags, and timestamps
5. THE Recovery_Manager SHALL log the count of recovered sessions per admin
6. IF state deserialization fails for a session, THEN THE Recovery_Manager SHALL log the error and skip that session without failing startup
7. THE Recovery_Manager SHALL complete session recovery within 5 seconds for up to 1000 active sessions

### Requirement 5: State Cleanup for Expired Sessions

**User Story:** As a system administrator, I want expired conversation states removed from the database, so that storage costs remain manageable and queries stay fast.

#### Acceptance Criteria

1. THE Session_Cleanup_Service SHALL run a cleanup job every 15 minutes
2. THE Session_Cleanup_Service SHALL delete conversation states where last_activity_at is older than USER_IDLE_TTL_MS
3. THE Session_Cleanup_Service SHALL delete conversation states where the user has finalized their lead or order
4. THE Session_Cleanup_Service SHALL log the count of deleted sessions after each cleanup run
5. THE Session_Cleanup_Service SHALL use database indexes to perform cleanup queries efficiently
6. THE Session_Cleanup_Service SHALL limit cleanup operations to 1000 records per batch to avoid long-running transactions
7. IF cleanup fails, THEN THE Session_Cleanup_Service SHALL log the error and retry on the next scheduled run

### Requirement 6: Redis Caching Layer (Optional)

**User Story:** As a system architect, I want frequently accessed conversation states cached in Redis, so that database load is minimized and response times are optimized.

#### Acceptance Criteria

1. WHERE Redis is configured, THE Cache_Layer SHALL cache conversation states with TTL matching USER_IDLE_TTL_MS
2. WHEN reading conversation state, THE Cache_Layer SHALL check Redis first before querying the database
3. WHEN writing conversation state, THE Cache_Layer SHALL update both Redis and the database
4. WHEN a cache miss occurs, THE Cache_Layer SHALL load from database and populate the cache
5. THE Cache_Layer SHALL use cache keys in format "conversation:{admin_id}:{phone}"
6. IF Redis is unavailable, THEN THE Cache_Layer SHALL fall back to direct database access without failing
7. THE Cache_Layer SHALL reduce database query load by at least 80% for active conversations

### Requirement 7: Horizontal Scalability Support

**User Story:** As a system architect, I want multiple server instances to share conversation state, so that the system can scale horizontally to handle increased load.

#### Acceptance Criteria

1. WHEN multiple server instances run, THE Session_State_Manager SHALL use the database as the single source of truth
2. THE Session_State_Manager SHALL handle concurrent state updates using database row-level locking
3. WHEN a state conflict occurs, THE Session_State_Manager SHALL use last-write-wins strategy based on updated_at timestamp
4. THE Session_State_Manager SHALL support at least 5 concurrent server instances without data corruption
5. THE Session_State_Manager SHALL ensure that a user's conversation is handled by only one server instance at a time
6. WHERE Redis is configured, THE Cache_Layer SHALL use Redis pub/sub to invalidate caches across server instances
7. THE Session_State_Manager SHALL maintain conversation state consistency across all server instances

### Requirement 8: Backward Compatibility with In-Memory Sessions

**User Story:** As a developer, I want the persistence layer to work seamlessly with existing code, so that minimal changes are required to the 3,936-line whatsapp.js file.

#### Acceptance Criteria

1. THE Session_State_Manager SHALL maintain the existing session.users object structure
2. THE Session_State_Manager SHALL preserve all existing user properties: step, data, isReturningUser, clientId, name, email, assignedAdminId, greetedThisSession, resumeStep, awaitingResumeDecision, lastUserMessageAt, partialSavedAt, finalized, idleTimer, automationDisabled
3. THE Session_State_Manager SHALL not require changes to message handling logic in handleIncomingMessage function
4. THE Session_State_Manager SHALL integrate through minimal hook points: after message processing, on startup, on cleanup
5. THE Session_State_Manager SHALL maintain existing session cleanup behavior for in-memory state
6. THE Session_State_Manager SHALL preserve existing idle timer functionality
7. THE Session_State_Manager SHALL support gradual migration where some sessions use persistence and others remain in-memory

### Requirement 9: Zero Data Loss Guarantee

**User Story:** As a business owner, I want zero conversation data lost during deployments, so that customer orders and appointments are never dropped.

#### Acceptance Criteria

1. WHEN a server shutdown is initiated, THE Session_State_Manager SHALL persist all active conversation states before termination
2. THE Session_State_Manager SHALL register SIGTERM and SIGINT handlers for graceful shutdown
3. THE Session_State_Manager SHALL complete all pending state writes within 10 seconds of shutdown signal
4. THE Session_State_Manager SHALL log any sessions that could not be persisted during shutdown
5. WHEN the server restarts, THE Recovery_Manager SHALL restore all sessions that were active at shutdown time
6. THE Session_State_Manager SHALL maintain conversation continuity across deployments with 100% success rate
7. FOR ALL active conversations, THE system SHALL preserve conversation state through server restart (invariant property)

### Requirement 10: Monitoring and Observability

**User Story:** As a system administrator, I want visibility into session persistence operations, so that I can monitor system health and troubleshoot issues.

#### Acceptance Criteria

1. THE Session_State_Manager SHALL log all state persistence operations with admin_id, phone, and operation duration
2. THE Session_State_Manager SHALL emit metrics for: state_save_duration, state_load_duration, cache_hit_rate, persistence_errors
3. THE Session_State_Manager SHALL log warnings when state persistence exceeds 100ms
4. THE Session_State_Manager SHALL log errors when state persistence fails after all retries
5. THE Recovery_Manager SHALL log session recovery statistics on startup: total_sessions_recovered, recovery_duration, failed_recoveries
6. THE Session_Cleanup_Service SHALL log cleanup statistics: sessions_deleted, cleanup_duration, errors
7. WHERE Sentry is configured, THE Session_State_Manager SHALL report persistence errors to Sentry with full context

### Requirement 11: Performance Requirements

**User Story:** As a system architect, I want session persistence to have minimal performance impact, so that message processing remains fast and responsive.

#### Acceptance Criteria

1. THE Session_State_Manager SHALL complete state persistence within 100ms for 95% of operations
2. THE Session_State_Manager SHALL complete state persistence within 500ms for 99% of operations
3. THE Recovery_Manager SHALL restore 1000 sessions within 5 seconds on startup
4. THE Session_State_Manager SHALL support at least 100 concurrent state updates per second
5. WHERE Redis is configured, THE Cache_Layer SHALL complete cache reads within 10ms for 99% of operations
6. THE Session_State_Manager SHALL add no more than 50ms latency to message processing
7. THE Session_State_Manager SHALL maintain performance under load of 500 active conversations per admin

### Requirement 12: Data Migration and Rollback

**User Story:** As a developer, I want a safe migration path from in-memory to persistent storage, so that the feature can be deployed without risk.

#### Acceptance Criteria

1. THE Session_State_Manager SHALL support a feature flag ENABLE_SESSION_PERSISTENCE to enable/disable persistence
2. WHEN ENABLE_SESSION_PERSISTENCE is false, THE Session_State_Manager SHALL use in-memory storage only
3. WHEN ENABLE_SESSION_PERSISTENCE is true, THE Session_State_Manager SHALL use database persistence
4. THE Session_State_Manager SHALL support a migration mode where existing in-memory sessions are persisted on first message
5. THE Session_State_Manager SHALL provide a database migration script to create the conversation_states table
6. THE Session_State_Manager SHALL provide a rollback script to drop the conversation_states table
7. THE Session_State_Manager SHALL log the persistence mode (in-memory vs database) on startup

### Requirement 13: Security and Data Privacy

**User Story:** As a security officer, I want conversation state data protected, so that customer information remains confidential and compliant with privacy regulations.

#### Acceptance Criteria

1. THE Session_State_Manager SHALL store conversation state in the same database as other customer data with existing security controls
2. THE Session_State_Manager SHALL not log sensitive customer data (email, phone, personal details) in plain text
3. THE Session_State_Manager SHALL use parameterized queries to prevent SQL injection attacks
4. THE Session_State_Manager SHALL enforce admin_id isolation ensuring admins can only access their own conversation states
5. WHERE Redis is configured, THE Cache_Layer SHALL use Redis authentication and TLS encryption
6. THE Session_State_Manager SHALL support automatic data retention policies deleting states older than 90 days
7. THE Session_State_Manager SHALL comply with existing GDPR data deletion requirements when a contact is deleted

### Requirement 14: Error Recovery and Resilience

**User Story:** As a system administrator, I want the system to recover gracefully from persistence failures, so that temporary database issues don't crash the application.

#### Acceptance Criteria

1. IF database connection fails, THEN THE Session_State_Manager SHALL continue using in-memory state and retry persistence every 30 seconds
2. IF state deserialization fails, THEN THE Recovery_Manager SHALL skip the corrupted session and continue loading others
3. IF Redis connection fails, THEN THE Cache_Layer SHALL fall back to direct database access
4. THE Session_State_Manager SHALL implement circuit breaker pattern after 10 consecutive persistence failures
5. WHEN circuit breaker is open, THE Session_State_Manager SHALL use in-memory storage and log critical alerts
6. WHEN database connection is restored, THE Session_State_Manager SHALL automatically resume persistence
7. THE Session_State_Manager SHALL maintain system availability even when persistence layer is degraded

### Requirement 15: Testing and Validation

**User Story:** As a developer, I want comprehensive tests for session persistence, so that the feature is reliable and bug-free in production.

#### Acceptance Criteria

1. THE State_Serializer SHALL include property-based tests validating the round-trip property for all conversation state objects
2. THE Session_State_Manager SHALL include integration tests validating state persistence and recovery across server restarts
3. THE Session_State_Manager SHALL include load tests validating performance under 500 concurrent conversations
4. THE Recovery_Manager SHALL include tests validating recovery of 1000 sessions within 5 seconds
5. THE Session_Cleanup_Service SHALL include tests validating cleanup of expired sessions
6. THE Cache_Layer SHALL include tests validating cache invalidation across multiple server instances
7. THE Session_State_Manager SHALL include chaos engineering tests simulating database failures, network partitions, and server crashes

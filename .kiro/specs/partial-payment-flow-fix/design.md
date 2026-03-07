# Partial Payment Flow Fix - Bugfix Design

## Overview

This bugfix addresses a critical issue where typing "3" during the payment method selection step (PRODUCT_PAYMENT_METHOD) incorrectly triggers a global intent handler instead of selecting the "Pay Partial Amount Now" option. The bug occurs because the global intent detection system (`resolveAiIntent`) extracts numbers from user input and matches them against main menu choices, and the corresponding global handler executes before the step-specific handler can process the input.

The fix ensures that when a user is in an active guided flow (hasActiveGuidedFlow is true), step-specific handlers process the input first, and global intent handlers are bypassed entirely. This prevents menu navigation intents from interrupting critical transactional flows like checkout.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when a user in an active guided flow types input that matches a global intent pattern (like a number matching a main menu choice)
- **Property (P)**: The desired behavior - step-specific handlers should process input first, and global intent handlers should not execute during active guided flows
- **Preservation**: Existing global intent detection behavior that must remain unchanged when the user is NOT in an active guided flow
- **hasActiveGuidedFlow**: Boolean flag that is true when user.step is not in ["START", "MENU", "RESUME_DECISION"], indicating the user is in a multi-step transactional flow
- **resolveAiIntent**: Function in `src/whatsapp.js` that extracts numbers from user input and maps them to main menu choice IDs (PRODUCTS, TRACK_ORDER, EXECUTIVE, etc.)
- **aiDetectedIntent**: The intent ID returned by resolveAiIntent (e.g., "TRACK_ORDER", "PRODUCTS", "EXECUTIVE")
- **PRODUCT_PAYMENT_METHOD**: The step where users select payment method (1=COD, 2=Pay Full, 3=Pay Partial)

## Bug Details

### Fault Condition

The bug manifests when a user is in an active guided flow step (like PRODUCT_PAYMENT_METHOD) and types input that matches a global intent pattern. The `resolveAiIntent` function extracts numbers from the input and maps them to main menu choices. Global intent handlers (like TRACK_ORDER, EXECUTIVE) then execute despite the `hasActiveGuidedFlow` check, because they appear BEFORE the step-specific handlers in the message processing flow.

**Formal Specification:**
```
FUNCTION isBugCondition(input, userStep)
  INPUT: input of type string, userStep of type string
  OUTPUT: boolean
  
  RETURN hasActiveGuidedFlow(userStep) == true
         AND resolveAiIntent(input) != null
         AND globalIntentHandlerExecutes(input) == true
         AND stepSpecificHandlerNotReached(userStep) == true
END FUNCTION
```

### Examples

- User at step "PRODUCT_PAYMENT_METHOD" types "3" → Global intent handler executes → Payment flow interrupted (BUG)
- User at step "PRODUCT_PAYMENT_METHOD" types "3" → Expected: Select "Pay Partial Amount Now" → Actual: Triggers global intent
- User at step "PRODUCT_DELIVERY_ADDRESS" types "2" → May trigger global intent instead of processing address input (BUG)
- User at step "MENU" types "3" → Global intent handler executes → Correct behavior (NOT A BUG)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Global intent detection must continue to work when user is at step "MENU" or "START"
- Payment method selection for options 1 (COD) and 2 (Pay Full) must continue to work correctly
- All other step-specific handlers must continue to function as before
- Invalid input handling at PRODUCT_PAYMENT_METHOD must continue to re-prompt correctly

**Scope:**
All inputs when the user is NOT in an active guided flow (hasActiveGuidedFlow is false) should be completely unaffected by this fix. This includes:
- Users at "MENU" or "START" steps typing numbers or keywords
- Users typing global intent keywords when not in a flow
- All AI conversation and catalog query handling

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **Handler Execution Order**: Global intent handlers appear BEFORE step-specific handlers in the handleIncomingMessage function flow. When `resolveAiIntent` detects a matching intent, the global handler executes and returns early, preventing the step-specific handler from ever being reached.

2. **Insufficient Guard Condition**: The `hasActiveGuidedFlow` check exists but is only applied to SOME global intent handlers (like TRACK_ORDER), not ALL of them. Additionally, the check may not be comprehensive enough to cover all edge cases.

3. **Intent Detection Too Aggressive**: The `resolveAiIntent` function extracts numbers from ANY user input during active flows, even when those numbers are clearly meant for step-specific choices (like payment method selection).

4. **Missing Early Return Prevention**: There's no mechanism to prevent global intent handlers from executing when a step-specific handler should take precedence. The code structure allows global handlers to "steal" input that belongs to the current step.

## Correctness Properties

Property 1: Fault Condition - Step-Specific Handler Priority

_For any_ input where the user is in an active guided flow (hasActiveGuidedFlow returns true) and the input could match both a global intent and a step-specific option, the fixed code SHALL process the input through the step-specific handler and SHALL NOT execute any global intent handler.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Global Intent Detection Outside Flows

_For any_ input where the user is NOT in an active guided flow (hasActiveGuidedFlow returns false), the fixed code SHALL produce exactly the same behavior as the original code, preserving all global intent detection and handling for menu navigation, catalog queries, and AI conversations.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/whatsapp.js`

**Function**: `handleIncomingMessage`

**Specific Changes**:

1. **Move Global Intent Handlers After Step-Specific Handlers**: Restructure the handler execution order so that all step-specific handlers (PRODUCT_PAYMENT_METHOD, PRODUCT_DELIVERY_ADDRESS, etc.) are checked BEFORE any global intent handlers execute.

2. **Add Comprehensive Guard to All Global Intent Handlers**: Ensure EVERY global intent handler (TRACK_ORDER, PRODUCTS, SERVICES, EXECUTIVE, etc.) checks `!hasActiveGuidedFlow` before executing, not just some of them.

3. **Prevent Intent Detection During Active Flows**: Add a guard condition that skips `resolveAiIntent` entirely when `hasActiveGuidedFlow` is true, OR ensure that detected intents are ignored when in an active flow.

4. **Add Early Return After Step Handler**: Ensure that when a step-specific handler processes input successfully, it returns immediately to prevent any subsequent global handlers from executing.

5. **Document Handler Execution Order**: Add comments to clarify the intended execution order: step-specific handlers first, then global intent handlers, then AI fallback.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Fault Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate user input during active guided flows (like PRODUCT_PAYMENT_METHOD) with numbers that could match global intents. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Partial Payment Selection Test**: Simulate user at PRODUCT_PAYMENT_METHOD typing "3" (will fail on unfixed code - should select partial payment but triggers global intent)
2. **COD Selection Test**: Simulate user at PRODUCT_PAYMENT_METHOD typing "1" (should pass on unfixed code - COD selection works)
3. **Full Payment Selection Test**: Simulate user at PRODUCT_PAYMENT_METHOD typing "2" (should pass on unfixed code - full payment works)
4. **Menu Navigation Test**: Simulate user at MENU typing "3" (should pass on unfixed code - global intent should work)

**Expected Counterexamples**:
- Typing "3" at PRODUCT_PAYMENT_METHOD triggers global intent handler instead of partial payment flow
- Possible causes: handler execution order, missing guard conditions, aggressive intent detection

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input, userStep) DO
  result := handleIncomingMessage_fixed(input, userStep)
  ASSERT stepSpecificHandlerExecuted(result)
  ASSERT globalIntentHandlerNotExecuted(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input, userStep) DO
  ASSERT handleIncomingMessage_original(input, userStep) = handleIncomingMessage_fixed(input, userStep)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for menu navigation and other flows, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Menu Navigation Preservation**: Observe that typing "1", "2", "3" at MENU step works correctly on unfixed code, then write test to verify this continues after fix
2. **COD Payment Preservation**: Observe that typing "1" at PRODUCT_PAYMENT_METHOD works correctly on unfixed code, then write test to verify this continues after fix
3. **Full Payment Preservation**: Observe that typing "2" at PRODUCT_PAYMENT_METHOD works correctly on unfixed code, then write test to verify this continues after fix
4. **Invalid Input Preservation**: Observe that typing invalid input at PRODUCT_PAYMENT_METHOD re-prompts correctly on unfixed code, then write test to verify this continues after fix

### Unit Tests

- Test payment method selection for all three options (1=COD, 2=Full, 3=Partial) at PRODUCT_PAYMENT_METHOD step
- Test that global intent handlers execute correctly when hasActiveGuidedFlow is false
- Test that global intent handlers do NOT execute when hasActiveGuidedFlow is true
- Test edge cases (empty input, non-numeric input, out-of-range numbers)

### Property-Based Tests

- Generate random user steps and inputs to verify step-specific handlers always take priority during active flows
- Generate random menu navigation scenarios to verify global intent detection continues working outside flows
- Test that all payment method selections work correctly across many randomized order scenarios

### Integration Tests

- Test full product ordering flow from product selection through payment method selection to order completion
- Test switching between different flows (appointments, products, services) and verify no cross-contamination
- Test that partial payment flow completes successfully end-to-end after the fix

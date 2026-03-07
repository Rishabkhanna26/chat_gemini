# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Fault Condition** - Step-Specific Handler Priority During Active Flows
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete failing case - user at PRODUCT_PAYMENT_METHOD typing "3"
  - Test that when hasActiveGuidedFlow is true and user types "3" at PRODUCT_PAYMENT_METHOD, the step-specific handler processes the input (partial payment selection)
  - The test assertions should verify: stepSpecificHandlerExecuted AND globalIntentHandlerNotExecuted
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found: typing "3" triggers global intent handler instead of partial payment flow
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Global Intent Detection Outside Flows
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - User at MENU step typing "1", "2", "3" triggers global intent handlers correctly
    - User at PRODUCT_PAYMENT_METHOD typing "1" (COD) works correctly
    - User at PRODUCT_PAYMENT_METHOD typing "2" (Pay Full) works correctly
    - Invalid input at PRODUCT_PAYMENT_METHOD re-prompts correctly
  - Write property-based tests capturing observed behavior patterns:
    - For all inputs where hasActiveGuidedFlow is false, global intent detection works
    - For all valid payment method selections (1, 2), step-specific handlers work
    - For all invalid inputs during active flows, re-prompting works
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for partial payment flow interruption by global intent handlers

  - [x] 3.1 Implement the fix in src/whatsapp.js
    - Move global intent handlers after step-specific handlers in handleIncomingMessage execution order
    - Add comprehensive guard (!hasActiveGuidedFlow) to ALL global intent handlers (TRACK_ORDER, PRODUCTS, SERVICES, EXECUTIVE, etc.)
    - Add guard condition to skip resolveAiIntent when hasActiveGuidedFlow is true, OR ensure detected intents are ignored during active flows
    - Ensure step-specific handlers return immediately after processing to prevent global handlers from executing
    - Add comments documenting handler execution order: step-specific first, then global intents, then AI fallback
    - _Bug_Condition: isBugCondition(input, userStep) where hasActiveGuidedFlow(userStep) == true AND resolveAiIntent(input) != null_
    - _Expected_Behavior: stepSpecificHandlerExecuted(result) AND globalIntentHandlerNotExecuted(result)_
    - _Preservation: For all inputs where hasActiveGuidedFlow is false, behavior must remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Step-Specific Handler Priority During Active Flows
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify that typing "3" at PRODUCT_PAYMENT_METHOD now selects partial payment instead of triggering global intent
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Global Intent Detection Outside Flows
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix:
      - Menu navigation with numbers still works
      - COD and full payment selections still work
      - Invalid input handling still works
      - Global intent detection outside flows still works

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise
  - Verify the partial payment flow works end-to-end
  - Verify no regressions in other flows (appointments, services, product ordering)

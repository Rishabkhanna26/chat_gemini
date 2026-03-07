# Partial Payment Flow Bug Fix

## Problem

When a user selects option "3" (Pay Partial Amount Now) during the payment method step, the system was showing order tracking information instead of asking "How much do you want to pay now?"

### User Flow (Broken)
1. User completes order summary
2. User types "CONFIRM"
3. System shows payment method options:
   - 1️⃣ Cash on Delivery
   - 2️⃣ Pay Full Amount Now
   - 3️⃣ Pay Partial Amount Now
4. User types "3"
5. ❌ System shows order tracking (WRONG!)
6. Expected: System should ask "How much do you want to pay now?"

## Root Cause

The bug was caused by a **global intent handler** that runs BEFORE step-based flow checks.

### Code Flow Analysis

**Location**: `src/whatsapp.js` around line 4074

```javascript
// This runs BEFORE step-based handlers
if (aiDetectedIntent === "TRACK_ORDER") {
  // Show tracking immediately
  await sendMessage(trackingReply);
  return; // ← Exits before reaching PRODUCT_PAYMENT_METHOD step handler
}
```

**What happened:**
1. User is in step `PRODUCT_PAYMENT_METHOD`
2. User types "3"
3. The `resolveAiIntent()` function detects "3" as "TRACK_ORDER" (because "3" is the Track Order option in the main menu)
4. The global handler intercepts and shows tracking
5. The step-based handler for `PRODUCT_PAYMENT_METHOD` never runs

**Why "3" was detected as TRACK_ORDER:**
- Main menu structure:
  - 1️⃣ Services
  - 2️⃣ View Products
  - 3️⃣ Track Order ← Number "3"!
  - 4️⃣ Talk to Support

## Solution

Added a check to ensure global intent handlers only run when the user is NOT in an active guided flow.

### Code Change

**File**: `src/whatsapp.js` (line ~4074)

**Before:**
```javascript
if (aiDetectedIntent === "TRACK_ORDER") {
  const tracked = await fetchRecentOrdersForPhone({
    adminId: assignedAdminId,
    phone,
  });
  const trackingReply = await localizeReply(buildTrackingMessage(tracked));
  appendAiConversationHistory(user, "user", messageText);
  appendAiConversationHistory(user, "assistant", trackingReply);
  await sendMessage(trackingReply);
  trackLeadCaptureActivity({ user, messageText, phone, assignedAdminId });
  return;
}
```

**After:**
```javascript
if (!hasActiveGuidedFlow && aiDetectedIntent === "TRACK_ORDER") {
  const tracked = await fetchRecentOrdersForPhone({
    adminId: assignedAdminId,
    phone,
  });
  const trackingReply = await localizeReply(buildTrackingMessage(tracked));
  appendAiConversationHistory(user, "user", messageText);
  appendAiConversationHistory(user, "assistant", trackingReply);
  await sendMessage(trackingReply);
  trackLeadCaptureActivity({ user, messageText, phone, assignedAdminId });
  return;
}
```

**Key change:** Added `!hasActiveGuidedFlow &&` condition

### What is `hasActiveGuidedFlow`?

```javascript
const hasActiveGuidedFlow = Boolean(
  user?.step && !["START", "MENU", "RESUME_DECISION"].includes(user.step)
);
```

This checks if the user is in an active flow (like product ordering, service booking, etc.) vs. just browsing the menu.

## Expected Behavior After Fix

### User Flow (Fixed)
1. User completes order summary
2. User types "CONFIRM"
3. System shows payment method options:
   - 1️⃣ Cash on Delivery
   - 2️⃣ Pay Full Amount Now
   - 3️⃣ Pay Partial Amount Now
4. User types "3"
5. ✅ System asks: "Your order total is ₹5,996. Please type how much you want to pay now. (Example: 500)"
6. User types amount (e.g., "2000")
7. System generates payment link
8. User completes payment
9. Order is confirmed

## Testing

### Test Case 1: Partial Payment Flow
```
User: Hello
Bot: [Welcome message with menu]
User: I would like to order starter pack
Bot: [Product details]
User: Yes
Bot: How many would you like to order?
User: 4
Bot: Can I have your full name?
User: Rishab khanna
Bot: Please share your delivery address.
User: 618 addresses
Bot: Share an alternate phone number...
User: Same
Bot: Any note for delivery?
User: No
Bot: [Order Summary] Type *CONFIRM* to continue.
User: Confirm
Bot: Payment Method: 1️⃣ COD 2️⃣ Pay Full 3️⃣ Pay Partial
User: 3
Bot: ✅ Your order total is ₹5,996. Please type how much you want to pay now.
User: 2000
Bot: [Payment link generated]
```

### Test Case 2: Track Order from Menu (Should Still Work)
```
User: Hello
Bot: [Welcome message with menu]
User: 3
Bot: ✅ [Shows order tracking information]
```

### Test Case 3: Track Order During Active Flow (Should Be Ignored)
```
User: I want to order premium pack
Bot: [Product details]
User: 3
Bot: ❌ Should NOT show tracking (user is in product flow)
Bot: ✅ Should treat "3" as part of the current flow context
```

## Impact

This fix ensures that:
1. ✅ Partial payment flow works correctly
2. ✅ Track order from main menu still works
3. ✅ All numbered inputs during active flows are handled by the correct step handler
4. ✅ Global intent handlers don't interfere with guided flows

## Related Code

**Global intent detection**: `resolveAiIntent()` function
**Step-based handlers**: Lines 4500-5500 in `src/whatsapp.js`
**Payment method handler**: Line ~5076 (`PRODUCT_PAYMENT_METHOD` step)
**Partial payment handler**: Line ~5210 (`PRODUCT_PARTIAL_PAYMENT_AMOUNT` step)

## Deployment

1. Restart backend: `npm run backend`
2. Test partial payment flow end-to-end
3. Verify track order still works from main menu
4. Monitor logs for any issues

## Prevention

To prevent similar bugs in the future:
1. Always check `hasActiveGuidedFlow` before global intent handlers
2. Prioritize step-based handlers over global intent detection
3. Test all numbered menu options in different flow contexts
4. Add logging to track which handler processes each message

## Summary

Fixed a critical bug where typing "3" during payment method selection was triggering the track order handler instead of the partial payment flow. The fix adds a check to ensure global intent handlers only run when the user is not in an active guided flow.

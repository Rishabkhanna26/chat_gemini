# Build Error Fix: Missing deleteOrder Export

## Error

```
Export deleteOrder doesn't exist in target module
./app/api/orders/[id]/route.js:2:1
import { deleteOrder, getOrderById, updateOrder } from '../../../../lib/db-helpers';
```

## Problem

The `app/api/orders/[id]/route.js` file was trying to import `deleteOrder` from `lib/db-helpers.js`, but that function didn't exist.

## Solution

Created the `deleteOrder` function in `lib/db-helpers.js` following the same pattern as other order functions (`getOrderById`, `updateOrder`).

### Function Implementation

**Location**: `lib/db-helpers.js` (after `updateOrder` function, around line 1484)

```javascript
export async function deleteOrder(orderId, adminId = null) {
  const normalizedOrderId = Number(orderId);
  if (!Number.isFinite(normalizedOrderId) || normalizedOrderId <= 0) {
    return { success: false, error: 'Invalid order ID' };
  }

  const connection = await getConnection();
  try {
    // First, get the order to verify it exists and belongs to the admin
    const params = [normalizedOrderId];
    let whereClause = 'WHERE id = ?';
    if (adminId) {
      whereClause += ' AND admin_id = ?';
      params.push(adminId);
    }

    const [existingRows] = await connection.query(
      `SELECT id FROM orders ${whereClause} LIMIT 1`,
      params
    );

    if (!existingRows || existingRows.length === 0) {
      return { success: false, error: 'Order not found' };
    }

    // Delete the order (CASCADE will handle related records)
    await connection.query(
      `DELETE FROM orders ${whereClause}`,
      params
    );

    return { success: true };
  } catch (error) {
    console.error('Error deleting order:', error);
    return { success: false, error: error.message || 'Failed to delete order' };
  } finally {
    connection.release();
  }
}
```

## Features

1. **Input Validation**: Validates that `orderId` is a valid positive number
2. **Admin Scoping**: Optional `adminId` parameter ensures admins can only delete their own orders
3. **Existence Check**: Verifies the order exists before attempting deletion
4. **Cascade Deletion**: Database CASCADE constraints automatically delete related records:
   - `order_revenue` (revenue tracking)
   - `order_payment_link_timers` (payment link timers)
5. **Error Handling**: Returns structured response with success/error status
6. **Connection Management**: Properly releases database connection

## Usage

```javascript
// Delete order (any admin)
const result = await deleteOrder(123);

// Delete order (specific admin only)
const result = await deleteOrder(123, adminId);

// Response format
{
  success: true  // or false
  error: 'Error message'  // only if success is false
}
```

## Database Schema

The function relies on CASCADE constraints defined in the database schema:

```sql
-- order_revenue table
order_id INT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE

-- order_payment_link_timers table
order_id INT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE
```

When an order is deleted, these related records are automatically removed.

## Testing

After this fix, the build should succeed. To test the delete functionality:

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Test the API endpoint**:
   ```bash
   # Delete an order
   curl -X DELETE http://localhost:3001/api/orders/123 \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Expected responses**:
   ```json
   // Success
   { "success": true }

   // Order not found
   { "success": false, "error": "Order not found" }

   // Invalid ID
   { "success": false, "error": "Invalid order ID" }
   ```

## Related Files

- **Function definition**: `lib/db-helpers.js` (line ~1484)
- **Import usage**: `app/api/orders/[id]/route.js` (line 2)
- **Related functions**: `getOrderById`, `updateOrder`

## Summary

Created the missing `deleteOrder` function in `lib/db-helpers.js` to fix the build error. The function follows the same pattern as other order functions, includes proper validation, admin scoping, and error handling.

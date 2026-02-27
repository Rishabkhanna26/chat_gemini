import { requireAuth } from '../../../../lib/auth-server';
import { updateOrder } from '../../../../lib/db-helpers';
import { hasProductAccess } from '../../../../lib/business.js';

const ALLOWED_STATUSES = new Set([
  'new',
  'confirmed',
  'processing',
  'packed',
  'out_for_delivery',
  'fulfilled',
  'cancelled',
  'refunded',
]);
const ALLOWED_FULFILLMENT = new Set([
  'unfulfilled',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
]);
const ALLOWED_PAYMENT = new Set(['pending', 'paid', 'failed', 'refunded']);
const ALLOWED_PAYMENT_METHODS = new Set(['cash', 'card', 'upi', 'bank', 'wallet', 'other', '']);

export async function PATCH(request, context) {
  try {
    const authUser = await requireAuth();
    if (!hasProductAccess(authUser)) {
      return Response.json(
        { success: false, error: 'Orders are disabled for this business type.' },
        { status: 403 }
      );
    }
    const params = await context.params;
    const orderId = Number(params?.id);
    if (!Number.isFinite(orderId)) {
      return Response.json({ success: false, error: 'Invalid order id' }, { status: 400 });
    }

    const body = await request.json();
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      const status = String(body?.status || '');
      if (!ALLOWED_STATUSES.has(status)) {
        return Response.json({ success: false, error: 'Invalid status' }, { status: 400 });
      }
      updates.status = status;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'fulfillment_status')) {
      const fulfillment = String(body?.fulfillment_status || '');
      if (!ALLOWED_FULFILLMENT.has(fulfillment)) {
        return Response.json({ success: false, error: 'Invalid fulfillment status' }, { status: 400 });
      }
      updates.fulfillment_status = fulfillment;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'payment_status')) {
      const paymentStatus = String(body?.payment_status || '');
      if (!ALLOWED_PAYMENT.has(paymentStatus)) {
        return Response.json({ success: false, error: 'Invalid payment status' }, { status: 400 });
      }
      updates.payment_status = paymentStatus;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'payment_total')) {
      updates.payment_total = body?.payment_total;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'payment_paid')) {
      updates.payment_paid = body?.payment_paid;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'payment_method')) {
      const method = String(body?.payment_method || '');
      if (!ALLOWED_PAYMENT_METHODS.has(method)) {
        return Response.json({ success: false, error: 'Invalid payment method' }, { status: 400 });
      }
      updates.payment_method = method || null;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'payment_notes')) {
      updates.payment_notes = String(body?.payment_notes || '').trim() || null;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'assigned_to')) {
      updates.assigned_to = String(body?.assigned_to || '').trim() || null;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
      updates.notes = Array.isArray(body?.notes) ? body.notes : null;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ success: false, error: 'No updates provided' }, { status: 400 });
    }

    const adminScopeId = authUser.admin_tier === 'super_admin' ? null : authUser.id;
    const updated = await updateOrder(orderId, updates, adminScopeId);
    if (!updated) {
      return Response.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    return Response.json({ success: true, data: updated });
  } catch (error) {
    if (error.status === 401) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

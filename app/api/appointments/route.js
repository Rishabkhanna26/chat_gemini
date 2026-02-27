import { createAppointment, getAppointments, getUserById } from '../../../lib/db-helpers';
import { parsePagination, parseSearch, parseStatus } from '../../../lib/api-utils';
import { requireAuth } from '../../../lib/auth-server';
import { hasServiceAccess } from '../../../lib/business.js';

const ALLOWED_STATUSES = new Set(['booked', 'completed', 'cancelled']);
const ALLOWED_PAYMENT_METHODS = new Set(['cash', 'card', 'upi', 'bank', 'wallet', 'other', '']);

export async function GET(req) {
  try {
    const authUser = await requireAuth();
    if (!hasServiceAccess(authUser)) {
      return Response.json(
        { success: false, error: 'Appointments are disabled for this business type.' },
        { status: 403 }
      );
    }
    const { searchParams } = new URL(req.url);
    const { limit, offset } = parsePagination(searchParams);
    const search = parseSearch(searchParams);
    const status = parseStatus(searchParams);
    const adminScopeId = authUser.admin_tier === 'super_admin' ? null : authUser.id;
    const appointments = await getAppointments(adminScopeId, {
      search,
      status,
      limit: limit + 1,
      offset,
    });
    const hasMore = appointments.length > limit;
    const data = hasMore ? appointments.slice(0, limit) : appointments;
    const response = Response.json({
      success: true,
      data,
      meta: {
        limit,
        offset,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      },
    });
    response.headers.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
    return response;
  } catch (error) {
    if (error.status === 401) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const authUser = await requireAuth();
    if (!hasServiceAccess(authUser)) {
      return Response.json(
        { success: false, error: 'Appointments are disabled for this business type.' },
        { status: 403 }
      );
    }
    const body = await req.json();

    const userId = Number(body?.user_id);
    if (!Number.isFinite(userId)) {
      return Response.json({ success: false, error: 'Invalid contact.' }, { status: 400 });
    }

    const contact = await getUserById(
      userId,
      authUser.admin_tier === 'super_admin' ? null : authUser.id
    );
    if (!contact) {
      return Response.json({ success: false, error: 'Contact not found.' }, { status: 404 });
    }

    const status = String(body?.status || 'booked');
    if (!ALLOWED_STATUSES.has(status)) {
      return Response.json({ success: false, error: 'Invalid status.' }, { status: 400 });
    }

    const appointmentType = String(body?.appointment_type || '').trim();
    const start = new Date(body?.start_time);
    const endRaw = body?.end_time;
    let end = endRaw ? new Date(endRaw) : null;
    if (Number.isNaN(start.getTime())) {
      return Response.json({ success: false, error: 'Invalid start time.' }, { status: 400 });
    }
    if (end && Number.isNaN(end.getTime())) {
      end = null;
    }
    if (!end) {
      return Response.json({ success: false, error: 'End time is required.' }, { status: 400 });
    }
    if (end <= start) {
      return Response.json({ success: false, error: 'End time must be after start time.' }, { status: 400 });
    }

    const paymentMethod = String(body?.payment_method || '');
    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
      return Response.json({ success: false, error: 'Invalid payment method.' }, { status: 400 });
    }

    const created = await createAppointment({
      user_id: userId,
      admin_id: authUser.id,
      appointment_type: appointmentType || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status,
      payment_total: body?.payment_total,
      payment_paid: body?.payment_paid,
      payment_method: paymentMethod || null,
      payment_notes: String(body?.payment_notes || '').trim() || null,
    });

    if (!created) {
      return Response.json({ success: false, error: 'Unable to create appointment.' }, { status: 500 });
    }

    return Response.json({ success: true, data: created });
  } catch (error) {
    if (error.status === 401) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

import { requireAuth } from '../../../lib/auth-server';
import { getAdminAISettings, updateAdminAISettings } from '../../../lib/db-helpers';

export const runtime = 'nodejs';

const DEFAULTS = Object.freeze({
  ai_enabled: false,
  ai_prompt: '',
  ai_blocklist: '',
  automation_enabled: true,
  appointment_start_hour: 9,
  appointment_end_hour: 20,
  appointment_slot_minutes: 60,
  appointment_window_months: 3,
});

const parseBoundedInteger = (value, { min, max }) => {
  if (value === undefined) return { provided: false, value: undefined };
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    return { provided: true, error: `Must be an integer between ${min} and ${max}.` };
  }
  return { provided: true, value: num };
};

export async function GET() {
  try {
    const user = await requireAuth();
    const settings = await getAdminAISettings(user.id);
    return Response.json({
      success: true,
      data: settings || DEFAULTS,
    });
  } catch (error) {
    if (error.status === 401) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const ai_enabled = typeof body.ai_enabled === 'boolean' ? body.ai_enabled : undefined;
    const ai_prompt = typeof body.ai_prompt === 'string' ? body.ai_prompt : undefined;
    const ai_blocklist = typeof body.ai_blocklist === 'string' ? body.ai_blocklist : undefined;
    const automation_enabled =
      typeof body.automation_enabled === 'boolean' ? body.automation_enabled : undefined;
    const startHour = parseBoundedInteger(body.appointment_start_hour, { min: 0, max: 23 });
    if (startHour.error) {
      return Response.json(
        { success: false, error: `appointment_start_hour: ${startHour.error}` },
        { status: 400 }
      );
    }
    const endHour = parseBoundedInteger(body.appointment_end_hour, { min: 1, max: 24 });
    if (endHour.error) {
      return Response.json(
        { success: false, error: `appointment_end_hour: ${endHour.error}` },
        { status: 400 }
      );
    }
    const slotMinutes = parseBoundedInteger(body.appointment_slot_minutes, { min: 15, max: 240 });
    if (slotMinutes.error) {
      return Response.json(
        { success: false, error: `appointment_slot_minutes: ${slotMinutes.error}` },
        { status: 400 }
      );
    }
    const windowMonths = parseBoundedInteger(body.appointment_window_months, { min: 1, max: 24 });
    if (windowMonths.error) {
      return Response.json(
        { success: false, error: `appointment_window_months: ${windowMonths.error}` },
        { status: 400 }
      );
    }

    const finalStartHour =
      startHour.provided && startHour.value !== undefined ? startHour.value : undefined;
    const finalEndHour = endHour.provided && endHour.value !== undefined ? endHour.value : undefined;
    if (
      finalStartHour !== undefined &&
      finalEndHour !== undefined &&
      finalEndHour <= finalStartHour
    ) {
      return Response.json(
        {
          success: false,
          error: 'appointment_end_hour must be greater than appointment_start_hour.',
        },
        { status: 400 }
      );
    }

    const updated = await updateAdminAISettings(user.id, {
      ai_enabled,
      ai_prompt,
      ai_blocklist,
      automation_enabled,
      appointment_start_hour: finalStartHour,
      appointment_end_hour: finalEndHour,
      appointment_slot_minutes:
        slotMinutes.provided && slotMinutes.value !== undefined ? slotMinutes.value : undefined,
      appointment_window_months:
        windowMonths.provided && windowMonths.value !== undefined ? windowMonths.value : undefined,
    });
    return Response.json({ success: true, data: updated });
  } catch (error) {
    if (error.status === 401) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

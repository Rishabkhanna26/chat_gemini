import { requireAuth } from '../../../lib/auth-server';
import { getAdminAISettings, updateAdminAISettings } from '../../../lib/db-helpers';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireAuth();
    const settings = await getAdminAISettings(user.id);
    return Response.json({
      success: true,
      data:
        settings || {
          ai_enabled: false,
          ai_prompt: '',
          ai_blocklist: '',
          automation_enabled: true,
        },
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

    const updated = await updateAdminAISettings(user.id, {
      ai_enabled,
      ai_prompt,
      ai_blocklist,
      automation_enabled,
    });
    return Response.json({ success: true, data: updated });
  } catch (error) {
    if (error.status === 401) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

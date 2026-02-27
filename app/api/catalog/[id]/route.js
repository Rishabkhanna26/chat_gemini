import { requireAuth } from '../../../../lib/auth-server';
import { deleteCatalogItem, getCatalogItemById, updateCatalogItem } from '../../../../lib/db-helpers';
import { canUseCatalogItemType } from '../../../../lib/business.js';

const parseId = (value) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return null;
  const num = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(num) ? num : null;
};

const parseBoolean = (value) => {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return undefined;
};

const parseNumber = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return num;
};

const parseDurationUnit = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return undefined;
  if (['minutes', 'minute', 'min', 'mins'].includes(raw)) return 'minutes';
  if (['hours', 'hour', 'hr', 'hrs'].includes(raw)) return 'hours';
  if (['weeks', 'week'].includes(raw)) return 'weeks';
  if (['months', 'month'].includes(raw)) return 'months';
  return undefined;
};

const toDurationMinutes = (value, unit) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  const factors = {
    minutes: 1,
    hours: 60,
    weeks: 60 * 24 * 7,
    months: 60 * 24 * 30,
  };
  const normalizedUnit = parseDurationUnit(unit) || 'minutes';
  return Math.round(num * (factors[normalizedUnit] || 1));
};

export async function GET(request, { params }) {
  try {
    const user = await requireAuth();
    const resolvedParams = await Promise.resolve(params);
    const itemId = parseId(resolvedParams?.id);
    if (!itemId) {
      return Response.json({ success: false, error: 'Invalid item id.' }, { status: 400 });
    }
    const item = await getCatalogItemById(itemId, user.id);
    if (!item) {
      return Response.json({ success: false, error: 'Item not found.' }, { status: 404 });
    }
    return Response.json({ success: true, data: item });
  } catch (error) {
    if (error.status === 401) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const user = await requireAuth();
    const resolvedParams = await Promise.resolve(params);
    const itemId = parseId(resolvedParams?.id);
    if (!itemId) {
      return Response.json({ success: false, error: 'Invalid item id.' }, { status: 400 });
    }

    const body = await request.json();
    const updates = {};

    if (body?.item_type || body?.type) {
      const itemType = String(body?.item_type || body?.type || '').trim().toLowerCase();
      if (!['service', 'product'].includes(itemType)) {
        return Response.json({ success: false, error: 'Invalid item type.' }, { status: 400 });
      }
      if (!canUseCatalogItemType(user, itemType)) {
        return Response.json(
          { success: false, error: `Your business type cannot add ${itemType} items.` },
          { status: 403 }
        );
      }
      updates.item_type = itemType;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      const name = String(body?.name || '').trim();
      if (!name) {
        return Response.json({ success: false, error: 'Name is required.' }, { status: 400 });
      }
      updates.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'category')) {
      updates.category = String(body?.category || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
      updates.description = String(body?.description || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'price_label')) {
      updates.price_label = String(body?.price_label || '').trim();
    }

    if (
      Object.prototype.hasOwnProperty.call(body, 'duration_value') ||
      Object.prototype.hasOwnProperty.call(body, 'duration_unit') ||
      Object.prototype.hasOwnProperty.call(body, 'duration_minutes')
    ) {
      updates.duration_value = parseNumber(body?.duration_value);
      updates.duration_unit = parseDurationUnit(body?.duration_unit);
      updates.duration_minutes =
        toDurationMinutes(body?.duration_value, body?.duration_unit) ??
        parseNumber(body?.duration_minutes);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'quantity_value')) {
      updates.quantity_value = parseNumber(body?.quantity_value);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'quantity_unit')) {
      updates.quantity_unit = String(body?.quantity_unit || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'details_prompt')) {
      updates.details_prompt = String(body?.details_prompt || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'keywords')) {
      updates.keywords = body?.keywords;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
      const value = parseBoolean(body?.is_active);
      if (value !== undefined) updates.is_active = value;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'sort_order')) {
      updates.sort_order = parseNumber(body?.sort_order) ?? 0;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'is_bookable')) {
      const value = parseBoolean(body?.is_bookable);
      if (value !== undefined) updates.is_bookable = value;
    }

    const item = await updateCatalogItem(itemId, user.id, updates);
    if (!item) {
      return Response.json({ success: false, error: 'Item not found.' }, { status: 404 });
    }
    return Response.json({ success: true, data: item });
  } catch (error) {
    if (error.status === 401) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const user = await requireAuth();
    const resolvedParams = await Promise.resolve(params);
    const itemId = parseId(resolvedParams?.id);
    if (!itemId) {
      return Response.json({ success: false, error: 'Invalid item id.' }, { status: 400 });
    }
    const deleted = await deleteCatalogItem(itemId, user.id);
    if (!deleted) {
      return Response.json({ success: false, error: 'Item not found.' }, { status: 404 });
    }
    return Response.json({ success: true, data: deleted });
  } catch (error) {
    if (error.status === 401) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

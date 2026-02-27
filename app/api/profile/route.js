import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { requireAuth } from '../../../lib/auth-server';
import { signAuthToken } from '../../../lib/auth';
import { getAdminById, updateAdminProfile } from '../../../lib/db-helpers';
import { sanitizeEmail, sanitizeNameUpper, sanitizeText } from '../../../lib/sanitize.js';

export const runtime = 'nodejs';

const getSafeFolder = (value) => String(value || '').replace(/\D/g, '');

const getProfilePhotoUrl = async (phone) => {
  const folderName = getSafeFolder(phone);
  if (!folderName) return null;
  const publicDir = path.join(process.cwd(), 'public', folderName);
  const candidates = ['profile.jpg', 'profile.jpeg', 'profile.png', 'profile.webp'];
  for (const candidate of candidates) {
    try {
      await fs.access(path.join(publicDir, candidate));
      return `/${folderName}/${candidate}`;
    } catch (error) {
      // continue
    }
  }
  return null;
};

export async function GET() {
  try {
    const user = await requireAuth();
    const admin = await getAdminById(user.id);
    if (!admin) {
      const response = NextResponse.json({ success: false, error: 'User not found' }, { status: 401 });
      response.cookies.set({
        name: 'auth_token',
        value: '',
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
        secure: process.env.NODE_ENV === 'production',
      });
      return response;
    }
    const profilePhotoUrl = await getProfilePhotoUrl(admin.phone);
    return NextResponse.json({
      success: true,
      data: {
        ...admin,
        profile_photo_url: profilePhotoUrl,
      },
    });
  } catch (error) {
    if (error.status === 401) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const name = typeof body.name === 'string' ? sanitizeNameUpper(body.name) : undefined;
    const email = typeof body.email === 'string' ? sanitizeEmail(body.email) || '' : undefined;
    const businessCategory =
      typeof body.business_category === 'string'
        ? sanitizeText(body.business_category, 120)
        : undefined;
    const businessTypeRaw =
      typeof body.business_type === 'string' ? body.business_type.trim().toLowerCase() : undefined;
    const allowedBusinessTypes = new Set(['product', 'service', 'both']);
    const businessType =
      businessTypeRaw && allowedBusinessTypes.has(businessTypeRaw)
        ? businessTypeRaw
        : undefined;

    const admin = await updateAdminProfile(user.id, {
      name,
      email,
      business_category: businessCategory,
      business_type: businessType,
    });
    if (!admin) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }
    const token = signAuthToken({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      phone: admin.phone,
      admin_tier: admin.admin_tier,
      business_category: admin.business_category,
      business_type: admin.business_type,
      access_expires_at: admin.access_expires_at,
    });

    const profilePhotoUrl = await getProfilePhotoUrl(admin.phone);
    const response = NextResponse.json({
      success: true,
      data: {
        ...admin,
        profile_photo_url: profilePhotoUrl,
      },
    });
    response.cookies.set({
      name: 'auth_token',
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === 'production',
    });
    return response;
  } catch (error) {
    if (error.status === 401) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

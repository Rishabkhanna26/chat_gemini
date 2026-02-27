'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Input from '../components/common/Input.jsx';
import Badge from '../components/common/Badge.jsx';
import { useAuth } from '../components/auth/AuthProvider.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUser,
  faPalette,
  faMobileScreen,
  faShieldHalved,
  faCheck,
} from '@fortawesome/free-solid-svg-icons';
import {
  ACCENT_COLORS,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_THEME,
  THEMES,
  applyAccentColor,
  applyTheme,
  getStoredAccentColor,
  getStoredTheme,
  storeAccentColor,
  storeTheme,
} from '../../lib/appearance.js';
import { getBackendJwt } from '../../lib/backend-auth.js';
import { getBusinessTypeLabel } from '../../lib/business.js';

const WHATSAPP_API_BASE =
  process.env.NEXT_PUBLIC_WHATSAPP_API_BASE || 'http://localhost:3001';
const WHATSAPP_SOCKET_URL =
  process.env.NEXT_PUBLIC_WHATSAPP_SOCKET_URL || WHATSAPP_API_BASE;

const BUSINESS_TYPE_OPTIONS = [
  { value: 'product', label: 'Product-based' },
  { value: 'service', label: 'Service-based' },
  { value: 'both', label: 'Product + Service' },
];

export default function SettingsPage() {
  const { user, loading: authLoading, refresh } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    business_category: '',
    business_type: 'both',
  });
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState('idle');
  const [whatsappQr, setWhatsappQr] = useState('');
  const [whatsappQrVersion, setWhatsappQrVersion] = useState(0);
  const whatsappQrJobRef = useRef(0);
  const [whatsappActionStatus, setWhatsappActionStatus] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    next: '',
    confirm: '',
  });
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [whatsappConfig, setWhatsappConfig] = useState({
    phone: '',
    businessName: '',
    category: '',
    businessType: 'both',
  });

  const updatePasswordField = (field) => (event) =>
    setPasswordForm((prev) => ({ ...prev, [field]: event.target.value }));

  const updateWhatsappQr = useCallback((nextQr) => {
    setWhatsappQr(nextQr || '');
    setWhatsappQrVersion((prev) => prev + 1);
    whatsappQrJobRef.current += 1;
  }, []);

  const fetchWhatsAppApi = useCallback(async (path, options = {}, retry = true) => {
    const token = await getBackendJwt();
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };
    const response = await fetch(`${WHATSAPP_API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (response.status === 401 && retry) {
      const freshToken = await getBackendJwt({ forceRefresh: true });
      return fetch(`${WHATSAPP_API_BASE}${path}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${freshToken}`,
        },
        credentials: 'include',
      });
    }

    return response;
  }, []);

  useEffect(() => {
    const storedAccent = getStoredAccentColor();
    const initialAccent = storedAccent || DEFAULT_ACCENT_COLOR;
    setAccentColor(initialAccent);
    applyAccentColor(initialAccent);
    const storedTheme = getStoredTheme(user?.id);
    const initialTheme = THEMES.includes(storedTheme) ? storedTheme : DEFAULT_THEME;
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, [user?.id]);

  const handleAccentChange = (color) => {
    setAccentColor(color);
    applyAccentColor(color);
    storeAccentColor(color);
  };

  const handleThemeChange = (nextTheme) => {
    const resolved = nextTheme === 'dark' ? 'dark' : 'light';
    setTheme(resolved);
    applyTheme(resolved);
    storeTheme(resolved, user?.id);
  };

  const renderQrFromRaw = useCallback(
    async (qrText) => {
      if (!qrText) return;
      const jobId = (whatsappQrJobRef.current += 1);
      try {
        const { toDataURL } = await import('qrcode');
        const dataUrl = await toDataURL(qrText);
        if (whatsappQrJobRef.current !== jobId) return;
        updateWhatsappQr(dataUrl);
      } catch (error) {
        console.error('Failed to render WhatsApp QR:', error);
      }
    },
    [updateWhatsappQr]
  );

  useEffect(() => {
    if (user) {
      setProfile((prev) => ({
        name: user.name || prev.name,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        business_category: user.business_category || prev.business_category,
        business_type: user.business_type || prev.business_type,
      }));
    }
  }, [user]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setProfileError('');
        const response = await fetch('/api/profile', { credentials: 'include' });
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(text || 'Unexpected server response');
        }
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load profile');
        }
        setProfile({
          name: data.data?.name || '',
          email: data.data?.email || '',
          phone: data.data?.phone || '',
          business_category: data.data?.business_category || '',
          business_type: data.data?.business_type || 'both',
        });
        setProfilePhotoPreview(data.data?.profile_photo_url || null);
        if (data.data?.whatsapp_number || data.data?.whatsapp_name) {
          setWhatsappConfig((prev) => ({
            ...prev,
            phone: data.data?.whatsapp_number || prev.phone,
            businessName: data.data?.whatsapp_name || prev.businessName,
          }));
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
        setProfileError(error.message);
      } finally {
        setProfileLoading(false);
      }
    };

    if (authLoading) return;
    if (!user) {
      setProfileLoading(false);
      return;
    }
    loadProfile();
  }, [authLoading, user]);

  useEffect(() => {
    setWhatsappConfig((prev) => ({
      ...prev,
      category: profile.business_category || 'General',
      businessType: profile.business_type || 'both',
    }));
  }, [profile.business_category, profile.business_type]);

  const fetchWhatsAppStatus = useCallback(async (isMountedRef = { current: true }) => {
    try {
      if (!user?.id) return;
      const response = await fetchWhatsAppApi(
        `/whatsapp/status?adminId=${user.id}`
      );
      if (!response.ok) {
        throw new Error('Failed to load WhatsApp status');
      }
      const payload = await response.json();
      if (!isMountedRef.current) return;
      const nextStatus = payload?.status || 'idle';
      const isCurrentAdmin =
        payload?.activeAdminId && user?.id && payload.activeAdminId === user.id;
      const derivedStatus =
        nextStatus === 'connected' && !isCurrentAdmin
          ? 'connected_other'
          : nextStatus;
      setWhatsappStatus(derivedStatus);
      setWhatsappConnected(derivedStatus === 'connected');
      if (derivedStatus === 'connected') {
        updateWhatsappQr('');
      } else if (payload?.qrImage) {
        updateWhatsappQr(payload.qrImage);
      } else if (derivedStatus !== 'qr') {
        updateWhatsappQr('');
      }
    } catch (error) {
      if (isMountedRef.current) {
        setWhatsappActionStatus('Unable to fetch WhatsApp status.');
      }
    }
  }, [fetchWhatsAppApi, user?.id]);

  useEffect(() => {
    const isMountedRef = { current: true };
    let socket = null;
    if (!user?.id) {
      return () => {
        isMountedRef.current = false;
        if (socket) socket.disconnect();
      };
    }
    fetchWhatsAppStatus(isMountedRef);

    (async () => {
      try {
        const token = await getBackendJwt();
        if (!isMountedRef.current) return;
        socket = io(WHATSAPP_SOCKET_URL, {
          query: { adminId: user?.id },
          auth: { token },
        });

        socket.on('whatsapp:status', (payload) => {
          const nextStatus = payload?.status || 'idle';
          const isCurrentAdmin =
            payload?.activeAdminId && user?.id && payload.activeAdminId === user.id;
          const derivedStatus =
            nextStatus === 'connected' && !isCurrentAdmin
              ? 'connected_other'
              : nextStatus;
          setWhatsappStatus(derivedStatus);
          setWhatsappConnected(derivedStatus === 'connected');
          if (derivedStatus === 'connected') {
            updateWhatsappQr('');
          } else if (payload?.qrImage) {
            updateWhatsappQr(payload.qrImage);
          } else if (derivedStatus !== 'qr') {
            updateWhatsappQr('');
          }
        });

        socket.on('whatsapp:qr', (payload) => {
          if (!payload) return;
          if (typeof payload === 'string') {
            updateWhatsappQr(payload);
            return;
          }
          if (payload?.qrImage) {
            updateWhatsappQr(payload.qrImage);
            return;
          }
          if (payload?.qr) {
            renderQrFromRaw(payload.qr);
          }
        });

        socket.on('connect_error', () => {
          setWhatsappActionStatus('Unable to connect to WhatsApp service.');
        });
      } catch (error) {
        if (!isMountedRef.current) return;
        setWhatsappActionStatus('Unable to connect to WhatsApp service.');
      }
    })();

    return () => {
      isMountedRef.current = false;
      if (socket) socket.disconnect();
    };
  }, [fetchWhatsAppStatus, renderQrFromRaw, updateWhatsappQr, user?.id]);

  const handleStartWhatsApp = async () => {
    try {
      setWhatsappActionStatus('');
      const response = await fetchWhatsAppApi('/whatsapp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: user?.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to start WhatsApp');
      }
      await fetchWhatsAppStatus();
    } catch (error) {
      setWhatsappActionStatus(error.message);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    try {
      setWhatsappActionStatus('');
      const response = await fetchWhatsAppApi('/whatsapp/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: user?.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to disconnect WhatsApp');
      }
      await fetchWhatsAppStatus();
    } catch (error) {
      setWhatsappActionStatus(error.message);
    }
  };

  const tabs = [
    { id: 'profile', name: 'Profile', icon: faUser, hint: 'Identity and account data' },
    { id: 'appearance', name: 'Appearance', icon: faPalette, hint: 'Theme and accent colors' },
    { id: 'whatsapp', name: 'WhatsApp', icon: faMobileScreen, hint: 'Connection and QR pairing' },
    { id: 'security', name: 'Security', icon: faShieldHalved, hint: 'Password and sessions' },
  ];

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  const isWhatsappPending = whatsappStatus === 'starting' || whatsappStatus === 'qr';
  const canDisconnect = whatsappConnected || whatsappStatus === 'connected_other';
  const whatsappTone = whatsappConnected ? 'green' : isWhatsappPending ? 'amber' : 'red';
  const whatsappStatusLabel = whatsappConnected
    ? 'Configured'
    : whatsappStatus === 'connected_other'
    ? 'Connected (Other Admin)'
    : whatsappStatus === 'starting'
    ? 'Starting'
    : whatsappStatus === 'qr'
    ? 'Awaiting Scan'
    : whatsappStatus === 'auth_failure'
    ? 'Auth Failed'
    : 'Disconnected';
  const whatsappStatusMessage = whatsappConnected
    ? 'WhatsApp is connected and configured for this admin.'
    : whatsappStatus === 'connected_other'
    ? 'WhatsApp is connected under a different admin account.'
    : whatsappStatus === 'starting'
    ? 'Starting WhatsApp client. Please wait...'
    : whatsappStatus === 'qr'
    ? 'Scan the QR code below with WhatsApp to connect.'
    : whatsappStatus === 'auth_failure'
    ? 'Authentication failed. Please reconnect.'
    : 'WhatsApp client is currently disconnected.';

  return (
    <div
      className="space-y-6 rounded-3xl border border-white/60 bg-[radial-gradient(circle_at_top_right,_#fff4ea_0%,_#ffffff_42%,_#eef4ff_100%)] p-4 sm:p-6"
      data-testid="settings-page"
    >
      <Card className="border border-white/70 bg-white/85 backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-aa-dark-blue">Settings</h1>
            <p className="text-aa-gray mt-2">Manage your account and preferences from one place.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={whatsappConnected ? 'green' : 'yellow'}>
              WhatsApp: {whatsappStatusLabel}
            </Badge>
            <Badge variant="blue">Current: {activeTabMeta.name}</Badge>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="border border-white/70 bg-white/90 backdrop-blur p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                    activeTab === tab.id
                      ? 'border-aa-orange bg-aa-orange/10 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-aa-orange/40 hover:bg-gray-50'
                  }`}
                  data-testid={`settings-tab-${tab.id}`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        activeTab === tab.id
                          ? 'bg-aa-orange text-white'
                          : 'bg-aa-dark-blue/10 text-aa-dark-blue'
                      }`}
                    >
                      <FontAwesomeIcon icon={tab.icon} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-aa-text-dark">{tab.name}</span>
                      <span className="mt-0.5 hidden text-xs text-aa-gray sm:block">
                        {tab.hint}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="min-w-0">
          {/* Profile Settings */}
          {activeTab === 'profile' && (
            <Card className="border border-white/70 bg-white/90 backdrop-blur">
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-aa-dark-blue">Profile Settings</h2>
                <p className="mt-1 text-sm text-aa-gray">
                  Keep your account details up to date for appointments and reporting.
                </p>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                    <p className="text-xs uppercase tracking-wide text-aa-gray">Profile Photo</p>
                    <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="h-24 w-24 rounded-2xl bg-aa-dark-blue flex items-center justify-center overflow-hidden shadow-sm">
                        {profilePhotoPreview ? (
                          <img
                            src={profilePhotoPreview}
                            alt="Profile"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-white font-bold text-3xl">
                            {profile.name?.charAt(0) || 'A'}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <input
                          id="profile-photo-input"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            setProfilePhoto(file);
                            setProfilePhotoPreview(URL.createObjectURL(file));
                          }}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            className="min-w-[132px]"
                            onClick={() => document.getElementById('profile-photo-input')?.click()}
                          >
                            Change Photo
                          </Button>
                          {profilePhotoPreview && (
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setProfilePhoto(null);
                                setProfilePhotoPreview(null);
                              }}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-aa-gray">JPG, PNG. Max 2MB.</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-aa-orange/20 bg-aa-orange/5 p-4 sm:p-5">
                    <p className="text-xs uppercase tracking-wide text-aa-gray">Account Summary</p>
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-col gap-1 rounded-xl bg-white/90 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm text-aa-gray">Role</span>
                        <span className="text-sm font-semibold text-aa-text-dark sm:text-right">
                          {user?.admin_tier === 'super_admin' ? 'Super Admin' : 'Admin'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-xl bg-white/90 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm text-aa-gray">Business Category</span>
                        <span className="text-sm font-semibold text-aa-text-dark sm:text-right break-words">
                          {profile.business_category || 'General'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-xl bg-white/90 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm text-aa-gray">Business Type</span>
                        <span className="text-sm font-semibold text-aa-text-dark sm:text-right break-words">
                          {getBusinessTypeLabel(profile.business_type)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {profileError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {profileError}
                  </div>
                )}

                <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                  {profileLoading ? (
                    <div className="rounded-xl bg-gray-50 px-4 py-6 text-sm text-aa-gray">
                      Loading profile data...
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Input
                        label="Full Name"
                        value={profile.name}
                        onChange={(event) => setProfile((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Enter your name"
                      />
                      <Input
                        label="Email"
                        type="email"
                        value={profile.email}
                        onChange={(event) => setProfile((prev) => ({ ...prev, email: event.target.value }))}
                        placeholder="Enter your email"
                      />
                      <Input
                        label="Phone"
                        value={profile.phone}
                        onChange={(event) => setProfile((prev) => ({ ...prev, phone: event.target.value }))}
                        placeholder="Enter phone number"
                        disabled
                      />
                      <div className="w-full">
                        <label className="mb-2 block text-sm font-semibold text-aa-text-dark">
                          Business Category <span className="text-red-500">*</span>
                        </label>
                        <input
                          value={profile.business_category}
                          onChange={(event) =>
                            setProfile((prev) => ({ ...prev, business_category: event.target.value }))
                          }
                          placeholder="Shop, Retail, Cracker..."
                          className="w-full rounded-lg border-2 border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-aa-orange sm:py-3 sm:text-base"
                        />
                        <p className="mt-1 text-xs text-aa-gray">
                          Add your business category that customers understand quickly.
                        </p>
                      </div>
                      <div className="w-full">
                        <label className="mb-2 block text-sm font-semibold text-aa-text-dark">
                          Business Type <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={profile.business_type}
                          onChange={(event) =>
                            setProfile((prev) => ({ ...prev, business_type: event.target.value }))
                          }
                          className="w-full rounded-lg border-2 border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-aa-orange sm:py-3 sm:text-base"
                        >
                          {BUSINESS_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-aa-gray">
                          Product-based shows orders, service-based shows appointments, both shows both.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="order-2 sm:order-1">
                    {saveStatus && (
                      <span
                        className={`text-sm font-semibold ${
                          saveStatus.includes('Failed') || saveStatus.includes('error')
                            ? 'text-red-600'
                            : 'text-green-600'
                        }`}
                      >
                        {saveStatus}
                      </span>
                    )}
                  </div>
                  <div className="order-1 flex flex-col gap-2 sm:order-2 sm:flex-row">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setProfileLoading(true);
                        setProfileError('');
                        try {
                          const response = await fetch('/api/profile', { credentials: 'include' });
                          const data = await response.json();
                          if (!response.ok) {
                            throw new Error(data.error || 'Failed to reset');
                          }
                          setProfile({
                            name: data.data?.name || '',
                            email: data.data?.email || '',
                            phone: data.data?.phone || '',
                            business_category: data.data?.business_category || '',
                            business_type: data.data?.business_type || 'both',
                          });
                          setProfilePhoto(null);
                          setProfilePhotoPreview(data.data?.profile_photo_url || null);
                          setSaveStatus('');
                        } catch (error) {
                          setProfileError(error.message);
                        } finally {
                          setProfileLoading(false);
                        }
                      }}
                      disabled={profileLoading}
                      className="w-full sm:w-auto"
                    >
                      Reset
                    </Button>
                    <Button
                      variant="primary"
                      onClick={async () => {
                        try {
                          setSaveStatus('');
                          if (profilePhoto) {
                            const formData = new FormData();
                            formData.append('photo', profilePhoto);
                            const photoResponse = await fetch('/api/profile/photo', {
                              method: 'POST',
                              body: formData,
                            });
                            const photoData = await photoResponse.json().catch(() => ({}));
                            if (!photoResponse.ok) {
                              throw new Error(photoData.error || 'Failed to upload photo.');
                            }
                            if (photoData?.url) {
                              setProfilePhotoPreview(photoData.url);
                            }
                            setProfilePhoto(null);
                          }
                          const response = await fetch('/api/profile', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({
                              name: profile.name,
                              email: profile.email,
                              business_category: profile.business_category,
                              business_type: profile.business_type,
                            }),
                          });
                          const contentType = response.headers.get('content-type') || '';
                          if (!contentType.includes('application/json')) {
                            const text = await response.text();
                            throw new Error(text || 'Unexpected server response');
                          }
                          const data = await response.json();
                          if (!response.ok) {
                            throw new Error(data.error || 'Failed to save');
                          }
                          setProfile({
                            name: data.data?.name || '',
                            email: data.data?.email || '',
                            phone: data.data?.phone || '',
                            business_category: data.data?.business_category || '',
                            business_type: data.data?.business_type || 'both',
                          });
                          await refresh();
                          setSaveStatus('Profile updated.');
                          setTimeout(() => setSaveStatus(''), 2000);
                        } catch (error) {
                          console.error('Failed to save profile:', error);
                          setSaveStatus(error.message);
                        }
                      }}
                      disabled={profileLoading}
                      className="w-full sm:w-auto"
                    >
                      Save Changes
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Notifications Settings */}
          {/* {activeTab === 'notifications' && (
            <Card>
              <h2 className="text-2xl font-bold text-aa-dark-blue mb-6">Notification Preferences</h2>
              <div className="space-y-4">
                {[
                  { title: 'New Messages', description: 'Get notified when you receive new messages' },
                  { title: 'New Leads', description: 'Get notified when new leads are created' },
                  { title: 'Broadcast Sent', description: 'Get notified when broadcasts are successfully sent' },
                  { title: 'Team Updates', description: 'Get notified about team member activities' },
                  { title: 'System Updates', description: 'Get notified about system maintenance and updates' }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-semibold text-aa-text-dark">{item.title}</p>
                      <p className="text-sm text-aa-gray mt-1">{item.description}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-aa-orange"></div>
                    </label>
                  </div>
                ))}
              </div>
            </Card>
          )} */}

          {/* Appearance Settings */}
          {activeTab === 'appearance' && (
            <Card className="border border-white/70 bg-white/90 backdrop-blur">
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-aa-dark-blue">Appearance</h2>
                <p className="mt-1 text-sm text-aa-gray">
                  Personalize your workspace theme and accent.
                </p>
              </div>
              <div className="space-y-6">
                <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                  <label className="mb-3 block text-xs uppercase tracking-wide text-aa-gray">Theme</label>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => handleThemeChange('light')}
                      className={`rounded-2xl border-2 p-4 text-left transition ${
                        theme === 'light'
                          ? 'border-aa-orange bg-aa-orange/5 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-aa-orange/50'
                      }`}
                    >
                      <div className="mb-3 h-24 rounded-xl border border-white/70 bg-[linear-gradient(130deg,_#ffd4b0_0%,_#ffffff_50%,_#dbeafe_100%)]" />
                      <p className="font-semibold text-aa-text-dark">Light Theme</p>
                      <p className="mt-1 text-xs text-aa-gray">Best for daytime and brighter displays.</p>
                      <Badge variant={theme === 'light' ? 'orange' : 'default'} className="mt-3">
                        {theme === 'light' ? 'Active' : 'Use'}
                      </Badge>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleThemeChange('dark')}
                      className={`rounded-2xl border-2 p-4 text-left transition ${
                        theme === 'dark'
                          ? 'border-aa-orange bg-aa-orange/5 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-aa-orange/50'
                      }`}
                    >
                      <div className="mb-3 h-24 rounded-xl border border-slate-700/70 bg-[linear-gradient(130deg,_#0f172a_0%,_#1e293b_52%,_#334155_100%)]" />
                      <p className="font-semibold text-aa-text-dark">Dark Theme</p>
                      <p className="mt-1 text-xs text-aa-gray">Reduced glare for low-light environments.</p>
                      <Badge variant={theme === 'dark' ? 'orange' : 'default'} className="mt-3">
                        {theme === 'dark' ? 'Active' : 'Use'}
                      </Badge>
                    </button>
                  </div>
                </section>

                <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                  <label className="mb-3 block text-xs uppercase tracking-wide text-aa-gray">Accent Color</label>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 md:grid-cols-8">
                    {ACCENT_COLORS.map((color) => {
                      const isActive =
                        accentColor?.toUpperCase() === color.toUpperCase();
                      return (
                        <button
                          key={color}
                          type="button"
                          aria-pressed={isActive}
                          title={`Set accent color ${color}`}
                          onClick={() => handleAccentChange(color)}
                          className={`group relative flex h-12 w-full items-center justify-center rounded-xl border-2 transition ${
                            isActive
                              ? 'border-aa-dark-blue ring-2 ring-aa-orange/30'
                              : 'border-gray-200 hover:border-aa-dark-blue/50'
                          }`}
                          style={{ backgroundColor: color }}
                        >
                          {isActive && (
                            <span className="text-sm text-white drop-shadow">
                              <FontAwesomeIcon icon={faCheck} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            </Card>
          )}

          {/* WhatsApp Settings */}
          {activeTab === 'whatsapp' && (
            <Card className="border border-white/70 bg-white/90 backdrop-blur">
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-aa-dark-blue">WhatsApp Configuration</h2>
                <p className="mt-1 text-sm text-aa-gray">
                  Connect your WhatsApp account to sync chats inside inbox.
                </p>
              </div>

              <div className="space-y-5">
                <div
                  className={`rounded-2xl border p-4 sm:p-5 ${
                    whatsappTone === 'green'
                      ? 'bg-green-50 border-green-200'
                      : whatsappTone === 'amber'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`h-3 w-3 rounded-full ${
                          whatsappTone === 'green'
                            ? 'bg-green-500 animate-pulse'
                            : whatsappTone === 'amber'
                            ? 'bg-amber-500 animate-pulse'
                            : 'bg-red-500'
                        }`}
                      />
                      <span
                        className={`font-semibold ${
                          whatsappTone === 'green'
                            ? 'text-green-700'
                            : whatsappTone === 'amber'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {whatsappStatusLabel}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        variant="primary"
                        onClick={handleStartWhatsApp}
                        disabled={whatsappConnected || whatsappStatus === 'starting'}
                        className="w-full sm:w-auto"
                      >
                        {whatsappConnected
                          ? 'Configured'
                          : whatsappStatus === 'starting'
                          ? 'Starting...'
                          : 'Connect WhatsApp'}
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full border-red-600 text-red-600 hover:bg-red-50 sm:w-auto"
                        onClick={handleDisconnectWhatsApp}
                        disabled={!canDisconnect}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>
                  <p
                    className={`mt-3 text-sm ${
                      whatsappTone === 'green'
                        ? 'text-green-700'
                        : whatsappTone === 'amber'
                        ? 'text-amber-700'
                        : 'text-red-700'
                    }`}
                  >
                    {whatsappStatusMessage}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                    <p className="text-xs uppercase tracking-wide text-aa-gray">Business Profile</p>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Input
                        label="Phone Number"
                        value={whatsappConfig.phone}
                        onChange={(event) =>
                          setWhatsappConfig((prev) => ({ ...prev, phone: event.target.value }))
                        }
                        placeholder="Not connected"
                        disabled
                      />
                      <Input
                        label="Business Name"
                        value={whatsappConfig.businessName}
                        onChange={(event) =>
                          setWhatsappConfig((prev) => ({
                            ...prev,
                            businessName: event.target.value,
                          }))
                        }
                        placeholder="Not connected"
                        disabled
                      />
                      <div className="flex flex-col">
                        <Input
                          label="Business Category"
                          value={whatsappConfig.category}
                          disabled
                        />
                        <p className="mt-1 text-xs text-aa-gray">
                          Category describes your domain like retail, shop, crackers, clinic, etc.
                        </p>
                      </div>
                      <div className="flex flex-col">
                        <Input
                          label="Business Type"
                          value={getBusinessTypeLabel(whatsappConfig.businessType)}
                          disabled
                        />
                        <p className="mt-1 text-xs text-aa-gray">
                          Type controls whether orders, appointments, or both are shown.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-4 sm:p-5">
                    <p className="text-xs uppercase tracking-wide text-aa-gray">QR Pairing</p>
                    {!whatsappConnected && whatsappQr ? (
                      <div className="mt-3 flex flex-col items-center gap-3">
                        <img
                          key={whatsappQrVersion}
                          src={whatsappQr}
                          alt="WhatsApp QR Code"
                          className="h-52 w-52 max-w-full rounded-xl border border-gray-200 bg-white p-2"
                        />
                        <p className="text-center text-xs text-aa-gray">
                          WhatsApp &gt; Linked Devices &gt; Link a device
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl bg-gray-50 px-4 py-10 text-center text-sm text-aa-gray">
                        QR will appear here when connection starts.
                      </div>
                    )}
                  </div>
                </div>

                {whatsappActionStatus && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {whatsappActionStatus}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Integrations */}
          {/* {activeTab === 'integrations' && (
            <Card>
              <h2 className="text-2xl font-bold text-aa-dark-blue mb-6">Integrations</h2>
              <div className="space-y-4">
                {[
                  { name: 'Google Calendar', description: 'Sync your meetings and appointments', connected: true },
                  { name: 'Slack', description: 'Get notifications in your Slack workspace', connected: false },
                  { name: 'Zapier', description: 'Connect with 5000+ apps', connected: false },
                  { name: 'Google Drive', description: 'Store and share files', connected: true },
                  { name: 'Stripe', description: 'Accept payments and manage subscriptions', connected: false }
                ].map((integration, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg hover:border-aa-orange">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-aa-dark-blue/10 rounded-lg flex items-center justify-center">
                        <FontAwesomeIcon icon={faGlobe} className="text-aa-dark-blue" style={{ fontSize: 24 }} />
                      </div>
                      <div>
                        <p className="font-semibold text-aa-text-dark">{integration.name}</p>
                        <p className="text-sm text-aa-gray">{integration.description}</p>
                      </div>
                    </div>
                    {integration.connected ? (
                      <Badge variant="green">Connected</Badge>
                    ) : (
                      <Button variant="outline" className="text-sm">Connect</Button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )} */}

          {/* Security Settings */}
          {activeTab === 'security' && (
            <Card className="border border-white/70 bg-white/90 backdrop-blur">
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-aa-dark-blue">Security Settings</h2>
                <p className="mt-1 text-sm text-aa-gray">
                  Manage password and active access to your account.
                </p>
              </div>

              <div className="space-y-5">
                <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                  <h3 className="text-base font-semibold text-aa-text-dark">Change Password</h3>
                  <p className="mt-1 text-xs text-aa-gray">Use at least 8 characters.</p>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Input
                      label="Current Password"
                      type="password"
                      placeholder="Enter current password"
                      value={passwordForm.current}
                      onChange={updatePasswordField('current')}
                      disabled={passwordLoading}
                      className="md:col-span-2"
                    />
                    <Input
                      label="New Password"
                      type="password"
                      placeholder="Enter new password"
                      value={passwordForm.next}
                      onChange={updatePasswordField('next')}
                      disabled={passwordLoading}
                    />
                    <Input
                      label="Confirm Password"
                      type="password"
                      placeholder="Confirm new password"
                      value={passwordForm.confirm}
                      onChange={updatePasswordField('confirm')}
                      disabled={passwordLoading}
                    />
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button
                      variant="primary"
                      onClick={async () => {
                        setPasswordStatus('');
                        if (!passwordForm.next || passwordForm.next.length < 8) {
                          setPasswordStatus('New password must be at least 8 characters.');
                          return;
                        }
                        if (passwordForm.next !== passwordForm.confirm) {
                          setPasswordStatus('Passwords do not match.');
                          return;
                        }
                        setPasswordLoading(true);
                        try {
                          const response = await fetch('/api/profile/password', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({
                              currentPassword: passwordForm.current,
                              newPassword: passwordForm.next,
                            }),
                          });
                          const data = await response.json();
                          if (!response.ok) {
                            throw new Error(data.error || 'Failed to update password.');
                          }
                          setPasswordForm({ current: '', next: '', confirm: '' });
                          setPasswordStatus('Password updated.');
                        } catch (error) {
                          setPasswordStatus(error.message);
                        } finally {
                          setPasswordLoading(false);
                        }
                      }}
                      disabled={passwordLoading}
                      className="w-full sm:w-auto"
                    >
                      {passwordLoading ? 'Updating...' : 'Update Password'}
                    </Button>
                    {passwordStatus && (
                      <span
                        className={`text-sm font-semibold ${
                          passwordStatus.includes('updated') ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {passwordStatus}
                      </span>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                  <h3 className="text-base font-semibold text-aa-text-dark">Two-Factor Authentication</h3>
                  <div className="mt-3 flex flex-col gap-3 rounded-xl bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-aa-text-dark">Enable 2FA</p>
                      <p className="mt-1 text-sm text-aa-gray">
                        Add an extra layer of security to your account.
                      </p>
                    </div>
                    <Button variant="outline" className="w-full sm:w-auto">
                      Enable
                    </Button>
                  </div>
                </section>

              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

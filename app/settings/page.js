'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Input from '../components/common/Input.jsx';
import Badge from '../components/common/Badge.jsx';
import GeminiSelect from '../components/common/GeminiSelect.jsx';
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
    business_name: '',
    business_category: '',
    business_type: 'both',
    business_address: '',
    business_hours: '',
    business_map_url: '',
  });
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [whatsappCanReconnect, setWhatsappCanReconnect] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState('idle');
  const [whatsappQr, setWhatsappQr] = useState('');
  const [whatsappPairingCode, setWhatsappPairingCode] = useState('');
  const [whatsappPairingPhoneInput, setWhatsappPairingPhoneInput] = useState('');
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

  const normalizePairingPhone = useCallback((value) => {
    return String(value || '').replace(/\D/g, '').slice(0, 15);
  }, []);

  const markWhatsappDisconnectedUi = useCallback(({ allowReconnect = true } = {}) => {
    setWhatsappStatus('disconnected');
    setWhatsappConnected(false);
    if (!allowReconnect) {
      setWhatsappCanReconnect(false);
    }
    updateWhatsappQr('');
    setWhatsappPairingCode('');
  }, [updateWhatsappQr]);

  const applyWhatsappStatusPayload = useCallback((payload = {}) => {
    const nextStatus = String(payload?.status || 'disconnected');
    const isCurrentAdmin =
      !payload?.activeAdminId || !user?.id || payload.activeAdminId === user.id;
    let derivedStatus =
      nextStatus === 'connected' && !isCurrentAdmin
        ? 'connected_other'
        : nextStatus;
    const isConnected = derivedStatus === 'connected' && Boolean(payload?.ready);
    if (!isConnected && derivedStatus === 'connected') {
      derivedStatus = 'disconnected';
    }
    const canReconnect = Boolean(payload?.canReconnect);

    setWhatsappStatus(derivedStatus);
    setWhatsappConnected(isConnected);
    setWhatsappCanReconnect(canReconnect);

    if (isConnected) {
      updateWhatsappQr('');
      setWhatsappPairingCode('');
      return;
    }
    if (payload?.pairingCode) {
      updateWhatsappQr('');
      setWhatsappPairingCode(String(payload.pairingCode));
      if (payload?.pairingPhoneNumber) {
        setWhatsappPairingPhoneInput(
          normalizePairingPhone(payload.pairingPhoneNumber)
        );
      }
      return;
    }
    if (payload?.qrImage) {
      setWhatsappPairingCode('');
      updateWhatsappQr(payload.qrImage);
      return;
    }
    if (derivedStatus !== 'qr' && derivedStatus !== 'code') {
      updateWhatsappQr('');
      setWhatsappPairingCode('');
    }
  }, [normalizePairingPhone, updateWhatsappQr, user?.id]);

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
        business_name: user.business_name || prev.business_name,
        business_category: user.business_category || prev.business_category,
        business_type: user.business_type || prev.business_type,
        business_address: user.business_address || prev.business_address,
        business_hours: user.business_hours || prev.business_hours,
        business_map_url: user.business_map_url || prev.business_map_url,
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
          throw new Error(text || 'Something went wrong. Please try again.');
        }
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Could not load your profile.');
        }
        setProfile({
          name: data.data?.name || '',
          email: data.data?.email || '',
          phone: data.data?.phone || '',
          business_name: data.data?.business_name || '',
          business_category: data.data?.business_category || '',
          business_type: data.data?.business_type || 'both',
          business_address: data.data?.business_address || '',
          business_hours: data.data?.business_hours || '',
          business_map_url: data.data?.business_map_url || '',
        });
        setProfilePhotoPreview(data.data?.profile_photo_url || null);
        if (data.data?.whatsapp_number || data.data?.whatsapp_name) {
          setWhatsappConfig((prev) => ({
            ...prev,
            phone: data.data?.whatsapp_number || prev.phone,
            businessName:
              data.data?.whatsapp_name || data.data?.business_name || prev.businessName,
          }));
          setWhatsappPairingPhoneInput((prev) =>
            prev || normalizePairingPhone(data.data?.whatsapp_number || '')
          );
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
  }, [authLoading, normalizePairingPhone, user]);

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
      applyWhatsappStatusPayload(payload);
    } catch (error) {
      if (isMountedRef.current) {
        markWhatsappDisconnectedUi();
        setWhatsappActionStatus('Could not load WhatsApp status.');
      }
    }
  }, [applyWhatsappStatusPayload, fetchWhatsAppApi, markWhatsappDisconnectedUi, user?.id]);

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
    const pollTimer = setInterval(() => {
      fetchWhatsAppStatus(isMountedRef);
    }, 15000);
    const handleFocus = () => {
      fetchWhatsAppStatus(isMountedRef);
    };
    window.addEventListener('focus', handleFocus);

    (async () => {
      try {
        const token = await getBackendJwt();
        if (!isMountedRef.current) return;
        socket = io(WHATSAPP_SOCKET_URL, {
          query: { adminId: user?.id },
          auth: { token },
        });

        socket.on('whatsapp:status', (payload) => {
          applyWhatsappStatusPayload(payload);
        });

        socket.on('whatsapp:qr', (payload) => {
          if (!payload) return;
          setWhatsappPairingCode('');
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

        socket.on('whatsapp:code', (payload) => {
          const code =
            typeof payload === 'string'
              ? payload.trim()
              : String(payload?.code || '').trim();
          if (!code) return;
          setWhatsappStatus('code');
          setWhatsappConnected(false);
          updateWhatsappQr('');
          setWhatsappPairingCode(code);
          const incomingPhone =
            typeof payload === 'object' && payload?.phoneNumber
              ? normalizePairingPhone(payload.phoneNumber)
              : '';
          if (incomingPhone) {
            setWhatsappPairingPhoneInput(incomingPhone);
          }
          setWhatsappCanReconnect(false);
        });

        socket.on('connect_error', () => {
          markWhatsappDisconnectedUi();
          setWhatsappActionStatus('Could not connect to WhatsApp.');
        });

        socket.on('disconnect', () => {
          markWhatsappDisconnectedUi();
          setWhatsappActionStatus('Could not connect to WhatsApp.');
        });
      } catch (error) {
        if (!isMountedRef.current) return;
        markWhatsappDisconnectedUi();
        setWhatsappActionStatus('Could not connect to WhatsApp.');
      }
    })();

    return () => {
      isMountedRef.current = false;
      clearInterval(pollTimer);
      window.removeEventListener('focus', handleFocus);
      if (socket) socket.disconnect();
    };
  }, [
    applyWhatsappStatusPayload,
    fetchWhatsAppStatus,
    markWhatsappDisconnectedUi,
    normalizePairingPhone,
    renderQrFromRaw,
    updateWhatsappQr,
    user?.id,
  ]);

  const handleStartWhatsApp = async ({ usePairingCode = false } = {}) => {
    try {
      setWhatsappActionStatus('');
      const pairingPhoneNumber = normalizePairingPhone(whatsappPairingPhoneInput);
      if (usePairingCode && (pairingPhoneNumber.length < 8 || pairingPhoneNumber.length > 15)) {
        throw new Error('Enter a valid phone number with country code. Use digits only.');
      }
      const response = await fetchWhatsAppApi('/whatsapp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: user?.id,
          authMethod: usePairingCode ? 'code' : 'qr',
          ...(usePairingCode
            ? {
                phoneNumber: pairingPhoneNumber,
              }
            : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Could not start WhatsApp.');
      }
      if (payload?.pairingCode) {
        setWhatsappPairingCode(String(payload.pairingCode));
      } else if (usePairingCode) {
        setWhatsappPairingCode('');
      }
      if (usePairingCode) {
        updateWhatsappQr('');
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
        throw new Error(payload?.error || 'Could not disconnect WhatsApp.');
      }
      setWhatsappPairingCode('');
      updateWhatsappQr('');
      await fetchWhatsAppStatus();
    } catch (error) {
      setWhatsappActionStatus(error.message);
    }
  };

  const tabs = [
    { id: 'profile', name: 'Profile', icon: faUser, hint: 'Identity and account data' },
    { id: 'appearance', name: 'Appearance', icon: faPalette, hint: 'Theme and accent colors' },
    { id: 'whatsapp', name: 'WhatsApp', icon: faMobileScreen, hint: 'Connect and link' },
    { id: 'security', name: 'Security', icon: faShieldHalved, hint: 'Password and login' },
  ];

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  const isWhatsappPending =
    whatsappStatus === 'starting' ||
    whatsappStatus === 'qr' ||
    whatsappStatus === 'code';
  const showReconnectAction =
    whatsappStatus === 'disconnected' &&
    !whatsappConnected &&
    whatsappCanReconnect;
  const showFreshConnectActions =
    whatsappStatus === 'disconnected' &&
    !whatsappConnected &&
    !whatsappCanReconnect;
  const isStartBlocked =
    whatsappConnected ||
    whatsappStatus === 'connected_other' ||
    isWhatsappPending;
  const showDisconnectAction = Boolean(whatsappConnected || isWhatsappPending);
  const whatsappTone = whatsappConnected ? 'green' : isWhatsappPending ? 'amber' : 'red';
  const whatsappStatusLabel = whatsappConnected
    ? 'Connected'
    : whatsappStatus === 'connected_other'
    ? 'Connected (Another Admin)'
    : whatsappStatus === 'starting'
    ? 'Starting'
    : whatsappStatus === 'qr'
    ? 'Waiting for QR Scan'
    : whatsappStatus === 'code'
    ? 'Waiting for Link Code Confirm'
    : 'Disconnected';
  const whatsappStatusMessage = whatsappConnected
    ? 'WhatsApp is connected for this admin.'
    : whatsappStatus === 'connected_other'
    ? 'WhatsApp is connected under a different admin account.'
    : whatsappStatus === 'starting'
    ? 'Starting WhatsApp. Please wait...'
    : whatsappStatus === 'qr'
    ? 'Scan the QR code below with WhatsApp to connect.'
    : whatsappStatus === 'code'
    ? 'Use the code below in WhatsApp > Linked Devices > Link with phone number.'
    : showReconnectAction
    ? 'Saved WhatsApp login was found for this admin. Click Reconnect to restore the connection.'
    : 'WhatsApp is not connected right now.';

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
            <Badge
              variant={
                whatsappTone === 'green'
                  ? 'green'
                  : whatsappTone === 'amber'
                  ? 'yellow'
                  : 'red'
              }
            >
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
                        <span className="text-sm text-aa-gray">Business Name</span>
                        <span className="text-sm font-semibold text-aa-text-dark sm:text-right break-words">
                          {profile.business_name || 'Not added'}
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
                        label="Business Name"
                        value={profile.business_name}
                        onChange={(event) =>
                          setProfile((prev) => ({ ...prev, business_name: event.target.value }))
                        }
                        placeholder="Enter your shop or business name"
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
                        <GeminiSelect
                          label="Business Type *"
                          value={profile.business_type}
                          onChange={(value) =>
                            setProfile((prev) => ({ ...prev, business_type: value }))
                          }
                          options={BUSINESS_TYPE_OPTIONS}
                          variant="vibrant"
                        />
                        <p className="mt-1 text-xs text-aa-gray">
                          Product-based shows orders, service-based shows appointments, both shows both.
                        </p>
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-2 block text-sm font-semibold text-aa-text-dark">
                          Business Address
                        </label>
                        <textarea
                          value={profile.business_address}
                          onChange={(event) =>
                            setProfile((prev) => ({ ...prev, business_address: event.target.value }))
                          }
                          placeholder="Add your exact showroom / office / shop address for WhatsApp AI replies"
                          rows={3}
                          className="w-full rounded-lg border-2 border-gray-200 px-4 py-3 text-sm outline-none focus:border-aa-orange sm:text-base"
                        />
                        <p className="mt-1 text-xs text-aa-gray">
                          Customers asking for location or address will get this exact detail.
                        </p>
                      </div>
                      <Input
                        label="Business Hours"
                        value={profile.business_hours}
                        onChange={(event) =>
                          setProfile((prev) => ({ ...prev, business_hours: event.target.value }))
                        }
                        placeholder="10 AM to 7 PM, Monday to Saturday"
                      />
                      <Input
                        label="Map URL"
                        value={profile.business_map_url}
                        onChange={(event) =>
                          setProfile((prev) => ({ ...prev, business_map_url: event.target.value }))
                        }
                        placeholder="https://maps.google.com/..."
                      />
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
                            throw new Error(data.error || 'Could not reset.');
                          }
                          setProfile({
                            name: data.data?.name || '',
                            email: data.data?.email || '',
                            phone: data.data?.phone || '',
                            business_name: data.data?.business_name || '',
                            business_category: data.data?.business_category || '',
                            business_type: data.data?.business_type || 'both',
                            business_address: data.data?.business_address || '',
                            business_hours: data.data?.business_hours || '',
                            business_map_url: data.data?.business_map_url || '',
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
                              throw new Error(photoData.error || 'Could not upload photo.');
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
                              business_name: profile.business_name,
                              business_category: profile.business_category,
                              business_type: profile.business_type,
                              business_address: profile.business_address,
                              business_hours: profile.business_hours,
                              business_map_url: profile.business_map_url,
                            }),
                          });
                          const contentType = response.headers.get('content-type') || '';
                          if (!contentType.includes('application/json')) {
                            const text = await response.text();
                            throw new Error(text || 'Something went wrong. Please try again.');
                          }
                          const data = await response.json();
                          if (!response.ok) {
                            throw new Error(data.error || 'Could not save.');
                          }
                          setProfile({
                            name: data.data?.name || '',
                            email: data.data?.email || '',
                            phone: data.data?.phone || '',
                            business_name: data.data?.business_name || '',
                            business_category: data.data?.business_category || '',
                            business_type: data.data?.business_type || 'both',
                            business_address: data.data?.business_address || '',
                            business_hours: data.data?.business_hours || '',
                            business_map_url: data.data?.business_map_url || '',
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
                <h2 className="text-xl sm:text-2xl font-bold text-aa-dark-blue">WhatsApp Setup</h2>
                <p className="mt-1 text-sm text-aa-gray">
                  Link your WhatsApp so chats appear in Inbox.
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
                      {showReconnectAction ? (
                        <Button
                          variant="primary"
                          onClick={() => handleStartWhatsApp({ usePairingCode: false })}
                          disabled={isStartBlocked}
                          className="w-full sm:w-auto"
                        >
                          Reconnect
                        </Button>
                      ) : null}
                      {showFreshConnectActions ? (
                        <Button
                          variant="primary"
                          onClick={() => handleStartWhatsApp({ usePairingCode: false })}
                          disabled={isStartBlocked}
                          className="w-full sm:w-auto"
                        >
                          {whatsappStatus === 'starting' ? 'Starting...' : 'Connect with QR'}
                        </Button>
                      ) : null}
                      {showFreshConnectActions ? (
                        <Button
                          variant="outline"
                          onClick={() => handleStartWhatsApp({ usePairingCode: true })}
                          disabled={isStartBlocked}
                          className="w-full sm:w-auto"
                        >
                          Get Link Code
                        </Button>
                      ) : null}
                      {showDisconnectAction ? (
                        <Button
                          variant="outline"
                          className="w-full border-red-600 text-red-600 hover:bg-red-50 sm:w-auto"
                          onClick={handleDisconnectWhatsApp}
                        >
                          Disconnect
                        </Button>
                      ) : null}
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
                    <p className="text-xs uppercase tracking-wide text-aa-gray">Link Options</p>

                    <div className="mt-3">
                      <Input
                        label="Phone Number for Link Code"
                        value={whatsappPairingPhoneInput}
                        onChange={(event) =>
                          setWhatsappPairingPhoneInput(
                            normalizePairingPhone(event.target.value)
                          )
                        }
                        placeholder="e.g. 919876543210"
                        disabled={isStartBlocked}
                      />
                      <p className="mt-1 text-xs text-aa-gray">
                        Enter country code and number with digits only.
                      </p>
                    </div>

                    {whatsappPairingCode && !whatsappConnected ? (
                      <div className="mt-4 rounded-xl border border-aa-orange/30 bg-aa-orange/5 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-aa-gray">Link Code</p>
                        <p className="mt-2 text-2xl font-bold tracking-[0.2em] text-aa-dark-blue">
                          {whatsappPairingCode}
                        </p>
                        <p className="mt-2 text-xs text-aa-gray">
                          WhatsApp &gt; Linked Devices &gt; Link with phone number instead.
                        </p>
                      </div>
                    ) : null}

                    {!whatsappConnected && whatsappQr ? (
                      <div className="mt-4 flex flex-col items-center gap-3">
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
                      <div className="mt-4 rounded-xl bg-gray-50 px-4 py-8 text-center text-sm text-aa-gray">
                        QR code or link code will show here after you start.
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
                <h2 className="text-xl sm:text-2xl font-bold text-aa-dark-blue">Login & Security</h2>
                <p className="mt-1 text-sm text-aa-gray">
                  Change your password and keep your account safe.
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
                            throw new Error(data.error || 'Could not update password.');
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
                  <h3 className="text-base font-semibold text-aa-text-dark">Extra Login Security (2FA)</h3>
                  <div className="mt-3 flex flex-col gap-3 rounded-xl bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-aa-text-dark">Turn on 2-step login</p>
                      <p className="mt-1 text-sm text-aa-gray">
                        Add one more check during login.
                      </p>
                    </div>
                    <Button variant="outline" className="w-full sm:w-auto">
                      Turn On
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

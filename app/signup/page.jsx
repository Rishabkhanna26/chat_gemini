'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Button from '../components/common/Button.jsx';
import Input from '../components/common/Input.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserPlus, faEnvelope, faLock, faPhone, faUser } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../components/auth/AuthProvider.jsx';

export default function SignupPage() {
  const router = useRouter();
  const { refresh, user, loading: authLoading } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    businessCategory: '',
    businessType: 'both',
    password: '',
    confirm: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerificationStep, setIsVerificationStep] = useState(false);
  const [showExistsPopup, setShowExistsPopup] = useState(false);
  const [existsMessage, setExistsMessage] = useState('');

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/dashboard');
    }
  }, [authLoading, user, router]);

  const update = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const signupPayload = () => ({
    name: form.name,
    email: form.email,
    phone: form.phone,
    business_category: form.businessCategory,
    business_type: form.businessType,
    password: form.password,
  });

  const showConflict = (data) => {
    const fields = data.fields || {};
    let message = data.error || 'Account already exists';
    if (fields.phone && fields.email) {
      message = 'This phone number and email already exist.';
    } else if (fields.phone) {
      message = 'This phone number already exists.';
    } else if (fields.email) {
      message = 'This email already exists.';
    }
    setExistsMessage(message);
    setShowExistsPopup(true);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.name || !form.email || !form.phone || !form.businessCategory || !form.password) {
      setError('Name, email, phone, business category, and password are required.');
      return;
    }

    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...signupPayload(),
          action: 'request_code',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 409) {
          showConflict(data);
          setLoading(false);
          return;
        }
        throw new Error(data.error || 'Failed to send verification code');
      }

      const data = await response.json().catch(() => ({}));
      setIsVerificationStep(true);
      setVerificationCode('');
      setSuccess(
        data?.email
          ? `Verification code sent to ${data.email}. Enter the code below to complete signup.`
          : 'Verification code sent. Enter the code below to complete signup.'
      );
    } catch (err) {
      setError(err.message || 'Failed to send verification code. Please try again.');
      console.error('Signup error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!verificationCode.trim()) {
      setError('Verification code is required.');
      return;
    }

    setVerifyLoading(true);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'verify_code',
          email: form.email,
          verification_code: verificationCode.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) {
          showConflict(data);
          return;
        }
        throw new Error(data.error || 'Verification failed');
      }

      if (data?.requires_activation) {
        setSuccess('Email verified. Your account is pending super admin activation.');
        setTimeout(() => router.push('/login'), 1500);
        return;
      }

      await refresh();
      router.push('/dashboard');
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
      console.error('Signup verification error:', err);
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setSuccess('');
    setResendLoading(true);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...signupPayload(),
          action: 'request_code',
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend verification code');
      }

      setSuccess('A new verification code has been sent to your email.');
    } catch (err) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="auth-v3-shell auth-v3-signup relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="auth-v3-bg pointer-events-none absolute inset-0">
        <span className="auth-v3-orb auth-v3-orb-one" />
        <span className="auth-v3-orb auth-v3-orb-two" />
        <span className="auth-v3-orb auth-v3-orb-three" />
        <span className="auth-v3-grid-lines" />
      </div>

      <div className="auth-v3-wrap relative z-10 mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl items-center">
        <div className="auth-v3-layout grid w-full gap-5 lg:grid-cols-[1.02fr_0.98fr]">
          <section className="auth-v3-card rounded-[2rem] p-6 sm:p-8 lg:p-10">
            <div className="auth-v3-brand mb-6 flex justify-center">
              <Image
                src="/algoaura_logo.png"
                alt="AlgoAura"
                width={360}
                height={110}
                priority
                className="auth-v3-logo"
              />
            </div>

            <h1 className="text-center text-3xl font-black text-aa-dark-blue">Create account</h1>
            <p className="mt-2 text-center text-sm text-aa-gray">Set up your workspace for product and service workflows.</p>

            {error && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {success}
              </div>
            )}

            {!isVerificationStep ? (
              <form onSubmit={handleSignup} className="mt-6 space-y-4">
                <Input
                  label="Full Name"
                  value={form.name}
                  onChange={update('name')}
                  placeholder="Your name"
                  required
                  icon={<FontAwesomeIcon icon={faUser} style={{ fontSize: 18 }} />}
                />

                <Input
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={update('email')}
                  placeholder="your@email.com"
                  required
                  icon={<FontAwesomeIcon icon={faEnvelope} style={{ fontSize: 18 }} />}
                />

                <Input
                  label="Phone"
                  value={form.phone}
                  onChange={update('phone')}
                  placeholder="9876543210"
                  required
                  icon={<FontAwesomeIcon icon={faPhone} style={{ fontSize: 18 }} />}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="w-full">
                    <label className="mb-2 block text-sm font-semibold text-aa-text-dark">
                      Business Category <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={form.businessCategory}
                      onChange={update('businessCategory')}
                      placeholder="Shop, Retail, Services..."
                    />
                    <p className="mt-1 text-xs text-aa-gray">
                      This helps us tailor your modules and reports.
                    </p>
                  </div>

                  <div className="w-full">
                    <label className="mb-2 block text-sm font-semibold text-aa-text-dark">
                      Business Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.businessType}
                      onChange={update('businessType')}
                      className="auth-v3-select w-full rounded-lg border-2 border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-aa-orange sm:py-3 sm:text-base"
                    >
                      <option value="both">Both (Product + Service)</option>
                      <option value="product">Product-based</option>
                      <option value="service">Service-based</option>
                    </select>
                    <p className="mt-1 text-xs text-aa-gray">
                      We show only the modules your business needs.
                    </p>
                  </div>
                </div>

                <Input
                  label="Password"
                  type="password"
                  value={form.password}
                  onChange={update('password')}
                  placeholder="••••••••"
                  required
                  icon={<FontAwesomeIcon icon={faLock} style={{ fontSize: 18 }} />}
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  value={form.confirm}
                  onChange={update('confirm')}
                  placeholder="••••••••"
                  required
                  icon={<FontAwesomeIcon icon={faLock} style={{ fontSize: 18 }} />}
                />

                <Button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-xl py-3 text-base shadow-[0_12px_24px_rgb(var(--aa-orange)/0.26)]"
                  icon={<FontAwesomeIcon icon={faUserPlus} style={{ fontSize: 18 }} />}
                >
                  {loading ? 'Sending code...' : 'Send Verification Code'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="mt-6 space-y-4">
                <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                  Verification code sent to <span className="font-semibold">{form.email}</span>. Enter the code to complete account creation.
                </div>

                <Input
                  label="Verification Code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  required
                  icon={<FontAwesomeIcon icon={faLock} style={{ fontSize: 18 }} />}
                  inputMode="numeric"
                  maxLength={6}
                />

                <Button
                  type="submit"
                  disabled={verifyLoading}
                  className="mt-2 w-full rounded-xl py-3 text-base shadow-[0_12px_24px_rgb(var(--aa-orange)/0.26)]"
                  icon={<FontAwesomeIcon icon={faUserPlus} style={{ fontSize: 18 }} />}
                >
                  {verifyLoading ? 'Verifying...' : 'Verify Code & Create Account'}
                </Button>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={resendLoading || verifyLoading}
                    onClick={handleResendCode}
                  >
                    {resendLoading ? 'Resending...' : 'Resend Code'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    disabled={verifyLoading}
                    onClick={() => {
                      setIsVerificationStep(false);
                      setVerificationCode('');
                      setSuccess('');
                      setError('');
                    }}
                  >
                    Edit Details
                  </Button>
                </div>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-aa-gray">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="font-semibold text-aa-orange hover:underline"
              >
                Sign in
              </button>
            </p>
          </section>

          <aside className="auth-v3-side hidden rounded-[2rem] p-8 lg:flex lg:flex-col lg:justify-between">
            <div>
              <p className="auth-v3-pill">New Workspace</p>
              <h2 className="mt-6 text-4xl font-black leading-tight">
                Launch your WhatsApp growth stack from day one.
              </h2>
              <p className="mt-4 text-sm text-white/80">
                Configure your business type once and keep your team focused with a cleaner, role-aware dashboard.
              </p>
            </div>
            <div className="space-y-3 text-sm text-white/90">
              <p className="auth-v3-note">Organized customer timelines and follow-up history</p>
              <p className="auth-v3-note">Product and service modules auto-mapped to your setup</p>
              <p className="auth-v3-note">Secure onboarding with admin approval flow</p>
            </div>
          </aside>
        </div>
      </div>

      {showExistsPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 popup-overlay"
          onClick={() => setShowExistsPopup(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 popup-animate"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-aa-dark-blue mb-2">Account Already Exists</h2>
            <p className="text-aa-gray mb-6">{existsMessage}</p>
            <Button
              type="button"
              className="w-full"
              onClick={() => setShowExistsPopup(false)}
            >
              OK
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

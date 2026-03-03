'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faChartLine,
  faClock,
  faMoneyBillTrendUp,
  faWallet,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../components/auth/AuthProvider.jsx';
import { hasProductAccess } from '../../lib/business.js';

const toAmount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(2));
};

const toCount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.trunc(num));
};

const formatCurrency = (value, currency = 'INR') => {
  const safeValue = toAmount(value);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(safeValue);
  } catch (_error) {
    return `${currency} ${safeValue.toFixed(0)}`;
  }
};

const formatPercent = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.0%';
  return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
};

export default function RevenuePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const hasRevenueAccess = Boolean(user?.id) && hasProductAccess(user);

  useEffect(() => {
    if (!hasRevenueAccess) {
      setLoading(false);
      return;
    }

    let active = true;
    const fetchRevenue = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/dashboard/stats', { credentials: 'include' });
        const payload = await response.json();
        if (!response.ok || payload?.success === false) {
          throw new Error(payload?.error || 'Failed to load revenue analytics');
        }
        if (!active) return;
        setStats(payload?.data || null);
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Failed to load revenue analytics');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchRevenue();
    return () => {
      active = false;
    };
  }, [hasRevenueAccess]);

  const revenueTrendData = useMemo(() => {
    if (!Array.isArray(stats?.revenue_trend) || stats.revenue_trend.length === 0) return [];
    return stats.revenue_trend.map((point) => ({
      name: point?.label || point?.date || '',
      earned: toAmount(point?.earned),
      booked: toAmount(point?.booked),
    }));
  }, [stats?.revenue_trend]);

  const analysis = stats?.revenue_analysis || {};
  const trendDirection = String(analysis?.trend_direction || 'flat');
  const compareWindowDays = Math.max(1, toCount(analysis?.compare_window_days || 7));
  const revenueGrowthPercent = toAmount(analysis?.growth_percent);
  const revenueSlowdownPercent = toAmount(analysis?.slowdown_percent);
  const revenueInsight =
    analysis?.insight || `No WhatsApp revenue data available for the last ${compareWindowDays} days.`;
  const revenueTopDayLabel = analysis?.top_day?.label || 'N/A';
  const revenueTopDayValue = toAmount(analysis?.top_day?.earned || 0);
  const whatsappRevenueEarned = toAmount(stats?.whatsapp_revenue_paid ?? analysis?.total_earned);
  const whatsappRevenueBooked = toAmount(stats?.whatsapp_revenue_booked ?? analysis?.total_booked);
  const whatsappRevenueOutstanding = toAmount(
    stats?.whatsapp_revenue_outstanding ?? analysis?.outstanding_total
  );

  if (!hasRevenueAccess) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <h1 className="text-2xl font-bold text-aa-dark-blue mb-2">Revenue is not enabled</h1>
        <p className="text-aa-gray mb-5">
          Revenue analytics are available only for product-based businesses.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="rounded-full bg-aa-dark-blue px-5 py-2 text-sm font-semibold text-white hover:bg-aa-dark-blue/90"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-aa-orange"></div>
          <p className="text-gray-600">Loading revenue analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Revenue Management</h1>
          <p className="text-gray-600">All WhatsApp revenue data in one dedicated section.</p>
        </div>
        <div
          className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1 text-sm font-semibold ${
            trendDirection === 'up'
              ? 'bg-green-100 text-green-700'
              : trendDirection === 'down'
              ? 'bg-red-100 text-red-700'
              : 'bg-gray-100 text-gray-700'
          }`}
        >
          <FontAwesomeIcon
            icon={trendDirection === 'up' ? faArrowTrendUp : trendDirection === 'down' ? faArrowTrendDown : faChartLine}
          />
          {trendDirection === 'up'
            ? `Growing ${formatPercent(revenueGrowthPercent)}`
            : trendDirection === 'down'
            ? `Slowing ${formatPercent(-revenueSlowdownPercent)}`
            : 'Stable trend'}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-green-50/60 p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Earned (Collected)</p>
            <FontAwesomeIcon icon={faWallet} className="text-green-700" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(whatsappRevenueEarned)}</p>
          <p className="text-xs text-gray-600 mt-1">Collected from WhatsApp orders</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-blue-50/60 p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Booked Revenue</p>
            <FontAwesomeIcon icon={faMoneyBillTrendUp} className="text-blue-700" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(whatsappRevenueBooked)}</p>
          <p className="text-xs text-gray-600 mt-1">Total order value generated</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-amber-50/70 p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Outstanding</p>
            <FontAwesomeIcon icon={faClock} className="text-amber-700" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(whatsappRevenueOutstanding)}</p>
          <p className="text-xs text-gray-600 mt-1">Pending to be collected</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Top Revenue Day</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(revenueTopDayValue)}</p>
          <p className="text-xs text-gray-600 mt-1">{revenueTopDayLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Revenue Trend (Last {Math.max(revenueTrendData.length, 1)} days)
          </h2>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={revenueTrendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                interval={Math.max(0, Math.ceil(Math.max(revenueTrendData.length, 1) / 8) - 1)}
                angle={revenueTrendData.length > 10 ? -30 : 0}
                textAnchor={revenueTrendData.length > 10 ? 'end' : 'middle'}
                height={revenueTrendData.length > 10 ? 60 : 30}
              />
              <YAxis />
              <Tooltip
                formatter={(value, key) => [
                  formatCurrency(value),
                  key === 'earned' ? 'Earned' : 'Booked',
                ]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="earned"
                stroke="#16a34a"
                strokeWidth={3}
                dot={{ fill: '#16a34a', r: 4 }}
                name="Earned"
              />
              <Line
                type="monotone"
                dataKey="booked"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ fill: '#2563eb', r: 3 }}
                name="Booked"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Analysis</h2>
          <p className="text-sm text-gray-700">{revenueInsight}</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Recent {compareWindowDays} days</span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(analysis?.recent_total || 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Previous {compareWindowDays} days</span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(analysis?.previous_total || 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Recent daily avg</span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(analysis?.recent_daily_avg || 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Previous daily avg</span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(analysis?.previous_daily_avg || 0)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-sm">
              <span className="text-gray-600">Growth</span>
              <span className="font-semibold text-green-700">{formatPercent(revenueGrowthPercent)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Slowdown</span>
              <span className="font-semibold text-red-700">{formatPercent(-revenueSlowdownPercent)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

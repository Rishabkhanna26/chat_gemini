'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCartShopping,
  faMagnifyingGlass,
  faTruck,
  faWallet,
  faCircleCheck,
  faClock,
  faBoxOpen,
  faLocationDot,
  faUser,
  faClipboardList,
} from '@fortawesome/free-solid-svg-icons';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Badge from '../components/common/Badge.jsx';
import Modal from '../components/common/Modal.jsx';
import Input from '../components/common/Input.jsx';
import Loader from '../components/common/Loader.jsx';
import { useAuth } from '../components/auth/AuthProvider.jsx';
import { getBusinessTypeLabel, hasProductAccess } from '../../lib/business.js';

const STATUS_VARIANTS = {
  new: 'blue',
  confirmed: 'orange',
  processing: 'yellow',
  packed: 'yellow',
  out_for_delivery: 'blue',
  fulfilled: 'green',
  cancelled: 'red',
  refunded: 'red',
};

const PAYMENT_VARIANTS = {
  pending: 'yellow',
  paid: 'green',
  failed: 'red',
  refunded: 'red',
};

const FULFILLMENT_VARIANTS = {
  unfulfilled: 'default',
  packed: 'yellow',
  shipped: 'blue',
  delivered: 'green',
  cancelled: 'red',
};

const DATE_RANGES = {
  '7days': 7,
  '30days': 30,
  '90days': 90,
  all: null,
};

const formatCurrency = (value = 0, currency = 'INR') => {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(safeValue);
  } catch (error) {
    return `${currency} ${safeValue.toFixed(0)}`;
  }
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

const getOrderTotal = (order) => {
  if (Number.isFinite(Number(order?.total_amount))) return Number(order.total_amount);
  if (Number.isFinite(Number(order?.total))) return Number(order.total);
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
};

const getItemCount = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
};

const normalizeText = (value) => String(value || '').toLowerCase();

export default function OrdersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncWarning, setSyncWarning] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    payment: 'all',
    fulfillment: 'all',
    channel: 'all',
    range: '30days',
  });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeOrder, setActiveOrder] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');

  const hasOrderAccess = Boolean(user?.id) && hasProductAccess(user);

  const fetchOrders = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/orders?limit=200', { credentials: 'include' });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) {
        const message = contentType.includes('application/json')
          ? (await response.json()).error
          : await response.text();
        throw new Error(message || 'Failed to load orders');
      }
      const data = contentType.includes('application/json') ? await response.json() : {};
      setOrders(Array.isArray(data?.data) ? data.data : []);
      setSyncWarning('');
    } catch (err) {
      setOrders([]);
      setError(err.message || 'Orders API is not available yet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!hasOrderAccess) return;
    fetchOrders();
  }, [authLoading, hasOrderAccess, user?.id]);

  useEffect(() => {
    setNoteDraft('');
  }, [activeOrder?.id]);

  const filteredOrders = useMemo(() => {
    const term = normalizeText(filters.search);
    const maxAgeDays = DATE_RANGES[filters.range];
    const now = new Date();

    return orders.filter((order) => {
      const statusValue = normalizeText(order.status);
      const paymentValue = normalizeText(order.payment_status);
      const fulfillmentValue = normalizeText(order.fulfillment_status);
      const channelValue = normalizeText(order.channel);

      if (filters.status !== 'all' && statusValue !== filters.status) return false;
      if (filters.payment !== 'all' && paymentValue !== filters.payment) return false;
      if (filters.fulfillment !== 'all' && fulfillmentValue !== filters.fulfillment) return false;
      if (filters.channel !== 'all' && channelValue !== filters.channel) return false;

      if (maxAgeDays) {
        const createdAt = order.placed_at || order.created_at;
        const createdDate = new Date(createdAt);
        if (!Number.isNaN(createdDate.getTime())) {
          const diffDays = (now - createdDate) / (1000 * 60 * 60 * 24);
          if (diffDays > maxAgeDays) return false;
        }
      }

      if (!term) return true;

      const itemNames = Array.isArray(order.items)
        ? order.items.map((item) => item.name).join(' ')
        : '';
      const haystack = [
        order.id,
        order.order_number,
        order.customer_name,
        order.customer_phone,
        order.customer_email,
        order.channel,
        order.status,
        order.payment_status,
        order.fulfillment_status,
        itemNames,
      ]
        .filter(Boolean)
        .join(' ');
      return normalizeText(haystack).includes(term);
    });
  }, [orders, filters]);

  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((order) =>
      ['new', 'confirmed', 'processing', 'packed'].includes(order.status)
    ).length;
    const fulfilled = orders.filter((order) =>
      ['fulfilled', 'delivered'].includes(order.fulfillment_status || order.status)
    ).length;
    const revenue = orders.reduce((sum, order) => sum + getOrderTotal(order), 0);
    return { total, pending, fulfilled, revenue };
  }, [orders]);

  const toggleSelect = (orderId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (filteredOrders.length === 0) {
        return prev;
      }
      if (prev.size === filteredOrders.length) {
        return new Set();
      }
      return new Set(filteredOrders.map((order) => order.id));
    });
  };

  const applyOrderUpdate = (orderId, updates) => {
    setOrders((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, ...updates } : order))
    );
    setActiveOrder((prev) => (prev?.id === orderId ? { ...prev, ...updates } : prev));
  };

  const updateOrder = async (orderId, updates) => {
    applyOrderUpdate(orderId, updates);
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        throw new Error('Unable to sync order changes yet.');
      }
      const data = await response.json();
      if (data?.data) {
        applyOrderUpdate(orderId, data.data);
      }
      setSyncWarning('');
    } catch (err) {
      setSyncWarning(err.message || 'Orders API not connected. Changes saved locally.');
    }
  };

  const bulkUpdate = (updates) => {
    selectedIds.forEach((orderId) => updateOrder(orderId, updates));
    setSelectedIds(new Set());
  };

  const addNote = () => {
    if (!noteDraft.trim() || !activeOrder) return;
    const nextNote = {
      id: `note-${Date.now()}`,
      message: noteDraft.trim(),
      author: user?.name || 'Admin',
      created_at: new Date().toISOString(),
    };
    const nextNotes = [...(activeOrder.notes || []), nextNote];
    updateOrder(activeOrder.id, { notes: nextNotes });
    setNoteDraft('');
  };

  if (authLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader size="lg" text="Loading orders..." />
      </div>
    );
  }

  if (!hasOrderAccess) {
    return (
      <div className="space-y-6">
        <Card className="text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-aa-orange/10 flex items-center justify-center mb-4">
            <FontAwesomeIcon icon={faCartShopping} className="text-aa-orange" style={{ fontSize: 28 }} />
          </div>
          <h1 className="text-2xl font-bold text-aa-dark-blue mb-2">Orders are not enabled</h1>
          <p className="text-aa-gray">
            Orders are available only for product-based businesses. Your current type is{' '}
            <span className="font-semibold">{getBusinessTypeLabel(user)}</span>.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="primary" onClick={() => router.push('/settings')}>
              Update Business Type
            </Button>
            <Button variant="outline" onClick={() => router.push('/catalog')}>
              View Products & Services
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="orders-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-aa-dark-blue mb-2">Orders</h1>
          <p className="text-aa-gray">Track and manage WhatsApp orders end-to-end.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="outline" onClick={() => fetchOrders()} className="w-full sm:w-auto">
            Refresh
          </Button>
          <Button variant="primary" className="w-full sm:w-auto" disabled>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-aa-gray">Total Orders</p>
              <p className="text-2xl font-bold text-aa-dark-blue">{stats.total}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-aa-orange/10 flex items-center justify-center">
              <FontAwesomeIcon icon={faClipboardList} className="text-aa-orange" style={{ fontSize: 20 }} />
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-aa-gray">Pending</p>
              <p className="text-2xl font-bold text-aa-dark-blue">{stats.pending}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center">
              <FontAwesomeIcon icon={faClock} className="text-yellow-600" style={{ fontSize: 20 }} />
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-aa-gray">Fulfilled</p>
              <p className="text-2xl font-bold text-aa-dark-blue">{stats.fulfilled}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <FontAwesomeIcon icon={faCircleCheck} className="text-green-600" style={{ fontSize: 20 }} />
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-aa-gray">Revenue</p>
              <p className="text-2xl font-bold text-aa-dark-blue">
                {formatCurrency(stats.revenue)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <FontAwesomeIcon icon={faWallet} className="text-blue-600" style={{ fontSize: 20 }} />
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4">
            <div className="relative">
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-aa-gray"
              />
              <input
                type="text"
                placeholder="Search order, customer, item..."
                value={filters.search}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, search: event.target.value }))
                }
                className="w-full rounded-lg border border-gray-200 bg-white px-10 py-2.5 text-sm outline-none focus:border-aa-orange"
              />
            </div>
          </div>
          <div className="lg:col-span-2">
            <label className="text-xs font-semibold text-aa-gray uppercase">Status</label>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="confirmed">Confirmed</option>
              <option value="processing">Processing</option>
              <option value="packed">Packed</option>
              <option value="out_for_delivery">Out for delivery</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="text-xs font-semibold text-aa-gray uppercase">Payment</label>
            <select
              value={filters.payment}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, payment: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="text-xs font-semibold text-aa-gray uppercase">Fulfillment</label>
            <select
              value={filters.fulfillment}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, fulfillment: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="unfulfilled">Unfulfilled</option>
              <option value="packed">Packed</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="text-xs font-semibold text-aa-gray uppercase">Channel</label>
            <select
              value={filters.channel}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, channel: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="website">Website</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="text-xs font-semibold text-aa-gray uppercase">Range</label>
            <select
              value={filters.range}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, range: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="7days">Last 7 days</option>
              <option value="30days">Last 30 days</option>
              <option value="90days">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>
      </Card>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {syncWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {syncWarning}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-sm text-aa-text-dark">
            {selectedIds.size} selected
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => bulkUpdate({ payment_status: 'paid' })}>
              Mark paid
            </Button>
            <Button variant="outline" onClick={() => bulkUpdate({ fulfillment_status: 'delivered', status: 'fulfilled' })}>
              Mark delivered
            </Button>
            <Button variant="outline" onClick={() => bulkUpdate({ status: 'cancelled' })}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="h-[300px] flex items-center justify-center">
          <Loader size="lg" text="Loading orders..." />
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card className="text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-aa-orange/10 flex items-center justify-center mb-4">
            <FontAwesomeIcon icon={faBoxOpen} className="text-aa-orange" style={{ fontSize: 28 }} />
          </div>
          <h2 className="text-lg font-semibold text-aa-text-dark">No orders yet</h2>
          <p className="text-sm text-aa-gray mt-2">
            Orders from WhatsApp will appear here as soon as customers place them.
          </p>
        </Card>
      ) : (
        <>
          <div className="hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px]">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase text-aa-gray">
                    <th className="py-3 px-3 text-left">
                      <input
                        type="checkbox"
                        checked={filteredOrders.length > 0 && selectedIds.size === filteredOrders.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="py-3 px-3 text-left">Order</th>
                    <th className="py-3 px-3 text-left">Customer</th>
                    <th className="py-3 px-3 text-left">Items</th>
                    <th className="py-3 px-3 text-left">Total</th>
                    <th className="py-3 px-3 text-left">Payment</th>
                    <th className="py-3 px-3 text-left">Fulfillment</th>
                    <th className="py-3 px-3 text-left">Status</th>
                    <th className="py-3 px-3 text-left">Placed</th>
                    <th className="py-3 px-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(order.id)}
                          onChange={() => toggleSelect(order.id)}
                        />
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-aa-text-dark">
                          {order.order_number || `#${order.id}`}
                        </div>
                        <div className="text-xs text-aa-gray">{order.channel || 'WhatsApp'}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-aa-text-dark">{order.customer_name || 'Unknown'}</div>
                        <div className="text-xs text-aa-gray">{order.customer_phone || '—'}</div>
                      </td>
                      <td className="py-3 px-3 text-sm text-aa-text-dark">
                        {getItemCount(order)} items
                      </td>
                      <td className="py-3 px-3 text-sm font-semibold text-aa-text-dark">
                        {formatCurrency(getOrderTotal(order), order.currency || 'INR')}
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant={PAYMENT_VARIANTS[order.payment_status] || 'default'}>
                          {order.payment_status || 'pending'}
                        </Badge>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant={FULFILLMENT_VARIANTS[order.fulfillment_status] || 'default'}>
                          {order.fulfillment_status || 'unfulfilled'}
                        </Badge>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant={STATUS_VARIANTS[order.status] || 'default'}>
                          {order.status || 'new'}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-xs text-aa-gray">
                        {formatDateTime(order.placed_at || order.created_at)}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          className="text-aa-orange font-semibold text-sm hover:underline"
                          onClick={() => setActiveOrder(order)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4 lg:hidden">
            {filteredOrders.map((order) => (
              <Card key={order.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-aa-text-dark">
                      {order.order_number || `#${order.id}`}
                    </p>
                    <p className="text-xs text-aa-gray">{order.channel || 'WhatsApp'}</p>
                  </div>
                  <Badge variant={STATUS_VARIANTS[order.status] || 'default'}>
                    {order.status || 'new'}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm text-aa-text-dark">
                  <FontAwesomeIcon icon={faUser} className="text-aa-gray" />
                  <span>{order.customer_name || 'Unknown'}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-aa-text-dark">
                  <FontAwesomeIcon icon={faCartShopping} className="text-aa-gray" />
                  <span>{getItemCount(order)} items</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant={PAYMENT_VARIANTS[order.payment_status] || 'default'}>
                    {order.payment_status || 'pending'}
                  </Badge>
                  <Badge variant={FULFILLMENT_VARIANTS[order.fulfillment_status] || 'default'}>
                    {order.fulfillment_status || 'unfulfilled'}
                  </Badge>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <p className="font-semibold text-aa-text-dark">
                    {formatCurrency(getOrderTotal(order), order.currency || 'INR')}
                  </p>
                  <button
                    className="text-aa-orange font-semibold text-sm hover:underline"
                    onClick={() => setActiveOrder(order)}
                  >
                    View
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Modal
        isOpen={Boolean(activeOrder)}
        onClose={() => setActiveOrder(null)}
        title={activeOrder ? `Order ${activeOrder.order_number || `#${activeOrder.id}`}` : 'Order'}
        size="xl"
      >
        {!activeOrder ? null : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <div className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase text-aa-gray">Customer</p>
                      <p className="text-lg font-semibold text-aa-text-dark">
                        {activeOrder.customer_name || 'Unknown'}
                      </p>
                      <p className="text-sm text-aa-gray">{activeOrder.customer_phone || '—'}</p>
                      {activeOrder.customer_email && (
                        <p className="text-sm text-aa-gray">{activeOrder.customer_email}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase text-aa-gray">Placed</p>
                      <p className="text-sm font-semibold text-aa-text-dark">
                        {formatDateTime(activeOrder.placed_at || activeOrder.created_at)}
                      </p>
                      <p className="text-xs text-aa-gray">{activeOrder.channel || 'WhatsApp'}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-aa-text-dark mb-3">Items</p>
                  <div className="space-y-3">
                    {(activeOrder.items || []).length === 0 ? (
                      <p className="text-sm text-aa-gray">No items available.</p>
                    ) : (
                      activeOrder.items.map((item, idx) => (
                        <div key={`${item.name}-${idx}`} className="flex items-center justify-between text-sm">
                          <div>
                            <p className="font-semibold text-aa-text-dark">{item.name}</p>
                            <p className="text-xs text-aa-gray">Qty: {item.quantity || 1}</p>
                          </div>
                          <p className="font-semibold text-aa-text-dark">
                            {formatCurrency(
                              Number(item.price || 0) * Number(item.quantity || 1),
                              activeOrder.currency || 'INR'
                            )}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                    <p className="text-sm text-aa-gray">Total</p>
                    <p className="text-lg font-semibold text-aa-text-dark">
                      {formatCurrency(getOrderTotal(activeOrder), activeOrder.currency || 'INR')}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-aa-text-dark mb-3">Delivery</p>
                  <div className="flex items-start gap-3 text-sm text-aa-gray">
                    <FontAwesomeIcon icon={faLocationDot} />
                    <div>
                      <p className="text-aa-text-dark font-semibold">{activeOrder.delivery_method || 'Delivery'}</p>
                      <p>{activeOrder.delivery_address || activeOrder.address || 'Address not provided.'}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-aa-text-dark mb-3">Notes</p>
                  {(activeOrder.notes || []).length === 0 ? (
                    <p className="text-sm text-aa-gray">No notes added yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {activeOrder.notes.map((note) => (
                        <div key={note.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
                          <p className="text-aa-text-dark">{note.message}</p>
                          <p className="text-xs text-aa-gray mt-1">
                            {note.author || 'Admin'} • {formatDateTime(note.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder="Add a note for the team..."
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                    />
                    <Button variant="outline" onClick={addNote}>
                      Add note
                    </Button>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 space-y-4">
                <div className="rounded-2xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-aa-text-dark mb-3">Order Controls</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold uppercase text-aa-gray">Status</label>
                      <select
                        value={activeOrder.status || 'new'}
                        onChange={(event) => updateOrder(activeOrder.id, { status: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      >
                        <option value="new">New</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="processing">Processing</option>
                        <option value="packed">Packed</option>
                        <option value="out_for_delivery">Out for delivery</option>
                        <option value="fulfilled">Fulfilled</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="refunded">Refunded</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase text-aa-gray">Payment</label>
                      <select
                        value={activeOrder.payment_status || 'pending'}
                        onChange={(event) =>
                          updateOrder(activeOrder.id, { payment_status: event.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="failed">Failed</option>
                        <option value="refunded">Refunded</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase text-aa-gray">Fulfillment</label>
                      <select
                        value={activeOrder.fulfillment_status || 'unfulfilled'}
                        onChange={(event) =>
                          updateOrder(activeOrder.id, { fulfillment_status: event.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      >
                        <option value="unfulfilled">Unfulfilled</option>
                        <option value="packed">Packed</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase text-aa-gray">Assignee</label>
                      <input
                        type="text"
                        value={activeOrder.assigned_to || ''}
                        onChange={(event) =>
                          updateOrder(activeOrder.id, { assigned_to: event.target.value })
                        }
                        placeholder="Assign to..."
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-aa-text-dark mb-3">Quick Actions</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button variant="outline" onClick={() => updateOrder(activeOrder.id, { payment_status: 'paid' })}>
                      Mark paid
                    </Button>
                    <Button variant="outline" onClick={() => updateOrder(activeOrder.id, { fulfillment_status: 'packed' })}>
                      Mark packed
                    </Button>
                    <Button variant="outline" onClick={() => updateOrder(activeOrder.id, { fulfillment_status: 'delivered', status: 'fulfilled' })}>
                      Delivered
                    </Button>
                    <Button variant="outline" onClick={() => updateOrder(activeOrder.id, { status: 'cancelled' })}>
                      Cancel
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-aa-orange/10 flex items-center justify-center">
                      <FontAwesomeIcon icon={faTruck} className="text-aa-orange" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-aa-text-dark">Shipping timeline</p>
                      <p className="text-xs text-aa-gray">
                        {activeOrder.fulfillment_status === 'delivered'
                          ? 'Order delivered successfully.'
                          : 'Update fulfillment status as the order progresses.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

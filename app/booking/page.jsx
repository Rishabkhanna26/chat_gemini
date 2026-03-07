'use client';

import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faBed,
  faCalendarCheck,
  faClock,
  faHotel,
  faLayerGroup,
  faMagnifyingGlass,
  faPenToSquare,
  faPlus,
  faTag,
  faTrashCan,
  faUtensils,
} from '@fortawesome/free-solid-svg-icons';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/auth/AuthProvider.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Badge from '../components/common/Badge.jsx';
import Modal from '../components/common/Modal.jsx';
import Input from '../components/common/Input.jsx';
import Loader from '../components/common/Loader.jsx';
import GeminiSelect from '../components/common/GeminiSelect.jsx';
import { hasBookingAccess } from '../../lib/business.js';
import {
  BOOKING_CATEGORY_PRESETS,
  getBookingCategoryPreset,
  getBookingCategoryTerms,
  getBookingCustomCategories,
  normalizeBookingCategoryKey,
  resolveBookingCategoryLabel,
} from '../../lib/booking.js';

const DEFAULT_BOOKING_PROMPT =
  'Please share your preferred date, time, guest count, and any special request.';
const DURATION_UNIT_OPTIONS = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
];

const CATEGORY_ICON_MAP = {
  hotel: faHotel,
  restaurant: faUtensils,
  events: faCalendarCheck,
};

const BOOKING_SETUP_STEPS = [
  {
    number: '1',
    title: 'Pick a category',
    description: 'Choose Hotel, Restaurant, or Events based on what the customer will book.',
  },
  {
    number: '2',
    title: 'Add the booking name',
    description: 'Write the exact item name, such as Deluxe Room or Family Table.',
  },
  {
    number: '3',
    title: 'Save and use',
    description: 'Customers can find it in WhatsApp, and the request will be saved as a booking.',
  },
];

const buildEmptyForm = () => ({
  name: '',
  category: BOOKING_CATEGORY_PRESETS[0]?.label || 'Booking',
  price_label: '',
  duration_value: '',
  duration_unit: 'hours',
  description: '',
  details_prompt: DEFAULT_BOOKING_PROMPT,
  keywords: '',
  is_active: true,
  sort_order: 0,
});

const parseNumber = (value, fallback = null) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizePriceLabel = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.includes('₹')) {
    return text.replace(/₹\s*/g, '₹ ').replace(/\s{2,}/g, ' ').trim();
  }
  let normalized = text.replace(/^\s*(?:inr|rs\.?|rupees?)\s*/i, '₹ ');
  if (!normalized.includes('₹') && /^\d/.test(normalized)) {
    normalized = `₹ ${normalized}`;
  }
  return normalized.replace(/\s{2,}/g, ' ').trim();
};

const formatKeywords = (keywords) => {
  if (Array.isArray(keywords)) return keywords.join(', ');
  return keywords || '';
};

const getItemSearchText = (item) => {
  const keywords = formatKeywords(item?.keywords);
  const categoryTerms = getBookingCategoryTerms(item?.category).join(' ');
  return `${item?.name || ''} ${item?.category || ''} ${item?.description || ''} ${keywords} ${categoryTerms}`
    .toLowerCase()
    .trim();
};

const getCategoryIcon = (value) => CATEGORY_ICON_MAP[value] || faLayerGroup;

const formatDurationLabel = (item) => {
  const durationValue = parseNumber(item?.duration_value, null);
  const durationUnit = String(item?.duration_unit || '').trim().toLowerCase();
  if (!durationValue || !durationUnit) return '';
  const label = durationValue === 1 ? durationUnit.replace(/s$/, '') : durationUnit;
  return `${durationValue} ${label}`;
};

export default function BookingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    category: 'all',
  });
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(buildEmptyForm());
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const bookingAccess = Boolean(user?.id) && hasBookingAccess(user);

  const fetchItems = async ({ bustCache = false } = {}) => {
    setLoading(true);
    setError('');
    try {
      const cacheKey = bustCache ? `&ts=${Date.now()}` : '';
      const response = await fetch(`/api/bookings?limit=500${cacheKey}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load booking items');
      }
      const nextItems = Array.isArray(data?.data)
        ? data.data.map((item) => ({
            ...item,
            category: resolveBookingCategoryLabel(item?.category),
          }))
        : [];
      setItems(nextItems);
    } catch (err) {
      setError(err.message || 'Failed to load booking items');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!bookingAccess) {
      setLoading(false);
      return;
    }
    fetchItems();
  }, [bookingAccess]);

  const categories = useMemo(() => {
    const unique = new Set();
    items.forEach((item) => {
      const label = resolveBookingCategoryLabel(item.category, '');
      if (label) unique.add(label);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const customCategories = useMemo(
    () => getBookingCustomCategories(items.map((item) => item.category)),
    [items]
  );

  const selectedPreset = useMemo(() => getBookingCategoryPreset(form.category), [form.category]);
  const selectedCategoryLabel = resolveBookingCategoryLabel(form.category, 'Booking');
  const statusOptions = useMemo(
    () => [
      { value: 'all', label: 'All' },
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
    ],
    []
  );
  const categoryFilterOptions = useMemo(
    () => [{ value: 'all', label: 'All' }, ...categories.map((category) => ({ value: category, label: category }))],
    [categories]
  );
  const durationUnitSelectOptions = useMemo(
    () => DURATION_UNIT_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    []
  );

  const filteredItems = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return items.filter((item) => {
      if (filters.status !== 'all') {
        const isActive = Boolean(item.is_active);
        if (filters.status === 'active' && !isActive) return false;
        if (filters.status === 'inactive' && isActive) return false;
      }
      if (filters.category !== 'all' && item.category !== filters.category) return false;
      if (search) {
        const haystack = getItemSearchText(item);
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [filters, items]);

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((item) => item.is_active).length;
    const categoriesCount = new Set(items.map((item) => item.category).filter(Boolean)).size;
    return { total, active, categoriesCount };
  }, [items]);

  const openCreateModal = () => {
    setEditingItem(null);
    setForm(buildEmptyForm());
    setCustomCategoryInput('');
    setShowModal(true);
  };

  const openEditModal = (item) => {
    const category = resolveBookingCategoryLabel(item.category);
    const preset = getBookingCategoryPreset(category);
    setEditingItem(item);
    setForm({
      name: item.name || '',
      category,
      price_label: normalizePriceLabel(item.price_label || ''),
      duration_value: item.duration_value ?? item.duration_minutes ?? '',
      duration_unit: item.duration_unit || 'hours',
      description: item.description || '',
      details_prompt: item.details_prompt || DEFAULT_BOOKING_PROMPT,
      keywords: formatKeywords(item.keywords),
      is_active: Boolean(item.is_active),
      sort_order: item.sort_order ?? 0,
    });
    setCustomCategoryInput(
      preset || normalizeBookingCategoryKey(category) === 'booking' ? '' : category
    );
    setShowModal(true);
  };

  const selectPresetCategory = (label) => {
    setCustomCategoryInput('');
    setForm((prev) => ({ ...prev, category: label }));
  };

  const handleCustomCategoryChange = (value) => {
    setCustomCategoryInput(value);
    setForm((prev) => ({
      ...prev,
      category: resolveBookingCategoryLabel(value, ''),
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    setError('');

    const payload = {
      name: form.name.trim(),
      category: resolveBookingCategoryLabel(form.category, 'Booking'),
      price_label: normalizePriceLabel(form.price_label),
      duration_value: parseNumber(form.duration_value, null),
      duration_unit: form.duration_unit || 'hours',
      description: form.description.trim(),
      details_prompt: form.details_prompt.trim(),
      keywords: form.keywords,
      is_active: Boolean(form.is_active),
      sort_order: parseNumber(form.sort_order, 0),
    };

    try {
      const response = await fetch(
        editingItem ? `/api/bookings/${editingItem.id}` : '/api/bookings',
        {
          method: editingItem ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save booking item');
      }
      setShowModal(false);
      setEditingItem(null);
      setNotice(editingItem ? 'Booking item updated.' : 'Booking item created.');
      await fetchItems({ bustCache: true });
    } catch (err) {
      setError(err.message || 'Failed to save booking item');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item) => {
    try {
      const response = await fetch(`/api/bookings/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: !item.is_active }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update booking status');
      }
      setItems((prev) => prev.map((entry) => (entry.id === item.id ? data.data : entry)));
    } catch (err) {
      setError(err.message || 'Failed to update booking status');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) {
      setDeleteTarget(null);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/bookings/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data.error || 'Failed to delete booking item');
      }
      setNotice('Booking item deleted.');
      setItems((prev) => prev.filter((entry) => entry.id !== deleteTarget.id));
    } catch (err) {
      setError(err.message || 'Failed to delete booking item');
    } finally {
      setSaving(false);
      setDeleteTarget(null);
    }
  };

  if (!bookingAccess) {
    return (
      <div className="space-y-6">
        <Card
          unstyled
          className="overflow-hidden rounded-xl border-none bg-gradient-to-br from-aa-dark-blue to-[#15304d] text-white shadow-lg"
        >
          <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
                Booking Section
              </p>
              <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Booking is not enabled for this admin.</h1>
              <p className="mt-3 text-sm text-white/80 sm:text-base">
                Ask a super admin to enable booking access if you want a separate workspace for hotel rooms, table reservations, or other booking-only offers.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10"
              onClick={() => router.push(user?.admin_tier === 'super_admin' ? '/admins' : '/dashboard')}
            >
              {user?.admin_tier === 'super_admin' ? 'Open Admins' : 'Back to Dashboard'}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader size="lg" text="Loading booking items..." />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="booking-page">
      <Card className="overflow-hidden border-none bg-gradient-to-br from-white via-[#fff7ef] to-[#ffe6cf] shadow-lg">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.6fr_1fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-aa-dark-blue px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
              <FontAwesomeIcon icon={faHotel} />
              Booking
            </div>
            <h1 className="mt-4 text-3xl font-bold text-aa-dark-blue sm:text-4xl">
              Manage rooms, tables, and other booking offers.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-aa-gray sm:text-base">
              Anything added here stays in a separate Booking section, remains bookable, and can be marked as booking inside appointments.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="primary" icon={<FontAwesomeIcon icon={faPlus} />} onClick={openCreateModal}>
                Add Booking Option
              </Button>
              <Button variant="outline" icon={<FontAwesomeIcon icon={faCalendarCheck} />} onClick={() => router.push('/appointments')}>
                Open Appointments
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-aa-gray">Total</p>
              <p className="mt-2 text-3xl font-bold text-aa-dark-blue">{stats.total}</p>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-aa-gray">Active</p>
              <p className="mt-2 text-3xl font-bold text-aa-dark-blue">{stats.active}</p>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-aa-gray">Categories</p>
              <p className="mt-2 text-3xl font-bold text-aa-dark-blue">{stats.categoriesCount}</p>
            </div>
          </div>
        </div>
      </Card>

      {(error || notice) && (
        <div className="flex flex-col gap-2">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {notice}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-4">
          <Card className="overflow-visible p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="flex-1">
                <Input
                  label="Search"
                  value={filters.search}
                  onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                  placeholder="Search by name or category"
                  icon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px] lg:flex-1">
                <GeminiSelect
                  label="Status"
                  value={filters.status}
                  options={statusOptions}
                  onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
                  variant="warm"
                />
                <GeminiSelect
                  label="Category"
                  value={filters.category}
                  options={categoryFilterOptions}
                  onChange={(value) => setFilters((prev) => ({ ...prev, category: value }))}
                  variant="vibrant"
                />
              </div>
            </div>
          </Card>

          {filteredItems.length === 0 ? (
            <Card className="border-dashed p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-aa-orange/10">
                <FontAwesomeIcon icon={faBed} className="text-aa-orange" style={{ fontSize: 22 }} />
              </div>
              <h2 className="mt-4 text-xl font-bold text-aa-dark-blue">No booking items yet</h2>
              <p className="mt-2 text-sm text-aa-gray">
                Add your first room, table, stay package, or reservation slot.
              </p>
              <div className="mt-5 flex justify-center">
                <Button variant="primary" onClick={openCreateModal}>
                  Add Booking Option
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredItems.map((item) => (
                <Card key={item.id} className="overflow-hidden border-gray-200 p-0">
                  <div className="border-b border-gray-100 bg-gradient-to-r from-white to-[#fff6ed] px-5 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-bold text-aa-dark-blue">{item.name}</h2>
                          <Badge variant="yellow">Booking</Badge>
                          <Badge variant={item.is_active ? 'green' : 'default'}>
                            {item.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          {item.category && <Badge variant="blue">{item.category}</Badge>}
                        </div>
                        {item.description && (
                          <p className="mt-3 text-sm text-aa-gray">{item.description}</p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-4 text-xs text-aa-gray">
                          {item.price_label && (
                            <span className="inline-flex items-center gap-2">
                              <FontAwesomeIcon icon={faTag} />
                              {normalizePriceLabel(item.price_label)}
                            </span>
                          )}
                          {formatDurationLabel(item) && (
                            <span className="inline-flex items-center gap-2">
                              <FontAwesomeIcon icon={faClock} />
                              {formatDurationLabel(item)}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-2">
                            <FontAwesomeIcon icon={faLayerGroup} />
                            Order {item.sort_order ?? 0}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-aa-dark-blue hover:text-aa-orange"
                        >
                          <FontAwesomeIcon icon={faPenToSquare} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(item)}
                          className="inline-flex items-center gap-2 rounded-full border border-aa-orange px-3 py-1.5 text-xs font-semibold text-aa-orange transition hover:bg-aa-orange hover:text-white"
                        >
                          {item.is_active ? 'Hide' : 'Publish'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 hover:text-red-700"
                      >
                        <FontAwesomeIcon icon={faTrashCan} />
                        Delete
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 px-5 py-4 md:grid-cols-[1.1fr_0.9fr]">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aa-gray">
                        Customer Message
                      </p>
                      <p className="mt-2 rounded-xl bg-gray-50 px-4 py-3 text-sm text-aa-text-dark">
                        {item.details_prompt || DEFAULT_BOOKING_PROMPT}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aa-gray">
                        Saved In Appointments
                      </p>
                      <p className="mt-2 text-sm text-aa-gray">
                        New reservation requests for this item can be logged in appointments and marked as <span className="font-semibold text-aa-dark-blue">booking</span>.
                      </p>
                      <button
                        type="button"
                        onClick={() => router.push('/appointments')}
                        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-aa-orange hover:text-aa-dark-blue"
                      >
                        Review appointments
                        <FontAwesomeIcon icon={faArrowRight} />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card unstyled className="rounded-xl bg-aa-dark-blue p-5 text-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              How To Use
            </p>
            <div className="mt-4 grid gap-3">
              {BOOKING_SETUP_STEPS.map((step) => (
                <div
                  key={step.number}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-aa-dark-blue">
                    {step.number}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{step.title}</p>
                    <p className="mt-1 text-sm text-white/75">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-4 text-sm text-white/85">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Hotel</p>
                <p className="mt-1">Use for rooms, suites, dinners, cabanas, and stay packages.</p>
                <p className="mt-2 text-xs text-white/70">
                  Example: Deluxe Room, Family Suite, Rooftop Dinner, Poolside Cabana.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Restaurant</p>
                <p className="mt-1">Use for table booking, dining slots, and private table reservations.</p>
                <p className="mt-2 text-xs text-white/70">
                  Example: 2-Seater Table, 6-Seater Family Table, Private Event Table.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Events</p>
                <p className="mt-1">Use for halls, venues, conferences, weddings, and party bookings.</p>
                <p className="mt-2 text-xs text-white/70">
                  Example: Banquet Slot, Conference Hall, Wedding Venue Booking.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aa-gray">
              Preview
            </p>
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-aa-dark-blue">{form.name || 'Booking name'}</p>
                <span className="text-sm text-aa-gray">{normalizePriceLabel(form.price_label) || 'Price'}</span>
              </div>
              <p className="mt-2 text-xs text-aa-gray">
                Category: {selectedCategoryLabel}
              </p>
              {form.duration_value && (
                <p className="mt-1 text-xs text-aa-gray">
                  Duration: {form.duration_value} {form.duration_unit}
                </p>
              )}
              <p className="mt-3 text-sm text-aa-text-dark">
                {form.details_prompt || DEFAULT_BOOKING_PROMPT}
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingItem ? 'Edit Booking Option' : 'Add Booking Option'}
        size="lg"
      >
        <form className="space-y-5" onSubmit={handleSave}>
          <div className="rounded-[28px] border border-[#f1dcc5] bg-gradient-to-br from-[#fff9f2] via-white to-[#fdebd7] p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-aa-orange">
                  Step 1
                </p>
                <h3 className="mt-2 text-xl font-bold text-aa-dark-blue">
                  Pick the booking type
                </h3>
                <p className="mt-2 text-sm text-aa-gray">
                  Start by choosing the closest type. This helps you stay organized and helps WhatsApp understand what the customer is asking for.
                </p>
              </div>
              <Badge variant="yellow">Selected: {selectedCategoryLabel}</Badge>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aa-orange">Do this first</p>
                <p className="mt-2 text-sm font-semibold text-aa-dark-blue">Choose one category below</p>
                <p className="mt-1 text-sm text-aa-gray">Most businesses only need Hotel, Restaurant, or Events.</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aa-orange">Then add item</p>
                <p className="mt-2 text-sm font-semibold text-aa-dark-blue">Write the exact booking name</p>
                <p className="mt-1 text-sm text-aa-gray">Example: Deluxe Room, Window Table, Banquet Slot.</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aa-orange">Use custom only if needed</p>
                <p className="mt-2 text-sm font-semibold text-aa-dark-blue">Create your own category</p>
                <p className="mt-1 text-sm text-aa-gray">Use this only when none of the preset options fit your business.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {BOOKING_CATEGORY_PRESETS.map((preset) => {
                const isSelected =
                  normalizeBookingCategoryKey(form.category) ===
                  normalizeBookingCategoryKey(preset.label);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => selectPresetCategory(preset.label)}
                    className={`group relative overflow-hidden rounded-[26px] border p-4 text-left transition-all duration-300 ${
                      isSelected
                        ? 'border-[#FDA913] bg-gradient-to-r from-[#FE8802] to-[#FDA913] text-white shadow-2xl shadow-[#FE8802]/25'
                        : 'border-[#FDA913] bg-white text-gray-900 shadow-sm hover:shadow-lg hover:shadow-[#FDA913]/25'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute inset-0 -translate-x-full bg-white/10 transition-transform duration-700 group-hover:translate-x-full" />
                    )}
                    <div className="relative z-10 flex items-start justify-between gap-3">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm ${
                          isSelected ? 'bg-white/15 text-white' : 'bg-[#FDA913] text-white'
                        }`}
                      >
                        <FontAwesomeIcon icon={getCategoryIcon(preset.id)} />
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isSelected ? 'bg-white/15 text-white' : 'bg-[#FE8802]/10 text-[#FE8802]'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Choose'}
                      </span>
                    </div>
                    <p className={`relative z-10 mt-4 text-lg font-bold ${isSelected ? 'text-white' : 'text-aa-dark-blue'}`}>
                      {preset.label}
                    </p>
                    <p className={`relative z-10 mt-1 text-sm ${isSelected ? 'text-white/85' : 'text-aa-gray'}`}>
                      {preset.description}
                    </p>
                    <p
                      className={`relative z-10 mt-3 text-xs font-semibold uppercase tracking-[0.18em] ${
                        isSelected ? 'text-white/70' : 'text-aa-gray'
                      }`}
                    >
                      Good for
                    </p>
                    <div className="relative z-10 mt-4 flex flex-wrap gap-2">
                      {preset.examples.map((example) => (
                        <span
                          key={example}
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            isSelected
                              ? 'border border-white/20 bg-white/10 text-white'
                              : 'bg-[#fff1e2] text-aa-dark-blue'
                          }`}
                        >
                          {example}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[24px] border-2 border-[#FDA913] bg-white p-4 shadow-lg shadow-[#FDA913]/10">
                <label className="mb-2 block font-mono text-sm font-semibold text-aa-text-dark">
                  // Need your own category? (Optional)
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-4 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[#FDA913]" />
                  <input
                    type="text"
                    value={customCategoryInput}
                    onChange={(event) => handleCustomCategoryChange(event.target.value)}
                    placeholder="Example: Villas, Spa, Beach Club"
                    className="w-full rounded-xl border-2 border-[#FDA913] bg-white px-10 py-3 text-sm text-gray-900 outline-none transition focus:shadow-lg focus:shadow-[#FDA913]/20"
                  />
                </div>
                <p className="mt-3 text-sm text-aa-gray">
                  Use this only if Hotel, Restaurant, and Events do not fit. Your custom category stays only in this admin account.
                </p>
                <div className="mt-4 rounded-2xl bg-gradient-to-r from-[#fff7ee] to-[#fff0da] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aa-gray">
                    Your Custom Categories
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {customCategories.length > 0 ? (
                      customCategories.map((category) => {
                        const isSelected =
                          normalizeBookingCategoryKey(form.category) ===
                          normalizeBookingCategoryKey(category);
                        return (
                          <button
                            key={category}
                            type="button"
                            onClick={() => handleCustomCategoryChange(category)}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-300 ${
                              isSelected
                                ? 'border-[#FDA913] bg-gradient-to-r from-[#FE8802] to-[#FDA913] text-white shadow-lg shadow-[#FE8802]/25'
                                : 'border-[#FDA913] bg-white text-aa-dark-blue hover:shadow-md hover:shadow-[#FDA913]/20'
                            }`}
                          >
                            <span className={`h-2.5 w-2.5 rounded-full ${isSelected ? 'bg-white' : 'bg-[#FDA913]'}`} />
                            {category}
                          </button>
                        );
                      })
                    ) : (
                      <span className="rounded-full bg-white px-3 py-1.5 text-xs text-aa-gray shadow-sm">
                        No custom category saved yet
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] bg-aa-dark-blue p-4 text-white shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">
                  Easy Guide
                </p>
                <p className="mt-3 text-sm text-white/85">
                  {selectedPreset
                    ? `If a customer asks for ${selectedPreset.examples.join(', ')}, this category helps match the booking faster.`
                    : 'Custom categories still work. Add a clear booking name and useful search words so customers can find it easily.'}
                </p>
                <div className="mt-4 space-y-3 text-sm text-white/80">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="font-semibold text-white">What to write in Booking Name</p>
                    <p className="mt-1">Write the exact thing the customer books, like Deluxe Room or Conference Hall.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="font-semibold text-white">When to use Search Words</p>
                    <p className="mt-1">Add extra terms like honeymoon, poolside, birthday, or premium if customers may search with those words.</p>
                  </div>
                </div>
                {selectedPreset && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                      Search Examples
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {getBookingCategoryTerms(selectedPreset.label)
                        .filter((term) => term.includes(' ') || term.length > 5)
                        .slice(0, 8)
                        .map((term) => (
                          <span
                            key={term}
                            className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white"
                          >
                            {term}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aa-orange">
              Step 2
            </p>
            <h3 className="mt-2 text-lg font-bold text-aa-dark-blue">Add booking details</h3>
            <p className="mt-1 text-sm text-aa-gray">
              Fill the form below with the booking name, price, duration, and customer message.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Booking Name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Deluxe Room, Window Table, Banquet Slot"
              required
            />
            <Input
              label="Price"
              value={form.price_label}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, price_label: normalizePriceLabel(event.target.value) }))
              }
              placeholder="₹ 2499 / night"
            />
            <div className="w-full">
              <label className="mb-2 block font-mono text-xs font-semibold uppercase tracking-[0.16em] text-aa-gray">
                // Category Chosen
              </label>
              <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#FE8802] to-[#FDA913] px-5 py-4 text-white shadow-lg">
                <span className="absolute inset-0 -translate-x-full bg-white/10 transition-transform duration-700 group-hover:translate-x-full" />
                <div className="relative z-10 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-3 font-bold">
                    <span className="h-3 w-3 rounded-full bg-white" />
                    {selectedCategoryLabel}
                  </span>
                  <Badge className="bg-white/15 text-white">Current</Badge>
                </div>
              </div>
            </div>
            <Input
              label="How Long"
              type="number"
              value={form.duration_value}
              onChange={(event) => setForm((prev) => ({ ...prev, duration_value: event.target.value }))}
              placeholder="2"
            />
          </div>

          <p className="-mt-1 text-xs text-aa-gray">
            This category comes from the selection above. To change it, use the category boxes at the top.
          </p>

          <div>
            <GeminiSelect
              label="Time Unit"
              value={form.duration_unit}
              options={durationUnitSelectOptions}
              onChange={(value) => setForm((prev) => ({ ...prev, duration_unit: value }))}
              variant="vibrant"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-aa-text-dark">Short Note</label>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows="3"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-aa-orange focus:ring-2 focus:ring-aa-orange/20"
              placeholder="Write a simple note about this room, table, or booking option"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-aa-text-dark">Message Shown To Customer</label>
            <textarea
              value={form.details_prompt}
              onChange={(event) => setForm((prev) => ({ ...prev, details_prompt: event.target.value }))}
              rows="4"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-aa-orange focus:ring-2 focus:ring-aa-orange/20"
              placeholder={DEFAULT_BOOKING_PROMPT}
            />
            <p className="mt-2 text-xs text-aa-gray">
              Customers will see this after they choose this option.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Search Words"
              value={form.keywords}
              onChange={(event) => setForm((prev) => ({ ...prev, keywords: event.target.value }))}
              placeholder="room, suite, stay, reservation"
            />
            <Input
              label="Show Order"
              type="number"
              value={form.sort_order}
              onChange={(event) => setForm((prev) => ({ ...prev, sort_order: event.target.value }))}
            />
          </div>

          <label className="flex items-center justify-between gap-4 rounded-2xl border-2 border-[#FDA913] bg-gradient-to-r from-white to-[#fff4e6] px-4 py-4 shadow-lg shadow-[#FDA913]/10 transition-all duration-300">
            <div>
              <p className="font-mono text-sm font-semibold text-aa-text-dark">
                // Visibility
              </p>
              <p className="mt-1 text-sm font-semibold text-aa-text-dark">
                {form.is_active ? 'Show on WhatsApp' : 'Hide from WhatsApp'}
              </p>
              <p className="text-xs text-aa-gray">
                Turn this off if you do not want customers to see this yet.
              </p>
            </div>
            <span className="relative inline-flex items-center">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                className="peer sr-only"
              />
              <span className="h-7 w-14 rounded-full bg-[#ffd39c] transition peer-checked:bg-gradient-to-r peer-checked:from-[#FE8802] peer-checked:to-[#FDA913]" />
              <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow-md transition peer-checked:translate-x-7" />
            </span>
          </label>

          <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row">
            <Button type="submit" variant="primary" className="flex-1" disabled={saving}>
              {saving ? 'Saving...' : editingItem ? 'Update Booking Option' : 'Create Booking Option'}
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete booking option?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-aa-text-dark">
            Delete <span className="font-semibold">{deleteTarget?.name || 'this booking option'}</span>?
            This action cannot be undone.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" className="flex-1" onClick={confirmDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendarCheck,
  faMagnifyingGlass,
  faListUl,
  faTableColumns,
  faMoneyBillWave,
  faClock,
  faPenToSquare,
  faCircleCheck,
  faBan,
  faCreditCard,
  faWallet,
  faBuildingColumns,
  faMobileScreen,
  faEllipsis,
  faPercent,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../components/auth/AuthProvider.jsx';
import Card from '../components/common/Card.jsx';
import Modal from '../components/common/Modal.jsx';
import Input from '../components/common/Input.jsx';
import Button from '../components/common/Button.jsx';
import { getBusinessTypeLabel, hasServiceAccess } from '../../lib/business.js';

export default function AppointmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);
  const [viewMode, setViewMode] = useState('board');
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState('edit');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [createContactMode, setCreateContactMode] = useState(false);
  const [createContactError, setCreateContactError] = useState('');
  const [creatingContact, setCreatingContact] = useState(false);
  const [newContactForm, setNewContactForm] = useState({
    name: '',
    phone: '',
    email: '',
  });
  const [autoOpened, setAutoOpened] = useState(false);
  const [catalogServices, setCatalogServices] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [editForm, setEditForm] = useState({
    id: null,
    user_id: '',
    status: 'booked',
    appointment_type: '',
    start_time: '',
    end_time: '',
    payment_total: '',
    payment_paid: '',
    payment_paid_mode: '',
    payment_method: '',
    payment_notes: '',
    payment_services: [],
  });

  const hasAppointmentsAccess = Boolean(user?.id) && hasServiceAccess(user);
  const label = useMemo(() => 'Appointments', []);
  const labelLower = label.toLowerCase();

  useEffect(() => {
    if (!hasAppointmentsAccess) {
      setLoading(false);
      return undefined;
    }
    const handle = setTimeout(() => {
      fetchAppointments({ reset: true, nextOffset: 0, searchTerm: search, status: filterStatus });
    }, 300);
    return () => clearTimeout(handle);
  }, [filterStatus, hasAppointmentsAccess, search]);

  useEffect(() => {
    if (autoOpened) return;
    const shouldOpen = searchParams?.get('new') === '1';
    if (shouldOpen) {
      openCreate();
      setAutoOpened(true);
    }
  }, [searchParams, autoOpened]);

  const loadContacts = async () => {
    setContactsLoading(true);
    try {
      const response = await fetch('/api/users?limit=500', { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load contacts');
      }
      setContacts(Array.isArray(data?.data) ? data.data : []);
    } catch (error) {
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  };

  const handleNewContactChange = (field) => (event) => {
    setNewContactForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const createNewContact = async () => {
    setCreateContactError('');
    const name = String(newContactForm.name || '').trim();
    const phone = String(newContactForm.phone || '').trim();
    const email = String(newContactForm.email || '').trim();
    if (!phone) {
      throw new Error('Phone is required for a new contact.');
    }
    setCreatingContact(true);
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, phone, email }),
      });
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to create contact');
      }
      const created = data?.data || null;
      if (created?.id) {
        setContacts((prev) => [created, ...prev]);
        return created;
      }
      throw new Error('Failed to create contact');
    } finally {
      setCreatingContact(false);
    }
  };

  const loadCatalogServices = async () => {
    if (catalogLoading) return;
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const params = new URLSearchParams();
      params.set('type', 'service');
      params.set('status', 'active');
      params.set('limit', '500');
      const response = await fetch(`/api/catalog?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load services');
      }
      const list = Array.isArray(data?.data) ? data.data : [];
      const sorted = list
        .filter((item) => item?.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setCatalogServices(sorted);
    } catch (error) {
      setCatalogServices([]);
      setCatalogError(error.message || 'Failed to load services');
    } finally {
      setCatalogLoading(false);
    }
  };

  async function fetchAppointments({ reset = false, nextOffset = 0, searchTerm = '', status = 'all' } = {}) {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('offset', String(nextOffset));
      if (searchTerm) params.set('q', searchTerm);
      if (status && status !== 'all') params.set('status', status);
      const response = await fetch(`/api/appointments?${params.toString()}`, { credentials: 'include' });
      const data = await response.json();
      const list = data.data || [];
      const meta = data.meta || {};
      setHasMore(Boolean(meta.hasMore));
      setOffset(meta.nextOffset ?? nextOffset + list.length);
      if (reset) {
        setAppointments(list);
      } else {
        setAppointments((prev) => [...prev, ...list]);
      }
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
      if (reset) {
        setAppointments([]);
        setHasMore(false);
        setOffset(0);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function updateStatus(appointmentId, status) {
    const previous = appointments;
    setUpdatingId(appointmentId);
    setAppointments((prev) =>
      prev.map((appt) => (appt.id === appointmentId ? { ...appt, status } : appt))
    );

    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update status');
      }
      setAppointments((prev) =>
        prev.map((appt) => (appt.id === appointmentId ? data.data : appt))
      );
    } catch (error) {
      console.error('Failed to update appointment:', error);
      setAppointments(previous);
    } finally {
      setUpdatingId(null);
    }
  }

  const toInputDateTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  };

  const getPaymentStatus = (appt) => {
    if (appt?.payment_status) return appt.payment_status;
    const total = Number(appt?.payment_total || 0);
    const paid = Number(appt?.payment_paid || 0);
    if (!total && !paid) return 'unpaid';
    if (paid <= 0) return 'unpaid';
    if (total > 0 && paid < total) return 'partial';
    return 'paid';
  };

  const getPaymentBadge = (status) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-700';
      case 'partial':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getPaymentSummary = (appt) => {
    const total = appt?.payment_total !== null && appt?.payment_total !== undefined
      ? Number(appt.payment_total)
      : null;
    const paid = appt?.payment_paid !== null && appt?.payment_paid !== undefined
      ? Number(appt.payment_paid)
      : null;
    const due =
      total !== null && paid !== null && Number.isFinite(total) && Number.isFinite(paid)
        ? Math.max(0, total - paid)
        : null;
    return { total, paid, due };
  };

  const toInputNumber = (value) => {
    if (value === null || value === undefined || value === '') return '';
    return String(value);
  };

  const computePaidForMode = (totalValue, mode) => {
    const total = Number(totalValue);
    if (!Number.isFinite(total)) return '';
    if (mode === 'full') return String(total);
    if (mode === 'partial') {
      const value = Math.round(total * 0.5 * 100) / 100;
      return String(value);
    }
    return '';
  };

  const derivePaidMode = (totalValue, paidValue) => {
    const total = Number(totalValue);
    const paid = Number(paidValue);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(paid)) return '';
    if (paid >= total) return 'full';
    if (paid > 0 && paid < total) return 'partial';
    return '';
  };

  const parsePaymentNotes = (raw) => {
    if (!raw) return { note: '', services: [] };
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const note = typeof parsed.note === 'string' ? parsed.note : '';
        const services = Array.isArray(parsed.services)
          ? parsed.services.map((service) => ({
              name: String(service?.name || ''),
              amount:
                service?.amount === null || service?.amount === undefined
                  ? ''
                  : String(service.amount),
            }))
          : [];
        return { note, services };
      }
    } catch (error) {
      // fall back to raw note
    }
    return { note: raw, services: [] };
  };

  const sanitizeServices = (services) =>
    (Array.isArray(services) ? services : []).map((service) => ({
      name: String(service?.name || ''),
      amount:
        service?.amount === null || service?.amount === undefined
          ? ''
          : String(service.amount),
    }));

  const calculateServicesTotal = (services) => {
    return (Array.isArray(services) ? services : []).reduce((sum, service) => {
      const value = Number(service?.amount);
      if (!Number.isFinite(value)) return sum;
      return sum + value;
    }, 0);
  };

  const hasServiceInput = (services) =>
    (Array.isArray(services) ? services : []).some(
      (service) => String(service?.name || '').trim() || String(service?.amount || '').trim()
    );

  const buildPaymentNotesPayload = (note, services) => {
    const trimmedNote = String(note || '').trim();
    const normalized = sanitizeServices(services).filter(
      (service) => service.name.trim() || String(service.amount || '').trim()
    );
    if (!normalized.length) return trimmedNote || '';
    return JSON.stringify({ note: trimmedNote, services: normalized });
  };

  const openEdit = (appt) => {
    if (!catalogServices.length && !catalogLoading) {
      loadCatalogServices();
    }
    const parsedNotes = parsePaymentNotes(appt.payment_notes || '');
    const services = sanitizeServices(parsedNotes.services);
    const servicesTotal = calculateServicesTotal(services);
    const hasServices = hasServiceInput(services);
    const totalValue =
      appt.payment_total !== null && appt.payment_total !== undefined
        ? toInputNumber(appt.payment_total)
        : hasServices
        ? toInputNumber(servicesTotal)
        : '';
    const paidValue = toInputNumber(appt.payment_paid);
    const paidMode = derivePaidMode(totalValue, paidValue);
    setEditError('');
    setEditMode('edit');
    setEditForm({
      id: appt.id,
      user_id: appt.user_id || '',
      status: appt.status || 'booked',
      appointment_type: appt.appointment_type || '',
      start_time: toInputDateTime(appt.start_time),
      end_time: toInputDateTime(appt.end_time),
      payment_total: totalValue,
      payment_paid: paidValue,
      payment_paid_mode: paidMode,
      payment_method: appt.payment_method || '',
      payment_notes: parsedNotes.note || '',
      payment_services: services,
    });
    setEditOpen(true);
  };

  const openCreate = () => {
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    setEditError('');
    setEditMode('create');
    setCreateContactMode(false);
    setCreateContactError('');
    setNewContactForm({ name: '', phone: '', email: '' });
    setEditForm({
      id: null,
      user_id: '',
      status: 'booked',
      appointment_type: '',
      start_time: toInputDateTime(now),
      end_time: toInputDateTime(end),
      payment_total: '',
      payment_paid: '',
      payment_paid_mode: '',
      payment_method: '',
      payment_notes: '',
      payment_services: [],
    });
    setEditOpen(true);
    loadContacts();
    if (!catalogServices.length && !catalogLoading) {
      loadCatalogServices();
    }
  };

  const handleEditChange = (field) => (event) => {
    const value = event.target.value;
    setEditForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'payment_total' && prev.payment_paid_mode) {
        next.payment_paid = computePaidForMode(value, prev.payment_paid_mode);
      }
      return next;
    });
  };

  const setPaidMode = (mode) => {
    setEditForm((prev) => {
      const nextMode = prev.payment_paid_mode === mode ? '' : mode;
      return {
        ...prev,
        payment_paid_mode: nextMode,
        payment_paid: nextMode ? computePaidForMode(prev.payment_total, nextMode) : prev.payment_paid,
      };
    });
  };

  const setPaymentMethod = (value) => {
    setEditForm((prev) => ({ ...prev, payment_method: value }));
  };

  const updatePaymentServices = (updater) => {
    setEditForm((prev) => {
      const current = Array.isArray(prev.payment_services) ? prev.payment_services : [];
      const nextServices = typeof updater === 'function' ? updater(current) : updater;
      const sanitized = sanitizeServices(nextServices);
      const total = calculateServicesTotal(sanitized);
      const totalValue = hasServiceInput(sanitized) ? String(total) : '';
      const paidValue = prev.payment_paid_mode
        ? computePaidForMode(totalValue, prev.payment_paid_mode)
        : prev.payment_paid;
      return {
        ...prev,
        payment_services: sanitized,
        payment_total: totalValue,
        payment_paid: paidValue,
      };
    });
  };

  const findCatalogService = (name) => {
    const normalized = String(name || '').trim().toLowerCase();
    if (!normalized) return null;
    return catalogServices.find(
      (service) => String(service?.name || '').trim().toLowerCase() === normalized
    );
  };

  const parsePriceLabel = (label) => {
    const raw = String(label || '')
      .replace(/[, ]+/g, ' ')
      .trim();
    const match = raw.match(/(\d+(\.\d+)?)/);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  };

  const addServiceRow = () => {
    updatePaymentServices((services) => [...services, { name: '', amount: '' }]);
  };

  const updateServiceField = (index, field, value) => {
    updatePaymentServices((services) =>
      services.map((service, idx) => {
        if (idx !== index) return service;
        if (field === 'name') {
          const next = { ...service, name: value };
          const matched = findCatalogService(value);
          if (matched) {
            const price = parsePriceLabel(matched.price_label);
            if (price !== null) {
              next.amount = String(price);
            }
          }
          return next;
        }
        return { ...service, [field]: value };
      })
    );
  };

  const removeServiceRow = (index) => {
    updatePaymentServices((services) => services.filter((_, idx) => idx !== index));
  };

  const saveEdit = async () => {
    setEditSaving(true);
    setEditError('');
    try {
      const payload = {
        status: editForm.status,
        appointment_type: editForm.appointment_type,
        payment_total: editForm.payment_total === '' ? null : Number(editForm.payment_total),
        payment_paid: editForm.payment_paid === '' ? null : Number(editForm.payment_paid),
        payment_method: editForm.payment_method,
        payment_notes: buildPaymentNotesPayload(
          editForm.payment_notes,
          editForm.payment_services
        ),
      };
      if (editForm.start_time) {
        payload.start_time = new Date(editForm.start_time).toISOString();
      }
      if (editForm.end_time) {
        payload.end_time = new Date(editForm.end_time).toISOString();
      }
      if (editMode === 'create' && (!payload.start_time || !payload.end_time)) {
        if (!payload.start_time) {
          throw new Error('Start time is required.');
        }
        throw new Error('End time is required.');
      }

      let response;
      if (editMode === 'create') {
        let userId = editForm.user_id;
        if (!userId && createContactMode) {
          try {
            const created = await createNewContact();
            userId = created?.id || '';
          } catch (error) {
            setCreateContactError(error.message || 'Failed to create contact');
            throw error;
          }
        }
        if (!userId) {
          throw new Error('Please select a contact or add a new one.');
        }
        response = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ...payload,
            user_id: Number(userId),
          }),
        });
      } else {
        if (!editForm.id) return;
        response = await fetch(`/api/appointments/${editForm.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
      }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update appointment');
      }
      if (editMode === 'create') {
        await fetchAppointments({ reset: true, nextOffset: 0, searchTerm: search, status: filterStatus });
      } else {
        setAppointments((prev) => prev.map((appt) => (appt.id === editForm.id ? data.data : appt)));
      }
      setEditOpen(false);
    } catch (error) {
      setEditError(error.message || 'Failed to save appointment');
    } finally {
      setEditSaving(false);
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'booked': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const statusOptions = [
    {
      value: 'booked',
      label: 'Booked',
      icon: faClock,
      activeClass: 'bg-blue-600 text-white border-blue-600',
      panelClass: 'bg-blue-50 text-blue-800 border-blue-200',
      cardClass: 'border-blue-200 bg-blue-50 text-blue-900',
    },
    {
      value: 'completed',
      label: 'Completed',
      icon: faCircleCheck,
      activeClass: 'bg-green-600 text-white border-green-600',
      panelClass: 'bg-green-50 text-green-800 border-green-200',
      cardClass: 'border-green-200 bg-green-50 text-green-900',
    },
    {
      value: 'cancelled',
      label: 'Cancelled',
      icon: faBan,
      activeClass: 'bg-gray-700 text-white border-gray-700',
      panelClass: 'bg-gray-100 text-gray-700 border-gray-200',
      cardClass: 'border-gray-200 bg-gray-50 text-gray-800',
    },
  ];

  const filterStatusOptions = [
    { value: 'all', label: 'All' },
    ...statusOptions.map(({ value, label }) => ({ value, label })),
  ];

  const renderStatusSegmented = (current, onChange, disabled = false, size = 'sm') => {
    const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
    return (
      <div
        className={`inline-flex w-full sm:w-auto flex-wrap items-center gap-2 rounded-full border border-gray-200 bg-white p-1 ${disabled ? 'opacity-60' : ''}`}
        role="radiogroup"
        aria-label="Appointment status"
      >
        {statusOptions.map((option) => {
          const active = current === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              disabled={disabled}
              className={`${sizeClass} flex-1 sm:flex-initial rounded-full border font-semibold transition ${
                active
                  ? option.activeClass
                  : 'bg-white text-aa-gray border-transparent hover:border-aa-orange hover:text-aa-orange'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  };

  const renderStatusStacked = (current, onChange, disabled = false) => (
    <div
      className={`flex flex-col gap-2 w-full ${disabled ? 'opacity-60' : ''}`}
      role="radiogroup"
      aria-label="Appointment status"
    >
      {statusOptions.map((option) => {
        const active = current === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              active
                ? option.panelClass
                : 'bg-white text-aa-gray border-gray-200 hover:border-aa-orange hover:text-aa-orange'
            }`}
          >
            <span>{option.label}</span>
            <FontAwesomeIcon icon={option.icon} />
          </button>
        );
      })}
    </div>
  );

  const renderStatusCards = (current, onChange, disabled = false) => (
    <div
      className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${disabled ? 'opacity-60' : ''}`}
      role="radiogroup"
      aria-label="Appointment status"
    >
      {statusOptions.map((option) => {
        const active = current === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={`rounded-xl border-2 p-3 text-left transition ${
              active
                ? option.cardClass
                : 'border-gray-200 bg-white text-aa-text-dark hover:border-aa-orange'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FontAwesomeIcon icon={option.icon} />
              {option.label}
            </div>
            <p className="mt-1 text-xs text-aa-gray">
              {option.value === 'booked'
                ? 'Scheduled and confirmed'
                : option.value === 'completed'
                ? 'Service delivered'
                : 'Cancelled by admin or client'}
            </p>
          </button>
        );
      })}
    </div>
  );

  const paidModeOptions = [
    {
      value: 'full',
      label: 'Full paid',
      description: '100% of total amount',
      icon: faMoneyBillWave,
      className: 'border-green-200 bg-green-50 text-green-900',
    },
    {
      value: 'partial',
      label: 'Partial paid',
      description: 'Auto 50% of total',
      icon: faPercent,
      className: 'border-amber-200 bg-amber-50 text-amber-900',
    },
  ];

  const paymentMethodOptions = [
    { value: 'cash', label: 'Cash', icon: faMoneyBillWave, tone: 'bg-orange-50 text-orange-700 border-orange-200' },
    { value: 'card', label: 'Card', icon: faCreditCard, tone: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'upi', label: 'UPI', icon: faMobileScreen, tone: 'bg-purple-50 text-purple-700 border-purple-200' },
    { value: 'bank', label: 'Bank', icon: faBuildingColumns, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { value: 'wallet', label: 'Wallet', icon: faWallet, tone: 'bg-pink-50 text-pink-700 border-pink-200' },
    { value: 'other', label: 'Other', icon: faEllipsis, tone: 'bg-gray-100 text-gray-700 border-gray-200' },
  ];

  const statusColumns = useMemo(() => {
    const columns = [
      { key: 'booked', label: 'Booked' },
      { key: 'completed', label: 'Completed' },
      { key: 'cancelled', label: 'Cancelled' },
    ];
    if (filterStatus === 'all') {
      return columns;
    }
    return columns.filter((col) => col.key === filterStatus);
  }, [filterStatus]);

  const appointmentsByStatus = useMemo(() => {
    const grouped = {};
    statusColumns.forEach((col) => {
      grouped[col.key] = [];
    });
    appointments.forEach((appt) => {
      const key = appt.status || 'booked';
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(appt);
    });
    return grouped;
  }, [appointments, statusColumns]);

  const statusSummary = useMemo(() => {
    const base = { booked: 0, completed: 0, cancelled: 0 };
    appointments.forEach((appt) => {
      const key = appt.status || 'booked';
      if (base[key] !== undefined) {
        base[key] += 1;
      }
    });
    return base;
  }, [appointments]);

  if (!hasAppointmentsAccess) {
    return (
      <div className="space-y-6">
        <Card className="text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-aa-orange/10 flex items-center justify-center mb-4">
            <FontAwesomeIcon icon={faCalendarCheck} className="text-aa-orange" style={{ fontSize: 28 }} />
          </div>
          <h1 className="text-2xl font-bold text-aa-dark-blue mb-2">Appointments are not enabled</h1>
          <p className="text-aa-gray">
            Appointments are available only for service-based businesses. Your current type is{' '}
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-aa-orange mx-auto mb-4"></div>
          <p className="text-gray-600">Loading {labelLower}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <FontAwesomeIcon icon={faCalendarCheck} className="text-aa-orange" style={{ fontSize: 32 }} />
            {label}
          </h1>
          <Button variant="primary" onClick={openCreate}>
            Create {label.slice(0, -1)}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {[
            { key: 'booked', label: 'Booked', tone: 'bg-blue-50 text-blue-800', count: statusSummary.booked },
            { key: 'completed', label: 'Completed', tone: 'bg-green-50 text-green-800', count: statusSummary.completed },
            { key: 'cancelled', label: 'Cancelled', tone: 'bg-gray-50 text-gray-700', count: statusSummary.cancelled },
          ].map((item) => (
            <div key={item.key} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs uppercase text-aa-gray font-semibold">{item.label}</p>
              <p className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${item.tone}`}>
                {item.count}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-3 mb-4 lg:items-end">
          <div className="flex-1 relative">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="absolute left-3 top-3 text-gray-400"
              style={{ fontSize: 20 }}
            />
            <input
              type="text"
              placeholder={`Search ${labelLower} by name, phone, type...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aa-orange"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-1">
              {filterStatusOptions.map((option) => {
                const active = filterStatus === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFilterStatus(option.value)}
                    className={`px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? 'border-b-2 border-aa-orange text-aa-orange'
                        : 'text-aa-gray hover:text-aa-dark-blue'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="inline-flex w-full sm:w-auto rounded-full border border-gray-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition ${
                  viewMode === 'list'
                    ? 'bg-aa-dark-blue text-white'
                    : 'text-aa-gray hover:text-aa-dark-blue'
                }`}
              >
                <FontAwesomeIcon icon={faListUl} />
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition ${
                  viewMode === 'board'
                    ? 'bg-aa-dark-blue text-white'
                    : 'text-aa-gray hover:text-aa-dark-blue'
                }`}
              >
                <FontAwesomeIcon icon={faTableColumns} />
                Board
              </button>
            </div>
          </div>
        </div>
      </div>

      {appointments.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FontAwesomeIcon icon={faCalendarCheck} className="mx-auto text-gray-400 mb-2" style={{ fontSize: 48 }} />
          <p className="text-gray-500">No {labelLower} found</p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-3">
          {appointments.map((appt) => (
            <div
              key={appt.id}
              className="bg-white p-4 rounded-xl border border-gray-200 hover:shadow-md transition"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="font-bold text-lg text-gray-900">{appt.user_name || 'Unknown'}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(appt.status)}`}>
                      {String(appt.status || 'booked').replace('_', ' ').toUpperCase()}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPaymentBadge(getPaymentStatus(appt))}`}>
                      {getPaymentStatus(appt).toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{appt.phone || '—'}</p>
                  <p className="text-gray-700 mt-2">{appt.appointment_type || label.slice(0, -1)}</p>
                  <div className="flex flex-wrap gap-4 text-sm mt-3">
                    <span className="text-gray-500 flex items-center gap-2">
                      <FontAwesomeIcon icon={faClock} />
                      {appt.start_time ? new Date(appt.start_time).toLocaleDateString() : '—'} •{' '}
                      {appt.start_time ? new Date(appt.start_time).toLocaleTimeString() : '—'}
                    </span>
                    {(() => {
                      const summary = getPaymentSummary(appt);
                      if (summary.total === null && summary.paid === null) return null;
                      return (
                        <span className="text-gray-500 flex items-center gap-2">
                          <FontAwesomeIcon icon={faMoneyBillWave} />
                          Paid {summary.paid ?? 0} / {summary.total ?? 0}
                          {summary.due !== null ? ` • Due ${summary.due}` : ''}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {renderStatusSegmented(
                    appt.status || 'booked',
                    (value) => updateStatus(appt.id, value),
                    updatingId === appt.id,
                    'md'
                  )}
                  <Button
                    variant="outline"
                    className="text-sm px-4 py-2"
                    onClick={() => openEdit(appt)}
                  >
                    <FontAwesomeIcon icon={faPenToSquare} />
                    Edit
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {statusColumns.map((col) => (
            <Card key={col.key} className="p-4 bg-gray-50/60 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs uppercase text-aa-gray font-semibold">{col.label}</p>
                  <p className="text-sm text-aa-gray">{appointmentsByStatus[col.key]?.length || 0} items</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(col.key)}`}>
                  {col.label}
                </span>
              </div>

              <div className="space-y-3">
                {(appointmentsByStatus[col.key] || []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-white p-4 text-sm text-aa-gray">
                    No {col.label.toLowerCase()} {labelLower}.
                  </div>
                ) : (
                  appointmentsByStatus[col.key].map((appt) => (
                    <div key={appt.id} className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-aa-text-dark">{appt.user_name || 'Unknown'}</p>
                          <p className="text-xs text-aa-gray">{appt.phone || '—'}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getPaymentBadge(getPaymentStatus(appt))}`}>
                          {getPaymentStatus(appt).toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-3 text-sm text-aa-text-dark">
                        {appt.appointment_type || label.slice(0, -1)}
                      </div>
                      <div className="mt-2 text-xs text-aa-gray">
                        {appt.start_time ? new Date(appt.start_time).toLocaleDateString() : '—'} •{' '}
                        {appt.start_time ? new Date(appt.start_time).toLocaleTimeString() : '—'}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        {renderStatusStacked(
                          appt.status || 'booked',
                          (value) => updateStatus(appt.id, value),
                          updatingId === appt.id
                        )}
                        <button
                          type="button"
                          className="px-3 py-1 text-xs font-semibold text-aa-orange border border-aa-orange rounded-full hover:bg-aa-orange hover:text-white transition"
                          onClick={() => openEdit(appt)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() =>
              fetchAppointments({
                reset: false,
                nextOffset: offset,
                searchTerm: search,
                status: filterStatus,
              })
            }
            disabled={loadingMore}
            className="px-5 py-2 rounded-full border border-aa-orange text-aa-orange font-semibold hover:bg-aa-orange hover:text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title={`${editMode === 'create' ? 'Create' : 'Edit'} ${label.slice(0, -1)}`}
        size="lg"
      >
        <div className="space-y-5">
          {editError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {editError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {editMode === 'create' && (
              <div className="md:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-aa-text-dark">
                    {createContactMode ? 'New Contact' : 'Select Existing Contact'}
                  </label>
                  <Button
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      setCreateContactError('');
                      setCreateContactMode((prev) => !prev);
                      if (!createContactMode) {
                        setEditForm((prev) => ({ ...prev, user_id: '' }));
                      }
                    }}
                  >
                    {createContactMode ? 'Use Existing' : 'Add New'}
                  </Button>
                </div>
                {!createContactMode ? (
                  <>
                    <select
                      value={editForm.user_id}
                      onChange={handleEditChange('user_id')}
                      className="w-full px-4 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-lg outline-none focus:border-aa-orange"
                    >
                      <option value="">Select existing contact</option>
                      {contacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.name || 'Unknown'} • {contact.phone || '—'}
                        </option>
                      ))}
                    </select>
                    {contactsLoading && (
                      <p className="text-xs text-aa-gray mt-2">Loading contacts...</p>
                    )}
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input
                      label="Full Name"
                      value={newContactForm.name}
                      onChange={handleNewContactChange('name')}
                      placeholder="Customer name"
                    />
                    <Input
                      label="Phone"
                      value={newContactForm.phone}
                      onChange={handleNewContactChange('phone')}
                      placeholder="Phone number"
                      required
                    />
                    <Input
                      label="Email (optional)"
                      value={newContactForm.email}
                      onChange={handleNewContactChange('email')}
                      placeholder="Email address"
                    />
                  </div>
                )}
                {createContactError && (
                  <p className="text-xs text-red-600">{createContactError}</p>
                )}
              </div>
            )}
            <Input
              label="Appointment Type"
              value={editForm.appointment_type}
              onChange={handleEditChange('appointment_type')}
              placeholder="Consultation"
            />
            <div>
              <label className="block text-sm font-semibold text-aa-text-dark mb-2">Status</label>
              {renderStatusCards(
                editForm.status || 'booked',
                (value) => setEditForm((prev) => ({ ...prev, status: value })),
                false
              )}
            </div>
            <Input
              label="Start Time"
              type="datetime-local"
              value={editForm.start_time}
              onChange={handleEditChange('start_time')}
            />
            <Input
              label="End Time"
              type="datetime-local"
              value={editForm.end_time}
              onChange={handleEditChange('end_time')}
            />
          </div>

          <div className="rounded-xl border border-gray-200 p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-aa-dark-blue">
              <FontAwesomeIcon icon={faMoneyBillWave} />
              Payment Details
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Total Amount"
                type="number"
                value={editForm.payment_total}
                onChange={handleEditChange('payment_total')}
                placeholder="0"
              />
              <div className="md:col-span-1">
                <label className="block text-sm font-semibold text-aa-text-dark mb-2">Paid Type</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {paidModeOptions.map((option) => {
                    const active = editForm.payment_paid_mode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPaidMode(option.value)}
                        className={`rounded-xl border-2 p-3 text-left transition ${
                          active
                            ? option.className
                            : 'border-gray-200 bg-white text-aa-text-dark hover:border-aa-orange'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <FontAwesomeIcon icon={option.icon} />
                          {option.label}
                        </div>
                        <p className="mt-1 text-xs text-aa-gray">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
              <Input
                label="Paid Amount"
                type="number"
                value={editForm.payment_paid}
                onChange={handleEditChange('payment_paid')}
                placeholder="0"
                disabled={Boolean(editForm.payment_paid_mode)}
              />
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-aa-text-dark mb-2">Payment Method</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('')}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      !editForm.payment_method
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'border-gray-200 text-aa-gray hover:border-aa-orange hover:text-aa-orange'
                    }`}
                  >
                    Not set
                  </button>
                  {paymentMethodOptions.map((option) => {
                    const active = editForm.payment_method === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPaymentMethod(option.value)}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                          active
                            ? option.tone
                            : 'border-gray-200 text-aa-gray hover:border-aa-orange hover:text-aa-orange'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <FontAwesomeIcon icon={option.icon} />
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-aa-text-dark">Services</label>
                <Button variant="outline" className="text-xs" onClick={addServiceRow}>
                  Add Service
                </Button>
              </div>
              <datalist id="appointment-service-options">
                {catalogServices.map((service) => (
                  <option
                    key={service.id}
                    value={service.name}
                    label={service.price_label ? `${service.name} • ${service.price_label}` : service.name}
                  />
                ))}
              </datalist>
              {catalogLoading && (
                <p className="text-xs text-aa-gray">Loading services...</p>
              )}
              {catalogError && (
                <p className="text-xs text-red-600">{catalogError}</p>
              )}
              {editForm.payment_services?.length ? (
                editForm.payment_services.map((service, index) => (
                  <div
                    key={`service-${index}`}
                    className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3 items-end"
                  >
                    <Input
                      label={`Service ${index + 1}`}
                      value={service.name}
                      onChange={(event) =>
                        updateServiceField(index, 'name', event.target.value)
                      }
                      placeholder="Service name"
                      list="appointment-service-options"
                    />
                    <Input
                      label="Amount"
                      type="number"
                      value={service.amount}
                      onChange={(event) =>
                        updateServiceField(index, 'amount', event.target.value)
                      }
                      placeholder="0"
                    />
                    <Button
                      variant="ghost"
                      className="text-xs text-red-600 hover:bg-red-50"
                      onClick={() => removeServiceRow(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-aa-gray">No services added yet.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-aa-text-dark mb-2">Payment Notes</label>
              <textarea
                value={editForm.payment_notes}
                onChange={handleEditChange('payment_notes')}
                rows="3"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg outline-none focus:border-aa-orange text-sm"
                placeholder="Add partial payment details or receipts"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveEdit} disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

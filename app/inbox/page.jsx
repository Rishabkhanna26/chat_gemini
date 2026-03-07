'use client';

import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faInbox,
  faMagnifyingGlass,
  faFilter,
  faBolt,
  faClock,
  faEnvelopeOpen,
  faPaperPlane,
  faPhone,
  faUser,
  faRotateRight,
  faMessage,
  faArrowDown,
  faArrowLeft,
  faCheckDouble,
} from '@fortawesome/free-solid-svg-icons';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Badge from '../components/common/Badge.jsx';
import Loader from '../components/common/Loader.jsx';
import { useAuth } from '../components/auth/AuthProvider.jsx';
import { getBackendJwt } from '../../lib/backend-auth.js';

const WHATSAPP_API_BASE =
  process.env.NEXT_PUBLIC_WHATSAPP_API_BASE || 'http://localhost:3001';

const RANGE_OPTIONS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
};

const QUICK_REPLIES = [
  { label: 'Share pricing', text: 'Sure — sharing the pricing details now.' },
  { label: 'Confirm slot', text: 'Great. I can confirm the slot for you.' },
  { label: 'Request details', text: 'Could you share a few more details so I can help better?' },
  { label: 'Payment link', text: 'Here is the payment link. Let me know once completed.' },
];
const APPOINTMENT_CHANGE_REQUEST_HINTS = [
  'reschedule',
  'change appointment',
  'change date',
  'change time',
  'change slot',
  'move appointment',
  'another time',
  'another slot',
  'new slot',
  'slot change',
  'time change',
  'date change',
  'date badal',
  'time badal',
  'slot badal',
  'dusra time',
  'dusra slot',
  'reschedule karna',
  'तारीख बदल',
  'समय बदल',
  'स्लॉट बदल',
];

const normalizeText = (value) => String(value || '').toLowerCase();
const isUnreadIncoming = (msg) =>
  msg?.message_type === 'incoming' && msg?.status !== 'read';
const isAppointmentChangeRequest = (value) => {
  const normalized = normalizeText(value);
  return APPOINTMENT_CHANGE_REQUEST_HINTS.some((hint) => normalized.includes(hint));
};

const formatTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getAppointmentKind = (appointment) =>
  String(appointment?.appointment_kind || '').trim().toLowerCase() === 'booking'
    ? 'booking'
    : 'service';

const getAppointmentKindLabel = (appointment) =>
  getAppointmentKind(appointment) === 'booking' ? 'Booking' : 'Service';

const getInitials = (name, phone) => {
  const safe = String(name || '').trim();
  if (safe) {
    const parts = safe.split(' ').filter(Boolean);
    const first = parts[0]?.[0] || '';
    const second = parts[1]?.[0] || '';
    return `${first}${second}`.toUpperCase();
  }
  return (phone || '?').slice(-2);
};

const mergeById = (existing, incoming) => {
  const map = new Map();
  [...existing, ...incoming].forEach((msg) => {
    if (!msg?.id) return;
    map.set(msg.id, msg);
  });
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
};

export default function InboxPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    range: '30d',
    sort: 'recent',
  });
  const [selectedThread, setSelectedThread] = useState(null);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [threadMap, setThreadMap] = useState({});
  const [appointmentMap, setAppointmentMap] = useState({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [whatsappReady, setWhatsappReady] = useState(true);
  const [whatsappChecked, setWhatsappChecked] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState('idle');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [mobileQuickRepliesOpen, setMobileQuickRepliesOpen] = useState(false);

  const statusFilterOptions = [
    { value: 'all', label: 'All', icon: faFilter },
    { value: 'unread', label: 'Unread', icon: faEnvelopeOpen },
    { value: 'read', label: 'Read', icon: faCheckDouble },
    { value: 'needs_reply', label: 'Needs reply', icon: faBolt },
  ];

  const typeFilterOptions = [
    { value: 'all', label: 'All', icon: faMessage },
    { value: 'incoming', label: 'Incoming', icon: faEnvelopeOpen },
    { value: 'outgoing', label: 'Outgoing', icon: faPaperPlane },
  ];

  const rangeFilterOptions = [
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' },
    { value: 'all', label: 'All time' },
  ];

  const sortFilterOptions = [
    { value: 'recent', label: 'Most recent' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'unread', label: 'Unread first' },
  ];

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;

    const fetchStatus = async () => {
      try {
        const token = await getBackendJwt();
        if (!mounted) return;
        const response = await fetch(`${WHATSAPP_API_BASE}/whatsapp/status?adminId=${user.id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
        });
        if (response.status === 401) {
          const freshToken = await getBackendJwt({ forceRefresh: true });
          if (!mounted) return;
          const retryResponse = await fetch(`${WHATSAPP_API_BASE}/whatsapp/status?adminId=${user.id}`, {
            headers: {
              Authorization: `Bearer ${freshToken}`,
            },
            credentials: 'include',
          });
          const retryData = await retryResponse.json();
          if (!mounted) return;
          setWhatsappReady(Boolean(retryData?.ready));
          setWhatsappStatus(retryData?.status || 'idle');
          setWhatsappChecked(true);
          return;
        }
        const data = await response.json();
        if (!mounted) return;
        setWhatsappReady(Boolean(data?.ready));
        setWhatsappStatus(data?.status || 'idle');
        setWhatsappChecked(true);
      } catch (error) {
        if (!mounted) return;
        setWhatsappReady(false);
        setWhatsappStatus('unknown');
        setWhatsappChecked(true);
      }
    };

    fetchStatus();
    const timer = setInterval(fetchStatus, 20000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const handle = setTimeout(() => {
      fetchMessages({ reset: true, nextOffset: 0, searchTerm: search });
    }, 300);
    return () => clearTimeout(handle);
  }, [search, user?.id]);

  useEffect(() => {
    if (!selectedThread) return;
    loadThreadMessages(selectedThread, { reset: true });
  }, [selectedThread]);

  useEffect(() => {
    if (!selectedThread) return;
    let cancelled = false;

    const loadThreadAppointments = async () => {
      setAppointmentMap((prev) => ({
        ...prev,
        [selectedThread]: {
          appointments: prev[selectedThread]?.appointments || [],
          loading: true,
          error: '',
        },
      }));

      try {
        const response = await fetch(`/api/users/${selectedThread}/appointments?limit=6`);
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok || data?.success === false) {
          throw new Error(data?.error || 'Failed to load appointments');
        }
        setAppointmentMap((prev) => ({
          ...prev,
          [selectedThread]: {
            appointments: Array.isArray(data?.data) ? data.data : [],
            loading: false,
            error: '',
          },
        }));
      } catch (error) {
        if (cancelled) return;
        setAppointmentMap((prev) => ({
          ...prev,
          [selectedThread]: {
            appointments: prev[selectedThread]?.appointments || [],
            loading: false,
            error: error.message || 'Failed to load appointments',
          },
        }));
      }
    };

    loadThreadAppointments();
    return () => {
      cancelled = true;
    };
  }, [selectedThread]);

  const handleSelectThread = (userId) => {
    if (!userId) return;
    setSelectedThread(userId);
    setMobileThreadOpen(true);
    setMobileQuickRepliesOpen(false);
  };

  const applyDraftTemplate = (text) => {
    const next = String(text || '').trim();
    if (!next) return;
    setDraft((prev) => (prev.trim() ? `${prev}\n${next}` : next));
  };

  const resetFilters = () => {
    setSearch('');
    setFilters({
      status: 'all',
      type: 'all',
      range: '30d',
      sort: 'recent',
    });
  };

  const stats = useMemo(() => {
    const now = Date.now();
    const uniqueThreads = new Set(messages.map((msg) => msg.user_id)).size;
    const unreadMessages = messages.filter((msg) => isUnreadIncoming(msg)).length;
    const incomingToday = messages.filter(
      (msg) =>
        msg.message_type === 'incoming' &&
        now - new Date(msg.created_at).getTime() <= 24 * 60 * 60 * 1000
    ).length;
    const needsReply = (() => {
      const map = new Map();
      messages.forEach((msg) => {
        const current = map.get(msg.user_id) || { last: null, unread: 0 };
        const msgTime = new Date(msg.created_at).getTime();
        if (!current.last || msgTime > current.last.time) {
          current.last = { time: msgTime, type: msg.message_type };
        }
        if (isUnreadIncoming(msg)) current.unread += 1;
        map.set(msg.user_id, current);
      });
      let count = 0;
      map.forEach((value) => {
        if (value.unread > 0 && value.last?.type === 'incoming') count += 1;
      });
      return count;
    })();
    return {
      uniqueThreads,
      unreadMessages,
      incomingToday,
      needsReply,
    };
  }, [messages]);

  const threads = useMemo(() => {
    const now = Date.now();
    const map = new Map();
    messages.forEach((msg) => {
      if (!msg?.user_id) return;
      const time = new Date(msg.created_at).getTime();
      const existing = map.get(msg.user_id) || {
        user_id: msg.user_id,
        user_name: msg.user_name,
        phone: msg.phone,
        lastMessage: msg,
        lastTime: time,
        unreadCount: 0,
        incomingCount: 0,
        messageCount: 0,
      };
      existing.messageCount += 1;
      if (isUnreadIncoming(msg)) existing.unreadCount += 1;
      if (msg.message_type === 'incoming') existing.incomingCount += 1;
      if (!existing.lastTime || time > existing.lastTime) {
        existing.lastTime = time;
        existing.lastMessage = msg;
        existing.user_name = msg.user_name;
        existing.phone = msg.phone;
      }
      map.set(msg.user_id, existing);
    });

    let list = Array.from(map.values());

    if (filters.status === 'unread') {
      list = list.filter((thread) => thread.unreadCount > 0);
    } else if (filters.status === 'read') {
      list = list.filter((thread) => thread.unreadCount === 0);
    } else if (filters.status === 'needs_reply') {
      list = list.filter(
        (thread) =>
          thread.unreadCount > 0 && thread.lastMessage?.message_type === 'incoming'
      );
    }

    if (filters.type !== 'all') {
      list = list.filter(
        (thread) => thread.lastMessage?.message_type === filters.type
      );
    }

    const days = RANGE_OPTIONS[filters.range];
    if (days) {
      list = list.filter(
        (thread) => now - thread.lastTime <= days * 24 * 60 * 60 * 1000
      );
    }

    if (search) {
      const term = normalizeText(search);
      list = list.filter((thread) => {
        const haystack = [
          thread.user_name,
          thread.phone,
          thread.lastMessage?.message_text,
        ]
          .filter(Boolean)
          .join(' ');
        return normalizeText(haystack).includes(term);
      });
    }

    if (filters.sort === 'oldest') {
      list.sort((a, b) => a.lastTime - b.lastTime);
    } else if (filters.sort === 'unread') {
      list.sort((a, b) => b.unreadCount - a.unreadCount || b.lastTime - a.lastTime);
    } else {
      list.sort((a, b) => b.lastTime - a.lastTime);
    }

    return list;
  }, [messages, filters, search]);

  useEffect(() => {
    if (threads.length === 0) {
      setSelectedThread(null);
      setMobileThreadOpen(false);
      return;
    }
    const exists = threads.some((thread) => thread.user_id === selectedThread);
    if (!exists) {
      setSelectedThread(threads[0].user_id);
      setMobileThreadOpen(false);
    }
  }, [threads, selectedThread]);

  async function fetchMessages({ reset = false, nextOffset = 0, searchTerm = '' } = {}) {
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
      const response = await fetch(`/api/messages?${params.toString()}`);
      const data = await response.json();
      const list = data.data || [];
      const meta = data.meta || {};
      setHasMore(Boolean(meta.hasMore));
      setOffset(meta.nextOffset ?? nextOffset + list.length);
      if (reset) {
        setMessages(list);
      } else {
        setMessages((prev) => [...prev, ...list]);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      if (reset) {
        setMessages([]);
        setHasMore(false);
        setOffset(0);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  const loadThreadMessages = async (userId, { reset = false } = {}) => {
    if (!userId) return;
    setThreadMap((prev) => ({
      ...prev,
      [userId]: {
        messages: reset ? [] : prev[userId]?.messages || [],
        loading: true,
        hasMore: reset ? false : prev[userId]?.hasMore || false,
        offset: reset ? 0 : prev[userId]?.offset || 0,
        error: '',
      },
    }));

    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('offset', String(reset ? 0 : threadMap[userId]?.offset || 0));
      const response = await fetch(`/api/users/${userId}/messages?${params.toString()}`);
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to load messages');
      }
      const list = Array.isArray(data?.data) ? data.data : [];
      setThreadMap((prev) => {
        const existing = reset ? [] : prev[userId]?.messages || [];
        const merged = mergeById(existing, list);
        const shouldMarkRead = reset && merged.length > 0;
        const nextMessages = shouldMarkRead
          ? merged.map((msg) => {
              if (msg.message_type !== 'incoming') return msg;
              if (msg.status === 'read') return msg;
              return { ...msg, status: 'read' };
            })
          : merged;
        return {
          ...prev,
          [userId]: {
            messages: nextMessages,
            loading: false,
            hasMore: Boolean(data?.meta?.hasMore),
            offset:
              data?.meta?.nextOffset ??
              (reset ? list.length : (prev[userId]?.offset || 0) + list.length),
            error: '',
          },
        };
      });
      if (reset && list.length > 0) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.user_id !== userId) return msg;
            if (msg.message_type !== 'incoming') return msg;
            if (msg.status === 'read') return msg;
            return { ...msg, status: 'read' };
          })
        );
      }
    } catch (error) {
      console.error('Failed to load thread messages:', error);
      setThreadMap((prev) => ({
        ...prev,
        [userId]: {
          messages: prev[userId]?.messages || [],
          loading: false,
          hasMore: prev[userId]?.hasMore || false,
          offset: prev[userId]?.offset || 0,
          error: error.message || 'Failed to load messages',
        },
      }));
    }
  };

  const sendMessage = async () => {
    if (!selectedThread || sending) return;
    if (whatsappChecked && !whatsappReady) {
      setSendError('WhatsApp is not connected. Go to Settings > WhatsApp to connect.');
      return;
    }
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setSendError('');
    try {
      const response = await fetch(`/api/users/${selectedThread}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        const message = data?.error || 'Failed to send message';
        setSendError(message);
        return;
      }
      const newMessage = {
        ...data.data,
        user_name: activeThreadMeta?.user_name || data.data?.user_name,
        phone: activeThreadMeta?.phone || data.data?.phone,
      };
      setDraft('');
      setThreadMap((prev) => ({
        ...prev,
        [selectedThread]: {
          ...(prev[selectedThread] || { messages: [] }),
          messages: mergeById(prev[selectedThread]?.messages || [], [newMessage]),
        },
      }));
      setMessages((prev) => [newMessage, ...prev]);
    } catch (error) {
      console.error('Failed to send message:', error);
      setSendError(error.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const activeThreadData = selectedThread ? threadMap[selectedThread] : null;
  const activeMessages = activeThreadData?.messages || [];
  const activeAppointmentData = selectedThread ? appointmentMap[selectedThread] : null;
  const activeAppointments = activeAppointmentData?.appointments || [];
  const activeThreadMeta = threads.find((thread) => thread.user_id === selectedThread);
  const isThreadLoading = Boolean(selectedThread) && (!activeThreadData || activeThreadData.loading);
  const latestIncomingMessage = useMemo(
    () =>
      [...activeMessages]
        .reverse()
        .find((msg) => msg?.message_type === 'incoming') || null,
    [activeMessages]
  );
  const hasAppointmentChangeFlag = useMemo(
    () => isAppointmentChangeRequest(latestIncomingMessage?.message_text || ''),
    [latestIncomingMessage]
  );
  const activeUpcomingAppointment = useMemo(() => {
    const now = Date.now();
    return (
      activeAppointments.find(
        (appointment) =>
          appointment?.status === 'booked' &&
          new Date(appointment.start_time).getTime() >= now
      ) ||
      activeAppointments.find((appointment) => appointment?.status === 'booked') ||
      activeAppointments[0] ||
      null
    );
  }, [activeAppointments]);
  const appointmentReplyActions = useMemo(() => {
    const confirmSlotText = activeUpcomingAppointment
      ? `Your appointment is confirmed for ${formatDateTime(activeUpcomingAppointment.start_time)}.`
      : 'Please share your preferred slot, and I will help you with the appointment.';
    return [
      {
        label: 'Ask New Date',
        text: 'Sure. Please share your preferred new date for the appointment, and I will check the available slots.',
      },
      {
        label: 'Ask New Time',
        text: 'Please share your preferred new time, and I will help with the available slots.',
      },
      {
        label: 'Confirm Slot',
        text: confirmSlotText,
      },
    ];
  }, [activeUpcomingAppointment]);
  const activeFilterBadges = [
    search.trim() ? `Search: ${search.trim()}` : null,
    filters.status !== 'all'
      ? `Status: ${statusFilterOptions.find((option) => option.value === filters.status)?.label || filters.status}`
      : null,
    filters.type !== 'all'
      ? `Type: ${typeFilterOptions.find((option) => option.value === filters.type)?.label || filters.type}`
      : null,
    filters.range !== '30d'
      ? `Range: ${rangeFilterOptions.find((option) => option.value === filters.range)?.label || filters.range}`
      : null,
    filters.sort !== 'recent'
      ? `Sort: ${sortFilterOptions.find((option) => option.value === filters.sort)?.label || filters.sort}`
      : null,
  ].filter(Boolean);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader size="lg" text="Loading inbox..." />
      </div>
    );
  }

  return (
    <div
      data-testid="inbox-page"
      className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50"
    >
      <div className="mx-auto w-full max-w-[1920px] px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6 xl:px-8 xl:py-8">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white/90 p-3 shadow-2xl backdrop-blur-sm sm:rounded-3xl sm:p-4 lg:p-5 xl:p-6">
          <div className={`${mobileThreadOpen ? 'hidden sm:flex' : 'flex'} flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between`}>
            <div className="space-y-2">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 sm:h-12 sm:w-12 lg:h-14 lg:w-14 lg:rounded-2xl">
                  <FontAwesomeIcon icon={faInbox} className="text-base text-blue-600 sm:text-lg lg:text-xl" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 sm:text-2xl lg:text-3xl">Inbox</h1>
                  <p className="text-xs text-gray-600 sm:text-sm lg:max-w-2xl">
                    Stay on top of customer messages with quick filters and replies.
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => fetchMessages({ reset: true, nextOffset: 0, searchTerm: search })}
              icon={<FontAwesomeIcon icon={faRotateRight} />}
              className="w-full sm:w-auto"
            >
              <span className="hidden sm:inline">Refresh</span>
              <span className="sm:hidden">Refresh</span>
            </Button>
          </div>

          <div className={`${mobileThreadOpen ? 'hidden sm:grid' : 'grid'} mt-4 grid-cols-2 gap-2 sm:mt-5 sm:gap-3 lg:mt-6 lg:grid-cols-4 lg:gap-4 xl:gap-5`}>
            <Card
              unstyled
              className="min-h-[100px] rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:min-h-[120px] sm:p-4 lg:min-h-[140px] lg:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 sm:text-xs">
                    Conversations
                  </p>
                  <p className="mt-2 text-lg font-bold text-gray-900 sm:mt-3 sm:text-2xl lg:text-3xl">
                    {stats.uniqueThreads}
                  </p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600 sm:h-10 sm:w-10 lg:h-11 lg:w-11 lg:rounded-xl">
                  <FontAwesomeIcon icon={faMessage} className="text-xs sm:text-sm" />
                </div>
              </div>
              <div className="mt-3 hidden text-xs text-gray-600 sm:mt-4 sm:block lg:text-sm">
                Total active threads
              </div>
            </Card>

            <Card
              unstyled
              className="min-h-[100px] rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:min-h-[120px] sm:p-4 lg:min-h-[140px] lg:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 sm:text-xs">
                    Unread
                  </p>
                  <p className="mt-2 text-lg font-bold text-gray-900 sm:mt-3 sm:text-2xl lg:text-3xl">
                    {stats.unreadMessages}
                  </p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 sm:h-10 sm:w-10 lg:h-11 lg:w-11 lg:rounded-xl">
                  <FontAwesomeIcon icon={faEnvelopeOpen} className="text-xs sm:text-sm" />
                </div>
              </div>
              <div className="mt-3 hidden text-xs text-gray-600 sm:mt-4 sm:block lg:text-sm">
                Messages to review
              </div>
            </Card>

            <Card
              unstyled
              className="min-h-[100px] rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:min-h-[120px] sm:p-4 lg:min-h-[140px] lg:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 sm:text-xs">
                    Needs Reply
                  </p>
                  <p className="mt-2 text-lg font-bold text-gray-900 sm:mt-3 sm:text-2xl lg:text-3xl">
                    {stats.needsReply}
                  </p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 sm:h-10 sm:w-10 lg:h-11 lg:w-11 lg:rounded-xl">
                  <FontAwesomeIcon icon={faBolt} className="text-xs sm:text-sm" />
                </div>
              </div>
              <div className="mt-3 hidden text-xs text-gray-600 sm:mt-4 sm:block lg:text-sm">
                Latest incoming unread
              </div>
            </Card>

            <Card
              unstyled
              className="min-h-[100px] rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:min-h-[120px] sm:p-4 lg:min-h-[140px] lg:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 sm:text-xs">
                    Incoming Today
                  </p>
                  <p className="mt-2 text-lg font-bold text-gray-900 sm:mt-3 sm:text-2xl lg:text-3xl">
                    {stats.incomingToday}
                  </p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-green-600 sm:h-10 sm:w-10 lg:h-11 lg:w-11 lg:rounded-xl">
                  <FontAwesomeIcon icon={faClock} className="text-xs sm:text-sm" />
                </div>
              </div>
              <div className="mt-3 hidden text-xs text-gray-600 sm:mt-4 sm:block lg:text-sm">
                Last 24 hours
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 sm:mt-5 sm:gap-5 lg:mt-6 lg:min-h-[calc(100vh-24rem)] lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)] lg:items-stretch">
            <div
              className={`${mobileThreadOpen ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col space-y-3 overflow-hidden sm:space-y-4 lg:h-[calc(100vh-26rem)] lg:max-h-[calc(100vh-26rem)]`}
            >
              <Card
                unstyled
                className="order-2 shrink-0 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4 lg:order-1 lg:max-h-[32vh] lg:overflow-y-auto"
              >
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-900 sm:text-sm">
                        <FontAwesomeIcon icon={faFilter} className="text-blue-600" />
                        Refine Inbox
                      </div>
                      <p className="mt-1 text-[10px] text-gray-600 sm:text-xs">
                        {activeFilterBadges.length
                          ? `${activeFilterBadges.length} active filter${activeFilterBadges.length > 1 ? 's' : ''}`
                          : 'Search and filter conversations'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFiltersExpanded((prev) => !prev)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 sm:px-4 sm:py-2"
                      aria-expanded={filtersExpanded}
                    >
                      <span className="hidden sm:inline">{filtersExpanded ? 'Hide filters' : 'Show filters'}</span>
                      <span className="sm:hidden">{filtersExpanded ? 'Hide' : 'Show'}</span>
                      <FontAwesomeIcon
                        icon={faArrowDown}
                        className={`text-[10px] transition-transform ${filtersExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>

                  <div className="relative">
                    <FontAwesomeIcon
                      icon={faMagnifyingGlass}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 sm:left-4"
                    />
                    <input
                      type="text"
                      placeholder="Search name, phone, or message"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 bg-white px-9 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:px-11 sm:py-3"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {activeFilterBadges.length ? (
                      activeFilterBadges.map((badge) => (
                        <span
                          key={badge}
                          className="inline-flex items-center rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-700 sm:px-3 sm:py-1.5 sm:text-xs"
                        >
                          {badge}
                        </span>
                      ))
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-[10px] font-semibold text-gray-600 sm:px-3 sm:py-1.5 sm:text-xs">
                        Default view active
                      </span>
                    )}
                  </div>

                  <div className="hidden gap-1.5 overflow-x-auto pb-1 sm:flex sm:flex-wrap sm:gap-2 sm:overflow-visible sm:pb-0">
                    <button
                      onClick={resetFilters}
                      className="whitespace-nowrap rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-700 hover:bg-gray-50 sm:px-3 sm:py-1.5 sm:text-xs"
                    >
                      Clear all
                    </button>
                    <button
                      onClick={() => setFilters((prev) => ({ ...prev, status: 'needs_reply' }))}
                      className="whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700 sm:px-3 sm:py-1.5 sm:text-xs"
                    >
                      Needs reply
                    </button>
                    <button
                      onClick={() => setFilters((prev) => ({ ...prev, status: 'unread' }))}
                      className="whitespace-nowrap rounded-full border border-blue-300 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700 sm:px-3 sm:py-1.5 sm:text-xs"
                    >
                      Unread only
                    </button>
                    <button
                      onClick={() => setFilters((prev) => ({ ...prev, type: 'incoming' }))}
                      className="whitespace-nowrap rounded-full border border-green-300 bg-green-50 px-2.5 py-1 text-[10px] font-semibold text-green-700 sm:px-3 sm:py-1.5 sm:text-xs"
                    >
                      Incoming
                    </button>
                  </div>
                </div>

                {filtersExpanded && (
                  <div className="mt-4 grid gap-3 border-t border-gray-200 pt-4 sm:mt-5 sm:gap-4 sm:pt-5 md:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 sm:text-xs">
                        Status
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2">
                        {statusFilterOptions.map((option) => {
                          const active = filters.status === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setFilters((prev) => ({ ...prev, status: option.value }))
                              }
                              className={`rounded-lg border px-2 py-2 text-[10px] font-semibold transition sm:px-3 sm:py-2.5 sm:text-xs ${
                                active
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-gray-300 bg-white text-gray-700 hover:border-blue-500'
                              }`}
                            >
                              <span className="flex items-center justify-center gap-1 sm:gap-2">
                                <FontAwesomeIcon icon={option.icon} />
                                <span className="hidden sm:inline">{option.label}</span>
                                <span className="sm:hidden">{option.label.slice(0, 6)}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 sm:text-xs">
                        Type
                      </p>
                      <div className="mt-2 inline-flex w-full flex-wrap gap-1 rounded-lg border border-gray-300 bg-white p-1 sm:mt-3 sm:gap-1.5 sm:p-1.5">
                        {typeFilterOptions.map((option) => {
                          const active = filters.type === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setFilters((prev) => ({ ...prev, type: option.value }))
                              }
                              className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-semibold transition sm:px-3 sm:py-2 sm:text-xs ${
                                active
                                  ? 'bg-blue-600 text-white'
                                  : 'text-gray-700 hover:text-gray-900'
                              }`}
                            >
                              <span className="inline-flex items-center gap-1 sm:gap-2">
                                <FontAwesomeIcon icon={option.icon} />
                                <span className="hidden sm:inline">{option.label}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 sm:text-xs">
                        Range
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 border-b border-gray-300 pb-2 sm:mt-3 sm:gap-3">
                        {rangeFilterOptions.map((option) => {
                          const active = filters.range === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setFilters((prev) => ({ ...prev, range: option.value }))
                              }
                              className={`text-[10px] font-semibold transition sm:text-xs ${
                                active
                                  ? 'border-b-2 border-blue-600 text-blue-600'
                                  : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 sm:text-xs">
                        Sort
                      </p>
                      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:mt-3 sm:gap-2">
                        {sortFilterOptions.map((option) => {
                          const active = filters.sort === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setFilters((prev) => ({ ...prev, sort: option.value }))
                              }
                              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-[10px] font-semibold transition sm:px-4 sm:py-2.5 sm:text-xs ${
                                active
                                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                                  : 'border-gray-300 bg-white text-gray-700 hover:border-blue-500'
                              }`}
                            >
                              {option.label}
                              {active && <FontAwesomeIcon icon={faCheckDouble} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              <Card
                unstyled
                className="order-1 flex min-h-[18rem] flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 shadow-sm lg:order-2"
              >
                <div className="flex items-center justify-between border-b border-gray-200 px-3 py-3 sm:px-4 sm:py-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 sm:gap-2 sm:text-sm">
                    <FontAwesomeIcon icon={faFilter} className="text-blue-600" />
                    Conversations
                  </div>
                  <Badge variant="blue">{threads.length}</Badge>
                </div>
                <div className="max-h-[42vh] overflow-y-auto sm:max-h-[48vh] lg:flex-1 lg:min-h-0 lg:max-h-none">
                  {threads.length === 0 ? (
                    <div className="px-3 py-8 text-center text-xs text-gray-600 sm:px-4 sm:py-10 sm:text-sm">
                      No conversations match your filters.
                    </div>
                  ) : (
                    threads.map((thread) => {
                      const isActive = thread.user_id === selectedThread;
                      return (
                        <button
                          key={thread.user_id}
                          onClick={() => handleSelectThread(thread.user_id)}
                          className={`w-full border-b border-gray-100 px-3 py-3 text-left transition hover:bg-blue-50 sm:px-4 sm:py-4 ${
                            isActive ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2 sm:gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-200 text-[10px] font-semibold text-gray-700 sm:h-10 sm:w-10 sm:text-xs lg:h-12 lg:w-12 lg:text-sm">
                              {getInitials(thread.user_name, thread.phone)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-semibold text-gray-900 sm:text-sm">
                                    {thread.user_name || 'Unknown'}
                                  </p>
                                  <p className="mt-0.5 truncate text-[10px] text-gray-600 sm:text-xs">
                                    {thread.phone || '—'}
                                  </p>
                                </div>
                                <span className="shrink-0 pt-0.5 text-[10px] text-gray-500 sm:text-xs">
                                  {formatTime(thread.lastMessage?.created_at)}
                                </span>
                              </div>
                              <p className="inbox-thread-preview mt-1 text-[10px] text-gray-600 sm:mt-1.5 sm:text-xs">
                                {thread.lastMessage?.message_text || 'No message preview'}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-1 sm:gap-1.5">
                                <Badge
                                  variant={
                                    thread.lastMessage?.message_type === 'incoming' ? 'blue' : 'green'
                                  }
                                >
                                  {thread.lastMessage?.message_type || 'incoming'}
                                </Badge>
                                {thread.unreadCount > 0 && (
                                  <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white sm:px-2">
                                    {thread.unreadCount}
                                  </span>
                                )}
                                <span className="text-[10px] text-gray-500 sm:text-xs">
                                  {formatDate(thread.lastMessage?.created_at)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                {hasMore && (
                  <div className="p-3 sm:p-4">
                    <Button
                      variant="outline"
                      onClick={() =>
                        fetchMessages({ reset: false, nextOffset: offset, searchTerm: search })
                      }
                      disabled={loadingMore}
                      className="w-full"
                      icon={<FontAwesomeIcon icon={faArrowDown} />}
                    >
                      {loadingMore ? 'Loading...' : 'Load more'}
                    </Button>
                  </div>
                )}
              </Card>
            </div>

            <Card
              unstyled
              className={`h-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 shadow-sm ${mobileThreadOpen ? 'block' : 'hidden lg:block'}`}
            >
              {!selectedThread ? (
                <div className="flex h-full min-h-[400px] flex-col items-center justify-center px-4 py-12 text-center sm:min-h-[500px] sm:px-6 lg:min-h-[600px]">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 sm:h-14 sm:w-14 lg:h-16 lg:w-16 lg:rounded-2xl">
                    <FontAwesomeIcon icon={faInbox} className="text-blue-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">Select a conversation</h2>
                  <p className="mt-2 max-w-md text-xs text-gray-600 sm:mt-3 sm:text-sm">
                    Choose a thread from the left to view the full conversation and reply.
                  </p>
                </div>
              ) : (
                <div className="flex h-[calc(100vh-8rem)] min-h-[400px] flex-col sm:h-[calc(100vh-9rem)] sm:min-h-[500px] lg:h-[calc(100vh-14rem)] lg:min-h-[600px]">
                  <div className="flex min-h-0 flex-col">
                    <div className="flex flex-col gap-2 border-b border-gray-200 px-3 py-3 sm:gap-3 sm:px-4 sm:py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5 lg:py-5">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <button
                          type="button"
                          onClick={() => setMobileThreadOpen(false)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 sm:h-9 sm:w-9 lg:hidden"
                          aria-label="Back to conversations"
                        >
                          <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-200 text-xs font-semibold text-gray-700 sm:h-11 sm:w-11 sm:text-sm lg:h-12 lg:w-12 lg:rounded-2xl">
                          {getInitials(activeThreadMeta?.user_name, activeThreadMeta?.phone)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900 sm:text-base lg:text-lg">
                            {activeThreadMeta?.user_name || 'Unknown'}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-gray-600 sm:text-xs">
                            {activeThreadMeta?.phone || 'No phone number'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <a
                          href={activeThreadMeta?.phone ? `tel:${activeThreadMeta.phone}` : undefined}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-50 sm:gap-2 sm:px-3 sm:py-2 sm:text-xs"
                          aria-label="Call customer"
                        >
                          <FontAwesomeIcon icon={faPhone} />
                          <span className="hidden sm:inline">Call</span>
                        </a>
                        <button
                          onClick={() => {
                            if (!activeThreadMeta?.phone) return;
                            navigator.clipboard?.writeText(activeThreadMeta.phone);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-50 sm:gap-2 sm:px-3 sm:py-2 sm:text-xs"
                          aria-label="Copy phone number"
                        >
                          <FontAwesomeIcon icon={faUser} />
                          <span className="hidden sm:inline">Copy</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 space-y-2 overflow-y-auto px-3 py-3 sm:space-y-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
                      {isThreadLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader size="md" text="Loading conversation..." />
                        </div>
                      ) : activeThreadData?.error ? (
                        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 sm:px-4 sm:py-3 sm:text-sm">
                          {activeThreadData.error}
                        </div>
                      ) : (
                        <>
                          {activeThreadData?.hasMore && (
                            <div className="flex justify-center">
                              <button
                                onClick={() => loadThreadMessages(selectedThread, { reset: false })}
                                className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-50 sm:px-4 sm:py-2 sm:text-xs"
                              >
                                Load earlier messages
                              </button>
                            </div>
                          )}
                          {activeMessages.length === 0 ? (
                            <div className="py-8 text-center text-xs text-gray-600 sm:text-sm">
                              No messages yet. Start the conversation below.
                            </div>
                          ) : (
                            activeMessages.map((msg) => {
                              const isOutgoing = msg.message_type === 'outgoing';
                              return (
                                <div
                                  key={msg.id}
                                  className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                                >
                                  <div
                                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm sm:max-w-[75%] sm:px-4 sm:py-3 sm:text-sm ${
                                      isOutgoing
                                        ? 'bg-blue-600 text-white'
                                        : 'border border-gray-200 bg-white text-gray-900'
                                    }`}
                                  >
                                    <p>{msg.message_text}</p>
                                    <div
                                      className={`mt-1.5 flex items-center gap-1.5 text-[10px] sm:mt-2 sm:text-xs ${
                                        isOutgoing ? 'text-white/80' : 'text-gray-500'
                                      }`}
                                    >
                                      <span>{formatTime(msg.created_at)}</span>
                                      {msg.status === 'read' && isOutgoing && (
                                        <FontAwesomeIcon icon={faCheckDouble} />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </>
                      )}
                    </div>

                    <div className="mt-auto shrink-0 border-t border-gray-200 p-3 sm:p-4 lg:p-5">
                      {whatsappChecked && !whatsappReady && (
                        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] text-amber-800 sm:mb-4 sm:px-4 sm:py-3 sm:text-xs">
                          WhatsApp is not connected. Go to Settings to connect before sending messages.
                        </div>
                      )}
                      <div className="mb-3 sm:mb-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 sm:text-xs">
                            Quick Replies
                          </p>
                          <button
                            type="button"
                            onClick={() => setMobileQuickRepliesOpen((prev) => !prev)}
                            className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-1 text-[10px] font-semibold text-gray-700 hover:bg-gray-50 sm:hidden sm:gap-1.5 sm:px-2.5"
                            aria-expanded={mobileQuickRepliesOpen}
                          >
                            {mobileQuickRepliesOpen ? 'Hide' : 'Show'}
                            <FontAwesomeIcon
                              icon={faArrowDown}
                              className={`text-[9px] transition-transform ${mobileQuickRepliesOpen ? 'rotate-180' : ''}`}
                            />
                          </button>
                        </div>
                        <div className={`${mobileQuickRepliesOpen ? 'flex' : 'hidden'} flex-wrap gap-1.5 sm:flex sm:gap-2`}>
                          {QUICK_REPLIES.map((reply) => (
                            <button
                              key={reply.label}
                              onClick={() => applyDraftTemplate(reply.text)}
                              className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-700 hover:bg-gray-50 sm:px-3 sm:py-1.5 sm:text-xs"
                            >
                              {reply.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                        <div className="flex-1">
                          <textarea
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            rows={2}
                            placeholder="Type a reply..."
                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:px-4 sm:py-3 sm:text-sm"
                          />
                          {sendError && <p className="mt-1.5 text-[10px] text-red-600 sm:text-xs">{sendError}</p>}
                        </div>
                        <Button
                          variant="primary"
                          onClick={sendMessage}
                          disabled={sending || !draft.trim() || (whatsappChecked && !whatsappReady)}
                          icon={<FontAwesomeIcon icon={faPaperPlane} />}
                          className="w-full sm:w-auto sm:min-w-[120px]"
                        >
                          {sending ? 'Sending...' : 'Send'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Card
            unstyled
            className="mt-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:mt-5 sm:p-4 lg:mt-6 lg:p-5"
          >
            <div className="flex flex-col gap-2 border-b border-gray-200 pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:pb-4">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 sm:gap-2 sm:text-sm">
                  <FontAwesomeIcon icon={faClock} className="text-blue-600" />
                  Appointment Actions
                </div>
                <p className="mt-1 text-[10px] text-gray-600 sm:text-xs lg:max-w-3xl">
                  Handle date or time change requests from the selected chat in a separate workspace.
                </p>
              </div>
              {activeThreadMeta && (
                <div className="inline-flex rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-700 sm:px-3 sm:py-1.5 sm:text-xs">
                  {activeThreadMeta.user_name || 'Selected chat'}
                </div>
              )}
            </div>

            {!selectedThread ? (
              <div className="py-8 text-center text-xs text-gray-600 sm:py-10 sm:text-sm">
                Select a conversation to view appointment actions.
              </div>
            ) : activeAppointmentData?.loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader size="sm" text="Loading appointments..." />
              </div>
            ) : activeAppointmentData?.error ? (
              <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 sm:mt-5 sm:px-4 sm:py-3 sm:text-sm">
                {activeAppointmentData.error}
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 shadow-sm sm:px-4 sm:py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 sm:text-xs">
                    Current Appointment
                  </p>
                  {activeUpcomingAppointment ? (
                    <div className="mt-2 space-y-1.5 text-xs text-gray-900 sm:mt-3 sm:space-y-2 sm:text-sm">
                      <p className="font-semibold">
                        {activeUpcomingAppointment.appointment_type || getAppointmentKindLabel(activeUpcomingAppointment)}
                      </p>
                      <p>{formatDateTime(activeUpcomingAppointment.start_time)}</p>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        <Badge variant={getAppointmentKind(activeUpcomingAppointment) === 'booking' ? 'yellow' : 'blue'}>
                          {getAppointmentKindLabel(activeUpcomingAppointment)}
                        </Badge>
                        <Badge variant="blue">
                          {activeUpcomingAppointment.status || 'booked'}
                        </Badge>
                        {activeUpcomingAppointment.payment_status && (
                          <Badge variant="green">
                            {activeUpcomingAppointment.payment_status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-[10px] text-gray-600 sm:mt-3 sm:text-xs">
                      No appointment record was found for this contact yet.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 shadow-sm sm:px-4 sm:py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 sm:text-xs">
                    Send a Fast Reply
                  </p>
                  <div className="mt-2 grid gap-1.5 sm:mt-3 sm:gap-2">
                    {appointmentReplyActions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => applyDraftTemplate(action.text)}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-[10px] font-semibold text-gray-900 transition hover:border-blue-500 hover:bg-blue-50 sm:px-4 sm:py-2.5 sm:text-xs"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                  <a
                    href="/appointments"
                    className="mt-2 inline-flex items-center text-[10px] font-semibold text-blue-600 hover:text-blue-700 sm:mt-3 sm:text-xs"
                  >
                    Open appointments
                  </a>
                </div>

                <div className="space-y-3 sm:space-y-4 lg:col-span-2 xl:col-span-1">
                  {hasAppointmentChangeFlag && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:px-4 sm:py-3 sm:text-sm">
                      <p className="font-semibold">Customer asked to change the appointment.</p>
                      <p className="mt-1 text-[10px] text-amber-800 sm:text-xs">
                        Latest incoming message looks like a date/time change request.
                      </p>
                    </div>
                  )}

                  {latestIncomingMessage && (
                    <div className={`${hasAppointmentChangeFlag ? 'block' : 'hidden lg:block'} rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4 sm:py-4`}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 sm:text-xs">
                        Latest Incoming
                      </p>
                      <p className="mt-2 text-xs text-gray-900 sm:mt-3 sm:text-sm">
                        {latestIncomingMessage.message_text}
                      </p>
                      <p className="mt-1.5 text-[10px] text-gray-500 sm:mt-2 sm:text-xs">
                        {formatDateTime(latestIncomingMessage.created_at)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

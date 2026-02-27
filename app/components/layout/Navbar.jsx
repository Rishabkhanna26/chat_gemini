'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMagnifyingGlass,
  faBell,
  faWifi,
  faBan,
  faBars,
  faRightFromBracket,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../auth/AuthProvider.jsx';
import { hasProductAccess } from '../../../lib/business.js';
import { getBackendJwt } from '../../../lib/backend-auth.js';

const WHATSAPP_API_BASE =
  process.env.NEXT_PUBLIC_WHATSAPP_API_BASE || 'http://localhost:3001';
const WHATSAPP_SOCKET_URL =
  process.env.NEXT_PUBLIC_WHATSAPP_SOCKET_URL || WHATSAPP_API_BASE;

export default function Navbar({ onMenuClick }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [orderNotifications, setOrderNotifications] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  useEffect(() => {
    let isMounted = true;
    if (!user?.id) {
      setWhatsappConnected(false);
      return () => {
        isMounted = false;
      };
    }

    const deriveConnected = (payload) => {
      const status = payload?.status || 'idle';
      const isCurrentAdmin =
        payload?.activeAdminId && user?.id && payload.activeAdminId === user.id;
      return status === 'connected' && isCurrentAdmin;
    };

    const fetchStatus = async () => {
      try {
        const token = await getBackendJwt();
        if (!isMounted) return;
        const response = await fetch(
          `${WHATSAPP_API_BASE}/whatsapp/status?adminId=${user.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            credentials: 'include',
          }
        );
        if (response.status === 401) {
          const freshToken = await getBackendJwt({ forceRefresh: true });
          if (!isMounted) return;
          const retryResponse = await fetch(
            `${WHATSAPP_API_BASE}/whatsapp/status?adminId=${user.id}`,
            {
              headers: {
                Authorization: `Bearer ${freshToken}`,
              },
              credentials: 'include',
            }
          );
          if (!retryResponse.ok) throw new Error('status');
          const retryPayload = await retryResponse.json();
          if (!isMounted) return;
          setWhatsappConnected(deriveConnected(retryPayload));
          return;
        }
        if (!response.ok) throw new Error('status');
        const payload = await response.json();
        if (!isMounted) return;
        setWhatsappConnected(deriveConnected(payload));
      } catch (error) {
        if (isMounted) setWhatsappConnected(false);
      }
    };

    fetchStatus();
    let socket = null;
    (async () => {
      try {
        const token = await getBackendJwt();
        if (!isMounted) return;
        socket = io(WHATSAPP_SOCKET_URL, {
          query: { adminId: user.id },
          auth: { token },
        });

        socket.on('whatsapp:status', (payload) => {
          setWhatsappConnected(deriveConnected(payload));
        });

        socket.on('connect_error', () => {
          setWhatsappConnected(false);
        });
      } catch (error) {
        if (isMounted) setWhatsappConnected(false);
      }
    })();

    return () => {
      isMounted = false;
      if (socket) socket.disconnect();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !hasProductAccess(user)) {
      setOrderNotifications(0);
      return;
    }
    let mounted = true;
    const ordersKey = `aa_orders_last_seen_${user.id}`;

    const fetchOrderNotifications = async () => {
      try {
        const since =
          typeof window !== 'undefined' && localStorage.getItem(ordersKey)
            ? localStorage.getItem(ordersKey)
            : '1970-01-01T00:00:00.000Z';
        const response = await fetch(`/api/orders/count?since=${encodeURIComponent(since)}`, {
          credentials: 'include',
        });
        const data = await response.json();
        if (!mounted) return;
        setOrderNotifications(Math.max(0, Number(data?.count || 0)));
      } catch (error) {
        if (mounted) setOrderNotifications(0);
      }
    };

    fetchOrderNotifications();
    const handler = () => fetchOrderNotifications();
    window.addEventListener('aa-badge-refresh', handler);
    const timer = setInterval(fetchOrderNotifications, 30000);
    return () => {
      mounted = false;
      window.removeEventListener('aa-badge-refresh', handler);
      clearInterval(timer);
    };
  }, [user?.id, user?.business_type, user?.admin_tier]);

  return (
    <nav
      className="sticky top-0 z-40 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-4 lg:px-6 py-2 min-h-16"
      data-testid="navbar"
    >
      {/* Left: Menu + Search */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          type="button"
          aria-label="Open sidebar"
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
          data-testid="sidebar-open-btn"
        >
          <FontAwesomeIcon icon={faBars} className="text-aa-gray" style={{ fontSize: 22 }} />
        </button>
        <div className="hidden sm:block flex-1 max-w-2xl">
          <div className="relative">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-aa-gray"
              style={{ fontSize: 18 }}
            />
            <input
              type="text"
              placeholder="Search contacts, leads, messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border-2 border-gray-200 rounded-lg outline-none focus:border-aa-orange"
              data-testid="navbar-search"
            />
          </div>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-2 sm:gap-3 ml-2 sm:ml-4">
        {/* WhatsApp Status */}
        <div 
          className={`hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg ${
            whatsappConnected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
          data-testid="whatsapp-status"
        >
          {whatsappConnected ? (
            <FontAwesomeIcon icon={faWifi} style={{ fontSize: 16 }} />
          ) : (
            <FontAwesomeIcon icon={faBan} style={{ fontSize: 16 }} />
          )}
          <span className="text-sm font-semibold">
            {whatsappConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Notifications */}
        <button className="relative p-2 hover:bg-gray-100 rounded-lg" data-testid="notification-btn">
          <FontAwesomeIcon icon={faBell} className="text-aa-gray" style={{ fontSize: 22 }} />
          {orderNotifications > 0 && (
            <span className="absolute top-0 right-0 w-5 h-5 bg-aa-orange text-white text-xs flex items-center justify-center rounded-full">
              {orderNotifications}
            </span>
          )}
        </button>

        {user && (
          <div className="hidden md:flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-aa-dark-blue">{user.name}</p>
              <p className="text-xs text-aa-gray">
                {user.admin_tier === 'super_admin' ? 'Super Admin' : 'Admin'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100"
              aria-label="Logout"
            >
              <FontAwesomeIcon icon={faRightFromBracket} className="text-aa-gray" style={{ fontSize: 18 }} />
            </button>
          </div>
        )}
        {user && (
          <button
            type="button"
            onClick={handleLogout}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 md:hidden"
            aria-label="Logout"
          >
            <FontAwesomeIcon icon={faRightFromBracket} className="text-aa-gray" style={{ fontSize: 18 }} />
          </button>
        )}
      </div>
    </nav>
  );
}

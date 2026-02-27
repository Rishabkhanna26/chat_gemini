'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { isPathAllowed, PUBLIC_PATHS } from '../../../lib/access.js';
import {
  applyAccentColor,
  getStoredAccentColor,
  DEFAULT_ACCENT_COLOR,
  applyTheme,
  getStoredTheme,
  DEFAULT_THEME,
} from '../../../lib/appearance.js';

export default function MainLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, loading } = useAuth();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const storedAccent = getStoredAccentColor();
    applyAccentColor(storedAccent || DEFAULT_ACCENT_COLOR);
    const storedTheme = getStoredTheme(user?.id);
    applyTheme(storedTheme || DEFAULT_THEME);
  }, [user?.id]);

  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (isPublic) return;
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (!isPathAllowed(user.admin_tier, pathname)) {
      router.push('/dashboard');
    }
  }, [isPublic, loading, user, pathname, router]);

  useEffect(() => {
    if (isPublic) return;
    if (!user?.id) return;
    if (typeof window === 'undefined') return;
    const now = new Date().toISOString();
    const inboxKey = `aa_inbox_last_seen_${user.id}`;
    const ordersKey = `aa_orders_last_seen_${user.id}`;
    let updated = false;

    if (pathname === '/inbox') {
      localStorage.setItem(inboxKey, now);
      updated = true;
    }

    if (pathname === '/orders') {
      localStorage.setItem(ordersKey, now);
      updated = true;
    }

    if (updated) {
      window.dispatchEvent(new Event('aa-badge-refresh'));
    }
  }, [isPublic, pathname, user?.id]);

  // Login/signup pages should NOT show sidebar/navbar
  if (isPublic) {
    return <>{children}</>;
  }

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-aa-light-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-aa-orange mx-auto mb-4"></div>
          <p className="text-gray-600">Checking access...</p>
        </div>
      </div>
    );
  }

  // Normal layout
  const desktopOffset = sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64';

  return (
    <div className="min-h-screen bg-aa-light-bg overflow-x-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
        />
      )}
      <div className={`flex min-h-screen flex-col ${desktopOffset}`}>
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-3 sm:p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

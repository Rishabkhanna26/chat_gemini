'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './components/auth/AuthProvider.jsx';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.push(user ? '/dashboard' : '/login');
  }, [router, user, loading]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-aa-light-bg">
      <p className="text-aa-gray">Loading...</p>
    </div>
  );
}

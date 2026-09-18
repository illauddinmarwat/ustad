'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Sidebar } from '@/components/Sidebar';
import { useAdminAuth } from '@/lib/useAdminAuth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { loading, session, isAdmin } = useAdminAuth();

  useEffect(() => {
    if (!loading && (!session || !isAdmin)) router.replace('/login');
  }, [loading, session, isAdmin, router]);

  if (loading || !session || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">
        {loading ? 'Loading…' : 'Redirecting…'}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}

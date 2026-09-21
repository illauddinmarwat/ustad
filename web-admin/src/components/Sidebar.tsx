'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useAdminAuth } from '@/lib/useAdminAuth';

const NAV = [
  { href: '/approvals', label: 'Approvals', icon: '✅' },
  { href: '/jobs', label: 'Job Activity', icon: '🧾' },
  { href: '/payments', label: 'Payments', icon: '💳' },
  { href: '/hisab', label: 'Hisab (dues)', icon: '📒' },
  { href: '/moderation', label: 'Posted jobs', icon: '🛡️' },
  { href: '/commissions', label: 'Commissions', icon: '📊' },
  { href: '/reports', label: 'Reports', icon: '📈' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { displayName, signOut } = useAdminAuth();

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-primary-deep text-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-lg">🎓</div>
        <div>
          <div className="text-base font-bold leading-tight">Ustad</div>
          <div className="text-[11px] text-white/70">استاد — Admin</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? 'bg-white text-primary-deep' : 'text-white/85 hover:bg-white/10'
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <div className="mb-2 truncate px-1 text-xs text-white/70">{displayName ?? 'Admin'}</div>
        <button
          onClick={async () => {
            await signOut();
            router.replace('/login');
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10"
        >
          <span aria-hidden>🚪</span>
          Logout
        </button>
      </div>
    </aside>
  );
}

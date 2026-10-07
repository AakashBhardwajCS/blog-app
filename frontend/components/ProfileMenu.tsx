'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Building2, LogOut, PenSquare, UserRound } from 'lucide-react';
import { signOut } from '../lib/auth';
import { departmentLabel } from '../lib/departments';
import type { User } from '../lib/types';
import { Avatar } from './Avatar';

/** Avatar button in the header's top-right corner that opens an account menu. */
export function ProfileMenu({ user }: { user: User }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100';

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open profile menu"
        className="flex rounded-full ring-offset-2 transition hover:ring-2 hover:ring-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Avatar size={36} user={user} />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10" role="menu">
          <div className="flex items-center gap-3 border-b border-slate-100 px-3 pb-3 pt-2">
            <Avatar size={40} user={user} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
              <p className="truncate text-xs text-slate-500">
                {[user.role, user.department && departmentLabel(user.department)].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <div className="pt-2">
            <Link className={item} href="/profile" onClick={() => setOpen(false)} role="menuitem">
              <UserRound size={16} /> Your profile
            </Link>
            <Link className={item} href="/dashboard" onClick={() => setOpen(false)} role="menuitem">
              <PenSquare size={16} /> Your writing
            </Link>
            <Link className={item} href="/organization" onClick={() => setOpen(false)} role="menuitem">
              <Building2 size={16} />
              <span className="min-w-0 flex-1 truncate">{user.tenant?.name ?? 'Organization'}</span>
            </Link>
            <button
              className={`${item} text-red-600 hover:bg-red-50`}
              onClick={() => {
                signOut();
                window.location.href = '/';
              }}
              role="menuitem"
              type="button"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

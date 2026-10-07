'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { authChangeEvent, getStoredUser, storeUser, syncTokenCookie } from '../lib/auth';
import type { User } from '../lib/types';
import { ProfileMenu } from './ProfileMenu';
import Image from "next/image";

export function Header(): React.ReactElement {
  const router = useRouter();
  // null until mounted / when signed out; refreshed on sign-in, sign-out and profile edits.
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const updateLoginState = (): void => {
      setUser(getStoredUser());
    };

    updateLoginState();
    // Older sessions have no token cookie, so server-rendered pages saw them as signed out.
    if (syncTokenCookie()) router.refresh();
    // The stored user can be stale (older sessions lack role/department/avatar/organization), so refresh it once.
    if (getStoredUser()) {
      api<User>('/profile')
        .then(storeUser)
        .catch(() => undefined);
    }
    window.addEventListener(authChangeEvent, updateLoginState);
    window.addEventListener('storage', updateLoginState);

    return () => {
      window.removeEventListener(authChangeEvent, updateLoginState);
      window.removeEventListener('storage', updateLoginState);
    };
  }, []);

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link
          className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900"
          href="/"
        >
        <span className="flex h-8 w-8 items-center justify-center">
          <Image
            src="/crownstack_logo.jpeg"
            alt="CrownStack"
            width={32}
            height={32}
            className="object-contain"
          />
        </span>
          CrownStack Knowledge Hub
        </Link>
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <Link className="hidden hover:text-brand sm:block" href="/">
            Explore
          </Link>
          {user ? (
            <>
              <Link className="hover:text-brand" href="/dashboard">
                Dashboard
              </Link>
              <Link className="hover:text-brand" href="/assistant">
                Write with AI
              </Link>
              <ProfileMenu user={user} />
            </>
          ) : (
            <>
              <Link className="hover:text-brand" href="/login">
                Sign in
              </Link>
              <Link
                className="rounded-lg bg-brand px-3.5 py-2 text-white shadow-sm transition hover:bg-brand-dark"
                href="/register"
              >
                Start writing
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

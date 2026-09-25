'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authChangeEvent, notifyAuthChange } from '../lib/auth';
import Image from "next/image";

export function Header(): React.ReactElement {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const updateLoginState = (): void => {
      setLoggedIn(Boolean(localStorage.getItem('blog_token')));
    };

    updateLoginState();
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
          {loggedIn ? (
            <>
              <Link className="hover:text-brand" href="/dashboard">
                Dashboard
              </Link>
              <Link className="hover:text-brand" href="/assistant">
                Assistant
              </Link>
              <button
                className="rounded-lg px-3 py-2 hover:bg-slate-100"
                onClick={() => {
                  localStorage.removeItem('blog_token');
                  localStorage.removeItem('blog_user');
                  notifyAuthChange();
                  window.location.href = '/';
                }}
              >
                Sign out
              </button>
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

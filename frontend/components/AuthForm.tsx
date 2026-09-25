'use client';
import { SubmitEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../lib/api';
import { notifyAuthChange } from '../lib/auth';
import { Session } from '../lib/types';

export function AuthForm({ mode }: { mode: 'login' | 'register' }): React.ReactElement {
  const router = useRouter();

  const [error, setError] = useState('');

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');

    const data = new FormData(event.currentTarget);

    const body = {
      email: String(data.get('email')),
      password: String(data.get('password')),
      ...(mode === 'register' ? { name: String(data.get('name')) } : {}),
    };

    try {
      const session = await api<Session>(`/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      localStorage.setItem('blog_token', session.token);
      localStorage.setItem('blog_user', JSON.stringify(session.user));
      notifyAuthChange();

      router.push('/dashboard');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in');
    }
  }

  const input =
    'mt-1 w-full rounded-lg border bg-white px-3 py-2.5 outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20';

  return (
    <form
      className="mx-auto max-w-md rounded-2xl border bg-white p-7 shadow-sm sm:p-9"
      onSubmit={submit}
    >
      <p className="text-sm font-semibold uppercase tracking-[.15em] text-brand">CrownStack Blog</p>
      <h1 className="mt-2 text-2xl">{mode === 'login' ? 'Welcome back' : 'Start writing'}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {mode === 'login'
          ? 'Sign in to manage your stories.'
          : 'Create your author account in seconds.'}
      </p>
      <div className="mt-7 space-y-4">
        {mode === 'register' && (
          <label className="block text-sm font-medium text-slate-700" htmlFor="name">
            Name
            <input className={input} id="name" name="name" required minLength={2} />
          </label>
        )}
        <label className="block text-sm font-medium text-slate-700" htmlFor="email">
          Email
          <input className={input} id="email" name="email" type="email" required />
        </label>
        <label className="block text-sm font-medium text-slate-700" htmlFor="password">
          Password
          <input
            className={input}
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
          />
        </label>
      </div>
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button
        className="mt-6 w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-dark"
        type="submit"
      >
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
      <p className="mt-5 text-center text-sm text-slate-500">
        {mode === 'login' ? (
          <>
            No account?{' '}
            <Link className="font-semibold text-brand hover:underline" href="/register">
              Register
            </Link>
          </>
        ) : (
          <>
            Already registered?{' '}
            <Link className="font-semibold text-brand hover:underline" href="/login">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

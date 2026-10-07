'use client';
import { SubmitEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { storeSession } from '../lib/auth';
import { departmentLabel, departments, roleSuggestions } from '../lib/departments';
import { InvitePreview, OrgRole, Session } from '../lib/types';

const orgRoleLabel: Record<OrgRole, string> = { OWNER: 'an owner', ADMIN: 'an admin', MEMBER: 'a member' };

/** Where to go after signing in: a same-site path from `?next=`, otherwise the dashboard. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export function AuthForm({ mode }: { mode: 'login' | 'register' }): React.ReactElement {
  const router = useRouter();

  const [error, setError] = useState('');
  // Register: the invite being redeemed (from `?invite=` or typed in), and what it joins.
  const [inviteCode, setInviteCode] = useState('');
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [showInviteInput, setShowInviteInput] = useState(false);
  // Login: only needed when the same email is registered in more than one organization.
  const [showOrganization, setShowOrganization] = useState(false);

  useEffect(() => {
    if (mode !== 'register') return;
    const code = new URLSearchParams(window.location.search).get('invite');
    if (code) void checkInvite(code);
  }, [mode]);

  async function checkInvite(code: string): Promise<void> {
    const trimmed = code.trim();
    setInviteCode(trimmed);
    setInvite(null);
    setError('');
    if (!trimmed) return;
    try {
      setInvite(await api<InvitePreview>(`/invites/${encodeURIComponent(trimmed)}`));
      setShowInviteInput(false);
    } catch (cause: unknown) {
      setShowInviteInput(true);
      setError(cause instanceof Error ? cause.message : 'This invite is invalid or has expired');
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');

    const data = new FormData(event.currentTarget);
    const text = (name: string): string | undefined => String(data.get(name) ?? '').trim() || undefined;

    const body = {
      email: String(data.get('email')),
      password: String(data.get('password')),
      ...(mode === 'register'
        ? {
            name: String(data.get('name')),
            department: String(data.get('department')),
            role: String(data.get('role')),
            ...(invite ? { inviteCode } : { tenantName: text('tenantName') }),
          }
        : { tenantSlug: text('tenantSlug')?.toLowerCase() }),
    };

    try {
      const session = await api<Session>(`/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      storeSession(session);
      router.push(nextPath());
      router.refresh();
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : 'Unable to sign in';
      if (mode === 'login' && message.includes('more than one organization')) setShowOrganization(true);
      setError(message);
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
      <h1 className="mt-2 text-2xl">{mode === 'login' ? 'Welcome back' : invite ? `Join ${invite.organization}` : 'Start writing'}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {mode === 'login'
          ? 'Sign in to read and write for your organization.'
          : invite
            ? 'Create your account to start reading and writing with your team.'
            : 'Create an account and a new organization for your team.'}
      </p>
      {mode === 'register' && invite && (
        <p className="mt-5 flex items-start gap-2.5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          <Users className="mt-0.5 shrink-0" size={16} />
          <span>
            You&apos;re joining <strong>{invite.organization}</strong> as {orgRoleLabel[invite.role]}.{' '}
            <button
              className="font-medium underline"
              onClick={() => {
                setInvite(null);
                setInviteCode('');
              }}
              type="button"
            >
              Create a new organization instead
            </button>
          </span>
        </p>
      )}
      <div className="mt-7 space-y-4">
        {mode === 'register' && (
          <label className="block text-sm font-medium text-slate-700" htmlFor="name">
            Name
            <input className={input} id="name" name="name" required minLength={2} />
          </label>
        )}
        {mode === 'register' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="department">
              Department
              <select className={input} defaultValue="" id="department" name="department" required>
                <option disabled value="">
                  Select…
                </option>
                {departments.map((department) => (
                  <option key={department} value={department}>
                    {departmentLabel(department)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700" htmlFor="role">
              Role
              {/* Free text with suggestions: pick one or type any title. */}
              <input className={input} id="role" list="role-suggestions" maxLength={60} minLength={2} name="role" placeholder="e.g. Engineer" required />
              <datalist id="role-suggestions">
                {roleSuggestions.map((role) => (
                  <option key={role} value={role} />
                ))}
              </datalist>
            </label>
          </div>
        )}
        <label className="block text-sm font-medium text-slate-700" htmlFor="email">
          Email
          {/* An invite issued for one address can only be redeemed with it. */}
          <input
            className={`${input} read-only:bg-slate-50 read-only:text-slate-500`}
            defaultValue={invite?.email ?? undefined}
            id="email"
            key={invite?.email ?? 'email'}
            name="email"
            readOnly={Boolean(invite?.email)}
            required
            type="email"
          />
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
        {mode === 'register' && !invite && (
          <label className="block text-sm font-medium text-slate-700" htmlFor="tenantName">
            Organization name <span className="font-normal text-slate-400">(optional)</span>
            <input className={input} id="tenantName" maxLength={60} minLength={2} name="tenantName" placeholder="e.g. CrownStack" />
            <span className="mt-1 block text-xs font-normal text-slate-500">You&apos;ll be its owner and can invite your team.</span>
          </label>
        )}
        {mode === 'register' && !invite && (
          showInviteInput ? (
            <div className="text-sm font-medium text-slate-700">
              <label htmlFor="inviteCode">Invite code</label>
              <div className="mt-1 flex gap-2">
                <input className={`${input} mt-0`} defaultValue={inviteCode} id="inviteCode" name="inviteCode" placeholder="Paste your invite code" />
                <button
                  className="shrink-0 rounded-lg border px-3 text-sm font-semibold text-slate-700 hover:border-brand hover:text-brand"
                  onClick={(event) => void checkInvite((event.currentTarget.previousElementSibling as HTMLInputElement).value)}
                  type="button"
                >
                  Apply
                </button>
              </div>
            </div>
          ) : (
            <button className="text-sm font-medium text-brand hover:underline" onClick={() => setShowInviteInput(true)} type="button">
              Have an invite code?
            </button>
          )
        )}
        {mode === 'login' && (
          showOrganization ? (
            <label className="block text-sm font-medium text-slate-700" htmlFor="tenantSlug">
              Organization
              <span className="relative block">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input className={`${input} pl-9`} id="tenantSlug" name="tenantSlug" pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*" placeholder="organization-slug" required />
              </span>
              <span className="mt-1 block text-xs font-normal text-slate-500">The short name in your organization settings, e.g. crownstack.</span>
            </label>
          ) : null
        )}
      </div>
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button
        className="mt-6 w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-dark"
        type="submit"
      >
        {mode === 'login' ? 'Sign in' : invite ? `Join ${invite.organization}` : 'Create account'}
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

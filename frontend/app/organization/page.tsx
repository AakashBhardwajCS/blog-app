'use client';

import { SubmitEvent, useEffect, useState } from 'react';
import { Check, Copy, LoaderCircle, Pencil, RotateCcw, UserMinus, X } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { api } from '../../lib/api';
import { getStoredUser, isOrgAdmin, storeUser } from '../../lib/auth';
import { departmentLabel } from '../../lib/departments';
import type { Invite, Member, Organization, OrgRole, User } from '../../lib/types';

const inputStyle =
  'mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20';
const roleLabel: Record<OrgRole, string> = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member' };
const roleBadge: Record<OrgRole, string> = {
  OWNER: 'bg-amber-50 text-amber-800',
  ADMIN: 'bg-sky-50 text-sky-700',
  MEMBER: 'bg-slate-100 text-slate-600',
};

function inviteLink(code: string): string {
  return `${window.location.origin}/register?invite=${encodeURIComponent(code)}`;
}

function isUsable(invite: Invite): boolean {
  return !invite.revokedAt && new Date(invite.expiresAt) > new Date() && (invite.maxUses === null || invite.uses < invite.maxUses);
}

export default function OrganizationPage(): React.ReactElement {
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const canManage = isOrgAdmin(org?.myRole);
  const isOwner = org?.myRole === 'OWNER';

  useEffect(() => {
    if (!localStorage.getItem('blog_token')) {
      location.href = '/login?next=/organization';
      return;
    }
    setMe(getStoredUser());
    void load();
  }, []);

  async function load(): Promise<void> {
    try {
      const [organization, people] = await Promise.all([api<Organization>('/organization'), api<Member[]>('/organization/members')]);
      setOrg(organization);
      setMembers(people);
      setInvites(isOrgAdmin(organization.myRole) ? await api<Invite[]>('/organization/invites') : []);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not load your organization');
    }
  }

  /** Runs one change, shows its outcome, and refreshes the user in the header (role or org name may have changed). */
  async function run(key: string, action: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await action();
      await load();
      api<User>('/profile').then((user) => { storeUser(user); setMe(user); }).catch(() => undefined);
      setNotice(success);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  function rename(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = editingName?.trim() ?? '';
    void run('rename', () => api('/organization', { method: 'PATCH', body: JSON.stringify({ name }) }), 'Organization renamed').then(() => setEditingName(null));
  }

  function createInvite(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const maxUses = String(data.get('maxUses') ?? '').trim();
    const body = {
      role: String(data.get('role')),
      email: String(data.get('email') ?? '').trim() || undefined,
      expiresInDays: Number(data.get('expiresInDays')),
      ...(maxUses ? { maxUses: Number(maxUses) } : {}),
    };
    void run(
      'invite',
      async () => {
        const invite = await api<Invite>('/organization/invites', { method: 'POST', body: JSON.stringify(body) });
        form.reset();
        await copy(invite);
      },
      'Invite created and link copied to your clipboard',
    );
  }

  async function copy(invite: Invite): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteLink(invite.code));
      setCopied(invite.id);
      setTimeout(() => setCopied((current) => (current === invite.id ? null : current)), 2000);
    } catch {
      window.prompt('Copy this invite link:', inviteLink(invite.code));
    }
  }

  function changeRole(member: Member, orgRole: OrgRole): void {
    if (orgRole === 'OWNER' && !confirm(`Make ${member.name} the owner? You will become an admin.`)) return;
    void run(
      `role-${member.id}`,
      () => api(`/organization/members/${member.id}`, { method: 'PATCH', body: JSON.stringify({ orgRole }) }),
      orgRole === 'OWNER' ? `${member.name} is now the owner` : `${member.name} is now ${orgRole === 'ADMIN' ? 'an admin' : 'a member'}`,
    );
  }

  function canRemove(member: Member): boolean {
    if (member.id === me?.id) return false;
    return isOwner || (org?.myRole === 'ADMIN' && member.orgRole === 'MEMBER');
  }

  if (!org) {
    return (
      <div className="mx-auto max-w-3xl text-sm text-slate-500">
        {error || (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="animate-spin" size={15} /> Loading your organization…
          </span>
        )}
      </div>
    );
  }

  const activeInvites = invites.filter(isUsable);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[.15em] text-brand">Organization</p>
      {editingName !== null ? (
        <form className="mt-2 flex max-w-md items-center gap-2" onSubmit={rename}>
          <input aria-label="Organization name" autoFocus className={`${inputStyle} mt-0 text-lg font-semibold`} maxLength={60} minLength={2} onChange={(event) => setEditingName(event.target.value)} required value={editingName} />
          <button aria-label="Save name" className="rounded-lg bg-brand p-2.5 text-white hover:bg-brand-dark disabled:opacity-50" disabled={busy !== null} type="submit"><Check size={16} /></button>
          <button aria-label="Cancel" className="rounded-lg border p-2.5 text-slate-500 hover:text-slate-800" onClick={() => setEditingName(null)} type="button"><X size={16} /></button>
        </form>
      ) : (
        <h1 className="mt-2 flex items-center gap-3">
          {org.name}
          {canManage && (
            <button aria-label="Rename organization" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand" onClick={() => setEditingName(org.name)} type="button">
              <Pencil size={18} />
            </button>
          )}
        </h1>
      )}
      <p className="mt-2 text-sm text-slate-500">
        <span className="font-mono">{org.slug}</span> · {org.memberCount} active {org.memberCount === 1 ? 'member' : 'members'} · You are{' '}
        {org.myRole === 'OWNER' ? 'the owner' : org.myRole === 'ADMIN' ? 'an admin' : 'a member'}
      </p>

      {error && <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && !error && <p className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}

      {canManage && (
        <section className="mt-7 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Invite people</h2>
          <p className="mt-1 text-sm text-slate-500">Anyone with an invite link can create an account in {org.name}.</p>
          <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={createInvite}>
            <label className="block text-sm font-medium">
              Role
              <select className={inputStyle} defaultValue="MEMBER" name="role">
                <option value="MEMBER">Member</option>
                {isOwner && <option value="ADMIN">Admin</option>}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Only for email <span className="font-normal text-slate-400">(optional)</span>
              <input className={inputStyle} name="email" placeholder="name@company.com" type="email" />
            </label>
            <label className="block text-sm font-medium">
              Expires after
              <select className={inputStyle} defaultValue="7" name="expiresInDays">
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Maximum uses <span className="font-normal text-slate-400">(blank = unlimited)</span>
              <input className={inputStyle} max={1000} min={1} name="maxUses" type="number" />
            </label>
            <div className="sm:col-span-2">
              <button className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50" disabled={busy !== null} type="submit">
                {busy === 'invite' ? 'Creating…' : 'Create invite link'}
              </button>
            </div>
          </form>

          {activeInvites.length > 0 && (
            <ul className="mt-6 divide-y border-t">
              {activeInvites.map((invite) => (
                <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm" key={invite.id}>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge[invite.role]}`}>{roleLabel[invite.role]}</span>
                      {invite.email ?? 'Anyone with the link'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {invite.uses}
                      {invite.maxUses !== null ? ` of ${invite.maxUses}` : ''} used · expires {new Date(invite.expiresAt).toLocaleDateString()} · by {invite.createdBy.name}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-brand hover:text-brand" onClick={() => void copy(invite)} type="button">
                      {copied === invite.id ? <Check size={13} /> : <Copy size={13} />} {copied === invite.id ? 'Copied' : 'Copy link'}
                    </button>
                    <button
                      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                      disabled={busy !== null}
                      onClick={() => void run(`revoke-${invite.id}`, () => api(`/organization/invites/${invite.id}`, { method: 'DELETE' }), 'Invite revoked')}
                      type="button"
                    >
                      <X size={13} /> Revoke
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-5 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Members</h2>
        <ul className="mt-3 divide-y">
          {members.map((member) => (
            <li className={`flex flex-wrap items-center gap-3 py-3 ${member.deactivatedAt ? 'opacity-60' : ''}`} key={member.id}>
              <Avatar size={40} user={member} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {member.name}
                  {member.id === me?.id && <span className="ml-1.5 font-normal text-slate-400">(you)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {member.email} · {member.role} · {departmentLabel(member.department)}
                </p>
              </div>
              {member.deactivatedAt ? (
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">Removed</span>
              ) : isOwner && member.id !== me?.id ? (
                <select
                  aria-label={`Role for ${member.name}`}
                  className="rounded-lg border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-brand"
                  disabled={busy !== null}
                  onChange={(event) => changeRole(member, event.target.value as OrgRole)}
                  value={member.orgRole}
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                  <option value="OWNER">Owner (transfer)</option>
                </select>
              ) : (
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${roleBadge[member.orgRole]}`}>{roleLabel[member.orgRole]}</span>
              )}
              {canRemove(member) &&
                (member.deactivatedAt ? (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-brand hover:text-brand disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => void run(`restore-${member.id}`, () => api(`/organization/members/${member.id}/restore`, { method: 'POST' }), `${member.name} can sign in again`)}
                    type="button"
                  >
                    <RotateCcw size={13} /> Restore
                  </button>
                ) : (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => {
                      if (confirm(`Remove ${member.name}? They will be signed out and can no longer sign in. Their posts and comments stay.`)) {
                        void run(`remove-${member.id}`, () => api(`/organization/members/${member.id}`, { method: 'DELETE' }), `${member.name} was removed`);
                      }
                    }}
                    type="button"
                  >
                    <UserMinus size={13} /> Remove
                  </button>
                ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

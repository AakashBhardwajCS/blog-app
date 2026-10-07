'use client';

import { ChangeEvent, SubmitEvent, useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, Lock, Trash2 } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { api, uploadAvatar } from '../../lib/api';
import { storeUser } from '../../lib/auth';
import { departmentLabel, roleSuggestions } from '../../lib/departments';
import type { User } from '../../lib/types';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // keep in sync with the backend limit
const inputStyle =
  'mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20';
const lockedStyle = `${inputStyle} flex cursor-not-allowed items-center justify-between bg-slate-50 text-slate-500`;

export default function ProfilePage(): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', role: '' });
  const [busy, setBusy] = useState<'save' | 'upload' | 'remove' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!localStorage.getItem('blog_token')) {
      location.href = '/login';
      return;
    }
    api<User>('/profile')
      .then(apply)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load your profile'));
  }, []);

  /** Shows the latest user here and in the header. */
  function apply(next: User): void {
    setUser(next);
    setForm({ name: next.name, role: next.role });
    storeUser(next);
  }

  async function run(kind: 'save' | 'upload' | 'remove', action: () => Promise<User>, success: string): Promise<void> {
    setBusy(kind);
    setError('');
    setNotice('');
    try {
      apply(await action());
      setNotice(success);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow choosing the same file again
    if (!file) return;
    // Quick client-side checks for a friendlier message; the server re-validates.
    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) return setError('Please choose a JPEG, PNG, GIF or WebP image.');
    if (file.size > MAX_AVATAR_BYTES) return setError('That image is too large. Please choose one under 2 MB.');
    void run('upload', () => uploadAvatar(file), 'Profile picture updated');
  }

  function save(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run('save', () => api<User>('/profile', { method: 'PATCH', body: JSON.stringify(form) }), 'Profile saved');
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl text-sm text-slate-500">
        {error || (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="animate-spin" size={15} /> Loading your profile…
          </span>
        )}
      </div>
    );
  }

  const dirty = form.name.trim() !== user.name || form.role.trim() !== user.role;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-[.15em] text-brand">Account</p>
      <h1 className="mt-2">Your profile</h1>

      <section className="mt-7 flex flex-col gap-5 rounded-2xl border bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div className="relative w-fit">
          <Avatar size={96} user={user} />
          {busy === 'upload' && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70">
              <LoaderCircle className="animate-spin text-brand" size={22} />
            </span>
          )}
        </div>
        <div>
          <p className="font-semibold text-slate-900">Profile picture</p>
          <p className="mt-1 text-sm text-slate-500">JPEG, PNG, GIF or WebP, up to 2 MB.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-50"
              disabled={busy !== null}
              onClick={() => fileInput.current?.click()}
              type="button"
            >
              <Camera size={15} /> {user.avatarUrl ? 'Change photo' : 'Upload photo'}
            </button>
            {user.avatarUrl && (
              <button
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-slate-600 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                disabled={busy !== null}
                onClick={() => void run('remove', () => api<User>('/profile/avatar', { method: 'DELETE' }), 'Profile picture removed')}
                type="button"
              >
                <Trash2 size={15} /> Remove
              </button>
            )}
          </div>
          <input accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={onFileChosen} ref={fileInput} type="file" />
        </div>
      </section>

      <form className="mt-5 space-y-4 rounded-2xl border bg-white p-6 shadow-sm" onSubmit={save}>
        <label className="block text-sm font-medium">
          Name
          <input className={inputStyle} maxLength={60} minLength={2} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
        </label>
        <label className="block text-sm font-medium">
          Role
          <input className={inputStyle} list="profile-role-suggestions" maxLength={60} minLength={2} onChange={(event) => setForm({ ...form, role: event.target.value })} required value={form.role} />
          <datalist id="profile-role-suggestions">
            {roleSuggestions.map((role) => (
              <option key={role} value={role} />
            ))}
          </datalist>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="text-sm font-medium">
            Email
            <div aria-readonly="true" className={lockedStyle}>
              <span className="truncate">{user.email}</span>
              <Lock aria-hidden size={14} />
            </div>
          </div>
          <div className="text-sm font-medium">
            Department
            <div aria-readonly="true" className={lockedStyle}>
              {departmentLabel(user.department)}
              <Lock aria-hidden size={14} />
            </div>
          </div>
        </div>

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && !error && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}

        <button
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
          disabled={!dirty || busy !== null}
          type="submit"
        >
          {busy === 'save' ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { authChangeEvent, getStoredUser, isOrgAdmin } from '../lib/auth';
import type { User } from '../lib/types';

/** Delete button for the post's author and for organization owners and admins. */
export function PostActions({ postId, authorId }: { postId: string; authorId: string }): React.ReactElement | null {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const update = (): void => setUser(getStoredUser());
    update();
    window.addEventListener(authChangeEvent, update);
    return () => window.removeEventListener(authChangeEvent, update);
  }, []);

  if (!user || (user.id !== authorId && !isOrgAdmin(user.orgRole))) return null;

  async function remove(): Promise<void> {
    const moderating = user!.id !== authorId;
    if (!confirm(moderating ? 'Delete this post as an organization admin? This cannot be undone.' : 'Delete this post? This cannot be undone.')) return;
    setBusy(true);
    setError('');
    try {
      await api(`/posts/${postId}`, { method: 'DELETE' });
      router.push('/');
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this post');
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-red-200 hover:text-red-600 disabled:opacity-50"
        disabled={busy}
        onClick={() => void remove()}
        type="button"
      >
        <Trash2 size={13} /> Delete post
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

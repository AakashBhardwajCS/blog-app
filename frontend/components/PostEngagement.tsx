'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle, Reply, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { getStoredUser, isOrgAdmin } from '../lib/auth';
import { Comment, Engagement } from '../lib/types';

export function PostEngagement({ slug }: { slug: string }): React.ReactElement {
  const [data, setData] = useState<Engagement | null>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [signInRequired, setSignInRequired] = useState(false);

  const [viewer, setViewer] = useState<{ id: string; canModerate: boolean } | null>(null);

  // The post page is members-only, so the viewer is always signed in here.
  async function load(): Promise<void> {
    try { setData(await api<Engagement>(`/posts/${encodeURIComponent(slug)}/engagement`)); }
    catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to load comments.');
    }
  }
  useEffect(() => {
    const user = getStoredUser();
    setViewer(user ? { id: user.id, canModerate: isOrgAdmin(user.orgRole) } : null);
    void load();
  }, [slug]);

  async function removeComment(id: string): Promise<void> {
    if (!confirm('Delete this comment and its replies?')) return;
    try { await api(`/posts/${encodeURIComponent(slug)}/comments/${id}`, { method: 'DELETE' }); await load(); }
    catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete this comment.');
    }
  }

  async function like(): Promise<void> {
    if (!localStorage.getItem('blog_token')) {
      setError('Sign in to like this article.');
      setSignInRequired(true);
      return;
    }
    try { await api(`/posts/${encodeURIComponent(slug)}/like`, { method: 'POST' }); await load(); }
    catch (cause: unknown) {
      const unauthorized = cause instanceof Error && cause.message === 'Unauthorized';
      setError(unauthorized ? 'Your session may have expired.' : cause instanceof Error ? cause.message : 'Unable to like this article.');
      setSignInRequired(unauthorized);
    }
  }
  async function comment(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!text.trim()) return;
    if (!localStorage.getItem('blog_token')) {
      setError('Sign in to comment.');
      setSignInRequired(true);
      return;
    }
    try { await api(`/posts/${encodeURIComponent(slug)}/comments`, { method: 'POST', body: JSON.stringify({ content: text, parentId: replyTo }) }); setText(''); setReplyTo(null); await load(); }
    catch (cause: unknown) {
      const unauthorized = cause instanceof Error && cause.message === 'Unauthorized';
      setError(unauthorized ? 'Your session may have expired.' : cause instanceof Error ? cause.message : 'Unable to post this comment.');
      setSignInRequired(unauthorized);
    }
  }
  const renderComment = (item: Comment): React.ReactElement => (
    <div className="border-l-2 border-slate-200 pl-4" key={item.id}>
      <p className="text-sm font-semibold text-slate-800">{item.user.name}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.content}</p>
      <div className="mt-2 flex gap-4">
        <button className="inline-flex items-center gap-1 text-xs font-medium text-brand" onClick={() => setReplyTo(item.id)} type="button"><Reply size={12} /> Reply</button>
        {viewer && (viewer.id === item.user.id || viewer.canModerate) && (
          <button className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-600" onClick={() => void removeComment(item.id)} type="button"><Trash2 size={12} /> Delete</button>
        )}
      </div>
      {item.replies?.length > 0 && <div className="mt-3 space-y-3">{item.replies.map(renderComment)}</div>}
    </div>
  );
  return (
    <section className="mt-10 border-t pt-8">
      <div className="flex items-center gap-5 text-sm text-slate-600">
        <button className={`inline-flex items-center gap-2 ${data?.liked ? 'text-rose-600' : 'hover:text-rose-600'}`} onClick={() => void like()} type="button"><Heart size={18} fill={data?.liked ? 'currentColor' : 'none'} /> {data?.likes ?? 0} likes</button>
        <span className="inline-flex items-center gap-2"><MessageCircle size={18} /> {data?.comments.length ?? 0} comments</span>
      </div>
      <form className="mt-6 flex gap-3" onSubmit={(event) => void comment(event)}>
        <textarea className="min-h-12 flex-1 rounded-xl border bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand" onChange={(event) => setText(event.target.value)} placeholder={replyTo ? 'Write a reply...' : 'Add a comment...'} value={text} />
        <button className="self-end rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white" type="submit">Post</button>
      </form>
      {replyTo && <button className="mt-2 text-xs text-slate-500" onClick={() => setReplyTo(null)} type="button">Cancel reply</button>}
      {error && <p className="mt-3 text-sm text-rose-600">{error}{signInRequired && <> <Link className="font-semibold underline" href="/login">Sign in</Link></>}</p>}
      <div className="mt-6 space-y-5">{data?.comments.map(renderComment)}</div>
    </section>
  );
}
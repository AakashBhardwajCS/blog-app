'use client';

import { SubmitEvent, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Post } from '../../lib/types';

type Draft = { title: string; excerpt: string; content: string; tags: string; published: boolean };

const initial: Draft = { title: '', excerpt: '', content: '', tags: '', published: false };

const inputStyle =
  'mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20';

export default function Dashboard(): React.ReactElement {
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async (): Promise<void> => {
    try {
      setPosts(await api<Post[]>('/posts/mine/list'));
    } catch {
      location.href = '/login';
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const field = (key: keyof Omit<Draft, 'published'>) => ({
    value: draft[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft({ ...draft, [key]: event.target.value }),
  });

  async function save(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');

    const body = {
      ...draft,
      tags: draft.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    };

    try {
      await api<Post>(editing ? `/posts/${editing}` : '/posts', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });

      setDraft(initial);
      setEditing(null);
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not save post');
    }
  }

  async function remove(id: string): Promise<void> {
    if (confirm('Delete this post?')) {
      await api<{ success: boolean }>(`/posts/${id}`, { method: 'DELETE' });
      await load();
    }
  }

  function edit(post: Post): void {
    setEditing(post.id);
    setDraft({
      title: post.title,
      excerpt: post.excerpt ?? '',
      content: post.content,
      tags: post.tags.join(', '),
      published: post.published,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section>
        <div className="mb-7">
          <p className="text-sm font-semibold uppercase tracking-[.15em] text-brand">
            Author studio
          </p>
          <h1 className="mt-2">Your writing</h1>
          <p className="mt-2 text-slate-600">
            Create drafts, publish stories, and keep your work organized.
          </p>
        </div>
        <form className="rounded-2xl border bg-white p-6 shadow-sm" onSubmit={save}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold">{editing ? 'Edit post' : 'New post'}</h2>
            {editing && (
              <button
                type="button"
                className="text-sm font-medium text-slate-500 hover:text-slate-900"
                onClick={() => {
                  setEditing(null);
                  setDraft(initial);
                }}
              >
                Cancel
              </button>
            )}
          </div>
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-medium">
              Title
              <input className={inputStyle} required {...field('title')} />
            </label>
            <label className="block text-sm font-medium">
              Excerpt
              <input
                className={inputStyle}
                {...field('excerpt')}
                placeholder="A short introduction to the post"
              />
            </label>
            <label className="block text-sm font-medium">
              Tags
              <input
                className={inputStyle}
                {...field('tags')}
                placeholder="design, technology, ideas"
              />
            </label>
            <label className="block text-sm font-medium">
              Content
              <textarea
                className={`${inputStyle} min-h-52 resize-y`}
                required
                {...field('content')}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                className="size-4 rounded border-slate-300 text-brand focus:ring-brand"
                type="checkbox"
                checked={draft.published}
                onChange={(event) => setDraft({ ...draft, published: event.target.checked })}
              />
              Publish now
            </label>
          </div>
          {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark">
            <Plus size={16} />
            {editing ? 'Save changes' : 'Save post'}
          </button>
        </form>
      </section>
      <aside className="lg:pt-[71px]">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">Your posts</h2>
          <p className="mt-1 text-sm text-slate-500">
            {posts.length} {posts.length === 1 ? 'story' : 'stories'} in your library
          </p>
          <div className="mt-5 space-y-3">
            {posts.length === 0 && (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                Your saved posts will appear here.
              </p>
            )}
            {posts.map((post) => (
              <article className="rounded-xl border p-4" key={post.id}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold leading-5 text-slate-900">{post.title}</h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${post.published ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                  >
                    {post.published ? 'Live' : 'Draft'}
                  </span>
                </div>
                <div className="mt-3 flex gap-3">
                  <button
                    className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-dark"
                    onClick={() => edit(post)}
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button
                    className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-red-600"
                    onClick={() => void remove(post.id)}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}


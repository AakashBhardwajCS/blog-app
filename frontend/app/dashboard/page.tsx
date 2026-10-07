'use client';

import { ChangeEvent, SubmitEvent, useEffect, useState } from 'react';
import { Lock, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { api, uploadImage } from '../../lib/api';
import { Department, departmentLabel, departments } from '../../lib/departments';
import { Post, Session } from '../../lib/types';

type Draft = { title: string; excerpt: string; content: string; department: Department; published: boolean };

/** New posts are locked to the signed-in user's department (shown read-only, enforced by the API). */
function initialDraft(): Draft {
  let department: Department = 'ENGINEERING';
  try {
    const user = JSON.parse(localStorage.getItem('blog_user') ?? '{}') as Partial<Session['user']>;
    if (user.department && departments.includes(user.department)) department = user.department;
  } catch {
    // Missing or malformed session: keep the fallback.
  }
  return { title: '', excerpt: '', content: '', department, published: false };
}

const inputStyle =
  'mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20';

export default function Dashboard(): React.ReactElement {
  const [posts, setPosts] = useState<Post[]>([]);
  // Start with a fixed default so server and client render the same markup; the session's
  // department is applied after mount (localStorage only exists in the browser).
  const [draft, setDraft] = useState<Draft>({ title: '', excerpt: '', content: '', department: 'ENGINEERING', published: false });
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = async (): Promise<Post[]> => {
    const token = typeof window === 'undefined' ? null : localStorage.getItem('blog_token');
    if (!token) {
      location.href = '/login';
      return [];
    }

    try {
      const mine = await api<Post[]>('/posts/mine/list');
      setPosts(mine);
      return mine;
    } catch (cause: unknown) {
      if (!localStorage.getItem('blog_token')) {
        location.href = '/login';
        return [];
      }
      setError(cause instanceof Error ? cause.message : 'Could not load your posts');
      return [];
    }
  };

  useEffect(() => {
    setDraft(initialDraft());
    // "Edit" in Write with AI links here as /dashboard?edit=<postId>.
    const editId = new URLSearchParams(window.location.search).get('edit');
    void load().then((mine) => {
      const post = editId ? mine.find((item) => item.id === editId) : undefined;
      if (post) edit(post);
      else if (editId) setError('That post could not be found in your library');
    });
  }, []);

  const field = (key: keyof Omit<Draft, 'published' | 'department'>) => ({
    value: draft[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft({ ...draft, [key]: event.target.value }),
  });

  async function save(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');

    // Department is display-only: the API files the post under the author's department and rejects the field.
    const { department: _department, ...body } = draft;

    try {
      await api<Post>(editing ? `/posts/${editing}` : '/posts', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });

      setDraft(initialDraft());
      setEditing(null);
      setNotice(editing ? (body.published ? 'Article published' : 'Article edited') : 'Article saved');
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not save post');
    }
  }

  async function uploadInlineImage(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError('');
      const result = await uploadImage(file);
      const snippet = `\n\n<figure class="my-6 text-center">\n  <img src="${result.url}" alt="${file.name}" style="max-width:100%; border-radius: 12px;" />\n</figure>\n\n`;
      setDraft((current) => ({ ...current, content: `${current.content.trim()}${current.content.trim() ? '\n\n' : ''}${snippet}` }));
      setNotice('Image uploaded and inserted into your article');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not upload image');
    } finally {
      event.target.value = '';
      setUploading(false);
    }
  }

  async function remove(id: string): Promise<void> {
    if (confirm('Delete this post?')) {
      await api<{ success: boolean }>(`/posts/${id}`, { method: 'DELETE' });
      setNotice('Article deleted');
      await load();
    }
  }

  function edit(post: Post): void {
    setEditing(post.id);
    setDraft({
      title: post.title,
      excerpt: post.excerpt ?? '',
      content: post.content,
      department: post.department,
      published: post.published,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      {notice && (
        <div className="fixed right-5 top-5 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-lg" role="status">
          {notice}
          <button className="ml-4 text-emerald-600" onClick={() => setNotice('')} type="button">Dismiss</button>
        </div>
      )}
      <section>
        <div className="mb-7">
          <p className="text-sm font-semibold uppercase tracking-[.15em] text-brand">
            Author studio
          </p>
          <h1 className="mt-2">Your writing</h1>
          <p className="mt-2 text-slate-600">
            Create drafts, publish articles, and keep your work organized.
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
                  setDraft(initialDraft());
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
              Department
              <div className={`${inputStyle} flex cursor-not-allowed items-center justify-between bg-slate-50 text-slate-500`} aria-readonly="true">
                {departmentLabel(draft.department)}
                <Lock aria-hidden size={14} />
              </div>
              <span className="mt-1 block text-xs font-normal text-slate-500">Articles are filed under your department.</span>
            </label>
            <label className="block text-sm font-medium">
              Content
              <textarea
                className={`${inputStyle} min-h-52 resize-y`}
                required
                {...field('content')}
              />
            </label>
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Inline image support</p>
                  <p className="mt-1 text-xs text-slate-500">Upload an image and it will be inserted as HTML inside the article body.</p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-50" htmlFor="inline-image-upload">
                  <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload image'}
                </label>
              </div>
              <input accept="image/*" className="hidden" disabled={uploading} id="inline-image-upload" onChange={(event) => void uploadInlineImage(event)} type="file" />
              <p className="mt-2 text-[11px] text-slate-500">Tip: place the image where you want it to sit in the text, for example after a paragraph and before the next section.</p>
            </div>
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


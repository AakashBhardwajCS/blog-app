import Link from 'next/link';
import { getPosts } from '../lib/api';

export default async function Home(): Promise<React.ReactElement> {
  const { items } = await getPosts();

  return (
    <>
      <section className="mb-10 max-w-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[.18em] text-brand">
          Ideas, insights, and knowledge from across CrownStack
        </p>
        <h1>Ideas, insights, and everything in between.</h1>
        <p className="mt-4 text-lg text-slate-600">A space for teams to share findings, best practices, technical insights, and ideas.</p>
      </section>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-slate-500">
          No published posts yet. Create an account and write the first one.
        </div>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((post) => (
            <article
              className="group rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              key={post.id}
            >
              <p className="text-sm text-slate-500">
                By {post.author.name} · {new Date(post.createdAt).toLocaleDateString()}
              </p>
              <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-900 group-hover:text-brand">
                <Link href={`/posts/${post.slug}`}>{post.title}</Link>
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {post.excerpt ?? post.content.slice(0, 150)}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span
                    className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

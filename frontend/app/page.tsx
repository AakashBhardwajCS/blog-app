import Link from 'next/link';
import { Sparkles, Type } from 'lucide-react';
import type { PostSearchHit } from '../lib/types';
import { ApiError, getPosts, searchPosts } from '../lib/api';
import { getServerToken } from '../lib/server-auth';
import { Department, departmentLabel, departments } from '../lib/departments';
import { PostSearchBar } from '../components/PostSearchBar';

type Card = {
  id: string;
  slug: string;
  title: string;
  authorName: string;
  createdAt: string;
  department: Department;
  text: string;
  /** Search-only fields: why and how well the post matched. */
  passage?: PostSearchHit['passage'];
  section?: string | null;
  matchedBy?: PostSearchHit['matchedBy'];
  meaning?: PostSearchHit['meaning'];
};

const meaningCopy: Record<NonNullable<PostSearchHit['meaning']>, string> = {
  strong: 'Strong match in meaning',
  close: 'Close in meaning',
  related: 'Related in meaning',
};

/** Wraps words in `text` that start with any search term in <mark>, mirroring the backend's prefix matching. */
function Highlighted({ text, terms }: { text: string; terms: string[] }): React.ReactElement {
  if (terms.length === 0) return <>{text}</>;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b((?:${escaped.join('|')})[\\p{L}\\p{N}]*)`, 'giu');
  return (
    <>
      {text.split(pattern).map((part, index) =>
        index % 2 === 1 ? <mark className="rounded bg-amber-100 px-0.5 text-slate-900" key={index}>{part}</mark> : part,
      )}
    </>
  );
}

/**
 * A search snippet with two kinds of highlight: the sentence closest in meaning to the
 * query (found by the embedding model, so it can share no words with the query) and,
 * inside it or around it, the literal query words.
 */
function Snippet({ text, terms, passage }: { text: string; terms: string[]; passage?: PostSearchHit['passage'] }): React.ReactElement {
  if (!passage) return <Highlighted terms={terms} text={text} />;
  return (
    <>
      <Highlighted terms={terms} text={text.slice(0, passage.start)} />
      <span className="rounded-sm bg-sky-50 underline decoration-sky-400 decoration-2 underline-offset-[5px]" title="Closest in meaning to your search">
        <Highlighted terms={terms} text={text.slice(passage.start, passage.end)} />
      </span>
      <Highlighted terms={terms} text={text.slice(passage.end)} />
    </>
  );
}

const highlightStopwords = new Set(
  'a an and are as at be by can do does for from how i in is it of on or the to what when where which who why with you your'.split(' '),
);

function filterHref(query: string, department?: Department): string {
  const params = new URLSearchParams({ ...(query ? { q: query } : {}), ...(department ? { department } : {}) });
  return params.size ? `/?${params}` : '/';
}

/** Shown to signed-out visitors: every organization's posts are visible to its members only. */
function Landing({ expired = false }: { expired?: boolean }): React.ReactElement {
  return (
    <section className="max-w-2xl">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[.18em] text-brand">Crownstack Workspace</p>
      <h1>Ideas, insights, and everything in between.</h1>
      <p className="mt-4 text-lg text-slate-600">
        A private space for your organization to share findings, best practices, technical insights, and ideas.
      </p>
      {expired && <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Your session has ended. Sign in again to keep reading.</p>}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-dark" href="/login">
          Sign in
        </Link>
        <Link className="rounded-lg border bg-white px-4 py-2.5 font-semibold text-slate-700 transition hover:border-brand hover:text-brand" href="/register">
          Create an organization
        </Link>
      </div>
      <p className="mt-4 text-sm text-slate-500">Joining a team? Open the invite link an admin sent you.</p>
    </section>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; department?: string }>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const query = (params.q ?? '').trim().slice(0, 200);
  const department = departments.find((item) => item === params.department);
  // Highlight only words that carry meaning; search itself ignores these stopwords too.
  const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter(
    (term) => term.length > 1 && !highlightStopwords.has(term),
  );

  const token = await getServerToken();
  if (!token) return <Landing />;

  let search: Awaited<ReturnType<typeof searchPosts>> | null;
  let feed: Awaited<ReturnType<typeof getPosts>> | null;
  try {
    search = query ? await searchPosts(token, query, department) : null;
    feed = search ? null : await getPosts(token, department);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return <Landing expired />;
    throw error;
  }

  const cards: Card[] = search
    ? search.items.map((hit) => ({
        id: hit.id,
        slug: hit.slug,
        title: hit.title,
        authorName: hit.author.name,
        createdAt: hit.createdAt,
        department: hit.department,
        text: hit.snippet || hit.excerpt || '',
        passage: hit.passage,
        section: hit.section,
        matchedBy: hit.matchedBy,
        meaning: hit.meaning,
      }))
    : feed!.items.map((post) => ({
        id: post.id,
        slug: post.slug,
        title: post.title,
        authorName: post.author.name,
        createdAt: post.createdAt,
        department: post.department,
        text: post.excerpt ?? post.content.slice(0, 150),
      }));

  const chip = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
      active ? 'border-brand bg-brand text-white shadow-sm' : 'bg-white text-slate-600 hover:border-brand hover:text-brand'
    }`;

  return (
    <>
      <section className="mb-8 max-w-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[.18em] text-brand">
          Crownstack Workspace
        </p>
        <h1>Ideas, insights, and everything in between.</h1>
        <p className="mt-4 text-lg text-slate-600">A space for teams to share findings, best practices, technical insights, and ideas.</p>
      </section>

      <section className="mb-8 space-y-4">
        <div className="max-w-2xl">
          <PostSearchBar department={department} query={query} />
        </div>
        <nav aria-label="Filter by department" className="flex flex-wrap gap-2">
          <Link aria-current={!department ? 'page' : undefined} className={chip(!department)} href={filterHref(query)} scroll={false}>
            All departments
          </Link>
          {departments.map((item) => (
            <Link
              aria-current={department === item ? 'page' : undefined}
              className={chip(department === item)}
              href={filterHref(query, department === item ? undefined : item)}
              key={item}
              scroll={false}
            >
              {departmentLabel(item)}
            </Link>
          ))}
        </nav>
        {search && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
            <p>
              {cards.length} {cards.length === 1 ? 'result' : 'results'} for “{query}”
              {department ? ` in ${departmentLabel(department)}` : ''}
              {search.semantic ? ' · ranked by meaning and keywords' : ''}
            </p>
            {search.semantic ? (
              <p aria-label="Highlight legend" className="flex items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <mark className="rounded bg-amber-100 px-1 text-slate-900">word</mark> your words
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="rounded-sm bg-sky-50 px-1 text-slate-900 underline decoration-sky-400 decoration-2 underline-offset-[5px]">sentence</span> closest in meaning
                </span>
              </p>
            ) : (
              <p className="text-xs text-amber-700">Matching keywords only. Meaning-based search is unavailable right now.</p>
            )}
          </div>
        )}
      </section>

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-slate-500">
          {query ? (
            <>
              No articles match “{query}”{department ? ` in ${departmentLabel(department)}` : ''}.{' '}
              <Link className="font-medium text-brand hover:text-brand-dark" href={filterHref('', department)}>Clear search</Link>
            </>
          ) : department ? (
            <>No published posts in {departmentLabel(department)} yet.</>
          ) : (
            <>No published posts in your organization yet. <Link className="font-medium text-brand hover:text-brand-dark" href="/dashboard">Write the first one</Link>.</>
          )}
        </div>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((post) => (
            <article
              className="group rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              key={post.id}
            >
              <p className="text-sm text-slate-500">
                By {post.authorName} · {new Date(post.createdAt).toLocaleDateString()}
              </p>
              <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-900 group-hover:text-brand">
                <Link href={`/posts/${post.slug}`}>
                  <Highlighted terms={terms} text={post.title} />
                </Link>
              </h2>
              {post.section && (
                <p className="mt-3 text-xs font-medium uppercase tracking-wider text-slate-400">From “{post.section}”</p>
              )}
              <p className={`${post.section ? 'mt-1' : 'mt-3'} text-sm leading-6 text-slate-600`}>
                <Snippet passage={post.passage} terms={terms} text={post.text} />
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                  {departmentLabel(post.department)}
                </span>
                {post.meaning ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700"
                    title={post.matchedBy === 'semantic' ? 'Found by meaning. It shares no words with your search.' : 'Matches your words and is close in meaning'}
                  >
                    <Sparkles size={12} /> {meaningCopy[post.meaning]}
                  </span>
                ) : post.matchedBy ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600" title="Matches the words you typed">
                    <Type size={12} /> Word match
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

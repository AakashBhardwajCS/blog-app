'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, Search, X } from 'lucide-react';

const DEBOUNCE_MS = 300;

/**
 * Search box for the home page. It only owns the text: the query lives in the URL
 * (`?q=`), so results are server-rendered, shareable, and survive a refresh.
 */
export function PostSearchBar({ query, department }: { query: string; department?: string }): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(query);
  const [pending, startTransition] = useTransition();
  const lastPushed = useRef(query);

  // Follow URL changes made elsewhere (e.g. "Clear search"), but not the echo of our own typing.
  useEffect(() => {
    if (query !== lastPushed.current) {
      lastPushed.current = query;
      setValue(query);
    }
  }, [query]);

  useEffect(() => {
    const next = value.trim();
    if (next === lastPushed.current) return;
    const timer = setTimeout(() => {
      lastPushed.current = next;
      const params = new URLSearchParams({ ...(next ? { q: next } : {}), ...(department ? { department } : {}) });
      startTransition(() => router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false }));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, department, pathname, router]);

  return (
    <form className="relative" onSubmit={(event) => event.preventDefault()} role="search">
      <label className="sr-only" htmlFor="post-search">Search articles</label>
      <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
      <input
        className="w-full rounded-xl border bg-white py-3 pl-11 pr-11 text-sm shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        id="post-search"
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search articles by keyword or idea, e.g. “making search understand meaning”"
        type="search"
        value={value}
      />
      <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
        {pending ? (
          <Loader2 aria-label="Searching" className="animate-spin text-slate-400" size={18} />
        ) : value ? (
          <button aria-label="Clear search" className="rounded p-1 text-slate-400 hover:text-slate-700" onClick={() => setValue('')} type="button">
            <X size={16} />
          </button>
        ) : null}
      </span>
    </form>
  );
}

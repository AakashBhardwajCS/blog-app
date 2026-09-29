'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronDown, LoaderCircle, Send, Sparkles, X } from 'lucide-react';

type Source = { id: string; title: string; slug: string; excerpt: string | null; score: number };
type RagResponse = { answer: string; sources: Source[]; mode: 'hybrid' | 'lexical' };
type Message = { role: 'user' | 'assistant'; text: string; sources?: Source[]; mode?: string };

const prompts = ['Find articles about MCP', 'What do we know about NestJS?', 'Search for posts on security'];

export function RagAssistant(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');

  async function ask(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    const value = query.trim();
    if (!value || busy) return;
    setQuery('');
    setError('');
    setMessages((current) => [...current, { role: 'user', text: value }]);
    setBusy(true);
    try {
      const token = typeof window === 'undefined' ? null : localStorage.getItem('blog_token');
      if (!token) throw new Error('Please sign in to use the knowledge assistant.');

      const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
      const response = await fetch(`${base}/rag/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query: value }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ message: 'The knowledge assistant is unavailable right now.' }))) as { message?: string };
        throw new Error(body.message || 'The knowledge assistant is unavailable right now.');
      }

      const result = (await response.json()) as RagResponse;
      setMessages((current) => [...current, { role: 'assistant', text: result.answer, sources: result.sources, mode: result.mode }]);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The knowledge assistant could not respond.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <section className="fixed bottom-24 right-5 z-50 flex w-[min( calc(100vw-2.5rem),390px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 sm:right-7" aria-label="CrownStack knowledge assistant">
          <header className="flex items-center justify-between bg-slate-950 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand"><Sparkles size={17} /></span>
              <div><p className="font-semibold">Knowledge assistant</p><p className="text-xs text-slate-300">Search the published blogs and articles</p></div>
            </div>
            <button aria-label="Close assistant" className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)} type="button"><X size={18} /></button>
          </header>
          <div className="max-h-[min(60vh,480px)] space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Ask about the platform or find a blog.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {prompts.map((prompt) => <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-xs text-slate-600 hover:border-brand hover:text-brand" key={prompt} onClick={() => setQuery(prompt)} type="button">{prompt}</button>)}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div className={message.role === 'user' ? 'ml-8' : 'mr-4'} key={`${message.role}-${index}`}>
                <div className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700'}`}>{message.text}</div>
                {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sources · {message.mode}</p>
                    {message.sources.map((source) => <Link className="flex items-center gap-2 text-xs font-medium text-brand hover:underline" href={`/posts/${source.slug}`} key={source.id}><BookOpen size={13} />{source.title}</Link>)}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-slate-400"><LoaderCircle className="animate-spin" size={15} /> Searching the knowledge base...</div>}
          </div>
          {error && <p className="px-4 pb-2 text-xs text-red-600">{error}</p>}
          <form className="border-t border-slate-100 p-3" onSubmit={(event) => void ask(event)}>
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
              <textarea aria-label="Ask the knowledge assistant" className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400" disabled={busy} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(); } }} placeholder="Ask or search blogs..." value={query} />
              <button aria-label="Ask assistant" className="rounded-xl bg-brand p-2.5 text-white transition hover:bg-brand-dark disabled:opacity-40" disabled={busy || !query.trim()} type="submit"><Send size={16} /></button>
            </div>
          </form>
        </section>
      )}
      <button aria-expanded={open} aria-label={open ? 'Close knowledge assistant' : 'Open knowledge assistant'} className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-brand sm:right-7" onClick={() => setOpen((current) => !current)} type="button">
        {open ? <ChevronDown size={18} /> : <Sparkles size={18} />}<span className="hidden sm:inline">Ask CrownStack AI</span>
      </button>
    </>
  );
}

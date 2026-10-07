'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil, Save, Send, Sparkles, Wrench } from 'lucide-react';
import { api } from '../../lib/api';
import { Post } from '../../lib/types';

type Draft = { title: string; content: string };
type Message = { role: 'user' | 'assistant'; content: string; tools?: string[]; draft?: Draft; savedPostId?: string; saving?: boolean };
type AgentResponse = { message: string; toolCalls: string[]; draft?: Draft };

/** Write with AI only drafts; posts are saved explicitly with the Save draft button. */
const WRITE_TOOLS = new Set(['create_post', 'update_post', 'publish_post', 'delete_post']);
type Tool = { name: string; description: string; inputSchema: Record<string, unknown> };
type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

export default function AssistantPage(): React.ReactElement {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showTools, setShowTools] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedTool, setSelectedTool] = useState('');
  const [llmTool, setLlmTool] = useState('');
  const [toolArgs, setToolArgs] = useState('{}');
  const [toolResult, setToolResult] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('blog_token')) {
      window.location.href = '/login';
      return;
    }

    void loadTools();
  }, []);

  async function loadTools(): Promise<void> {
    try {
      let result: { tools: Tool[] };
      try {
        result = await api<{ tools: Tool[] }>('/agent/mcp/tools');
      } catch {
        result = await api<{ tools: Tool[] }>('/agent/tools');
      }
      setTools(result.tools);
      if (!selectedTool && result.tools[0]) setSelectedTool(result.tools[0].name);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not load tools');
    }
  }

  async function callTool(): Promise<void> {
    if (!selectedTool || busy) return;
    setBusy(true);
    setError('');
    setToolResult('');
    try {
      const result = await api<ToolResult>('/agent/mcp/tools/call', {
        method: 'POST',
        body: JSON.stringify({ name: selectedTool, arguments: JSON.parse(toolArgs) as Record<string, unknown> }),
      });
      setToolResult(result.content.map((item) => item.text).join('\n'));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Tool call failed');
    } finally {
      setBusy(false);
    }
  }

  async function send(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput('');
    setError('');
    setMessages((current) => [...current, { role: 'user', content: prompt }]);
    setBusy(true);
    try {
      const result = await api<AgentResponse>('/agent/chat', {
        method: 'POST',
        body: JSON.stringify({ message: prompt, ...(llmTool ? { toolName: llmTool } : {}) }),
      });
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: result.message, tools: result.toolCalls, draft: result.draft },
      ]);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The assistant could not respond');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(index: number): Promise<void> {
    const draft = messages[index]?.draft;
    if (!draft) return;
    setError('');
    setMessages((current) => current.map((message, i) => (i === index ? { ...message, saving: true } : message)));
    try {
      const post = await api<Post>('/posts', {
        method: 'POST',
        body: JSON.stringify({ title: draft.title, content: draft.content, published: false }),
      });
      setMessages((current) => current.map((message, i) => (i === index ? { ...message, saving: false, savedPostId: post.id } : message)));
    } catch (cause: unknown) {
      setMessages((current) => current.map((message, i) => (i === index ? { ...message, saving: false } : message)));
      setError(cause instanceof Error ? cause.message : 'Could not save draft');
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[.15em] text-brand">
          <Sparkles size={16} /> Write with AI
        </p>
        <h1 className="mt-2">Draft an article with AI</h1>
        <p className="mt-2 text-slate-600">Describe what to write. The AI researches the topic and drafts it; nothing is saved until you choose Save draft.</p>
        <button
          className="mt-4 inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-brand hover:text-brand"
          onClick={() => { const next = !showTools; setShowTools(next); if (next) void loadTools(); }}
          type="button"
        >
          <Wrench size={16} /> {showTools ? 'Hide tools' : 'Available tools'}
        </button>
        <label className="mt-4 block max-w-md text-sm font-medium text-slate-700">
          Tool for this request
          <select
            className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            onChange={(event) => setLlmTool(event.target.value)}
            value={llmTool}
          >
            <option value="">Automatic tool choice</option>
            {tools.filter((tool) => !WRITE_TOOLS.has(tool.name)).map((tool) => <option key={tool.name} value={tool.name}>{tool.name}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Leave automatic to let the model decide whether and which tool to use.
          </span>
        </label>
      </div>
      {showTools && (
        <section className="mb-6 rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-bold text-slate-900">Available blog tools</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {tools.map((tool) => (
              <button
                className={`rounded-xl border p-3 text-left ${selectedTool === tool.name ? 'border-brand bg-brand/5' : 'hover:border-brand'}`}
                key={tool.name}
                onClick={() => setSelectedTool(tool.name)}
                type="button"
              >
                <p className="font-semibold text-slate-900">{tool.name}</p>
                <p className="mt-1 text-xs text-slate-500">{tool.description}</p>
              </button>
            ))}
          </div>
          <label className="mt-5 block text-sm font-medium text-slate-700">
            Arguments for <span className="font-mono">{selectedTool || 'tool'}</span>
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border bg-slate-50 p-3 font-mono text-xs outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              onChange={(event) => setToolArgs(event.target.value)}
              value={toolArgs}
            />
          </label>
          <button className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !selectedTool} onClick={() => void callTool()} type="button">
            {busy ? 'Calling...' : 'Call tool'}
          </button>
          {toolResult && <pre className="mt-4 max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{toolResult}</pre>}
        </section>
      )}
      <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
        <div className="min-h-[360px] space-y-5">
          {messages.length === 0 && (
            <div className="flex min-h-[320px] flex-col justify-center">
              <Sparkles className="text-brand" size={24} />
              <h2 className="mt-5 text-2xl font-bold text-slate-900">What should we write?</h2>
              <p className="mt-2 text-slate-600">The AI searches the web for current sources, then drafts the article for you to review.</p>
            </div>
          )}
          {messages.map((message, index) => (
            <div className={message.role === 'user' ? 'ml-auto max-w-[85%]' : 'max-w-[90%]'} key={`${message.role}-${index}`}>
              <div className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-brand text-white' : 'bg-slate-50 text-slate-700'}`}>
                {message.content}
              </div>
              {message.tools && message.tools.length > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><Wrench size={12} /> Used {message.tools.join(', ')}</p>
              )}
              {message.draft && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {message.savedPostId ? (
                    <>
                      <span className="text-xs font-medium text-emerald-700">Saved as draft</span>
                      <Link
                        className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-brand hover:text-brand"
                        href={`/dashboard?edit=${encodeURIComponent(message.savedPostId)}`}
                      >
                        <Pencil size={14} /> Edit
                      </Link>
                    </>
                  ) : (
                    <button
                      className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-50"
                      disabled={message.saving}
                      onClick={() => void saveDraft(index)}
                      type="button"
                    >
                      <Save size={14} /> {message.saving ? 'Saving...' : 'Save draft'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {busy && <p className="text-sm text-slate-400">Thinking...</p>}
        </div>
        {error && <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <form className="mt-8 flex items-end gap-3 border-t pt-5" onSubmit={(event) => void send(event)}>
          <textarea
            className="min-h-12 flex-1 resize-none rounded-xl border bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            disabled={busy}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
            }}
            placeholder="e.g. Write a 600-word article on the latest UPI news in India"
            value={input}
          />
          <button aria-label="Send message" className="rounded-xl bg-brand p-3 text-white disabled:opacity-50" disabled={busy || !input.trim()} type="submit">
            <Send size={18} />
          </button>
        </form>
      </section>
    </div>
  );
}
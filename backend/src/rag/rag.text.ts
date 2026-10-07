/**
 * Pure text utilities for the RAG pipeline: turning stored article content into
 * clean plain text, splitting it into retrieval-sized chunks, and a local
 * fallback embedding used when no embedding model is available.
 *
 * Everything here is deterministic and side-effect free so it can be unit tested
 * without a database or LLM.
 */

/**
 * Bump whenever chunking or the hashed embedding changes. It is folded into each
 * post's content hash, so every article is re-indexed on the next sync.
 */
export const CHUNKER_VERSION = 2;

/** Aim for chunks of roughly one or two paragraphs: small enough to be specific, big enough to carry context. */
const TARGET_CHUNK_CHARS = 900;
/** Paragraphs longer than this are split on sentence boundaries. */
const MAX_BLOCK_CHARS = 1400;
/** Trailing sentences carried into the next chunk so an idea split across a boundary is still retrievable. */
const OVERLAP_CHARS = 200;

export type TextChunk = { heading: string | null; text: string };

/**
 * Converts article content (HTML from the rich editor, or plain/markdown text) to
 * plain text. Headings are rewritten as markdown `## Heading` lines so
 * {@link chunkText} can detect section boundaries the same way for both formats.
 */
export function htmlToText(content: string): string {
  if (!/<[a-z][\s\S]*>/i.test(content)) return normalizeWhitespace(content);

  const text = content
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, inner: string) => `\n\n${'#'.repeat(Number(level))} ${inner.replace(/<[^>]+>/g, '')}\n\n`)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|blockquote|pre|ul|ol|table|tr|figure)>/gi, '\n\n')
    // Inline formatting sits inside words/punctuation ("<b>MCP</b>."), so drop it without adding a space.
    .replace(/<\/?(a|b|strong|i|em|u|s|code|span|mark|sub|sup|small)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  return normalizeWhitespace(decodeEntities(text));
}

/**
 * Splits plain text into overlapping chunks that respect section boundaries.
 * Each chunk remembers the heading it sits under, which is later prepended when
 * embedding so a paragraph like "It supports streaming." keeps its topic.
 */
export function chunkText(text: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  let heading: string | null = null;
  let buffer: string[] = [];
  let size = 0;

  // Emits the buffered paragraphs as a chunk. With `keepOverlap`, the tail of the
  // last paragraph seeds the next chunk; section changes start fresh instead.
  const flush = (keepOverlap: boolean): void => {
    if (buffer.length === 0) return;
    chunks.push({ heading, text: buffer.join('\n\n') });
    const tail = keepOverlap ? overlapTail(buffer[buffer.length - 1]) : '';
    buffer = tail ? [tail] : [];
    size = tail.length;
  };

  for (const block of text.split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const headingMatch = /^#{1,6}\s+(.+)$/.exec(trimmed);
    if (headingMatch && !trimmed.includes('\n')) {
      flush(false);
      heading = headingMatch[1].trim();
      continue;
    }

    for (const piece of splitLongBlock(trimmed)) {
      if (size > 0 && size + piece.length > TARGET_CHUNK_CHARS) flush(true);
      buffer.push(piece);
      size += piece.length + 2;
    }
  }
  flush(false);
  return chunks;
}

/**
 * Lowercased, accent-folded word tokens with stopwords removed and a light
 * plural stem ("agents" -> "agent"). Used only by the hashed fallback embedding;
 * lexical search uses Postgres full-text search instead.
 */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .map((token) => (token.length > 3 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token));
}

/**
 * Feature-hashing embedding: unigrams + bigrams hashed into a fixed-size vector
 * with a sign bit (reduces collision bias) and sublinear term frequency, then
 * L2-normalised so cosine distance works. It captures word overlap, not meaning,
 * so it is only the fallback when no embedding model is configured or reachable.
 */
export function hashedEmbedding(text: string, dimension: number): number[] {
  const counts = new Map<string, number>();
  const tokens = tokenize(text);
  tokens.forEach((token, index) => {
    counts.set(token, (counts.get(token) ?? 0) + 1);
    if (index > 0) {
      const bigram = `${tokens[index - 1]} ${token}`;
      counts.set(bigram, (counts.get(bigram) ?? 0) + 0.5);
    }
  });

  const vector = new Array<number>(dimension).fill(0);
  for (const [feature, count] of counts) {
    const hash = fnv1a(feature);
    const sign = hash & 1 ? 1 : -1;
    vector[(hash >>> 1) % dimension] += sign * (1 + Math.log(count));
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

function splitLongBlock(block: string): string[] {
  if (block.length <= MAX_BLOCK_CHARS) return [block];

  const pieces: string[] = [];
  let current = '';
  for (const sentence of splitSentences(block)) {
    // A single run-on "sentence" (e.g. a code dump) is hard-split so nothing exceeds the limit.
    for (const part of sentence.length > MAX_BLOCK_CHARS ? hardSplit(sentence) : [sentence]) {
      if (current && current.length + part.length + 1 > TARGET_CHUNK_CHARS) {
        pieces.push(current);
        current = '';
      }
      current = current ? `${current} ${part}` : part;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function overlapTail(block: string): string {
  const sentences = splitSentences(block);
  const tail: string[] = [];
  let length = 0;
  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    if (length + sentences[index].length > OVERLAP_CHARS) break;
    tail.unshift(sentences[index]);
    length += sentences[index].length + 1;
  }
  // Never overlap the whole paragraph, that would just duplicate it.
  return tail.length === sentences.length ? '' : tail.join(' ');
}

/**
 * Sentence boundaries of `text` as `[start, end)` offsets, so a caller can highlight
 * one sentence inside the original string. Whitespace between sentences is excluded.
 */
export function sentenceSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  for (const match of text.matchAll(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)) {
    const raw = match[0];
    const lead = raw.length - raw.trimStart().length;
    const start = (match.index ?? 0) + lead;
    const end = start + raw.trim().length;
    if (end > start) spans.push({ start, end });
  }
  return spans;
}

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) ?? [text]).map((sentence) => sentence.trim()).filter(Boolean);
}

function hardSplit(text: string): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > MAX_BLOCK_CHARS) {
    const cut = rest.lastIndexOf(' ', MAX_BLOCK_CHARS);
    const at = cut > MAX_BLOCK_CHARS / 2 ? cut : MAX_BLOCK_CHARS;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function fnv1a(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const STOPWORDS = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has have how i if in into is it its me my of on or our ' +
    'so than that the their them then there these they this to was we were what when where which who why will with would you your ' +
    'about any all also just more most not no some such tell know explain describe article articles post posts blog blogs'
  ).split(' '),
);

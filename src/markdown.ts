/**
 * A deliberately small, dependency-free Markdown subset for link descriptions.
 *
 * Supported: paragraphs, line breaks, **bold**, *italic* / _italic_, a `---` or
 * `***` horizontal rule, `-` / `*` bullets, `1.` numbered lists, and `inline
 * code`. Everything else is literal text: there are no links, images, headings,
 * code fences, or raw HTML.
 *
 * Security model: the whole input is HTML-escaped *before* any formatting
 * markup is added, and the renderer only ever emits fixed tags. It never emits
 * an attribute or a URL, so untrusted text cannot escape the element it is in.
 */

import { escapeHtml } from './html.ts';

/**
 * Hard input cap, as defence in depth. Descriptions are already capped at
 * `MAX_LINK_DESCRIPTION` upstream; this only bounds the work the renderer does
 * if it is ever called with something else.
 */
const MAX_INPUT = 20_000;

/** Marks an inline-code placeholder; NULs are stripped from the input first. */
const TOKEN = '\u0000';

/** Render the inline span of one line (bold, italic, inline code). */
function renderInline(source: string): string {
  // Escape first: afterwards the only `<` and `>` in the string are tags we add.
  let text = escapeHtml(source);

  // Pull inline code out before emphasis so its markers stay literal. The
  // placeholder cannot collide with real text because NULs were removed.
  const codeSpans: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_match: string, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `${TOKEN}${codeSpans.length - 1}${TOKEN}`;
  });

  // Bounded patterns only (no nested quantifiers), so hostile input cannot make
  // the regex engine backtrack pathologically.
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  // `_` only emphasises at word boundaries, so snake_case is left alone.
  text = text.replace(/(?<![\w])_([^_\n]+)_(?![\w])/g, '<em>$1</em>');

  return text.replace(
    /\u0000(\d+)\u0000/g,
    (_match: string, index: string) => codeSpans[Number(index)] ?? '',
  );
}

const RULE = /^\s*(?:-{3,}|\*{3,})\s*$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,9}\.\s+(.*)$/;

/**
 * Render a Markdown-subset description to safe HTML. Returns an empty string
 * for blank input. Block elements are paragraphs, lists, and horizontal rules.
 */
export function renderMarkdown(source: string): string {
  const text = source.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').slice(0, MAX_INPUT);
  if (text.trim().length === 0) return '';

  const out: string[] = [];
  let paragraph: string[] = [];
  let list: 'ul' | 'ol' | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    out.push(`<p>${paragraph.map(renderInline).join('<br>\n')}</p>`);
    paragraph = [];
  };

  const closeList = (): void => {
    if (list === null) return;
    out.push(`</${list}>`);
    list = null;
  };

  const openList = (kind: 'ul' | 'ol'): void => {
    if (list === kind) return;
    closeList();
    out.push(`<${kind}>`);
    list = kind;
  };

  for (const line of text.split('\n')) {
    if (line.trim().length === 0) {
      flushParagraph();
      closeList();
      continue;
    }
    if (RULE.test(line)) {
      flushParagraph();
      closeList();
      out.push('<hr>');
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet !== null) {
      flushParagraph();
      openList('ul');
      out.push(`<li>${renderInline(bullet[1] ?? '')}</li>`);
      continue;
    }
    const numbered = NUMBERED.exec(line);
    if (numbered !== null) {
      flushParagraph();
      openList('ol');
      out.push(`<li>${renderInline(numbered[1] ?? '')}</li>`);
      continue;
    }
    // A plain line continues the paragraph; consecutive lines become line breaks.
    closeList();
    paragraph.push(line.replace(/^\s+/, ''));
  }

  flushParagraph();
  closeList();
  return out.join('\n');
}

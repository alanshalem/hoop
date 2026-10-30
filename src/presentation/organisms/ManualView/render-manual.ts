import { Marked, Renderer, type Token, type Tokens } from 'marked';

export interface ManualTocEntry {
  id: string;
  /** Plain heading text (no markdown). */
  text: string;
  depth: 2 | 3;
}

export interface ManualDocument {
  /** Text of the first h1, rendered by the page header instead of the body. */
  title: string | null;
  /** Trusted HTML: generated from repository markdown with raw HTML escaped. */
  html: string;
  toc: ManualTocEntry[];
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

const decodeEntities = (value: string) =>
  value.replace(/&(amp|lt|gt|quot|#39);/g, (entity) =>
    Object.keys(HTML_ESCAPES).find((char) => HTML_ESCAPES[char] === entity) ?? entity
  );

/** GitHub-style heading slug, so the manual's `#anchors` work here and on GitHub alike. */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

const isTitle = (token: Token): token is Tokens.Heading => token.type === 'heading' && token.depth === 1;

/** Converts the system manual (GFM) to HTML with stable heading ids and an h2/h3 table of contents. */
export function renderManual(markdown: string): ManualDocument {
  const toc: ManualTocEntry[] = [];
  const slugCounts = new Map<string, number>();

  const uniqueSlug = (text: string) => {
    const base = slugifyHeading(text);
    const count = slugCounts.get(base) ?? 0;
    slugCounts.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = decodeEntities(this.parser.parseInline(tokens, this.parser.textRenderer));
        const id = uniqueSlug(text);
        if (depth === 2 || depth === 3) toc.push({ id, text, depth });
        return `<h${depth} id="${escapeHtml(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      // In-page anchors keep their accents so they match the heading ids byte for byte.
      link(token) {
        if (!token.href.startsWith('#')) return Renderer.prototype.link.call(this, token);
        return `<a href="${escapeHtml(token.href)}">${this.parser.parseInline(token.tokens)}</a>`;
      },
      // Wide tables scroll sideways on phones; tabindex lets keyboard users scroll them.
      table(token) {
        return `<div data-table-scroll="" tabindex="0">${Renderer.prototype.table.call(this, token)}</div>\n`;
      },
      // No raw HTML passthrough: the manual is shown as written.
      html({ text }) {
        return escapeHtml(text);
      },
    },
  });

  const tokens = marked.lexer(markdown);
  const titleIndex = tokens.findIndex(isTitle);
  let title: string | null = null;
  if (titleIndex !== -1) {
    const [titleToken] = tokens.splice(titleIndex, 1);
    title = (titleToken as Tokens.Heading).text.trim();
  }

  const html = marked.parser(tokens);
  return { title, html, toc };
}

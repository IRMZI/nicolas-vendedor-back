import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'a', 'span',
  'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'title', 'src', 'alt', 'width', 'height', 'class'];

/**
 * Sanitiza HTML vindo do editor de texto rico do painel.
 * Remove scripts, handlers inline e protocolos perigosos (defesa contra XSS).
 */
export function sanitizeHtml(dirty?: string | null): string | null {
  if (dirty === undefined || dirty === null) return null;
  if (dirty.trim() === '') return '';

  return purify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
  });
}

/** Remove todas as tags, util para gerar resumos e metadados. */
export function stripHtml(value?: string | null): string {
  if (!value) return '';
  return purify
    .sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    .replace(/\s+/g, ' ')
    .trim();
}

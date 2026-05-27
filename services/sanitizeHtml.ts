import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'a',
];

const ALLOWED_ATTR = ['href', 'name', 'target', 'rel', 'class'];

export function sanitizeRichHtml(value: string | null | undefined): string {
  return DOMPurify.sanitize(value || '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

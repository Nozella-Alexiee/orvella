import DOMPurify from 'dompurify';
import { marked, type Tokens } from 'marked';
import { esc, highlightLine } from './highlight';

/* Markdown for Studio text blocks: headings, lists, links, quotes, tables, images and fenced code
   (highlighted per language). Always sanitized; links open in a new tab. */
const renderer = new marked.Renderer();
renderer.code = ({ text, lang }: Tokens.Code) => {
  const l = (lang || '').trim().toLowerCase();
  const alias: Record<string, string> = { js: 'javascript', py: 'python', 'c++': 'cpp', rs: 'rust', kt: 'kotlin', golang: 'go' };
  const body = l ? text.split('\n').map(line => highlightLine(line, alias[l] || l)).join('\n') : esc(text);
  return `<pre class="codeblock"><code>${body}</code></pre>`;
};
renderer.codespan = ({ text }: Tokens.Codespan) => `<span class="ic">${text}</span>`;

const CONFIG = {
  ALLOWED_TAGS: ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'b', 'strong', 'i', 'em', 'a', 'blockquote', 'pre', 'code', 'span', 'br', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'kbd', 'del', 'sup', 'sub'],
  ALLOWED_ATTR: ['class', 'href', 'src', 'alt', 'title'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/)/i,
};

DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
  if (node.tagName === 'IMG') node.setAttribute('loading', 'lazy');
});

export function renderMarkdown(md: string): string {
  // headings start at h2: the scene title is the h1
  const src = (md || '').replace(/^# /gm, '## ');
  const out = marked.parse(src, { renderer, async: false, gfm: true, breaks: true }) as string;
  return DOMPurify.sanitize(out, CONFIG) as string;
}

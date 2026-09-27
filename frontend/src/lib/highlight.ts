/* Tiny read-only highlighter for code in cards, choices and reviews, for every language Orvella teaches.
   Editable code uses CodeMirror 6 with the same token classes. Returns escaped HTML.
   The language follows the chapter being shown (setHighlightLang), JavaScript by default. */
export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type Spec = { kw: string[]; builtin: string[]; comment: RegExp; ci?: boolean; vars?: RegExp; line?: string };

const SPECS: Record<string, Spec> = {
  javascript: { kw: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'of', 'in', 'while', 'new', 'typeof', 'true', 'false', 'null', 'undefined', 'class', 'import', 'export', 'from', 'async', 'await', 'switch', 'case', 'break', 'continue', 'do', 'this'],
    builtin: ['console', 'Math', 'JSON', 'document', 'window', 'Number', 'String', 'Array', 'Object', 'require'], comment: /^\/\/.*$/ },
  python: { kw: ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'class', 'import', 'from', 'as', 'with', 'try', 'except', 'finally', 'raise', 'lambda', 'pass', 'break', 'continue', 'global', 'yield'],
    builtin: ['print', 'input', 'len', 'range', 'int', 'str', 'float', 'list', 'dict', 'set', 'tuple', 'sum', 'min', 'max', 'abs', 'round', 'sorted', 'enumerate', 'zip', 'self'], comment: /^#.*$/, line: '#.*$' },
  c: { kw: ['int', 'char', 'float', 'double', 'void', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'struct', 'const', 'unsigned', 'long', 'short', 'bool', 'true', 'false', 'sizeof', 'NULL', '#include', '#define'],
    builtin: ['printf', 'scanf', 'puts', 'malloc', 'free', 'strlen', 'main'], comment: /^\/\/.*$/ },
  cpp: { kw: ['int', 'char', 'float', 'double', 'void', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'struct', 'class', 'const', 'unsigned', 'long', 'bool', 'true', 'false', 'nullptr', 'auto', 'new', 'delete', 'using', 'namespace', 'public', 'private', 'template', '#include'],
    builtin: ['std', 'cout', 'cin', 'endl', 'string', 'vector', 'printf', 'main'], comment: /^\/\/.*$/ },
  rust: { kw: ['fn', 'let', 'mut', 'const', 'if', 'else', 'match', 'for', 'while', 'loop', 'in', 'return', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'true', 'false', 'as', 'ref', 'move', 'self', 'Self'],
    builtin: ['println!', 'print!', 'vec!', 'format!', 'String', 'Vec', 'Option', 'Result', 'Some', 'None', 'Ok', 'Err', 'Box'], comment: /^\/\/.*$/ },
  java: { kw: ['public', 'private', 'protected', 'class', 'static', 'void', 'int', 'double', 'float', 'boolean', 'char', 'long', 'new', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'true', 'false', 'null', 'import', 'package', 'final', 'this', 'extends', 'implements', 'interface', 'var'],
    builtin: ['System', 'String', 'Math', 'Scanner', 'Integer', 'ArrayList', 'List'], comment: /^\/\/.*$/ },
  kotlin: { kw: ['fun', 'val', 'var', 'if', 'else', 'when', 'for', 'while', 'in', 'return', 'class', 'object', 'data', 'true', 'false', 'null', 'import', 'package', 'is', 'as'],
    builtin: ['println', 'print', 'readln', 'readLine', 'listOf', 'mutableListOf', 'mapOf', 'String', 'Int'], comment: /^\/\/.*$/ },
  go: { kw: ['func', 'var', 'const', 'if', 'else', 'for', 'range', 'return', 'package', 'import', 'type', 'struct', 'map', 'chan', 'go', 'defer', 'true', 'false', 'nil', 'switch', 'case', 'break', 'continue'],
    builtin: ['fmt', 'len', 'append', 'make', 'int', 'string', 'float64', 'bool', 'error'], comment: /^\/\/.*$/ },
  php: { kw: ['function', 'return', 'if', 'else', 'elseif', 'foreach', 'for', 'while', 'echo', 'print', 'true', 'false', 'null', 'class', 'new', 'public', 'private', 'array', 'as', 'require', 'include', 'fn'],
    builtin: ['strlen', 'count', 'implode', 'explode', 'isset', 'empty', 'htmlspecialchars', 'PDO'], comment: /^(\/\/|#).*$/, vars: /^\$\w+/, line: '(?://|#).*$' },
  sql: { kw: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP', 'ORDER', 'GROUP', 'BY', 'HAVING', 'JOIN', 'LEFT', 'INNER', 'ON', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'LIMIT', 'PRIMARY', 'KEY', 'DISTINCT', 'ASC', 'DESC', 'LIKE', 'IN', 'IS', 'DEFAULT'],
    builtin: ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'INTEGER', 'TEXT', 'REAL', 'VARCHAR'], comment: /^--.*$/, ci: true, line: '--.*$' },
};
SPECS.css = { kw: [], builtin: [], comment: /^\/\*.*$/ };

let current = 'javascript';
/** The language for read-only code on this page (a chapter's language). */
export function setHighlightLang(lang: string | null | undefined) { current = lang && (SPECS[lang] || lang === 'html') ? lang : 'javascript'; }
export const highlightLang = () => current;

const cache = new Map<string, RegExp>();
function tokens(lang: string): RegExp {
  const hit = cache.get(lang);
  if (hit) return hit;
  const s = SPECS[lang] || SPECS.javascript;
  const words = (l: string[]) => l.map(w => w.replace(/[#!$]/g, m => `\\${m}`)).join('|');
  const quotes = lang === 'rust' || lang === 'go' ? String.raw`("[^"]*"|'[^']'|` + '`[^`]*`)' : String.raw`("[^"]*"|'[^']*'|` + '`[^`]*`)';
  const kw = s.kw.length ? `(?<![\\w$])(${words(s.kw)})(?![\\w$])` : '(\\b\\B)';
  const bi = s.builtin.length ? `(?<![\\w$])(${words(s.builtin)})(?![\\w$])` : '(\\b\\B)';
  const line = s.line || '//.*$';
  const re = new RegExp(`${quotes}|\\b(\\d+(?:\\.\\d+)?)\\b|${kw}|${bi}|(\\$\\w+)|\\.(\\w+)(?=\\()|(${line})|([=+\\-*/<>!;:,(){}[\\]&|%])`, s.ci ? 'gi' : 'g');
  cache.set(lang, re);
  return re;
}

function html(line: string): string {
  // tags, attribute names and their values; enough for small HTML snippets
  return esc(line).replace(/(&lt;\/?)([\w-]+)|([\w-]+)=("[^"]*")/g, (m, open, tag, attr, val) => {
    if (tag) return `${open}<span class="ty">${tag}</span>`;
    if (attr) return `<span class="p">${attr}</span>=<span class="s">${val}</span>`;
    return m;
  });
}

function css(line: string): string {
  const m = /^(\s*)([^{:]+)(\{.*)?$/.exec(line);
  if (/^\s*[\w-]+\s*:/.test(line)) {
    return esc(line).replace(/^(\s*)([\w-]+)(\s*:\s*)(.*?)(;?)$/, (_x, sp, prop, colon, val, semi) =>
      `${sp}<span class="p">${prop}</span>${colon}<span class="n">${val}</span>${semi}`);
  }
  if (m && m[2].trim() && !line.trim().startsWith('}')) return `${m[1]}<span class="ty">${esc(m[2])}</span>${esc(m[3] || '')}`;
  return esc(line);
}

export function highlightLine(line: string, lang: string = current): string {
  if (lang === 'html') return html(line);
  if (lang === 'css') return css(line);
  const spec = SPECS[lang] || SPECS.javascript;
  if (spec.comment.test(line.trimStart())) return `<span class="c">${esc(line)}</span>`;
  let out = '';
  let last = 0;
  line.replace(tokens(lang), (m, s, n, k, o, v, f, c, pn, idx: number) => {
    out += esc(line.slice(last, idx));
    if (s) out += `<span class="s">${esc(s)}</span>`;
    else if (n) out += `<span class="n">${n}</span>`;
    else if (k) out += `<span class="k">${esc(k)}</span>`;
    else if (o) out += `<span class="p">${esc(o)}</span>`;
    else if (v) out += `<span class="p">${esc(v)}</span>`;
    else if (f) out += `.<span class="f">${esc(f)}</span>`;
    else if (c) out += `<span class="c">${esc(c)}</span>`;
    else if (pn) out += `<span class="pn">${esc(pn)}</span>`;
    last = idx + m.length;
    return m;
  });
  return out + esc(line.slice(last));
}

export const highlightLines = (src: string, lang: string = current) => src.split('\n').map(l => highlightLine(l, lang));

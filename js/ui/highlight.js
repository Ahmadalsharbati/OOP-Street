// highlight.js — colors for the Java code in the editor (keywords, types, strings, numbers, comments).

const KEYWORDS = new Set(['abstract', 'boolean', 'break', 'case', 'char', 'class', 'continue', 'default', 'do', 'double',
  'else', 'extends', 'false', 'final', 'float', 'for', 'if', 'implements', 'import', 'instanceof', 'int', 'interface',
  'long', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'short', 'byte', 'static', 'super',
  'switch', 'this', 'true', 'void', 'while', 'var']);

const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(@\w+)|(\b\d+(?:\.\d+)?[dDfFlL]?\b)|([A-Za-z_$][\w$]*)(\s*\()?/g;

function esc(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

export function highlightJava(src) {
  let out = '', last = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src))) {
    out += esc(src.slice(last, m.index));
    last = TOKEN.lastIndex;
    const [all, com, str, ann, num, word, paren] = m;
    if (com) out += `<span class="tk-com">${esc(com)}</span>`;
    else if (str) out += `<span class="tk-str">${esc(str)}</span>`;
    else if (ann) out += `<span class="tk-ann">${esc(ann)}</span>`;
    else if (num) out += `<span class="tk-num">${esc(num)}</span>`;
    else if (word) {
      let cls = null;
      if (KEYWORDS.has(word)) cls = 'tk-kw';
      else if (/^[A-Z]/.test(word)) cls = 'tk-type';
      else if (paren) cls = 'tk-fn';
      out += cls ? `<span class="${cls}">${esc(word)}</span>` : esc(word);
      if (paren) out += esc(paren);
    } else out += esc(all);
  }
  return out + esc(src.slice(last));
}

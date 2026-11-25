// lexer.js — turns Java source text into a list of tokens.
// A token = { type, value, line, col }.
// type is one of: 'ident', 'keyword', 'int', 'double', 'char', 'string', 'op', 'eof'.

import { JavaSyntaxError } from './errors.js';

const KEYWORDS = new Set([
  'abstract', 'boolean', 'break', 'case', 'char', 'class', 'continue', 'default',
  'do', 'double', 'else', 'extends', 'false', 'final', 'float', 'for', 'if',
  'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'new', 'null',
  'package', 'private', 'protected', 'public', 'return', 'short', 'byte', 'static',
  'super', 'switch', 'this', 'true', 'void', 'while', 'var',
]);

// Longest operators first, so ">>=" wins over ">".
const OPERATORS = [
  '>>>=', '<<=', '>>=', '>>>', '...', '->', '::',
  '++', '--', '&&', '||', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '<<', '>>',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '~', '?', ':', ';', ',', '.',
  '(', ')', '{', '}', '[', ']', '&', '|', '^', '@',
];

export function tokenize(src) {
  const tokens = [];
  let i = 0, line = 1, col = 1;

  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') { line++; col = 1; } else { col++; }
      i++;
    }
  };

  while (i < src.length) {
    const c = src[i];

    // whitespace
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { advance(); continue; }

    // comments
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') advance();
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const startLine = line;
      advance(2);
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) advance();
      if (i >= src.length) throw new JavaSyntaxError('Unclosed comment', startLine);
      advance(2);
      continue;
    }

    const start = { line, col };

    // identifiers and keywords
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      advance(j - i);
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, ...start });
      continue;
    }

    // numbers: 12, 12.5, .5, 1e3, 10L, 2.5f, 2d, 1_000
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      let isDouble = false;
      while (j < src.length && /[0-9_]/.test(src[j])) j++;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) {
        isDouble = true; j++;
        while (j < src.length && /[0-9_]/.test(src[j])) j++;
      } else if (src[j] === '.' && !/[A-Za-z_]/.test(src[j + 1] || '')) {
        isDouble = true; j++; // "5." is a valid double
      }
      if (src[j] === 'e' || src[j] === 'E') {
        isDouble = true; j++;
        if (src[j] === '+' || src[j] === '-') j++;
        while (j < src.length && /[0-9]/.test(src[j])) j++;
      }
      let text = src.slice(i, j).replace(/_/g, '');
      const suffix = src[j];
      if (suffix === 'd' || suffix === 'D' || suffix === 'f' || suffix === 'F') { isDouble = true; j++; }
      else if (suffix === 'l' || suffix === 'L') { j++; }
      advance(j - i);
      tokens.push({ type: isDouble ? 'double' : 'int', value: Number(text), ...start });
      continue;
    }

    // char literal
    if (c === "'") {
      advance();
      let ch;
      if (src[i] === '\\') { ch = readEscape(); }
      else { ch = src[i]; advance(); }
      if (src[i] !== "'") throw new JavaSyntaxError('Invalid character constant', start.line);
      advance();
      tokens.push({ type: 'char', value: ch, ...start });
      continue;
    }

    // string literal
    if (c === '"') {
      advance();
      let s = '';
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\n') throw new JavaSyntaxError('String literal is not properly closed by a double-quote', start.line);
        if (src[i] === '\\') s += readEscape();
        else { s += src[i]; advance(); }
      }
      if (i >= src.length) throw new JavaSyntaxError('String literal is not properly closed by a double-quote', start.line);
      advance();
      tokens.push({ type: 'string', value: s, ...start });
      continue;
    }

    // operators
    const op = OPERATORS.find(o => src.startsWith(o, i));
    if (op) {
      advance(op.length);
      tokens.push({ type: 'op', value: op, ...start });
      continue;
    }

    throw new JavaSyntaxError(`Syntax error on token "${c}", delete this token`, line);
  }

  tokens.push({ type: 'eof', value: '<end of file>', line, col });
  return tokens;

  function readEscape() {
    advance(); // the backslash
    const e = src[i];
    advance();
    switch (e) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'b': return '\b';
      case 'f': return '\f';
      case '0': return '\0';
      case '\\': return '\\';
      case "'": return "'";
      case '"': return '"';
      case 'u': {
        const hex = src.slice(i, i + 4);
        advance(4);
        return String.fromCharCode(parseInt(hex, 16));
      }
      default:
        throw new JavaSyntaxError('Invalid escape sequence (valid ones are  \\b  \\t  \\n  \\f  \\r  \\"  \\\'  \\\\ )', line);
    }
  }
}

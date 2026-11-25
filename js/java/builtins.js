// builtins.js — the parts of the Java library that OOP Street knows:
// System.out, String methods, Math, Integer, Double, Character, Arrays.toString.

import { CompilationProblem, JavaException, UnsupportedFeature } from './errors.js';
import {
  NULL, mkInt, mkLong, mkDouble, mkBool, mkChar, mkStr, mkRef,
  isNumeric, numOf, valueTypeName, primitiveToString, formatDouble,
} from './values.js';

// Library classes known by name. Those in java.util need an import, like in real Java.
export const BUILTIN_TYPES = new Set(['String', 'Object', 'Math', 'System', 'Integer', 'Double', 'Character', 'Boolean', 'Arrays', 'Scanner', 'ArrayList', 'List', 'Random']);
const IMPORTS = { Arrays: 'java.util.Arrays', Scanner: 'java.util.Scanner', ArrayList: 'java.util.ArrayList', List: 'java.util.List', Random: 'java.util.Random' };
export function needsImport(name) { return IMPORTS[name] || null; }

const LATER = {
  Scanner: 'Scanner (keyboard input) is not supported yet. Put your values directly in the code.',
  ArrayList: 'ArrayList is not supported yet (it comes later). Use an array for now.',
  List: 'List is not supported yet (it comes later). Use an array for now.',
  Random: 'Random is not supported yet. Use Math.random().',
};

export class BuiltinClasses {
  constructor(interp) { this.it = interp; }

  construct(name, args, line) {
    if (LATER[name]) throw new UnsupportedFeature(LATER[name], line);
    if (name === 'String') {
      if (args.length === 0) return mkStr('');
      if (args[0].t === 'String') return mkStr(args[0].v);
      if (args[0].t === 'ref' && args[0].obj.isArray && args[0].obj.elemType.name === 'char') return mkStr(args[0].obj.items.map(c => c.v).join(''));
    }
    if (name === 'Object') throw new UnsupportedFeature('new Object() is not supported.', line);
    throw new CompilationProblem(`Cannot instantiate the type ${name}`, line);
  }

  staticField(cls, name, line) {
    const table = {
      Math: { PI: mkDouble(Math.PI), E: mkDouble(Math.E) },
      Integer: { MAX_VALUE: mkInt(2147483647), MIN_VALUE: mkInt(-2147483648) },
      Double: { MAX_VALUE: mkDouble(Number.MAX_VALUE), MIN_VALUE: mkDouble(Number.MIN_VALUE) },
    };
    const v = table[cls]?.[name];
    if (v) return v;
    if (cls === 'System' && (name === 'out' || name === 'err')) {
      throw new UnsupportedFeature('Use System.out directly, like System.out.println(...).', line);
    }
    if (cls === 'System' && name === 'in') throw new UnsupportedFeature(LATER.Scanner, line);
    throw new CompilationProblem(`${name} cannot be resolved or is not a field`, line);
  }

  *printStream(stream, method, args, line) {
    const it = this.it;
    const kind = stream === 'err' ? 'err' : 'out';
    switch (method) {
      case 'println':
        if (args.length > 1) break;
        it.print((args.length ? yield* this.printText(args[0], line) : '') + '\n', kind);
        return;
      case 'print':
        if (args.length !== 1) break;
        it.print(yield* this.printText(args[0], line), kind);
        return;
      case 'printf': case 'format':
        if (args.length < 1 || args[0].t !== 'String') break;
        it.print(yield* this.format(args[0].v, args.slice(1), line), kind);
        return;
    }
    throw new CompilationProblem(`The method ${method}(${args.map(valueTypeName).join(', ')}) is undefined for the type PrintStream`, line);
  }

  *printText(v, line) {
    // println(char[]) prints the characters
    if (v.t === 'ref' && v.obj.isArray && v.obj.elemType.name === 'char' && v.obj.elemType.dims === 0) {
      return v.obj.items.map(c => c.v).join('');
    }
    return yield* this.it.stringOf(v, line);
  }

  // A small String.format: %d %s %f %.2f %5d %-10s %c %b %x %e %n %%
  *format(fmt, args, line) {
    let out = '';
    let argIndex = 0;
    const re = /%([-0+ ,(#]*)(\d+)?(\.\d+)?([a-zA-Z%])/g;
    let last = 0, m;
    while ((m = re.exec(fmt))) {
      out += fmt.slice(last, m.index);
      last = re.lastIndex;
      const [, flags, widthS, precS, conv] = m;
      if (conv === 'n') { out += '\n'; continue; }
      if (conv === '%') { out += '%'; continue; }
      if (argIndex >= args.length) {
        throw new JavaException('java.util.MissingFormatArgumentException', `Format specifier '%${flags}${widthS || ''}${precS || ''}${conv}'`, line);
      }
      const a = args[argIndex++];
      let s;
      const prec = precS ? Number(precS.slice(1)) : null;
      switch (conv) {
        case 'd':
          if (!(a.t === 'int' || a.t === 'long')) throw new JavaException('java.util.IllegalFormatConversionException', `d != ${javaBoxName(a)}`, line);
          s = String(a.v);
          if (flags.includes(',')) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          if (flags.includes('+') && a.v >= 0) s = '+' + s;
          break;
        case 'f':
          if (a.t !== 'double') throw new JavaException('java.util.IllegalFormatConversionException', `f != ${javaBoxName(a)}`, line);
          s = roundHalfUp(a.v, prec ?? 6);
          if (flags.includes(',')) { const [i, d] = s.split('.'); s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : ''); }
          if (flags.includes('+') && a.v >= 0) s = '+' + s;
          break;
        case 'e': case 'E':
          if (a.t !== 'double') throw new JavaException('java.util.IllegalFormatConversionException', `e != ${javaBoxName(a)}`, line);
          s = a.v.toExponential(prec ?? 6).replace(/e([+-])(\d)$/, 'e$10$2');
          if (conv === 'E') s = s.toUpperCase();
          break;
        case 's': case 'S':
          s = yield* this.it.stringOf(a, line);
          if (prec !== null) s = s.slice(0, prec);
          if (conv === 'S') s = s.toUpperCase();
          break;
        case 'c':
          s = a.t === 'char' ? a.v : a.t === 'int' ? String.fromCharCode(a.v) : (() => { throw new JavaException('java.util.IllegalFormatConversionException', `c != ${javaBoxName(a)}`, line); })();
          break;
        case 'b': case 'B':
          s = a.t === 'null' ? 'false' : a.t === 'boolean' ? String(a.v) : 'true';
          break;
        case 'x': case 'X':
          s = (a.v >>> 0).toString(16);
          if (conv === 'X') s = s.toUpperCase();
          break;
        default:
          throw new JavaException('java.util.UnknownFormatConversionException', `Conversion = '${conv}'`, line);
      }
      if (widthS) {
        const w = Number(widthS);
        if (flags.includes('-')) s = s.padEnd(w);
        else if (flags.includes('0') && /[dfxe]/i.test(conv)) s = s.startsWith('-') ? '-' + s.slice(1).padStart(w - 1, '0') : s.padStart(w, '0');
        else s = s.padStart(w);
      }
      out += s;
    }
    return out + fmt.slice(last);
  }

  *staticCall(cls, name, args, line) {
    if (LATER[cls]) throw new UnsupportedFeature(LATER[cls], line);
    const it = this.it;
    const n = (i) => numOf(args[i]);
    const num = (i) => {
      if (!args[i] || !isNumeric(args[i])) throw this.undefinedMethod(cls, name, args, line);
      return n(i);
    };
    const allInt = () => args.every(a => a.t === 'int' || a.t === 'char');
    const anyLong = () => args.some(a => a.t === 'long');
    switch (cls) {
      case 'Math':
        switch (name) {
          case 'abs': num(0); return args[0].t === 'double' ? mkDouble(Math.abs(n(0))) : args[0].t === 'long' ? mkLong(Math.abs(n(0))) : mkInt(Math.abs(n(0)));
          case 'max': case 'min': {
            num(0); num(1);
            const r = Math[name](n(0), n(1));
            return allInt() ? mkInt(r) : anyLong() && !args.some(a => a.t === 'double') ? mkLong(r) : mkDouble(r);
          }
          case 'pow': num(0); num(1); return mkDouble(Math.pow(n(0), n(1)));
          case 'sqrt': num(0); return mkDouble(Math.sqrt(n(0)));
          case 'cbrt': num(0); return mkDouble(Math.cbrt(n(0)));
          case 'floor': num(0); return mkDouble(Math.floor(n(0)));
          case 'ceil': num(0); return mkDouble(Math.ceil(n(0)));
          case 'round': num(0); return args[0].t === 'double' ? mkLong(Math.floor(n(0) + 0.5)) : mkInt(Math.floor(n(0) + 0.5));
          case 'random': if (args.length) break; return mkDouble(it.random.next());
        }
        break;
      case 'Integer':
        if (name === 'parseInt' && args[0]?.t === 'String') {
          const s = args[0].v;
          if (!/^[+-]?\d+$/.test(s) || Math.abs(Number(s)) > 2147483648) {
            throw new JavaException('java.lang.NumberFormatException', `For input string: "${s}"`, line, `"${s}" is not a whole number.`);
          }
          return mkInt(Number(s));
        }
        if (name === 'toString' && args.length === 1 && isNumeric(args[0])) return mkStr(String(n(0)));
        if (name === 'valueOf' && args[0]?.t === 'int') return args[0];
        if ((name === 'max' || name === 'min') && allInt() && args.length === 2) return mkInt(Math[name](n(0), n(1)));
        break;
      case 'Double':
        if (name === 'parseDouble' && args[0]?.t === 'String') {
          const s = args[0].v.trim();
          if (s === '' || Number.isNaN(Number(s))) throw new JavaException('java.lang.NumberFormatException', s === '' ? 'empty String' : `For input string: "${args[0].v}"`, line);
          return mkDouble(Number(s));
        }
        if (name === 'toString' && args.length === 1 && isNumeric(args[0])) return mkStr(formatDouble(n(0)));
        break;
      case 'String':
        if (name === 'valueOf' && args.length === 1) return mkStr(yield* it.stringOf(args[0], line));
        if (name === 'format' && args[0]?.t === 'String') return mkStr(yield* this.format(args[0].v, args.slice(1), line));
        if (name === 'join') break;
        break;
      case 'Character': {
        const c = args[0]?.t === 'char' ? args[0].v : null;
        if (c === null) break;
        switch (name) {
          case 'isDigit': return mkBool(/[0-9]/.test(c));
          case 'isLetter': return mkBool(/\p{L}/u.test(c));
          case 'isLetterOrDigit': return mkBool(/[\p{L}0-9]/u.test(c));
          case 'isUpperCase': return mkBool(c !== c.toLowerCase());
          case 'isLowerCase': return mkBool(c !== c.toUpperCase());
          case 'isWhitespace': return mkBool(/\s/.test(c));
          case 'toUpperCase': return mkChar(c.toUpperCase());
          case 'toLowerCase': return mkChar(c.toLowerCase());
          case 'getNumericValue': return mkInt(/[0-9]/.test(c) ? Number(c) : -1);
        }
        break;
      }
      case 'Boolean':
        if (name === 'parseBoolean' && args[0]?.t === 'String') return mkBool(args[0].v.toLowerCase() === 'true');
        break;
      case 'Arrays':
        if (name === 'toString' && args.length === 1) {
          const a = args[0];
          if (a.t === 'null') return mkStr('null');
          if (a.t === 'ref' && a.obj.isArray) {
            const parts = [];
            for (const x of a.obj.items) parts.push(yield* it.stringOf(x, line));
            return mkStr('[' + parts.join(', ') + ']');
          }
        }
        if (name === 'fill' && args.length === 2 && args[0].t === 'ref' && args[0].obj.isArray) {
          const arr = args[0].obj;
          for (let i = 0; i < arr.items.length; i++) arr.items[i] = it.convertForAssign(args[1], arr.elemType, null, line);
          it.event({ type: 'arrayFill', id: arr.id });
          return null;
        }
        if (name === 'sort' && args.length === 1 && args[0].t === 'ref' && args[0].obj.isArray) {
          const arr = args[0].obj;
          if (arr.elemType.name === 'String') arr.items.sort((x, y) => (x.v < y.v ? -1 : x.v > y.v ? 1 : 0));
          else if (arr.elemType.dims === 0 && ['int', 'double', 'char', 'long'].includes(arr.elemType.name)) arr.items.sort((x, y) => numOf(x) - numOf(y));
          else throw new UnsupportedFeature('Arrays.sort on objects is not supported yet.', line);
          it.event({ type: 'arrayFill', id: arr.id });
          return null;
        }
        break;
      case 'System':
        if (name === 'exit') { it.exited = true; throw new ProgramExit(); }
        if (name === 'currentTimeMillis') return mkLong(1764100000000);
        if (name === 'nanoTime') return mkLong(123456789);
        break;
      case 'Object':
        break;
    }
    throw this.undefinedMethod(cls, name, args, line);
  }

  undefinedMethod(cls, name, args, line) {
    return new CompilationProblem(`The method ${name}(${args.map(valueTypeName).join(', ')}) is undefined for the type ${cls}`, line);
  }

  *stringMethod(s, name, args, line) {
    const str = s.v;
    const it = this.it;
    const argT = args.map(a => a.t).join(',');
    const idx = (i, len) => {
      if (i < 0 || i > len) throw new JavaException('java.lang.StringIndexOutOfBoundsException', `Index ${i} out of bounds for length ${str.length}`, line);
      return i;
    };
    switch (name + '/' + argT) {
      case 'length/': return mkInt(str.length);
      case 'isEmpty/': return mkBool(str.length === 0);
      case 'isBlank/': return mkBool(str.trim().length === 0);
      case 'charAt/int': {
        const i = args[0].v;
        if (i < 0 || i >= str.length) throw new JavaException('java.lang.StringIndexOutOfBoundsException', `Index ${i} out of bounds for length ${str.length}`, line,
          `"${str}" has ${str.length} characters, numbered 0 to ${str.length - 1}.`);
        return mkChar(str[i]);
      }
      case 'toUpperCase/': return mkStr(str.toUpperCase());
      case 'toLowerCase/': return mkStr(str.toLowerCase());
      case 'trim/': case 'strip/': return mkStr(str.trim());
      case 'substring/int': return mkStr(str.slice(idx(args[0].v, str.length)));
      case 'substring/int,int': {
        const a = args[0].v, b = args[1].v;
        if (a < 0 || b > str.length || a > b) throw new JavaException('java.lang.StringIndexOutOfBoundsException', `begin ${a}, end ${b}, length ${str.length}`, line);
        return mkStr(str.slice(a, b));
      }
      case 'concat/String': return mkStr(str + args[0].v);
      case 'repeat/int': return mkStr(str.repeat(Math.max(0, args[0].v)));
      case 'toCharArray/': {
        const arr = it.newArray({ name: 'char', dims: 0 }, str.length, line);
        arr.items = [...str].map(c => mkChar(c));
        return mkRef(arr);
      }
      case 'split/String': {
        let parts = str.split(new RegExp(args[0].v));
        while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
        const arr = it.newArray({ name: 'String', dims: 0 }, parts.length, line);
        arr.items = parts.map(p => mkStr(p));
        return mkRef(arr);
      }
      case 'hashCode/': {
        let h = 0;
        for (const c of str) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
        return mkInt(h);
      }
      case 'toString/': return s;
    }
    // methods that take a String or char, or Object
    const a0 = args[0];
    const asText = (v) => v.t === 'String' ? v.v : v.t === 'char' ? v.v : null;
    if (args.length === 1 && a0) {
      switch (name) {
        case 'equals': return mkBool(a0.t === 'String' && a0.v === str);
        case 'equalsIgnoreCase': return mkBool(a0.t === 'String' && a0.v.toLowerCase() === str.toLowerCase());
        case 'compareTo': if (a0.t === 'String') return mkInt(compareJava(str, a0.v)); break;
        case 'compareToIgnoreCase': if (a0.t === 'String') return mkInt(compareJava(str.toLowerCase(), a0.v.toLowerCase())); break;
        case 'contains': if (a0.t === 'String') return mkBool(str.includes(a0.v)); break;
        case 'startsWith': if (a0.t === 'String') return mkBool(str.startsWith(a0.v)); break;
        case 'endsWith': if (a0.t === 'String') return mkBool(str.endsWith(a0.v)); break;
        case 'indexOf': if (asText(a0) !== null) return mkInt(str.indexOf(asText(a0))); if (a0.t === 'int') return mkInt(str.indexOf(String.fromCharCode(a0.v))); break;
        case 'lastIndexOf': if (asText(a0) !== null) return mkInt(str.lastIndexOf(asText(a0))); break;
      }
      if (a0.t === 'null' && (name === 'contains' || name === 'compareTo' || name === 'startsWith' || name === 'endsWith')) {
        throw it.npe('', line);
      }
    }
    if (name === 'replace' && args.length === 2 && asText(args[0]) !== null && asText(args[1]) !== null) {
      return mkStr(str.split(asText(args[0])).join(asText(args[1])));
    }
    if (name === 'indexOf' && args.length === 2 && asText(args[0]) !== null && args[1].t === 'int') {
      return mkInt(str.indexOf(asText(args[0]), args[1].v));
    }
    throw new CompilationProblem(`The method ${name}(${args.map(valueTypeName).join(', ')}) is undefined for the type String`, line);
  }
}

export class ProgramExit extends Error {}

function compareJava(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a.charCodeAt(i) - b.charCodeAt(i);
  return a.length - b.length;
}

function javaBoxName(v) {
  return { int: 'java.lang.Integer', long: 'java.lang.Long', double: 'java.lang.Double', boolean: 'java.lang.Boolean', char: 'java.lang.Character', String: 'java.lang.String' }[v.t] || 'java.lang.Object';
}

// Java's %.2f rounds HALF_UP on the decimal value
function roundHalfUp(x, digits) {
  if (!Number.isFinite(x)) return formatDouble(x);
  const s = x.toFixed(Math.min(20, digits + 3));
  const neg = s.startsWith('-');
  const [i, d = ''] = (neg ? s.slice(1) : s).split('.');
  let keep = i + d.slice(0, digits);
  const next = Number(d[digits] || '0');
  if (next >= 5) {
    keep = (BigInt(keep) + 1n).toString().padStart(keep.length, '0');
  }
  const intPart = keep.slice(0, keep.length - digits) || '0';
  const decPart = keep.slice(keep.length - digits);
  const res = digits > 0 ? intPart + '.' + decPart : intPart;
  return (neg && /[1-9]/.test(res) ? '-' : '') + res;
}
// keep imports used
void NULL; void primitiveToString;

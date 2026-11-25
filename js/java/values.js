// values.js — how Java values live inside OOP Street.
//
// Every value is a small object with a tag `t`:
//   { t: 'int', v: 5 }        int, long, short, byte  (v is a JS number)
//   { t: 'double', v: 2.5 }   double, float
//   { t: 'boolean', v: true }
//   { t: 'char', v: 'A' }
//   { t: 'String', v: 'Jean', sid: 'lit:Jean' }   sid = identity (for the classic == bug)
//   { t: 'null' }
//   { t: 'ref', obj }         obj = an object or an array on the heap (the "tas")
//   { t: 'class', cls }       a class name used as a value, e.g. in  Etudiant.compteur

export const NULL = Object.freeze({ t: 'null' });

export const mkInt = (v) => ({ t: 'int', v: v | 0 });
export const mkLong = (v) => ({ t: 'long', v: Math.trunc(v) });
export const mkDouble = (v) => ({ t: 'double', v });
export const mkBool = (v) => ({ t: 'boolean', v: !!v });
export const mkChar = (v) => ({ t: 'char', v });
let stringCounter = 0;
export const mkStr = (v, sid) => ({ t: 'String', v, sid: sid ?? 'new:' + (++stringCounter) });
export const mkLiteralStr = (v) => ({ t: 'String', v, sid: 'lit:' + v });
export const mkRef = (obj) => ({ t: 'ref', obj });

export const PRIMS = ['byte', 'short', 'char', 'int', 'long', 'float', 'double', 'boolean'];
export const NUMERIC_RANK = { byte: 1, short: 2, char: 2, int: 3, long: 4, float: 5, double: 6 };

export function isPrimitiveName(name) { return PRIMS.includes(name); }
export function isNumeric(v) { return v.t === 'int' || v.t === 'long' || v.t === 'double' || v.t === 'char'; }
export function numOf(v) { return v.t === 'char' ? v.v.charCodeAt(0) : v.v; }

// Name of a type descriptor {name, dims}
export function typeName(type) {
  return type.name + '[]'.repeat(type.dims || 0);
}

// Type name of a runtime value, used in error messages: "int", "String", "Etudiant", "null"
export function valueTypeName(v) {
  switch (v.t) {
    case 'ref': return v.obj.isArray ? typeName(v.obj.elemType) + '[]' : v.obj.cls.name;
    case 'class': return v.cls.name;
    default: return v.t;
  }
}

// Default value of a field or array cell
export function defaultValue(type) {
  if (type.dims > 0) return NULL;
  switch (type.name) {
    case 'int': case 'short': case 'byte': return mkInt(0);
    case 'long': return mkLong(0);
    case 'double': case 'float': return mkDouble(0);
    case 'boolean': return mkBool(false);
    case 'char': return mkChar('\0');
    default: return NULL;
  }
}

// Java's Double.toString
export function formatDouble(x) {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Infinity';
  if (x === -Infinity) return '-Infinity';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const a = Math.abs(x);
  if (a >= 1e-3 && a < 1e7) {
    const s = String(x);
    return s.includes('.') ? s : s + '.0';
  }
  // scientific: 1.0E7, 1.234E-5
  let [mant, exp] = x.toExponential().split('e');
  if (!mant.includes('.')) mant += '.0';
  return mant + 'E' + (exp.startsWith('+') ? exp.slice(1) : exp);
}

// Text of a primitive/String value (objects are handled by the interpreter, they may call toString()).
export function primitiveToString(v) {
  switch (v.t) {
    case 'int': case 'long': return String(v.v);
    case 'double': return formatDouble(v.v);
    case 'boolean': return v.v ? 'true' : 'false';
    case 'char': return v.v;
    case 'String': return v.v;
    case 'null': return 'null';
    default: return '?';
  }
}

// The hash codes a fresh JVM usually prints (Etudiant@1b6d3586 ...). Looks real in the console.
const JVM_HASHES = ['1b6d3586', '4554617c', '74a14482', '1540e19d', '677327b6', '14ae5a5', '7f31245a',
  '6d6f6e28', '135fbaa4', '45ee12a7', '330bedb4', '2503dbd3', '4b67cf4d', '7ea987ac', '12a3a380',
  '29453f44', '5cad8086', '6e0be858', '61bbe9ba', '610455d6', '511d50c0', '60e53b93', '5e2de80c'];

export class HashSource {
  constructor() { this.n = 0; this.seed = 0x5bd1e995; }
  next() {
    if (this.n < JVM_HASHES.length) return JVM_HASHES[this.n++];
    this.seed = (Math.imul(this.seed ^ (this.seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) | 0;
    return ((this.seed >>> 1) & 0x7fffffff).toString(16);
  }
}

// Small deterministic random generator, so "Back" replays give the same Math.random() values.
export class SeededRandom {
  constructor(seed = 42) { this.s = seed >>> 0; }
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

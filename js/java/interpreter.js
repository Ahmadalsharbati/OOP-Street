// interpreter.js — runs a Java program step by step.
//
// How stepping works:
//   Every function that executes code is a JavaScript *generator*.
//   Before each statement, the interpreter does `yield` (a "stop").
//   The runner (runner.js) collects every stop with a snapshot of the memory,
//   so the UI can go forward AND backward.
//
// Memory model (same words as the course):
//   - pile (stack): the frames of the methods being executed, each with its local variables.
//   - tas (heap):   the objects and arrays created with `new`.
//   - static fields live on the class itself (one copy for all objects).

import { CompilationProblem, JavaException, UnsupportedFeature } from './errors.js';
import {
  NULL, mkInt, mkLong, mkDouble, mkBool, mkChar, mkStr, mkLiteralStr, mkRef,
  isPrimitiveName, isNumeric, numOf, NUMERIC_RANK, typeName, valueTypeName, defaultValue,
  primitiveToString, formatDouble, HashSource, SeededRandom,
} from './values.js';
import { BuiltinClasses, BUILTIN_TYPES, needsImport } from './builtins.js';

const MAX_DEPTH = 400;   // frames before StackOverflowError

class Completion {
  constructor(type, value = null) { this.type = type; this.value = value; }
}
const NORMAL = new Completion('normal');
const BREAK = new Completion('break');
const CONTINUE = new Completion('continue');

export class Interpreter {
  constructor(program) {
    this.program = program;
    this.classes = new Map();      // simple name -> ClassInfo
    this.frames = [];              // the pile
    this.heap = [];                // the tas (every object/array ever created)
    this.output = [];              // console lines: { text, kind: 'out'|'err' }
    this.events = [];              // what happened since the last stop (for the 3D scene)
    this.nextId = 18;              // object ids, like the Eclipse debugger "id=18"
    this.hashes = new HashSource();
    this.random = new SeededRandom(7);
    this.problems = [];            // problems found before running (like Eclipse's Problems view)
    this.exited = false;
    this.builtins = new BuiltinClasses(this);
    this.loadClasses();
  }

  // ================= loading classes =================
  loadClasses() {
    for (const decl of this.program.classes) {
      if (this.classes.has(decl.name)) {
        this.problem(`The type ${decl.name} is already defined`, decl.line);
        continue;
      }
      if (decl.superName && decl.superName !== 'Object') {
        throw new UnsupportedFeature(`"extends" (inheritance) is not supported yet: class ${decl.name} extends ${decl.superName}.`, decl.line);
      }
      const info = {
        decl, name: decl.name, pkg: decl.pkg,
        fullName: decl.pkg ? decl.pkg + '.' + decl.name : decl.name,
        fields: new Map(),          // name -> field decl (instance and static)
        statics: new Map(),         // name -> value (static fields only)
        methods: decl.methods,
        ctors: decl.ctors,
        isPublic: decl.modifiers.visibility === 'public',
      };
      for (const f of decl.fields) {
        if (info.fields.has(f.name)) { f.problem = `Duplicate field ${decl.name}.${f.name}`; this.problem(f.problem, f.line); }
        else info.fields.set(f.name, f);
      }
      this.classes.set(decl.name, info);
    }

    // Checks that Eclipse would show as red marks before running.
    for (const info of this.classes.values()) {
      for (const f of info.decl.fields) this.checkTypeExists(f.type, info, f.line, f);
      const seen = new Map();
      for (const m of [...info.methods, ...info.ctors]) {
        const sig = m.name + '(' + m.params.map(p => typeName(p.type)).join(', ') + ')';
        if (seen.has(sig)) {
          m.problem = m.isCtor ? `Duplicate method ${sig} in type ${info.name}` : `Duplicate method ${sig} in type ${info.name}`;
          this.problem(m.problem, m.line);
        }
        seen.set(sig, m);
        for (const p of m.params) this.checkTypeExists(p.type, info, m.line, m);
        if (!m.isCtor && m.returnType.name !== 'void') {
          this.checkTypeExists(m.returnType, info, m.line, m);
          if (canCompleteNormally(m.body)) {
            m.problem = `This method must return a result of type ${typeName(m.returnType)}`;
            this.problem(m.problem, m.line);
          }
        }
      }
    }

    // static fields: default values first, then their initializers run when the program starts
    for (const info of this.classes.values()) {
      for (const f of info.fields.values()) {
        if (f.modifiers.static) info.statics.set(f.name, defaultValue(f.type));
      }
    }
  }

  problem(message, line) { this.problems.push({ message, line }); }

  checkTypeExists(type, info, line, member) {
    if (isPrimitiveName(type.name) || type.name === 'void') return;
    if (type.generic) {
      const p = `Generic types like ${type.name}${type.generic} are not supported yet`;
      member.unsupported = member.unsupported || p;
      return;
    }
    try { this.resolveClassName(type.name, info, line); }
    catch (e) {
      if (e instanceof CompilationProblem) {
        member.problem = member.problem || e.message;
        this.problem(e.message, line);
      } else throw e;
    }
  }

  // Find which class holds main.
  findMainClasses() {
    const result = [];
    for (const info of this.classes.values()) {
      const m = info.methods.find(m => m.name === 'main' && m.modifiers.static && m.returnType.name === 'void' &&
        m.params.length === 1 && m.params[0].type.name === 'String' && m.params[0].type.dims === 1);
      if (m) result.push(info.name);
    }
    return result;
  }

  // ================= running =================
  // The main generator. Yields a "stop" before each statement.
  *run(mainClassName) {
    const info = this.classes.get(mainClassName);
    const main = info.methods.find(m => m.name === 'main' && m.modifiers.static);
    if (main.modifiers.visibility !== 'public') {
      throw new CompilationProblem('Error: Main method not found in class ' + info.name + ', please define the main method as: public static void main(String[] args)', main.line);
    }
    this.event({ type: 'start', main: info.name });

    yield* this.ensureInit(info);

    const argsArray = this.newArray({ name: 'String', dims: 0 }, 0);
    yield* this.invoke(info, main, null, [mkRef(argsArray)], main.line);
    this.event({ type: 'end' });
  }

  // Java prepares a class (its static fields) the first time the class is used.
  *ensureInit(c) {
    if (!c || c.builtin || c.initialized) return;
    c.initialized = true;
    this.event({ type: 'classInit', cls: c.name });
    for (const f of c.fields.values()) {
      if (f.modifiers.static && f.init) {
        if (f.problem) throw new CompilationProblem(f.problem, f.line);
        this.pushFrame({ cls: c, method: null, label: c.name + '.<clinit>', thisObj: null, isStatic: true, line: f.line });
        yield* this.stop(f.line);
        const v = yield* this.evalInit(f.init, f.type);
        c.statics.set(f.name, this.convertForAssign(v, f.type, f.init, f.line));
        this.event({ type: 'staticSet', cls: c.name, field: f.name, value: this.describeValue(c.statics.get(f.name)) });
        this.frames.pop();
      }
    }
  }

  *stop(line) {
    if (this.exited) return;
    const f = this.frames[this.frames.length - 1];
    if (f) f.line = line;
    const events = this.events;
    this.events = [];
    yield { line, depth: this.frames.length, events };
  }

  event(e) { this.events.push(e); }

  print(text, kind = 'out') {
    // Java prints in a stream: keep partial lines with print()
    const last = this.output[this.output.length - 1];
    const parts = text.split('\n');
    if (last && !last.closed && last.kind === kind) last.text += parts[0];
    else this.output.push({ text: parts[0], kind, closed: false });
    for (let i = 1; i < parts.length; i++) {
      this.output[this.output.length - 1].closed = true;
      this.output.push({ text: parts[i], kind, closed: false });
    }
    this.event({ type: 'print', text, kind });
  }

  pushFrame(frame) {
    if (this.frames.length >= MAX_DEPTH) {
      throw new JavaException('java.lang.StackOverflowError', '', frame.line,
        'A method keeps calling itself (or two methods call each other) forever. The pile (stack) is full.');
    }
    frame.scopes = [new Map()];
    frame.id = this.frames.length;
    this.frames.push(frame);
  }

  get frame() { return this.frames[this.frames.length - 1]; }
  get currentClass() { return this.frame?.cls; }

  // ================= invoking methods and constructors =================
  *invoke(cls, method, thisObj, args, callLine) {
    if (method.problem) throw new CompilationProblem(method.problem, callLine);
    if (method.unsupported) throw new UnsupportedFeature(method.unsupported, method.line);
    const label = cls.name + '.' + (method.isCtor ? cls.name : method.name) + '(' + method.params.map(p => typeName(p.type)).join(', ') + ')';
    this.pushFrame({ cls, method, label, thisObj, isStatic: !!method.modifiers.static, line: method.line });
    const frame = this.frame;
    method.params.forEach((p, i) => {
      frame.scopes[0].set(p.name, { type: p.type, value: this.convertForAssign(args[i], p.type, null, callLine), final: p.final, assigned: true, param: true });
    });
    frame.fieldSets = 0;
    this.event({ type: 'call', cls: cls.name, method: method.isCtor ? '<init>' : method.name, thisId: thisObj?.id ?? null, static: !!method.modifiers.static, line: callLine,
      args: method.params.map((p, i) => ({ name: p.name, value: this.describeValue(frame.scopes[0].get(p.name).value) })) });

    let result = null;
    if (method.isCtor) {
      result = yield* this.runCtorBody(cls, method, thisObj);
    } else {
      const c = yield* this.execBlockStmts(method.body.stmts, true);
      if (c.type === 'return') result = c.value;
      else yield* this.stop(method.endLine); // the closing "}" — like Eclipse
    }
    // a setter that changed nothing: it refused the value (setAge(-3) with an if inside)
    if (!method.isCtor && thisObj && /^set[A-Z]/.test(method.name) && method.params.length === 1 && frame.fieldSets === 0) {
      const field = method.name.charAt(3).toLowerCase() + method.name.slice(4);
      this.event({ type: 'rejected', id: thisObj.id, cls: cls.name, method: method.name, field: thisObj.fields.has(field) ? field : null,
        value: this.describeValue(args[0]), kept: thisObj.fields.has(field) ? this.describeValue(thisObj.fields.get(field)) : null });
    }
    this.frames.pop();
    this.event({ type: 'return', cls: cls.name, method: method.isCtor ? '<init>' : method.name, thisId: thisObj?.id ?? null, value: result ? this.describeValue(result) : null });
    return result;
  }

  *runCtorBody(cls, ctor, obj) {
    const stmts = ctor.body.stmts;
    let start = 0;
    if (stmts[0] && stmts[0].kind === 'ThisCall') {
      // this(...) : another constructor of the same class does the field initialisation
      const call = stmts[0];
      yield* this.stop(call.line);
      const args = yield* this.evalArgs(call.args);
      const target = this.chooseMethod(cls, cls.ctors, args, call.line, true);
      yield* this.invoke(cls, target, obj, args, call.line);
      start = 1;
    } else {
      if (stmts[0] && stmts[0].kind === 'SuperCall') {
        if (stmts[0].args.length) throw new UnsupportedFeature('super(...) with arguments needs inheritance, not supported yet.', stmts[0].line);
        start = 1;
      }
      yield* this.initInstanceFields(cls, obj);
    }
    for (let i = start; i < stmts.length; i++) {
      const s = stmts[i];
      if (s.kind === 'ThisCall') throw new CompilationProblem('Constructor call must be the first statement in a constructor', s.line);
      const c = yield* this.exec(s);
      if (c.type === 'return') break;
    }
    yield* this.stop(ctor.endLine);
    // blank final fields must be set by the constructor
    for (const f of cls.fields.values()) {
      if (f.modifiers.final && !f.modifiers.static && !f.init && !obj.finalAssigned.has(f.name)) {
        throw new CompilationProblem(`The blank final field ${f.name} may not have been initialized`, ctor.line);
      }
    }
    return null;
  }

  *initInstanceFields(cls, obj) {
    for (const f of cls.fields.values()) {
      if (f.modifiers.static || !f.init) continue;
      if (f.problem) throw new CompilationProblem(f.problem, f.line);
      yield* this.stop(f.line);
      const v = yield* this.evalInit(f.init, f.type);
      obj.fields.set(f.name, this.convertForAssign(v, f.type, f.init, f.line));
      if (f.modifiers.final) obj.finalAssigned.add(f.name);
      this.event({ type: 'fieldSet', id: obj.id, field: f.name, value: this.describeValue(obj.fields.get(f.name)) });
    }
  }

  *construct(cls, args, line) {
    yield* this.ensureInit(cls);
    if (cls.decl.modifiers.abstract) throw new CompilationProblem(`Cannot instantiate the type ${cls.name}`, line);
    const obj = {
      id: this.nextId++, cls, fields: new Map(), finalAssigned: new Set(), hash: null,
    };
    for (const f of cls.fields.values()) {
      if (!f.modifiers.static) obj.fields.set(f.name, defaultValue(f.type));
    }
    if (cls.ctors.length === 0) {
      // default constructor: only exists when you wrote none
      if (args.length > 0) {
        throw new CompilationProblem(`The constructor ${cls.name}(${args.map(valueTypeName).join(', ')}) is undefined`, line,
          `${cls.name} has no constructor with parameters. Java only gives you the empty one: new ${cls.name}().`);
      }
      this.heap.push(obj);
      this.event({ type: 'new', id: obj.id, cls: cls.name, line });
      this.pushFrame({ cls, method: null, label: cls.name + '.' + cls.name + '()', thisObj: obj, isStatic: false, line: cls.decl.line });
      this.event({ type: 'call', cls: cls.name, method: '<init>', thisId: obj.id, static: false, line });
      yield* this.stop(cls.decl.line);
      yield* this.initInstanceFields(cls, obj);
      this.frames.pop();
      this.event({ type: 'return', cls: cls.name, method: '<init>', value: null });
      return obj;
    }
    const ctor = this.chooseMethod(cls, cls.ctors, args, line, true);
    this.heap.push(obj);
    this.event({ type: 'new', id: obj.id, cls: cls.name, line });
    yield* this.invoke(cls, ctor, obj, args, line);
    return obj;
  }

  // Overload resolution: pick the method whose parameters accept these arguments.
  chooseMethod(cls, candidates, args, line, isCtor, name) {
    const sameArity = candidates.filter(m => m.params.length === args.length);
    const applicable = [];
    for (const m of sameArity) {
      let cost = 0, ok = true;
      for (let i = 0; i < args.length; i++) {
        const c = this.conversionCost(args[i], m.params[i].type);
        if (c < 0) { ok = false; break; }
        cost += c;
      }
      if (ok) applicable.push({ m, cost });
    }
    const argText = args.map(valueTypeName).join(', ');
    if (applicable.length === 0) {
      if (isCtor) {
        const available = candidates.map(m => `new ${cls.name}(${m.params.map(p => typeName(p.type)).join(', ')})`).join('  or  ');
        throw new CompilationProblem(`The constructor ${cls.name}(${argText}) is undefined`, line,
          `No constructor of ${cls.name} takes (${argText}). You can use: ${available}.`);
      }
      if (candidates.length === 1) {
        const m = candidates[0];
        throw new CompilationProblem(`The method ${name}(${m.params.map(p => typeName(p.type)).join(', ')}) in the type ${cls.name} is not applicable for the arguments (${argText})`, line);
      }
      throw new CompilationProblem(`The method ${name}(${argText}) is undefined for the type ${cls.name}`, line);
    }
    applicable.sort((a, b) => a.cost - b.cost);
    if (applicable.length > 1 && applicable[0].cost === applicable[1].cost) {
      throw new CompilationProblem(`The ${isCtor ? 'constructor' : 'method'} ${isCtor ? cls.name : name}(${argText}) is ambiguous for the type ${cls.name}`, line);
    }
    return applicable[0].m;
  }

  // -1 = not allowed, 0 = exact, >0 = needs widening
  conversionCost(v, type) {
    if (type.dims > 0) {
      if (v.t === 'null') return 1;
      if (v.t === 'ref' && v.obj.isArray && typeName(v.obj.elemType) + '[]' === typeName(type)) return 0;
      return -1;
    }
    const tn = type.name;
    if (isPrimitiveName(tn)) {
      if (!isNumeric(v) && v.t !== 'boolean') return -1;
      if (tn === 'boolean' || v.t === 'boolean') return tn === v.t ? 0 : -1;
      const from = v.t === 'long' ? 'long' : v.t === 'double' ? 'double' : v.t === 'char' ? 'char' : 'int';
      if (from === tn) return 0;
      if (tn === 'char') return -1;
      if (from === 'char' && (tn === 'short' || tn === 'byte')) return -1;
      return NUMERIC_RANK[from] < NUMERIC_RANK[tn] ? NUMERIC_RANK[tn] - NUMERIC_RANK[from] : -1;
    }
    if (tn === 'Object') return v.t === 'ref' || v.t === 'String' || v.t === 'null' ? 2 : 5;
    if (tn === 'String') return v.t === 'String' ? 0 : v.t === 'null' ? 1 : -1;
    if (tn === 'Integer') return v.t === 'int' ? 1 : v.t === 'null' ? 1 : -1;
    if (tn === 'Double') return v.t === 'double' ? 1 : v.t === 'null' ? 1 : -1;
    if (v.t === 'null') return 1;
    if (v.t === 'ref' && !v.obj.isArray && v.obj.cls.name === tn) return 0;
    return -1;
  }

  // Assignment conversion (int -> double widening, type mismatch errors)
  convertForAssign(v, type, expr, line) {
    if (v === undefined || v === null) {
      throw new CompilationProblem('Type mismatch: cannot convert from void to ' + typeName(type), line);
    }
    const tn = type.name;
    if (type.dims === 0 && isPrimitiveName(tn)) {
      if (tn === 'boolean') {
        if (v.t === 'boolean') return v;
      } else if (isNumeric(v)) {
        const n = numOf(v);
        const literalInt = expr && (expr.kind === 'Literal' || isConstantExpr(expr)) && v.t === 'int';
        switch (tn) {
          case 'double': case 'float': return mkDouble(n);
          case 'long': if (v.t !== 'double') return mkLong(n); break;
          case 'int': if (v.t === 'int' || v.t === 'char') return mkInt(n); break;
          case 'short': case 'byte': if (v.t === 'int' && literalInt) return mkInt(n); if (v.t === 'int' && !expr) return v; break;
          case 'char':
            if (v.t === 'char') return v;
            if (literalInt && n >= 0 && n < 65536) return mkChar(String.fromCharCode(n));
            break;
        }
      }
      throw new CompilationProblem(`Type mismatch: cannot convert from ${valueTypeName(v)} to ${tn}`, line);
    }
    if (this.conversionCost(v, type) >= 0) {
      if ((tn === 'Integer' || tn === 'Double' || tn === 'Object') && type.dims === 0) return v;
      return v;
    }
    throw new CompilationProblem(`Type mismatch: cannot convert from ${valueTypeName(v)} to ${typeName(type)}`, line);
  }

  // ================= statements =================
  *execBlockStmts(stmts, isMethodBody = false) {
    const frame = this.frame;
    if (!isMethodBody) frame.scopes.push(new Map());
    try {
      for (const s of stmts) {
        const c = yield* this.exec(s);
        if (c.type !== 'normal') return c;
      }
      return NORMAL;
    } finally {
      if (!isMethodBody) frame.scopes.pop();
    }
  }

  *exec(s) {
    switch (s.kind) {
      case 'Block': return yield* this.execBlockStmts(s.stmts);
      case 'Empty': return NORMAL;

      case 'LocalVar': {
        yield* this.stop(s.line);
        for (const d of s.decls) {
          let type = d.type;
          if (type.generic) throw new UnsupportedFeature(`Generic types like ${type.name}${type.generic} are not supported yet (ArrayList comes later).`, s.line);
          if (type.name !== 'var' && !isPrimitiveName(type.name)) this.resolveClassName(type.name, this.currentClass, s.line);
          if (this.lookupLocal(d.name)) throw new CompilationProblem(`Duplicate local variable ${d.name}`, d.line);
          let value = null;
          if (d.init) {
            const v = yield* this.evalInit(d.init, type);
            if (type.name === 'var') type = typeOfValue(v);
            value = this.convertForAssign(v, type, d.init, d.line);
          } else if (type.name === 'var') {
            throw new CompilationProblem(`Cannot use 'var' on variable without initializer`, d.line);
          }
          this.frame.scopes[this.frame.scopes.length - 1].set(d.name, { type, value, final: s.final, assigned: !!d.init });
          this.event({ type: 'varDeclare', name: d.name, frame: this.frame.id, value: value ? this.describeValue(value) : null });
        }
        return NORMAL;
      }

      case 'ExprStmt':
        yield* this.stop(s.line);
        yield* this.eval(s.expr, true);
        return NORMAL;

      case 'If': {
        yield* this.stop(s.line);
        const c = yield* this.evalCondition(s.cond);
        if (c) return yield* this.execScoped(s.then);
        if (s.else) return yield* this.execScoped(s.else);
        return NORMAL;
      }

      case 'While': {
        for (;;) {
          yield* this.stop(s.line);
          if (!(yield* this.evalCondition(s.cond))) break;
          const c = yield* this.execScoped(s.body);
          if (c.type === 'break') break;
          if (c.type === 'return') return c;
        }
        return NORMAL;
      }

      case 'DoWhile': {
        for (;;) {
          const c = yield* this.execScoped(s.body);
          if (c.type === 'break') break;
          if (c.type === 'return') return c;
          yield* this.stop(s.condLine);
          if (!(yield* this.evalCondition(s.cond))) break;
        }
        return NORMAL;
      }

      case 'For': {
        this.frame.scopes.push(new Map());
        try {
          yield* this.stop(s.line);
          for (const init of s.init) {
            if (init.kind === 'LocalVar') {
              for (const d of init.decls) {
                if (this.lookupLocal(d.name)) throw new CompilationProblem(`Duplicate local variable ${d.name}`, d.line);
                const v = d.init ? this.convertForAssign(yield* this.evalInit(d.init, d.type), d.type, d.init, d.line) : null;
                this.frame.scopes[this.frame.scopes.length - 1].set(d.name, { type: d.type, value: v, final: init.final, assigned: !!d.init });
              }
            } else yield* this.eval(init.expr, true);
          }
          let first = true;
          for (;;) {
            if (!first) {
              yield* this.stop(s.line);
              for (const u of s.update) yield* this.eval(u, true);
            }
            first = false;
            if (s.cond && !(yield* this.evalCondition(s.cond))) break;
            const c = yield* this.execScoped(s.body);
            if (c.type === 'break') break;
            if (c.type === 'return') return c;
          }
          return NORMAL;
        } finally {
          this.frame.scopes.pop();
        }
      }

      case 'ForEach': {
        yield* this.stop(s.line);
        const it = yield* this.eval(s.iter);
        if (it.t === 'null') throw this.npe(`Cannot read the array length because ${this.describeExpr(s.iter)} is null`, s.line);
        if (it.t !== 'ref' || !it.obj.isArray) throw new CompilationProblem('Can only iterate over an array or an instance of java.lang.Iterable', s.line);
        const arr = it.obj;
        for (let i = 0; i < arr.items.length; i++) {
          if (i > 0) yield* this.stop(s.line);
          this.frame.scopes.push(new Map());
          try {
            const type = s.type.name === 'var' ? arr.elemType : s.type;
            this.frame.scopes[this.frame.scopes.length - 1].set(s.name, { type, value: this.convertForAssign(arr.items[i], type, null, s.line), final: s.final, assigned: true });
            const c = yield* this.execScoped(s.body);
            if (c.type === 'break') break;
            if (c.type === 'return') return c;
          } finally {
            this.frame.scopes.pop();
          }
        }
        return NORMAL;
      }

      case 'Switch': {
        yield* this.stop(s.line);
        const v = yield* this.eval(s.expr);
        if (v.t === 'null') throw this.npe('', s.line);
        let start = -1;
        for (let i = 0; i < s.cases.length && start < 0; i++) {
          for (const lab of s.cases[i].labels) {
            const lv = yield* this.eval(lab);
            if (this.valuesEqual(v, lv, true)) { start = i; break; }
          }
        }
        if (start < 0) start = s.cases.findIndex(c => c.isDefault);
        if (start < 0) return NORMAL;
        this.frame.scopes.push(new Map());
        try {
          for (let i = start; i < s.cases.length; i++) {
            for (const st of s.cases[i].body) {
              const c = yield* this.exec(st);
              if (c.type === 'break') return NORMAL;
              if (c.type !== 'normal') return c;
            }
          }
        } finally { this.frame.scopes.pop(); }
        return NORMAL;
      }

      case 'Break': yield* this.stop(s.line); return BREAK;
      case 'Continue': yield* this.stop(s.line); return CONTINUE;

      case 'Return': {
        yield* this.stop(s.line);
        const m = this.frame.method;
        if (!s.expr) {
          if (m && !m.isCtor && m.returnType.name !== 'void') throw new CompilationProblem(`This method must return a result of type ${typeName(m.returnType)}`, s.line);
          return new Completion('return', null);
        }
        if (!m || m.isCtor || m.returnType.name === 'void') {
          throw new CompilationProblem('Void methods cannot return a value', s.line);
        }
        const v = yield* this.eval(s.expr);
        return new Completion('return', this.convertForAssign(v, m.returnType, s.expr, s.line));
      }

      case 'ThisCall':
        throw new CompilationProblem('Constructor call must be the first statement in a constructor', s.line);
      case 'SuperCall':
        throw new CompilationProblem('Constructor call must be the first statement in a constructor', s.line);
    }
    throw new UnsupportedFeature(`Statement "${s.kind}" is not supported yet.`, s.line);
  }

  // A single statement after if/while/for gets its own scope.
  *execScoped(s) {
    if (s.kind === 'Block') return yield* this.exec(s);
    if (s.kind === 'LocalVar') throw new JavaSyntaxErrorLike('Syntax error, insert "AssignmentOperator Expression" to complete Expression', s.line);
    this.frame.scopes.push(new Map());
    try { return yield* this.exec(s); } finally { this.frame.scopes.pop(); }
  }

  *evalCondition(expr) {
    const v = yield* this.eval(expr);
    if (v.t !== 'boolean') throw new CompilationProblem(`Type mismatch: cannot convert from ${valueTypeName(v)} to boolean`, expr.line);
    return v.v;
  }

  // ================= variables =================
  lookupLocal(name) {
    const f = this.frame;
    for (let i = f.scopes.length - 1; i >= 0; i--) {
      const v = f.scopes[i].get(name);
      if (v) return v;
    }
    return null;
  }

  // Resolve a type name used inside class `fromCls`, with package/import rules.
  resolveClassName(name, fromCls, line, quiet = false) {
    // fully qualified: fr.eni.Etudiant
    if (name.includes('.')) {
      const simple = name.slice(name.lastIndexOf('.') + 1);
      const pkg = name.slice(0, name.lastIndexOf('.'));
      const c = this.classes.get(simple);
      if (c && c.pkg === pkg) return this.checkClassVisible(c, fromCls, line);
      if (BUILTIN_TYPES.has(simple)) return { builtin: simple };
      if (quiet) return null;
      throw new CompilationProblem(`${name} cannot be resolved to a type`, line);
    }
    const c = this.classes.get(name);
    if (c) {
      if (!fromCls || c.pkg === fromCls.pkg) return c;
      const imports = fromCls.decl.imports;
      const ok = imports.some(im => im.name === c.fullName || (im.name.endsWith('.*') && im.name.slice(0, -2) === c.pkg));
      if (ok) return this.checkClassVisible(c, fromCls, line);
      if (quiet) return null;
      throw new CompilationProblem(`${name} cannot be resolved to a type`, line,
        `${name} is in the package "${c.pkg || '(default)'}", not in "${fromCls.pkg || '(default)'}". Add: import ${c.fullName};`);
    }
    if (BUILTIN_TYPES.has(name)) {
      if (needsImport(name) && fromCls && !fromCls.decl.imports.some(im => im.name === needsImport(name) || im.name === needsImport(name).replace(/\.\w+$/, '.*'))) {
        if (quiet) return null;
        throw new CompilationProblem(`${name} cannot be resolved to a type`, line, `Add: import ${needsImport(name)};`);
      }
      return { builtin: name };
    }
    if (quiet) return null;
    throw new CompilationProblem(`${name} cannot be resolved to a type`, line);
  }

  checkClassVisible(c, fromCls, line) {
    if (fromCls && c.pkg !== fromCls.pkg && !c.isPublic) {
      throw new CompilationProblem(`The type ${c.fullName} is not visible`, line,
        `The class ${c.name} has no "public", so only classes of its own package can use it.`);
    }
    return c;
  }

  canAccess(modifiers, ownerCls) {
    const from = this.currentClass;
    switch (modifiers.visibility) {
      case 'public': return true;
      case 'private': return from === ownerCls;
      default: return from && from.pkg === ownerCls.pkg; // package and protected (no inheritance yet)
    }
  }

  // ================= expressions =================
  *evalInit(init, type) {
    if (init.kind === 'ArrayInit') {
      if (type.dims === 0) throw new CompilationProblem(`Type mismatch: cannot convert from int[] to ${typeName(type)}`, init.line);
      return yield* this.buildArrayFromInit(init, { name: type.name, dims: type.dims - 1 });
    }
    return yield* this.eval(init);
  }

  *buildArrayFromInit(init, elemType) {
    const arr = this.newArray(elemType, init.elems.length, init.line);
    for (let i = 0; i < init.elems.length; i++) {
      const v = yield* this.evalInit(init.elems[i], elemType);
      arr.items[i] = this.convertForAssign(v, elemType, init.elems[i], init.line);
    }
    return mkRef(arr);
  }

  newArray(elemType, length, line) {
    if (length < 0) throw new JavaException('java.lang.NegativeArraySizeException', String(length), line, 'An array cannot have a negative size.');
    const arr = { id: this.nextId++, isArray: true, elemType, items: new Array(length).fill(null).map(() => defaultValue(elemType)), hash: null };
    this.heap.push(arr);
    this.event({ type: 'newArray', id: arr.id, elemType: typeName(elemType), length, line });
    return arr;
  }

  *evalArgs(args) {
    const out = [];
    for (const a of args) {
      const v = yield* this.eval(a);
      if (v === undefined) throw new CompilationProblem(`A void method gives no value, so it cannot be used as an argument`, a.line,
        'This method is "void": it does something but returns nothing. Call it alone on its line.');
      if (v.t === 'class') throw new CompilationProblem(`${v.cls.name} cannot be resolved to a variable`, a.line);
      out.push(v);
    }
    return out;
  }

  *eval(e, asStatement = false) {
    switch (e.kind) {
      case 'Literal':
        switch (e.type) {
          case 'int': return Math.abs(e.value) > 2147483648 ? mkLong(e.value) : mkInt(e.value);
          case 'double': return mkDouble(e.value);
          case 'boolean': return mkBool(e.value);
          case 'char': return mkChar(e.value);
          case 'String': return mkLiteralStr(e.value);
          case 'null': return NULL;
        }
        break;

      case 'Paren': return yield* this.eval(e.expr);

      case 'Name': return this.evalName(e);

      case 'This':
        if (this.frame.isStatic || !this.frame.thisObj) throw new CompilationProblem('Cannot use this in a static context', e.line,
          '"this" means "the current object". A static method runs without an object, so there is no "this".');
        return mkRef(this.frame.thisObj);

      case 'Field': return yield* this.evalField(e);

      case 'Index': {
        const { arr, index } = yield* this.evalIndexTarget(e);
        const v = arr.items[index];
        this.event({ type: 'arrayGet', id: arr.id, index });
        return v;
      }

      case 'Call': return yield* this.evalCall(e, asStatement);

      case 'New': {
        if (e.type.generic) throw new UnsupportedFeature(`Generic classes like ${e.type.name}<...> are not supported yet (ArrayList comes later).`, e.line);
        const cls = this.resolveClassName(e.type.name, this.currentClass, e.line);
        const args = yield* this.evalArgs(e.args);
        if (cls.builtin) return this.builtins.construct(cls.builtin, args, e.line);
        // constructor visibility
        const obj = yield* this.constructChecked(cls, args, e.line);
        return mkRef(obj);
      }

      case 'NewArray': {
        if (!isPrimitiveName(e.elemName)) this.resolveClassName(e.elemName, this.currentClass, e.line);
        if (e.init) {
          return yield* this.buildArrayFromInit(e.init, { name: e.elemName, dims: e.totalDims - 1 });
        }
        const sizes = [];
        for (const d of e.dims) {
          const v = yield* this.eval(d);
          if (!(v.t === 'int' || v.t === 'char')) throw new CompilationProblem(`Type mismatch: cannot convert from ${valueTypeName(v)} to int`, e.line);
          sizes.push(numOf(v));
        }
        const make = (level) => {
          const elemType = { name: e.elemName, dims: e.totalDims - level - 1 };
          const arr = this.newArray(elemType, sizes[level], e.line);
          if (level + 1 < sizes.length) for (let i = 0; i < arr.items.length; i++) arr.items[i] = mkRef(make(level + 1));
          return arr;
        };
        return mkRef(make(0));
      }

      case 'ArrayInit':
        throw new CompilationProblem('Array constants can only be used in initializers', e.line);

      case 'Assign': return yield* this.evalAssign(e);

      case 'Update': {
        const ref = yield* this.lvalue(e.target);
        const old = ref.get();
        if (!isNumeric(old)) throw new CompilationProblem(`Invalid argument to operation ${e.op}, argument must be a numeric variable`, e.line);
        const n = numOf(old) + (e.op === '++' ? 1 : -1);
        const nv = old.t === 'double' ? mkDouble(n) : old.t === 'char' ? mkChar(String.fromCharCode(n & 0xffff)) : old.t === 'long' ? mkLong(n) : mkInt(n);
        ref.set(nv);
        return e.prefix ? nv : old;
      }

      case 'Unary': {
        const v = yield* this.eval(e.operand);
        switch (e.op) {
          case '!':
            if (v.t !== 'boolean') throw new CompilationProblem(`The operator ! is undefined for the argument type(s) ${valueTypeName(v)}`, e.line);
            return mkBool(!v.v);
          case '-': case '+': case '~': {
            if (!isNumeric(v)) throw new CompilationProblem(`The operator ${e.op} is undefined for the argument type(s) ${valueTypeName(v)}`, e.line);
            const n = numOf(v);
            const r = e.op === '-' ? -n : e.op === '~' ? ~n : n;
            if (v.t === 'double') return mkDouble(r);
            if (v.t === 'long') return mkLong(r);
            return mkInt(r);
          }
        }
        break;
      }

      case 'Binary': return yield* this.evalBinary(e);

      case 'Cond': {
        const c = yield* this.evalCondition(e.cond);
        return yield* this.eval(c ? e.then : e.else);
      }

      case 'Cast': return yield* this.evalCast(e);

      case 'InstanceOf': {
        const v = yield* this.eval(e.expr);
        if (v.t === 'null') return mkBool(false);
        const tn = e.type.name;
        if (tn === 'Object') return mkBool(true);
        if (v.t === 'String') return mkBool(tn === 'String');
        if (v.t === 'ref' && !v.obj.isArray) return mkBool(v.obj.cls.name === tn);
        return mkBool(false);
      }
    }
    throw new UnsupportedFeature(`Expression "${e.kind}" is not supported yet.`, e.line);
  }

  *constructChecked(cls, args, line) {
    if (cls.ctors.length && cls !== this.currentClass) {
      const visible = cls.ctors.filter(c => this.canAccess(c.modifiers, cls));
      if (visible.length === 0 || (visible.length < cls.ctors.length)) {
        const chosen = this.chooseMethod(cls, cls.ctors, args, line, true);
        if (!this.canAccess(chosen.modifiers, cls)) {
          throw new CompilationProblem(`The constructor ${cls.name}(${chosen.params.map(p => typeName(p.type)).join(', ')}) is not visible`, line);
        }
      }
    }
    return yield* this.construct(cls, args, line);
  }

  evalName(e) {
    const name = e.name;
    const local = this.lookupLocal(name);
    if (local) {
      if (!local.assigned) throw new CompilationProblem(`The local variable ${name} may not have been initialized`, e.line,
        `${name} was declared but never got a value.`);
      return local.value;
    }
    const cls = this.currentClass;
    if (cls) {
      const f = cls.fields.get(name);
      if (f) {
        if (f.modifiers.static) {
          this.event({ type: 'staticGet', cls: cls.name, field: name });
          return cls.statics.get(name);
        }
        if (this.frame.isStatic || !this.frame.thisObj) {
          throw new CompilationProblem(`Cannot make a static reference to the non-static field ${name}`, e.line,
            `${name} belongs to each object (each house). A static method has no object, so it cannot know which ${name} you mean.`);
        }
        this.event({ type: 'fieldGet', id: this.frame.thisObj.id, field: name });
        return this.frame.thisObj.fields.get(name);
      }
    }
    const c = this.resolveClassName(name, cls, e.line, true);
    if (c && !c.builtin) return { t: 'class', cls: c };
    if (c && c.builtin) return { t: 'class', cls: { builtin: c.builtin, name } };
    throw new CompilationProblem(`${name} cannot be resolved to a variable`, e.line,
      `There is no variable called "${name}" here. Maybe it is declared later, in another method, or the name is misspelled.`);
  }

  *evalField(e) {
    const target = yield* this.eval(e.target);
    const name = e.name;
    if (target.t === 'class') {
      if (target.cls.builtin) return this.builtins.staticField(target.cls.builtin, name, e.line);
      const cls = target.cls;
      const f = cls.fields.get(name);
      if (!f) throw new CompilationProblem(`${name} cannot be resolved or is not a field`, e.line);
      if (!this.canAccess(f.modifiers, cls)) throw this.notVisibleField(cls, name, e.line);
      if (!f.modifiers.static) {
        throw new CompilationProblem(`Cannot make a static reference to the non-static field ${cls.name}.${name}`, e.line,
          `${name} lives inside each object. Write it on an object (like jean.${name}), not on the class ${cls.name}.`);
      }
      yield* this.ensureInit(cls);
      this.event({ type: 'staticGet', cls: cls.name, field: name });
      return cls.statics.get(name);
    }
    if (target.t === 'null') {
      throw this.npe(`Cannot read field "${name}" because ${this.describeExpr(e.target)} is null`, e.line);
    }
    if (target.t === 'ref' && target.obj.isArray) {
      if (name === 'length') return mkInt(target.obj.items.length);
      throw new CompilationProblem(`${name} cannot be resolved or is not a field`, e.line);
    }
    if (target.t === 'ref') {
      const obj = target.obj;
      const f = obj.cls.fields.get(name);
      if (!f) throw new CompilationProblem(`${name} cannot be resolved or is not a field`, e.line);
      if (!this.canAccess(f.modifiers, obj.cls)) throw this.notVisibleField(obj.cls, name, e.line, obj);
      if (f.modifiers.static) {
        this.event({ type: 'staticGet', cls: obj.cls.name, field: name });
        return obj.cls.statics.get(name);
      }
      this.event({ type: 'fieldGet', id: obj.id, field: name });
      return obj.fields.get(name);
    }
    if (target.t === 'String') {
      throw new CompilationProblem(`${name} cannot be resolved or is not a field`, e.line);
    }
    throw new CompilationProblem(`Cannot invoke ${name} on the primitive type ${target.t}`, e.line);
  }

  notVisibleField(cls, name, line, obj) {
    const f = cls.fields.get(name);
    const hint = f.modifiers.visibility === 'private'
      ? `${name} is private: it is locked inside ${cls.name}. From outside, use a getter/setter (like get${cap(name)}()).`
      : `${name} has no visibility word, so only classes of the same package (${cls.pkg || 'default'}) can use it.`;
    const err = new CompilationProblem(`The field ${cls.name}.${name} is not visible`, line, hint);
    err.blocked = { kind: 'field', cls: cls.name, name, id: obj?.id ?? null, visibility: f.modifiers.visibility };
    this.event({ type: 'blocked', cls: cls.name, member: name, id: obj?.id ?? null, visibility: f.modifiers.visibility });
    return err;
  }

  *evalIndexTarget(e) {
    const t = yield* this.eval(e.target);
    const iv = yield* this.eval(e.index);
    if (t.t === 'null') throw this.npe(`Cannot load from ${'object'} array because ${this.describeExpr(e.target)} is null`, e.line);
    if (t.t !== 'ref' || !t.obj.isArray) throw new CompilationProblem(`The type of the expression must be an array type but it resolved to ${valueTypeName(t)}`, e.line);
    if (!(iv.t === 'int' || iv.t === 'char')) throw new CompilationProblem(`Type mismatch: cannot convert from ${valueTypeName(iv)} to int`, e.line);
    const index = numOf(iv);
    const arr = t.obj;
    if (index < 0 || index >= arr.items.length) {
      throw new JavaException('java.lang.ArrayIndexOutOfBoundsException', `Index ${index} out of bounds for length ${arr.items.length}`, e.line,
        `The array has ${arr.items.length} boxes, numbered 0 to ${arr.items.length - 1}. Box ${index} does not exist.`);
    }
    return { arr, index };
  }

  // An "lvalue" is something you can assign to: a variable, a field, an array box.
  *lvalue(target) {
    const line = target.line;
    if (target.kind === 'Name') {
      const local = this.lookupLocal(target.name);
      if (local) {
        return {
          get: () => {
            if (!local.assigned) throw new CompilationProblem(`The local variable ${target.name} may not have been initialized`, line);
            return local.value;
          },
          set: (v) => {
            if (local.final && local.assigned) throw new CompilationProblem(`The final local variable ${target.name} cannot be assigned. It must be blank and not using a compound assignment`, line);
            local.value = v; local.assigned = true;
            this.event({ type: 'varSet', name: target.name, frame: this.frame.id, value: this.describeValue(v) });
          },
          type: local.type,
        };
      }
      const cls = this.currentClass;
      const f = cls?.fields.get(target.name);
      if (f) {
        if (f.modifiers.static) return this.staticLvalue(cls, f, line);
        if (this.frame.isStatic || !this.frame.thisObj) throw new CompilationProblem(`Cannot make a static reference to the non-static field ${target.name}`, line);
        return this.fieldLvalue(this.frame.thisObj, f, line);
      }
      throw new CompilationProblem(`${target.name} cannot be resolved to a variable`, line,
        `There is no variable called "${target.name}" here. Maybe it is declared later, or the name is misspelled.`);
    }
    if (target.kind === 'Field') {
      const t = yield* this.eval(target.target);
      if (t.t === 'class') {
        if (t.cls.builtin) throw new CompilationProblem(`The final field ${t.cls.name}.${target.name} cannot be assigned`, line);
        const f = t.cls.fields.get(target.name);
        if (!f) throw new CompilationProblem(`${target.name} cannot be resolved or is not a field`, line);
        if (!this.canAccess(f.modifiers, t.cls)) throw this.notVisibleField(t.cls, target.name, line);
        if (!f.modifiers.static) throw new CompilationProblem(`Cannot make a static reference to the non-static field ${t.cls.name}.${target.name}`, line);
        yield* this.ensureInit(t.cls);
        return this.staticLvalue(t.cls, f, line);
      }
      if (t.t === 'null') throw this.npe(`Cannot assign field "${target.name}" because ${this.describeExpr(target.target)} is null`, line);
      if (t.t === 'ref' && t.obj.isArray) {
        if (target.name === 'length') throw new CompilationProblem('The final field array.length cannot be assigned', line);
        throw new CompilationProblem(`${target.name} cannot be resolved or is not a field`, line);
      }
      if (t.t !== 'ref') throw new CompilationProblem(`${target.name} cannot be resolved or is not a field`, line);
      const f = t.obj.cls.fields.get(target.name);
      if (!f) throw new CompilationProblem(`${target.name} cannot be resolved or is not a field`, line);
      if (!this.canAccess(f.modifiers, t.obj.cls)) throw this.notVisibleField(t.obj.cls, target.name, line, t.obj);
      if (f.modifiers.static) return this.staticLvalue(t.obj.cls, f, line);
      return this.fieldLvalue(t.obj, f, line);
    }
    if (target.kind === 'Index') {
      const { arr, index } = yield* this.evalIndexTarget(target);
      return {
        get: () => arr.items[index],
        set: (v) => { arr.items[index] = v; this.event({ type: 'arraySet', id: arr.id, index, value: this.describeValue(v) }); },
        type: arr.elemType,
      };
    }
    throw new CompilationProblem('The left-hand side of an assignment must be a variable', line);
  }

  fieldLvalue(obj, f, line) {
    return {
      get: () => obj.fields.get(f.name),
      set: (v) => {
        if (f.modifiers.final) {
          const inOwnCtor = this.frame.method?.isCtor && this.frame.thisObj === obj;
          if (f.init || !inOwnCtor || obj.finalAssigned.has(f.name)) {
            throw new CompilationProblem(`The final field ${obj.cls.name}.${f.name} cannot be assigned`, line,
              `${f.name} is final: it is in a glass box. You can read it, but it can only get its value once (in the constructor).`);
          }
          obj.finalAssigned.add(f.name);
        }
        obj.fields.set(f.name, v);
        for (const fr of this.frames) if (fr.thisObj === obj) fr.fieldSets = (fr.fieldSets || 0) + 1;
        this.event({ type: 'fieldSet', id: obj.id, field: f.name, value: this.describeValue(v) });
      },
      type: f.type,
    };
  }

  staticLvalue(cls, f, line) {
    return {
      get: () => cls.statics.get(f.name),
      set: (v) => {
        if (f.modifiers.final) throw new CompilationProblem(`The final field ${cls.name}.${f.name} cannot be assigned`, line);
        cls.statics.set(f.name, v);
        this.event({ type: 'staticSet', cls: cls.name, field: f.name, value: this.describeValue(v) });
      },
      type: f.type,
    };
  }

  *evalAssign(e) {
    const ref = yield* this.lvalue(e.target);
    let v;
    if (e.op === '=') {
      v = yield* this.eval(e.value);
      v = this.convertForAssign(v, ref.type, e.value, e.line);
    } else {
      const old = ref.get();
      const right = yield* this.eval(e.value);
      const r = yield* this.binaryOp(e.op[0], old, right, e.line);
      // compound assignment casts back to the variable type: int x; x += 1.5 is allowed
      v = old.t === 'String' ? r : this.castPrimitive(r, ref.type.name);
    }
    ref.set(v);
    return v;
  }

  *evalBinary(e) {
    const op = e.op;
    if (op === '&&' || op === '||') {
      const l = yield* this.eval(e.left);
      if (l.t !== 'boolean') throw new CompilationProblem(`The operator ${op} is undefined for the argument type(s) ${valueTypeName(l)}, ...`, e.line);
      if (op === '&&' && !l.v) return mkBool(false);
      if (op === '||' && l.v) return mkBool(true);
      const r = yield* this.eval(e.right);
      if (r.t !== 'boolean') throw new CompilationProblem(`The operator ${op} is undefined for the argument type(s) boolean, ${valueTypeName(r)}`, e.line);
      return r;
    }
    const l = yield* this.eval(e.left);
    const r = yield* this.eval(e.right);
    return yield* this.binaryOp(op, l, r, e.line);
  }

  *binaryOp(op, l, r, line) {
    if (l === undefined || r === undefined) throw new CompilationProblem(`The operator ${op} is undefined for the argument type(s) void`, line);
    if (l.t === 'class' || r.t === 'class') throw new CompilationProblem(`${(l.t === 'class' ? l : r).cls.name} cannot be resolved to a variable`, line);
    const undef = () => new CompilationProblem(`The operator ${op} is undefined for the argument type(s) ${valueTypeName(l)}, ${valueTypeName(r)}`, line);

    if (op === '+' && (l.t === 'String' || r.t === 'String')) {
      const a = yield* this.stringOf(l, line);
      const b = yield* this.stringOf(r, line);
      return mkStr(a + b);
    }
    if (op === '==' || op === '!=') {
      if ((isNumeric(l) && !isNumeric(r)) || (!isNumeric(l) && isNumeric(r)) || (l.t === 'boolean') !== (r.t === 'boolean')) {
        if (!(l.t === 'null' || r.t === 'null') || isNumeric(l) || isNumeric(r) || l.t === 'boolean' || r.t === 'boolean') {
          throw new CompilationProblem(`Incompatible operand types ${valueTypeName(l)} and ${valueTypeName(r)}`, line);
        }
      }
      if (l.t === 'ref' && r.t === 'ref' && !l.obj.isArray && !r.obj.isArray && l.obj.cls !== r.obj.cls) {
        throw new CompilationProblem(`Incompatible operand types ${valueTypeName(l)} and ${valueTypeName(r)}`, line);
      }
      const eq = this.valuesEqual(l, r, false);
      return mkBool(op === '==' ? eq : !eq);
    }
    if (l.t === 'boolean' && r.t === 'boolean' && (op === '&' || op === '|' || op === '^')) {
      return mkBool(op === '&' ? l.v && r.v : op === '|' ? l.v || r.v : l.v !== r.v);
    }
    if (!isNumeric(l) || !isNumeric(r)) throw undef();

    const a = numOf(l), b = numOf(r);
    const isDouble = l.t === 'double' || r.t === 'double';
    const isLong = !isDouble && (l.t === 'long' || r.t === 'long');
    const wrap = (x) => isDouble ? mkDouble(x) : isLong ? mkLong(x) : mkInt(x);
    switch (op) {
      case '+': return wrap(a + b);
      case '-': return wrap(a - b);
      case '*': return isDouble ? mkDouble(a * b) : isLong ? mkLong(a * b) : mkInt(Math.imul(a, b));
      case '/':
        if (!isDouble && b === 0) throw new JavaException('java.lang.ArithmeticException', '/ by zero', line, 'Dividing an int by 0 is impossible. (With double you would get Infinity.)');
        return isDouble ? mkDouble(a / b) : wrap(Math.trunc(a / b));
      case '%':
        if (!isDouble && b === 0) throw new JavaException('java.lang.ArithmeticException', '/ by zero', line, 'x % 0 divides by 0: impossible with int.');
        return wrap(a % b);
      case '<': return mkBool(a < b);
      case '>': return mkBool(a > b);
      case '<=': return mkBool(a <= b);
      case '>=': return mkBool(a >= b);
    }
    if (isDouble) throw undef();
    switch (op) {
      case '&': return wrap(a & b);
      case '|': return wrap(a | b);
      case '^': return wrap(a ^ b);
      case '<<': return wrap(a << b);
      case '>>': return wrap(a >> b);
      case '>>>': return wrap(a >>> b);
    }
    throw undef();
  }

  valuesEqual(l, r, forSwitch) {
    if (isNumeric(l) && isNumeric(r)) return numOf(l) === numOf(r);
    if (l.t === 'boolean' && r.t === 'boolean') return l.v === r.v;
    if (l.t === 'null' || r.t === 'null') return l.t === r.t;
    if (l.t === 'String' && r.t === 'String') return forSwitch ? l.v === r.v : l.sid === r.sid;
    if (l.t === 'ref' && r.t === 'ref') return l.obj === r.obj;
    return false;
  }

  castPrimitive(v, tn) {
    if (!isNumeric(v)) return v;
    const n = numOf(v);
    switch (tn) {
      case 'int': return mkInt(Number.isFinite(n) ? Math.trunc(n) : (Number.isNaN(n) ? 0 : n > 0 ? 2147483647 : -2147483648));
      case 'long': return mkLong(Number.isFinite(n) ? Math.trunc(n) : 0);
      case 'short': return mkInt((Math.trunc(n) << 16) >> 16);
      case 'byte': return mkInt((Math.trunc(n) << 24) >> 24);
      case 'char': return mkChar(String.fromCharCode(Math.trunc(n) & 0xffff));
      case 'double': case 'float': return mkDouble(n);
    }
    return v;
  }

  *evalCast(e) {
    const v = yield* this.eval(e.expr);
    const tn = e.type.name;
    if (e.type.dims === 0 && isPrimitiveName(tn)) {
      if (tn === 'boolean') {
        if (v.t === 'boolean') return v;
        throw new CompilationProblem(`Cannot cast from ${valueTypeName(v)} to boolean`, e.line);
      }
      if (!isNumeric(v)) throw new CompilationProblem(`Cannot cast from ${valueTypeName(v)} to ${tn}`, e.line);
      return this.castPrimitive(v, tn);
    }
    if (v.t === 'null') return v;
    if (tn === 'Object') return v;
    if (isNumeric(v) || v.t === 'boolean') throw new CompilationProblem(`Cannot cast from ${v.t} to ${tn}`, e.line);
    const vt = valueTypeName(v);
    if (vt === typeName(e.type)) return v;
    throw new JavaException('java.lang.ClassCastException', `class ${vt} cannot be cast to class ${tn}`, e.line);
  }

  // ================= method calls =================
  *evalCall(e, asStatement) {
    const name = e.name;
    // unqualified call: method of the current class
    if (!e.target) {
      const cls = this.currentClass;
      const candidates = cls.methods.filter(m => m.name === name);
      const args = yield* this.evalArgs(e.args);
      if (candidates.length === 0) {
        throw new CompilationProblem(`The method ${name}(${args.map(valueTypeName).join(', ')}) is undefined for the type ${cls.name}`, e.line);
      }
      const m = this.chooseMethod(cls, candidates, args, e.line, false, name);
      if (!m.modifiers.static && (this.frame.isStatic || !this.frame.thisObj)) {
        throw new CompilationProblem(`Cannot make a static reference to the non-static method ${sigOf(m)} from the type ${cls.name}`, e.line,
          `${name}() works on one object. Here you are in a static method (no object). Create an object first, then call obj.${name}().`);
      }
      return this.checkVoidUse(yield* this.invoke(cls, m, m.modifiers.static ? null : this.frame.thisObj, args, e.line), m, asStatement, e);
    }

    // System.out.println & co
    if (e.target.kind === 'Field' && e.target.target.kind === 'Name' && e.target.target.name === 'System' && !this.lookupLocal('System')) {
      const stream = e.target.name;
      if (stream === 'out' || stream === 'err') {
        const args = yield* this.evalArgs(e.args);
        yield* this.builtins.printStream(stream, name, args, e.line);
        return null;
      }
    }

    const target = yield* this.eval(e.target);

    if (target.t === 'class') {
      const args = yield* this.evalArgs(e.args);
      if (target.cls.builtin) return yield* this.builtins.staticCall(target.cls.builtin, name, args, e.line);
      const cls = target.cls;
      const candidates = cls.methods.filter(m => m.name === name);
      if (candidates.length === 0) throw new CompilationProblem(`The method ${name}(${args.map(valueTypeName).join(', ')}) is undefined for the type ${cls.name}`, e.line);
      const m = this.chooseMethod(cls, candidates, args, e.line, false, name);
      if (!this.canAccess(m.modifiers, cls)) throw this.notVisibleMethod(cls, m, e.line);
      if (!m.modifiers.static) {
        this.event({ type: 'blocked', cls: cls.name, member: name, id: null, visibility: 'static' });
        throw new CompilationProblem(`Cannot make a static reference to the non-static method ${sigOf(m)} from the type ${cls.name}`, e.line,
          `${name}() needs an object (a house). ${cls.name} is only the blueprint. Use a variable like obj.${name}().`);
      }
      yield* this.ensureInit(cls);
      return this.checkVoidUse(yield* this.invoke(cls, m, null, args, e.line), m, asStatement, e);
    }

    if (target.t === 'null') {
      yield* this.evalArgs(e.args);
      const cls = this.guessStaticType(e.target);
      throw this.npe(`Cannot invoke "${cls ? cls + '.' : ''}${name}()" because ${this.describeExpr(e.target)} is null`, e.line);
    }

    const args = yield* this.evalArgs(e.args);

    if (target.t === 'String') return yield* this.builtins.stringMethod(target, name, args, e.line);
    if (target.t === 'ref' && target.obj.isArray) {
      if (name === 'clone' && args.length === 0) {
        const src = target.obj;
        const arr = this.newArray(src.elemType, src.items.length, e.line);
        arr.items = src.items.slice();
        return mkRef(arr);
      }
      return yield* this.objectMethod(target, name, args, e.line, 'array');
    }
    if (target.t === 'ref') {
      const obj = target.obj;
      const candidates = obj.cls.methods.filter(m => m.name === name);
      if (candidates.length === 0) return yield* this.objectMethod(target, name, args, e.line, obj.cls.name);
      const m = this.chooseMethod(obj.cls, candidates, args, e.line, false, name);
      if (!this.canAccess(m.modifiers, obj.cls)) throw this.notVisibleMethod(obj.cls, m, e.line, obj);
      return this.checkVoidUse(yield* this.invoke(obj.cls, m, m.modifiers.static ? null : obj, args, e.line), m, asStatement, e);
    }
    throw new CompilationProblem(`Cannot invoke ${name}(${args.map(valueTypeName).join(', ')}) on the primitive type ${target.t}`, e.line);
  }

  checkVoidUse(result, m, asStatement, e) {
    if (!asStatement && m.returnType && m.returnType.name === 'void') {
      // a void method used as a value: println(obj.afficher())
      result = undefined;
    }
    return result === undefined ? undefined : result;
  }

  notVisibleMethod(cls, m, line, obj) {
    this.event({ type: 'blocked', cls: cls.name, member: m.name, id: obj?.id ?? null, visibility: m.modifiers.visibility });
    return new CompilationProblem(`The method ${sigOf(m)} from the type ${cls.name} is not visible`, line,
      m.modifiers.visibility === 'private' ? `${m.name}() is private: only code inside ${cls.name} can call it.` : `${m.name}() can only be used from the same package.`);
  }

  // Methods every object has (from java.lang.Object)
  *objectMethod(target, name, args, line, typeLabel) {
    if (name === 'toString' && args.length === 0) return mkStr(yield* this.stringOf(target, line));
    if (name === 'equals' && args.length === 1) return mkBool(this.valuesEqual(target, args[0], false));
    if (name === 'hashCode' && args.length === 0) return mkInt(parseInt(this.hashOf(target.obj), 16));
    if (name === 'getClass') throw new UnsupportedFeature('getClass() is not supported yet.', line);
    throw new CompilationProblem(`The method ${name}(${args.map(valueTypeName).join(', ')}) is undefined for the type ${typeLabel}`, line);
  }

  hashOf(obj) {
    if (!obj.hash) obj.hash = this.hashes.next();
    return obj.hash;
  }

  // String.valueOf(x): calls toString() on objects — this is why println(jean) runs your toString()
  *stringOf(v, line) {
    if (v === undefined) throw new CompilationProblem('Type mismatch: cannot convert from void to String', line);
    if (v.t === 'ref') {
      const obj = v.obj;
      if (obj.isArray) {
        const code = { int: 'I', double: 'D', boolean: 'Z', char: 'C', long: 'J', short: 'S', byte: 'B', float: 'F' };
        const et = obj.elemType;
        let inner = et.dims > 0 ? '[' .repeat(et.dims) : '';
        inner += code[et.name] || ('L' + this.qualifiedName(et.name) + ';');
        return '[' + inner + '@' + this.hashOf(obj);
      }
      const ts = obj.cls.methods.find(m => m.name === 'toString' && m.params.length === 0 && !m.modifiers.static);
      if (ts) {
        if (ts.modifiers.visibility !== 'public') {
          throw new CompilationProblem('Cannot reduce the visibility of the inherited method from Object', ts.line);
        }
        this.event({ type: 'autoToString', id: obj.id });
        const r = yield* this.invoke(obj.cls, ts, obj, [], line);
        if (r.t === 'null') return 'null';
        return r.v;
      }
      return obj.cls.fullName + '@' + this.hashOf(obj);
    }
    if (v.t === 'class') throw new CompilationProblem(`${v.cls.name} cannot be resolved to a variable`, line);
    return primitiveToString(v);
  }

  qualifiedName(simple) {
    const c = this.classes.get(simple);
    if (c) return c.fullName;
    if (simple === 'String' || simple === 'Object' || simple === 'Integer' || simple === 'Double') return 'java.lang.' + simple;
    return simple;
  }

  // ================= error helpers =================
  npe(message, line) {
    return new JavaException('java.lang.NullPointerException', message, line,
      'The variable points to nothing (null). There is no house at the end of the sign, so there is nothing to open.');
  }

  // Java 17 "helpful NullPointerException" descriptions
  describeExpr(e) {
    switch (e.kind) {
      case 'Name': {
        const local = this.lookupLocal(e.name);
        if (local) return `"${e.name}"`;
        return `"this.${e.name}"`;
      }
      case 'Field': {
        const inner = this.describeExprRaw(e.target);
        return `"${inner}.${e.name}"`;
      }
      case 'Index': return `"${this.describeExprRaw(e)}"`;
      case 'Call': {
        const t = e.target ? this.guessStaticType(e.target) : this.currentClass?.name;
        const m = this.findMethodDecl(t, e.name);
        return `the return value of "${t ? t + '.' : ''}${e.name}(${m ? m.params.map(p => typeName(p.type)).join(', ') : ''})"`;
      }
      case 'Paren': return this.describeExpr(e.expr);
      default: return '"<expression>"';
    }
  }
  describeExprRaw(e) {
    switch (e.kind) {
      case 'Name': return this.lookupLocal(e.name) ? e.name : (this.currentClass?.fields.get(e.name) ? 'this.' + e.name : e.name);
      case 'This': return 'this';
      case 'Field': return this.describeExprRaw(e.target) + '.' + e.name;
      case 'Index': return this.describeExprRaw(e.target) + '[' + this.describeExprRaw(e.index) + ']';
      case 'Literal': return String(e.value);
      case 'Paren': return this.describeExprRaw(e.expr);
      case 'Call': return (e.target ? this.guessStaticType(e.target) : this.currentClass?.name) + '.' + e.name + '(...)';
      default: return '...';
    }
  }

  findMethodDecl(clsName, name) {
    const c = this.classes.get(clsName);
    return c ? c.methods.find(m => m.name === name) : null;
  }

  // The declared type of an expression, as far as we can tell (for messages).
  guessStaticType(e) {
    if (e.kind === 'Name') {
      const l = this.lookupLocal(e.name);
      if (l) return typeName(l.type);
      const f = this.currentClass?.fields.get(e.name);
      if (f) return typeName(f.type);
    }
    if (e.kind === 'This') return this.currentClass?.name;
    if (e.kind === 'Paren') return this.guessStaticType(e.expr);
    if (e.kind === 'Field') {
      const t = this.guessStaticType(e.target);
      const f = this.classes.get(t)?.fields.get(e.name);
      if (f) return typeName(f.type);
    }
    if (e.kind === 'Index') {
      const t = this.guessStaticType(e.target);
      if (t && t.endsWith('[]')) return t.slice(0, -2);
    }
    if (e.kind === 'Call') {
      const t = e.target ? this.guessStaticType(e.target) : this.currentClass?.name;
      const m = this.findMethodDecl(t, e.name);
      if (m) return typeName(m.returnType);
    }
    return null;
  }

  // ================= snapshots for the UI =================
  describeValue(v) {
    if (!v) return { kind: 'none' };
    switch (v.t) {
      case 'null': return { kind: 'null', text: 'null' };
      case 'String': return { kind: 'string', text: v.v };
      case 'ref':
        return v.obj.isArray
          ? { kind: 'array', id: v.obj.id, type: typeName(v.obj.elemType) + '[]', length: v.obj.items.length }
          : { kind: 'object', id: v.obj.id, cls: v.obj.cls.name };
      case 'char': return { kind: 'prim', type: 'char', text: v.v };
      case 'double': return { kind: 'prim', type: 'double', text: formatDouble(v.v) };
      default: return { kind: 'prim', type: v.t, text: primitiveToString(v) };
    }
  }

  snapshot() {
    const frames = this.frames.map(f => {
      const vars = [];
      for (const scope of f.scopes) {
        for (const [name, v] of scope) {
          vars.push({ name, type: typeName(v.type), value: v.assigned ? this.describeValue(v.value) : { kind: 'unset' } });
        }
      }
      const m = f.method;
      return {
        id: f.id, label: f.label, cls: f.cls?.name, line: f.line, thisId: f.thisObj?.id ?? null, isStatic: f.isStatic, vars,
        // which code this frame runs (for the code card next to the person)
        isCtor: m ? !!m.isCtor : (!!f.thisObj && !f.isStatic),
        startLine: m ? m.line : null, endLine: m ? m.endLine : null,
      };
    });

    const reachable = this.reachableIds();
    const heap = this.heap.map(o => o.isArray
      ? { id: o.id, isArray: true, type: typeName(o.elemType) + '[]', items: o.items.map(x => this.describeValue(x)), reachable: reachable.has(o.id) }
      : {
        id: o.id, cls: o.cls.name, reachable: reachable.has(o.id),
        fields: [...o.fields].map(([name, value]) => {
          const f = o.cls.fields.get(name);
          return { name, type: typeName(f.type), visibility: f.modifiers.visibility, final: f.modifiers.final, value: this.describeValue(value) };
        }),
      });

    const classes = [...this.classes.values()].map(c => ({
      name: c.name, pkg: c.pkg, isPublic: c.isPublic, line: c.decl.line, endLine: c.decl.endLine,
      fields: [...c.fields.values()].map(f => ({
        name: f.name, type: typeName(f.type), visibility: f.modifiers.visibility, static: f.modifiers.static, final: f.modifiers.final, line: f.line,
        value: f.modifiers.static ? this.describeValue(c.statics.get(f.name)) : null,
      })),
      ctors: c.ctors.map(m => ({ params: m.params.map(p => typeName(p.type) + ' ' + p.name), visibility: m.modifiers.visibility, line: m.line })),
      methods: c.methods.map(m => ({
        name: m.name, params: m.params.map(p => typeName(p.type) + ' ' + p.name), returnType: typeName(m.returnType),
        visibility: m.modifiers.visibility, static: m.modifiers.static, line: m.line,
      })),
    }));

    return {
      frames, heap, classes,
      output: this.output.map(o => ({ text: o.text, kind: o.kind })),
    };
  }

  // Objects that can still be reached from the pile or static fields. The others wait for the Garbage Collector.
  reachableIds() {
    const seen = new Set();
    const stack = [];
    const push = (v) => { if (v && v.t === 'ref' && !seen.has(v.obj.id)) { seen.add(v.obj.id); stack.push(v.obj); } };
    for (const f of this.frames) {
      if (f.thisObj && !seen.has(f.thisObj.id)) { seen.add(f.thisObj.id); stack.push(f.thisObj); }
      for (const scope of f.scopes) for (const v of scope.values()) push(v.value);
    }
    for (const c of this.classes.values()) for (const v of c.statics.values()) push(v);
    while (stack.length) {
      const o = stack.pop();
      if (o.isArray) o.items.forEach(push);
      else for (const v of o.fields.values()) push(v);
    }
    return seen;
  }
}

class JavaSyntaxErrorLike extends CompilationProblem {}

// ---------- helpers ----------
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function sigOf(m) { return m.name + '(' + m.params.map(p => typeName(p.type)).join(', ') + ')'; }

function typeOfValue(v) {
  switch (v.t) {
    case 'ref': return v.obj.isArray ? { name: v.obj.elemType.name, dims: v.obj.elemType.dims + 1 } : { name: v.obj.cls.name, dims: 0 };
    case 'null': return { name: 'Object', dims: 0 };
    default: return { name: v.t, dims: 0 };
  }
}

function isConstantExpr(e) {
  if (e.kind === 'Literal') return true;
  if (e.kind === 'Paren') return isConstantExpr(e.expr);
  if (e.kind === 'Unary') return isConstantExpr(e.operand);
  if (e.kind === 'Binary') return isConstantExpr(e.left) && isConstantExpr(e.right);
  return false;
}

// Can the end of this block be reached without a return? (simplified Java rule)
export function canCompleteNormally(s) {
  if (!s) return true;
  switch (s.kind) {
    case 'Block':
      for (const st of s.stmts) if (!canCompleteNormally(st)) return false;
      return true;
    case 'Return': return false;
    case 'If': return !s.else || canCompleteNormally(s.then) || canCompleteNormally(s.else);
    case 'While': return !(s.cond.kind === 'Literal' && s.cond.value === true && !containsBreak(s.body));
    case 'For': return !(s.cond === null && !containsBreak(s.body));
    case 'DoWhile': return canCompleteNormally(s.body) || !(s.cond.kind === 'Literal' && s.cond.value === true);
    case 'Switch': {
      if (!s.cases.some(c => c.isDefault)) return true;
      if (s.cases.some(c => c.body.some(containsBreakShallow))) return true;
      const last = s.cases[s.cases.length - 1];
      return canCompleteNormally({ kind: 'Block', stmts: last.body });
    }
    default: return true;
  }
}
function containsBreak(s) {
  if (!s) return false;
  switch (s.kind) {
    case 'Break': return true;
    case 'Block': return s.stmts.some(containsBreak);
    case 'If': return containsBreak(s.then) || containsBreak(s.else);
    case 'Switch': return false;
    case 'While': case 'For': case 'DoWhile': case 'ForEach': return false;
    default: return false;
  }
}
function containsBreakShallow(s) { return containsBreak(s); }

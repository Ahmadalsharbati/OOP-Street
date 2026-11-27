// parser.js — reads the tokens and builds a tree (AST) that describes the program.
//
// The source can contain many classes, even many "files" pasted one after the other:
// each `package x;` line changes the package of the classes that follow it.
//
// Every node is a plain object: { kind: 'If', line: 12, ... }.

import { tokenize } from './lexer.js';
import { JavaSyntaxError, UnsupportedFeature } from './errors.js';

const PRIMITIVES = new Set(['int', 'double', 'boolean', 'char', 'long', 'float', 'short', 'byte']);
const MODIFIERS = new Set(['public', 'private', 'protected', 'static', 'final', 'abstract']);

export function parse(src) {
  const p = new Parser(tokenize(src));
  return p.parseProgram();
}

class Parser {
  constructor(tokens) {
    this.t = tokens;
    this.i = 0;
  }

  // ---------- small helpers ----------
  get tok() { return this.t[this.i]; }
  peek(n = 1) { return this.t[Math.min(this.i + n, this.t.length - 1)]; }
  is(value, tok = this.tok) { return (tok.type === 'op' || tok.type === 'keyword') && tok.value === value; }
  isIdent(tok = this.tok) { return tok.type === 'ident'; }
  next() { const tk = this.tok; if (tk.type !== 'eof') this.i++; return tk; }
  accept(value) { if (this.is(value)) { this.next(); return true; } return false; }
  expect(value) {
    if (this.is(value)) return this.next();
    const tk = this.tok;
    if (tk.type === 'eof') {
      throw new JavaSyntaxError(`Syntax error, insert "${value}" to complete the code`, this.prevLine());
    }
    // Eclipse says "insert ;" on the previous token's line when a ";" is missing.
    if (value === ';' || value === ')' || value === '}') {
      throw new JavaSyntaxError(`Syntax error, insert "${value}" to complete ${value === ';' ? 'BlockStatements' : 'the expression'}`, this.prevLine());
    }
    throw new JavaSyntaxError(`Syntax error on token "${tk.value}", "${value}" expected`, tk.line);
  }
  expectIdent(what = 'Identifier') {
    if (this.isIdent()) return this.next().value;
    const tk = this.tok;
    throw new JavaSyntaxError(`Syntax error on token "${tk.value}", ${what} expected`, tk.line);
  }
  prevLine() { return this.t[Math.max(0, this.i - 1)].line; }

  // ---------- program ----------
  parseProgram() {
    const classes = [];
    let pkg = '';
    let imports = [];
    while (this.tok.type !== 'eof') {
      if (this.accept('package')) {
        pkg = this.parseQualifiedName();
        imports = [];
        this.expect(';');
        continue;
      }
      if (this.accept('import')) {
        const line = this.prevLine();
        const isStatic = this.accept('static');
        let name = this.expectIdent();
        while (this.accept('.')) {
          if (this.accept('*')) { name += '.*'; break; }
          name += '.' + this.expectIdent();
        }
        this.expect(';');
        imports.push({ name, isStatic, line });
        continue;
      }
      if (this.accept(';')) continue;
      classes.push(this.parseClass(pkg, imports));
    }
    return { kind: 'Program', classes };
  }

  parseQualifiedName() {
    let name = this.expectIdent();
    while (this.accept('.')) name += '.' + this.expectIdent();
    return name;
  }

  skipAnnotations() {
    while (this.is('@')) {
      this.next();
      this.parseQualifiedName();
      if (this.is('(')) this.skipBalanced('(', ')');
    }
  }

  skipBalanced(open, close) {
    let depth = 0;
    do {
      if (this.is(open)) depth++;
      else if (this.is(close)) depth--;
      if (this.tok.type === 'eof') throw new JavaSyntaxError(`Syntax error, insert "${close}"`, this.prevLine());
      this.next();
    } while (depth > 0);
  }

  parseModifiers() {
    const mods = { visibility: 'package', static: false, final: false, abstract: false };
    for (;;) {
      this.skipAnnotations();
      const tk = this.tok;
      if (tk.type === 'keyword' && MODIFIERS.has(tk.value)) {
        this.next();
        if (tk.value === 'public' || tk.value === 'private' || tk.value === 'protected') mods.visibility = tk.value;
        else mods[tk.value] = true;
      } else break;
    }
    return mods;
  }

  // ---------- classes ----------
  parseClass(pkg, imports) {
    const mods = this.parseModifiers();
    const tk = this.tok;
    if (this.is('interface') || (this.isIdent() && (tk.value === 'enum' || tk.value === 'record'))) {
      throw new UnsupportedFeature(`"${tk.value}" is not supported yet. Only classes for now.`, tk.line);
    }
    const line = this.expect('class').line;
    const name = this.expectIdent('Identifier (class name)');
    let superName = null;
    if (this.accept('extends')) superName = this.parseQualifiedName();
    if (this.accept('implements')) {
      throw new UnsupportedFeature('"implements" (interfaces) is not supported yet.', this.prevLine());
    }
    if (this.is('<')) throw new UnsupportedFeature('Generic classes are not supported yet.', this.tok.line);
    this.expect('{');

    const cls = {
      kind: 'Class', name, pkg, imports: [...imports], modifiers: mods,
      superName, fields: [], ctors: [], methods: [], line, endLine: line,
    };

    while (!this.is('}')) {
      if (this.tok.type === 'eof') throw new JavaSyntaxError('Syntax error, insert "}" to complete ClassBody', this.prevLine());
      if (this.accept(';')) continue;
      this.parseMember(cls);
    }
    cls.endLine = this.expect('}').line;
    return cls;
  }

  parseMember(cls) {
    const startTok = this.tok;
    const mods = this.parseModifiers();
    const tk = this.tok;

    if (this.is('class') || this.is('interface')) {
      throw new UnsupportedFeature('Classes inside classes (nested classes) are not supported yet.', tk.line);
    }
    if (this.is('{')) {
      throw new UnsupportedFeature('Initializer blocks { ... } are not supported yet.', tk.line);
    }
    if (this.is('<')) throw new UnsupportedFeature('Generic methods are not supported yet.', tk.line);

    // constructor: ClassName (
    if (this.isIdent() && tk.value === cls.name && this.is('(', this.peek())) {
      this.next();
      const params = this.parseParams();
      const body = this.parseBlock();
      cls.ctors.push({ kind: 'Ctor', name: cls.name, params, modifiers: mods, body, line: tk.line, endLine: body.endLine, isCtor: true });
      return;
    }
    // something that looks like a constructor with a wrong name
    if (this.isIdent() && this.is('(', this.peek())) {
      throw new JavaSyntaxError('Return type for the method is missing', tk.line);
    }

    let type;
    if (this.accept('void')) type = { name: 'void', dims: 0 };
    else type = this.parseType();

    const nameTok = this.tok;
    const name = this.expectIdent();

    if (this.is('(')) {
      const params = this.parseParams();
      let body = null;
      if (this.accept(';')) {
        if (!mods.abstract) throw new JavaSyntaxError('This method requires a body instead of a semicolon', nameTok.line);
        // abstract method: no body, the child classes must write it
        cls.methods.push({ kind: 'Method', name, params, returnType: type, modifiers: mods, body: null, abstract: true, line: nameTok.line, endLine: nameTok.line });
        return;
      }
      if (mods.abstract) throw new JavaSyntaxError(`Abstract methods do not specify a body`, nameTok.line);
      body = this.parseBlock();
      cls.methods.push({ kind: 'Method', name, params, returnType: type, modifiers: mods, body, line: nameTok.line, endLine: body.endLine });
      return;
    }

    // field(s): int a = 1, b;
    let declName = name, declLine = nameTok.line;
    for (;;) {
      let dims = type.dims;
      while (this.is('[') && this.is(']', this.peek())) { this.next(); this.next(); dims++; }
      let init = null;
      if (this.accept('=')) init = this.parseVarInit();
      cls.fields.push({ kind: 'Field', name: declName, type: { ...type, dims }, modifiers: mods, init, line: declLine });
      if (!this.accept(',')) break;
      declLine = this.tok.line;
      declName = this.expectIdent();
    }
    this.expect(';');
    void startTok;
  }

  parseParams() {
    this.expect('(');
    const params = [];
    if (!this.is(')')) {
      do {
        this.skipAnnotations();
        const isFinal = this.accept('final');
        const type = this.parseType();
        if (this.accept('...')) throw new UnsupportedFeature('Varargs (...) are not supported yet.', this.prevLine());
        const name = this.expectIdent();
        let dims = type.dims;
        while (this.is('[')) { this.next(); this.expect(']'); dims++; }
        params.push({ type: { ...type, dims }, name, final: isFinal });
      } while (this.accept(','));
    }
    this.expect(')');
    return params;
  }

  // Type: int, String, Etudiant, int[], Etudiant[][], java.util.Scanner, ArrayList<Etudiant>
  parseType() {
    const tk = this.tok;
    let name;
    if (tk.type === 'keyword' && (PRIMITIVES.has(tk.value) || tk.value === 'var')) {
      this.next();
      name = tk.value;
    } else if (this.isIdent()) {
      name = this.next().value;
      while (this.is('.') && this.isIdent(this.peek())) { this.next(); name += '.' + this.next().value; }
      if (this.is('<')) {
        // generic type: parse and keep, the interpreter will refuse it with a clear message
        let depth = 0;
        let text = '';
        do {
          if (this.is('<')) depth++;
          else if (this.is('>')) depth--;
          else if (this.is('>>')) depth -= 2;
          text += this.tok.value;
          if (this.tok.type === 'eof') throw new JavaSyntaxError('Syntax error, insert ">"', this.prevLine());
          this.next();
        } while (depth > 0);
        return this.parseDims({ name, dims: 0, generic: text, line: tk.line });
      }
    } else {
      throw new JavaSyntaxError(`Syntax error on token "${tk.value}", Type expected`, tk.line);
    }
    return this.parseDims({ name, dims: 0, line: tk.line });
  }

  parseDims(type) {
    while (this.is('[') && this.is(']', this.peek())) { this.next(); this.next(); type.dims++; }
    return type;
  }

  // Try to read "Type name" without consuming anything if it fails.
  looksLikeDeclaration() {
    const save = this.i;
    try {
      if (this.is('final')) this.next();
      const tk = this.tok;
      if (!(this.isIdent() || (tk.type === 'keyword' && (PRIMITIVES.has(tk.value) || tk.value === 'var')))) return false;
      this.parseType();
      if (!this.isIdent()) return false;
      const after = this.peek();
      return this.is('=', after) || this.is(';', after) || this.is(',', after) || this.is('[', after) || this.is(':', after);
    } catch {
      return false;
    } finally {
      this.i = save;
    }
  }

  // ---------- statements ----------
  parseBlock() {
    const line = this.expect('{').line;
    const stmts = [];
    while (!this.is('}')) {
      if (this.tok.type === 'eof') throw new JavaSyntaxError('Syntax error, insert "}" to complete Block', this.prevLine());
      stmts.push(this.parseStatement());
    }
    const endLine = this.expect('}').line;
    return { kind: 'Block', stmts, line, endLine };
  }

  parseStatement() {
    const tk = this.tok;
    const line = tk.line;

    if (this.is('{')) return this.parseBlock();
    if (this.accept(';')) return { kind: 'Empty', line };

    if (tk.type === 'keyword') {
      switch (tk.value) {
        case 'if': {
          this.next(); this.expect('(');
          const cond = this.parseExpr();
          this.expect(')');
          const then = this.parseStatement();
          let els = null;
          if (this.accept('else')) els = this.parseStatement();
          return { kind: 'If', cond, then, else: els, line };
        }
        case 'while': {
          this.next(); this.expect('(');
          const cond = this.parseExpr();
          this.expect(')');
          return { kind: 'While', cond, body: this.parseStatement(), line };
        }
        case 'do': {
          this.next();
          const body = this.parseStatement();
          const wline = this.expect('while').line;
          this.expect('(');
          const cond = this.parseExpr();
          this.expect(')'); this.expect(';');
          return { kind: 'DoWhile', cond, body, line, condLine: wline };
        }
        case 'for': return this.parseFor();
        case 'break': this.next(); if (this.isIdent()) throw new UnsupportedFeature('Labeled break is not supported yet.', line); this.expect(';'); return { kind: 'Break', line };
        case 'continue': this.next(); this.expect(';'); return { kind: 'Continue', line };
        case 'return': {
          this.next();
          let expr = null;
          if (!this.is(';')) expr = this.parseExpr();
          this.expect(';');
          return { kind: 'Return', expr, line };
        }
        case 'switch': return this.parseSwitch();
        case 'this':
          if (this.is('(', this.peek())) {
            this.next();
            const args = this.parseArgs();
            this.expect(';');
            return { kind: 'ThisCall', args, line };
          }
          break;
        case 'super':
          if (this.is('(', this.peek())) {
            this.next();
            const args = this.parseArgs();
            this.expect(';');
            return { kind: 'SuperCall', args, line };
          }
          break;
        case 'else':
          throw new JavaSyntaxError('Syntax error on token "else", delete this token', line);
        case 'class':
          throw new UnsupportedFeature('Local classes are not supported.', line);
      }
    }

    if (this.looksLikeDeclaration()) {
      const decl = this.parseLocalVarDecl();
      this.expect(';');
      return decl;
    }

    const expr = this.parseExpr();
    if (!isStatementExpression(expr)) {
      throw new JavaSyntaxError('Syntax error, insert "AssignmentOperator Expression" to complete Expression', line);
    }
    this.expect(';');
    return { kind: 'ExprStmt', expr, line };
  }

  parseLocalVarDecl() {
    const line = this.tok.line;
    const isFinal = this.accept('final');
    const type = this.parseType();
    const decls = [];
    do {
      const dline = this.tok.line;
      const name = this.expectIdent();
      let dims = type.dims;
      while (this.is('[')) { this.next(); this.expect(']'); dims++; }
      let init = null;
      if (this.accept('=')) init = this.parseVarInit();
      decls.push({ name, type: { ...type, dims }, init, line: dline });
    } while (this.accept(','));
    return { kind: 'LocalVar', final: isFinal, type, decls, line };
  }

  parseVarInit() {
    if (this.is('{')) return this.parseArrayInit();
    return this.parseExpr();
  }

  parseArrayInit() {
    const line = this.expect('{').line;
    const elems = [];
    while (!this.is('}')) {
      elems.push(this.parseVarInit());
      if (!this.accept(',')) break;
    }
    this.expect('}');
    return { kind: 'ArrayInit', elems, line };
  }

  parseFor() {
    const line = this.next().line;
    this.expect('(');
    // for-each: for (Type x : arr)
    if (this.looksLikeDeclaration()) {
      const save = this.i;
      const isFinal = this.accept('final');
      const type = this.parseType();
      const name = this.expectIdent();
      if (this.accept(':')) {
        const iter = this.parseExpr();
        this.expect(')');
        return { kind: 'ForEach', type, name, final: isFinal, iter, body: this.parseStatement(), line };
      }
      this.i = save;
    }
    const init = [];
    if (!this.is(';')) {
      if (this.looksLikeDeclaration()) init.push(this.parseLocalVarDecl());
      else {
        do { const e = this.parseExpr(); init.push({ kind: 'ExprStmt', expr: e, line: e.line }); } while (this.accept(','));
      }
    }
    this.expect(';');
    const cond = this.is(';') ? null : this.parseExpr();
    this.expect(';');
    const update = [];
    if (!this.is(')')) {
      do { update.push(this.parseExpr()); } while (this.accept(','));
    }
    this.expect(')');
    return { kind: 'For', init, cond, update, body: this.parseStatement(), line };
  }

  parseSwitch() {
    const line = this.next().line;
    this.expect('(');
    const expr = this.parseExpr();
    this.expect(')');
    this.expect('{');
    const cases = [];
    while (!this.is('}')) {
      const cline = this.tok.line;
      const labels = [];
      let isDefault = false;
      if (this.accept('default')) { isDefault = true; }
      else {
        this.expect('case');
        do { labels.push(this.parseTernary()); } while (this.accept(','));
      }
      if (this.is('->')) throw new UnsupportedFeature('The new "case ->" switch is not supported yet. Use "case X:" with break.', cline);
      this.expect(':');
      const body = [];
      while (!this.is('case') && !this.is('default') && !this.is('}')) {
        if (this.tok.type === 'eof') throw new JavaSyntaxError('Syntax error, insert "}" to complete SwitchBlock', this.prevLine());
        body.push(this.parseStatement());
      }
      cases.push({ labels, isDefault, body, line: cline });
    }
    this.expect('}');
    return { kind: 'Switch', expr, cases, line };
  }

  // ---------- expressions (lowest precedence first) ----------
  parseExpr() { return this.parseAssignment(); }

  parseAssignment() {
    const left = this.parseTernary();
    const tk = this.tok;
    if (tk.type === 'op' && ['=', '+=', '-=', '*=', '/=', '%='].includes(tk.value)) {
      this.next();
      if (!['Name', 'Field', 'Index'].includes(left.kind)) {
        throw new JavaSyntaxError('The left-hand side of an assignment must be a variable', tk.line);
      }
      const value = this.parseAssignment();
      return { kind: 'Assign', op: tk.value, target: left, value, line: left.line };
    }
    return left;
  }

  parseTernary() {
    const cond = this.parseBinary(0);
    if (this.accept('?')) {
      const a = this.parseTernary();
      this.expect(':');
      const b = this.parseTernary();
      return { kind: 'Cond', cond, then: a, else: b, line: cond.line };
    }
    return cond;
  }

  parseBinary(minPrec) {
    let left = this.parseUnary();
    for (;;) {
      const tk = this.tok;
      if (tk.type === 'keyword' && tk.value === 'instanceof') {
        if (PREC.instanceof < minPrec) break;
        this.next();
        const type = this.parseType();
        left = { kind: 'InstanceOf', expr: left, type, line: left.line };
        continue;
      }
      const prec = tk.type === 'op' ? PREC[tk.value] : undefined;
      if (prec === undefined || prec < minPrec) break;
      this.next();
      const right = this.parseBinary(prec + 1);
      left = { kind: 'Binary', op: tk.value, left, right, line: left.line };
    }
    return left;
  }

  parseUnary() {
    const tk = this.tok;
    if (tk.type === 'op') {
      if (tk.value === '++' || tk.value === '--') {
        this.next();
        const target = this.parseUnary();
        return { kind: 'Update', op: tk.value, prefix: true, target, line: tk.line };
      }
      if (['-', '+', '!', '~'].includes(tk.value)) {
        this.next();
        const operand = this.parseUnary();
        // fold "-5" into a literal so that int ranges work
        if (tk.value === '-' && operand.kind === 'Literal' && (operand.type === 'int' || operand.type === 'double')) {
          return { ...operand, value: -operand.value };
        }
        return { kind: 'Unary', op: tk.value, operand, line: tk.line };
      }
      if (tk.value === '(' && this.isCast()) {
        this.next();
        const type = this.parseType();
        this.expect(')');
        const expr = this.parseUnary();
        return { kind: 'Cast', type, expr, line: tk.line };
      }
    }
    return this.parsePostfix(this.parsePrimary());
  }

  isCast() {
    const a = this.peek(1), b = this.peek(2);
    if (a.type === 'keyword' && PRIMITIVES.has(a.value)) {
      return this.is(')', b) || this.is('[', b);
    }
    if (a.type === 'ident') {
      // (Etudiant) x  /  (String[]) x  — only when something castable follows
      let k = 2;
      while (this.is('.', this.peek(k)) && this.peek(k + 1).type === 'ident') k += 2;
      while (this.is('[', this.peek(k)) && this.is(']', this.peek(k + 1))) k += 2;
      if (!this.is(')', this.peek(k))) return false;
      const after = this.peek(k + 1);
      return after.type === 'ident' || after.type === 'string' || after.type === 'char' ||
        (after.type === 'keyword' && ['this', 'new', 'null', 'true', 'false', 'super'].includes(after.value)) ||
        this.is('(', after);
    }
    return false;
  }

  parsePrimary() {
    const tk = this.tok;
    const line = tk.line;
    switch (tk.type) {
      case 'int': this.next(); return { kind: 'Literal', type: 'int', value: tk.value, line };
      case 'double': this.next(); return { kind: 'Literal', type: 'double', value: tk.value, line };
      case 'char': this.next(); return { kind: 'Literal', type: 'char', value: tk.value, line };
      case 'string': this.next(); return { kind: 'Literal', type: 'String', value: tk.value, line };
      case 'ident': {
        this.next();
        if (this.is('(')) {
          const args = this.parseArgs();
          return { kind: 'Call', target: null, name: tk.value, args, line };
        }
        return { kind: 'Name', name: tk.value, line };
      }
      case 'keyword':
        switch (tk.value) {
          case 'true': case 'false': this.next(); return { kind: 'Literal', type: 'boolean', value: tk.value === 'true', line };
          case 'null': this.next(); return { kind: 'Literal', type: 'null', value: null, line };
          case 'this': this.next(); return { kind: 'This', line };
          case 'super':
            // super.method(...) or super.field : the parent class version
            this.next();
            if (!this.is('.')) throw new JavaSyntaxError('Syntax error on token "super", . expected', line);
            return { kind: 'Super', line };
          case 'new': return this.parseNew();
          case 'int': case 'double': case 'boolean': case 'char': case 'long': case 'float': case 'short': case 'byte':
            // int.class etc. — not supported
            break;
        }
        break;
      case 'op':
        if (tk.value === '(') {
          this.next();
          const e = this.parseExpr();
          this.expect(')');
          return { kind: 'Paren', expr: e, line };
        }
        if (tk.value === '{') {
          throw new JavaSyntaxError('Array constants can only be used in initializers', line);
        }
        break;
    }
    if (tk.type === 'eof') throw new JavaSyntaxError('Syntax error, insert "Expression" to complete the code', this.prevLine());
    throw new JavaSyntaxError(`Syntax error on token "${tk.value}", invalid Expression`, line);
  }

  parseNew() {
    const line = this.next().line;
    const tk = this.tok;
    let name;
    if (tk.type === 'keyword' && PRIMITIVES.has(tk.value)) { name = this.next().value; }
    else {
      name = this.parseQualifiedName();
      if (this.is('<')) {
        let depth = 0;
        do { if (this.is('<')) depth++; else if (this.is('>')) depth--; this.next(); } while (depth > 0);
        return { kind: 'New', type: { name, dims: 0, generic: true }, args: this.parseArgs(), line };
      }
    }
    if (this.is('[')) {
      const dims = [];
      let extra = 0;
      while (this.is('[')) {
        this.next();
        if (this.is(']')) { this.next(); extra++; continue; }
        if (extra > 0) throw new JavaSyntaxError('Cannot specify an array dimension after an empty dimension', this.tok.line);
        dims.push(this.parseExpr());
        this.expect(']');
      }
      let init = null;
      if (dims.length === 0) {
        if (!this.is('{')) throw new JavaSyntaxError('Must provide either dimension expressions or an array initializer', line);
        init = this.parseArrayInit();
      } else if (this.is('{')) {
        throw new JavaSyntaxError('Cannot define dimension expressions when an array initializer is provided', line);
      }
      return { kind: 'NewArray', elemName: name, dims, totalDims: dims.length + extra, init, line };
    }
    if (PRIMITIVES.has(name)) throw new JavaSyntaxError(`Syntax error on token "${name}", Dimensions expected after this token`, line);
    const args = this.parseArgs();
    if (this.is('{')) throw new UnsupportedFeature('Anonymous classes are not supported.', line);
    return { kind: 'New', type: { name, dims: 0 }, args, line };
  }

  parseArgs() {
    this.expect('(');
    const args = [];
    if (!this.is(')')) {
      do { args.push(this.parseExpr()); } while (this.accept(','));
    }
    this.expect(')');
    return args;
  }

  parsePostfix(expr) {
    for (;;) {
      const tk = this.tok;
      if (this.is('.')) {
        this.next();
        const nameTok = this.tok;
        if (this.is('this') || this.is('class') || this.is('new')) {
          throw new UnsupportedFeature(`".${nameTok.value}" is not supported.`, nameTok.line);
        }
        const name = this.expectIdent();
        if (this.is('(')) {
          const args = this.parseArgs();
          expr = { kind: 'Call', target: expr, name, args, line: nameTok.line };
        } else {
          expr = { kind: 'Field', target: expr, name, line: nameTok.line };
        }
      } else if (this.is('[')) {
        this.next();
        const index = this.parseExpr();
        this.expect(']');
        expr = { kind: 'Index', target: expr, index, line: tk.line };
      } else if (this.is('++') || this.is('--')) {
        this.next();
        expr = { kind: 'Update', op: tk.value, prefix: false, target: expr, line: expr.line };
      } else if (this.is('::') || this.is('->')) {
        throw new UnsupportedFeature('Lambdas and method references are not supported.', tk.line);
      } else {
        return expr;
      }
    }
  }
}

const PREC = {
  '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5,
  '==': 6, '!=': 6,
  '<': 7, '>': 7, '<=': 7, '>=': 7, instanceof: 7,
  '<<': 8, '>>': 8, '>>>': 8,
  '+': 9, '-': 9,
  '*': 10, '/': 10, '%': 10,
};

function isStatementExpression(e) {
  return ['Assign', 'Update', 'Call', 'New'].includes(e.kind);
}

// errors.js — the kinds of errors OOP Street can show.
//
// 1. JavaSyntaxError     : the code cannot be read at all (like a red X in Eclipse before running).
// 2. CompilationProblem  : the code can be read, but a line breaks a Java rule
//                          (private field used from outside, unknown variable...).
//                          Eclipse still lets you run, and stops on that line with
//                          "java.lang.Error: Unresolved compilation problem".
//                          We do the same, so you can SEE where it breaks.
// 3. JavaException       : a runtime exception (NullPointerException, ArithmeticException...).
// 4. UnsupportedFeature  : valid Java that OOP Street does not understand yet. Never fails silently.

export class JavaSyntaxError extends Error {
  constructor(message, line) {
    super(message);
    this.name = 'JavaSyntaxError';
    this.line = line;
  }
  // Text shown in the console, like Eclipse's Problems view.
  toConsole() {
    return `Syntax error (line ${this.line}): ${this.message}`;
  }
}

export class CompilationProblem extends Error {
  constructor(message, line, hint) {
    super(message);
    this.name = 'CompilationProblem';
    this.line = line;
    this.hint = hint; // short simple-English explanation for learners
  }
  toConsole() {
    return 'Exception in thread "main" java.lang.Error: Unresolved compilation problem: \n\t' + this.message;
  }
}

export class JavaException extends Error {
  // javaClass: e.g. 'java.lang.NullPointerException'
  constructor(javaClass, message, line, hint) {
    super(message);
    this.name = 'JavaException';
    this.javaClass = javaClass;
    this.line = line;
    this.hint = hint;
  }
  toConsole() {
    return 'Exception in thread "main" ' + this.javaClass + (this.message ? ': ' + this.message : '');
  }
}

export class UnsupportedFeature extends Error {
  constructor(message, line) {
    super(message);
    this.name = 'UnsupportedFeature';
    this.line = line;
  }
  toConsole() {
    return `OOP Street does not support this yet (line ${this.line}): ${this.message}`;
  }
}

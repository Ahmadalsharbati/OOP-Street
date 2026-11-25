// runner.js — runs the whole program once and records every step.
//
// Because every step is recorded (with a copy of the memory), the UI can move
// forward and backward freely: Step, Back, Next line, To end.
//
//   const run = runProgram(sourceCode);
//   run.steps[i]   -> { line, depth, events, state }
//   run.error      -> the error that stopped the program (or null)

import { parse } from './parser.js';
import { Interpreter } from './interpreter.js';
import { JavaSyntaxError, CompilationProblem, JavaException, UnsupportedFeature } from './errors.js';
import { ProgramExit } from './builtins.js';

export const MAX_STEPS = 20000;

export function compile(source) {
  try {
    const program = parse(source);
    const interp = new Interpreter(program);
    return { program, interp, error: null };
  } catch (e) {
    return { program: null, interp: null, error: toErrorInfo(e) };
  }
}

export function runProgram(source, { mainClass = null, maxSteps = MAX_STEPS } = {}) {
  const { interp, error } = compile(source);
  const result = { steps: [], error: null, problems: [], mainClasses: [], mainClass: null, finished: false, classes: [] };
  if (error) { result.error = error; return result; }

  result.problems = interp.problems;
  result.mainClasses = interp.findMainClasses();
  result.classes = interp.snapshot().classes;
  if (result.mainClasses.length === 0) {
    result.error = {
      kind: 'noMain', line: null,
      console: 'Error: no main method found.',
      hint: 'Add a class with: public static void main(String[] args) { ... }',
    };
    return result;
  }
  result.mainClass = mainClass && result.mainClasses.includes(mainClass) ? mainClass : pickMain(result.mainClasses);

  const gen = interp.run(result.mainClass);
  try {
    for (;;) {
      const r = gen.next();
      if (r.done) break;
      const stop = r.value;
      result.steps.push({ line: stop.line, depth: stop.depth, events: stop.events, state: interp.snapshot() });
      if (result.steps.length >= maxSteps) {
        result.error = {
          kind: 'tooLong', line: stop.line,
          console: `OOP Street stopped the program after ${maxSteps} steps.`,
          hint: 'Maybe a loop never ends? Check the loop condition.',
        };
        return result;
      }
    }
    result.finished = true;
  } catch (e) {
    if (e instanceof ProgramExit) {
      result.finished = true;
    } else {
      result.error = toErrorInfo(e, interp);
      if (result.error.kind === 'internal') console.error(e);
      if (result.error.kind === 'compile' || result.error.kind === 'exception') {
        result.error.console += '\n' + stackTrace(interp, result.error.line);
      }
    }
  }
  // final state (after the last line)
  result.steps.push({ line: null, depth: 0, events: interp.events, state: interp.snapshot(), final: true, error: result.error });
  return result;
}

// "	at Etudiant.getNom(Etudiant.java:12)" lines, newest frame first
function stackTrace(interp, errorLine) {
  const lines = [];
  const frames = interp.frames;
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    const cls = f.cls ? f.cls.fullName : '?';
    const method = f.method ? (f.method.isCtor ? '<init>' : f.method.name) : (f.label.endsWith('<clinit>') ? '<clinit>' : '<init>');
    const line = i === frames.length - 1 && errorLine ? errorLine : f.line;
    lines.push(`\tat ${cls}.${method}(${f.cls ? f.cls.name : '?'}.java:${line})`);
    if (lines.length === 12 && frames.length > 14) { lines.push(`\t... ${frames.length - 13} more`); i = 1; }
  }
  return lines.join('\n');
}

function pickMain(names) {
  return names.find(n => /launcher/i.test(n)) || names.find(n => /main|app|test/i.test(n)) || names[0];
}

function toErrorInfo(e, interp) {
  if (e instanceof JavaSyntaxError) return { kind: 'syntax', line: e.line, message: e.message, console: e.toConsole() };
  if (e instanceof CompilationProblem) return { kind: 'compile', line: e.line, message: e.message, hint: e.hint, console: e.toConsole(), blocked: e.blocked || null };
  if (e instanceof JavaException) return { kind: 'exception', line: e.line, javaClass: e.javaClass, message: e.message, hint: e.hint, console: e.toConsole() };
  if (e instanceof UnsupportedFeature) return { kind: 'unsupported', line: e.line, message: e.message, console: e.toConsole() };
  void interp;
  return { kind: 'internal', line: null, message: String(e && e.message || e), console: 'OOP Street internal error: ' + (e && e.message || e) + '\nPlease report this code on GitHub.' };
}

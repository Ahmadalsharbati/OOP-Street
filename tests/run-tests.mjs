// Run with:  node tests/run-tests.mjs
//
// 1. tests/programs/*.java : OOP Street output must be EXACTLY the output of real Java.
//    (Needs `javac` and `java` installed. Without them, only OOP Street runs.)
// 2. tests/errors/*.java   : the first lines say what OOP Street must report:
//      // EXPECT: <text that must appear in the error>
//      // LINE: <line of the error>            (optional)
//      // EXPECT-OUT: <text that must appear in the output>

import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { runProgram } from '../js/java/runner.js';

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;

function ok(name) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
function bad(name, detail) { fail++; console.log('  \x1b[31m✗ ' + name + '\x1b[0m\n' + detail); }

function streetOutput(src) {
  const r = runProgram(src);
  const out = r.steps.length ? r.steps[r.steps.length - 1].state.output.map(o => o.text).join('\n') : '';
  return { r, out: out.replace(/\n$/, '') };
}

let hasJava = true;
try { execSync('javac -version', { stdio: 'ignore' }); } catch { hasJava = false; }

const clean = (s) => s.split('\n').filter(l => !l.startsWith('Picked up ')).join('\n').replace(/\n$/, '');

// Real Java: one file per class, in folders by package
function realJava(src, mainClass) {
  const dir = join(tmpdir(), 'oopstreet-' + Math.random().toString(36).slice(2));
  mkdirSync(dir, { recursive: true });
  try {
    const all = join(dir, 'All.java');
    writeFileSync(all, src.replace(/^public class/gm, 'class').replace(/^public final class/gm, 'final class'));
    execSync(`javac -d ${dir}/out ${all}`, { stdio: 'pipe' });
    try {
      const out = execSync(`java -cp ${dir}/out ${mainClass} 2>&1`, { stdio: 'pipe', env: { ...process.env, JAVA_TOOL_OPTIONS: '', _JAVA_OPTIONS: '' } }).toString();
      return clean(out);
    } catch (e) {
      return clean(e.stdout.toString());
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('\nPrograms (compared with real Java)' + (hasJava ? '' : ' — java not found, running OOP Street only'));
for (const f of readdirSync(join(here, 'programs')).filter(f => f.endsWith('.java'))) {
  const src = readFileSync(join(here, 'programs', f), 'utf8');
  const { r, out } = streetOutput(src);
  if (r.error) { bad(f, '    OOP Street error: ' + r.error.console); continue; }
  if (!hasJava) { ok(f + ' (ran)'); continue; }
  const expected = realJava(src, r.mainClass);
  if (expected === out) ok(f);
  else {
    const e = expected.split('\n'), o = out.split('\n');
    const i = e.findIndex((l, k) => l !== o[k]);
    bad(f, `    first difference at output line ${i + 1}:\n    java      : ${JSON.stringify(e[i])}\n    OOP Street: ${JSON.stringify(o[i])}`);
  }
}

console.log('\nErrors (Eclipse-style messages)');
for (const f of readdirSync(join(here, 'errors')).filter(f => f.endsWith('.java'))) {
  const src = readFileSync(join(here, 'errors', f), 'utf8');
  const expect = (src.match(/^\/\/ EXPECT: (.*)$/m) || [])[1];
  const expectLine = (src.match(/^\/\/ LINE: (\d+)$/m) || [])[1];
  const expectOut = (src.match(/^\/\/ EXPECT-OUT: (.*)$/m) || [])[1];
  const { r, out } = streetOutput(src);
  const problems = [];
  if (expect) {
    if (!r.error) problems.push('    expected an error, got none. Output: ' + out);
    else if (!r.error.console.includes(expect)) problems.push('    expected: ' + expect + '\n    got     : ' + r.error.console.split('\n').slice(0, 2).join(' | '));
    if (r.error && expectLine && String(r.error.line) !== expectLine) problems.push(`    expected line ${expectLine}, got ${r.error.line}`);
  }
  if (expectOut && !out.includes(expectOut)) problems.push('    expected output to contain: ' + expectOut + '\n    got: ' + out + (r.error ? '\n    error: ' + r.error.console : ''));
  if (problems.length) bad(f, problems.join('\n'));
  else ok(f + (r.error ? '  →  ' + r.error.console.split('\n')[0].slice(0, 90) : ''));
}

// Stepping sanity: Back/Step depend on recorded steps
console.log('\nStepping');
{
  const src = readFileSync(join(here, 'programs', 'etudiant-classe.java'), 'utf8');
  const r = runProgram(src);
  const lines = r.steps.slice(0, 6).map(s => s.line);
  const firstNew = r.steps.find(s => s.events.some(e => e.type === 'new'));
  const ctorStep = r.steps[1];
  if (lines[0] === 60 && lines[1] === 5 && firstNew && ctorStep.depth === 2) ok(`first steps at lines ${lines.join(', ')} (${r.steps.length} steps total)`);
  else bad('stepping', '    lines: ' + lines.join(', '));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

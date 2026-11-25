// main.js — connects everything: the code editor, the runner, the 3D street and the panels.

import { runProgram } from './java/runner.js';
import { StreetScene } from './scene/scene.js';
import { explainStep } from './ui/explain.js';
import { EXAMPLES } from './examples.js';

const $ = (id) => document.getElementById(id);
const editor = $('code');
const gutter = $('gutter');
const lineMark = $('line-mark');
const errorMark = $('error-mark');

const scene = new StreetScene($('scene'), $('labels'));

let run = null;      // result of runProgram
let index = 0;       // current step
let dirty = false;   // code changed since last Run

// ---------- examples ----------
for (const ex of EXAMPLES) {
  const o = document.createElement('option');
  o.value = ex.id; o.textContent = ex.title;
  $('example').appendChild(o);
}
$('example').addEventListener('change', () => {
  const ex = EXAMPLES.find(e => e.id === $('example').value);
  if (ex) { editor.value = ex.code; compileAndRun(); }
});

// ---------- editor ----------
const LINE_H = 20;
function refreshGutter() {
  const n = editor.value.split('\n').length;
  let s = '';
  for (let i = 1; i <= n; i++) s += i + '\n';
  gutter.textContent = s;
}
editor.addEventListener('input', () => {
  refreshGutter();
  if (!dirty) { dirty = true; $('status').textContent = 'Code changed: press Run (Ctrl+Enter)'; $('status').className = 'status warn'; }
});
editor.addEventListener('scroll', () => {
  gutter.scrollTop = editor.scrollTop;
  positionMarks();
});
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = editor.selectionStart;
    editor.setRangeText('    ', s, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input'));
  }
});

function markLine(el, line) {
  el.dataset.line = line || '';
  positionMarks();
}
function positionMarks() {
  for (const el of [lineMark, errorMark]) {
    const line = Number(el.dataset.line);
    if (!line) { el.style.display = 'none'; continue; }
    el.style.display = 'block';
    el.style.top = (8 + (line - 1) * LINE_H - editor.scrollTop) + 'px';
  }
}
function scrollToLine(line) {
  if (!line) return;
  const y = (line - 1) * LINE_H;
  if (y < editor.scrollTop + 20 || y > editor.scrollTop + editor.clientHeight - 60) {
    editor.scrollTop = Math.max(0, y - editor.clientHeight / 3);
  }
}

// ---------- running ----------
function compileAndRun() {
  dirty = false;
  scene.reset();
  run = runProgram(editor.value, { mainClass: $('main-class').value || null });
  // main class chooser (when several classes have a main)
  const sel = $('main-class');
  sel.replaceChildren(...run.mainClasses.map(n => { const o = document.createElement('option'); o.value = o.textContent = n; return o; }));
  sel.value = run.mainClass || '';
  $('main-wrap').hidden = run.mainClasses.length < 2;
  index = 0;
  show();
}

function show() {
  const status = $('status');
  if (!run.steps.length) {
    // the code could not even start (syntax error, no main...)
    status.textContent = run.error.kind === 'syntax' ? 'Syntax error: fix the red line' : 'Cannot start';
    status.className = 'status error';
    $('console').replaceChildren(consoleLine(run.error.console, 'err'));
    $('explain').replaceChildren(para(run.error.hint || run.error.message || ''));
    $('variables').replaceChildren();
    markLine(lineMark, null);
    markLine(errorMark, run.error.line);
    scrollToLine(run.error.line);
    $('step-count').textContent = '';
    updateButtons();
    return;
  }

  const step = run.steps[index];
  const prev = run.steps[index - 1];
  const state = step.state;

  markLine(lineMark, step.line);
  scrollToLine(step.line);
  markLine(errorMark, step.final && step.error ? step.error.line : null);
  if (step.final && step.error) scrollToLine(step.error.line);

  $('step-count').textContent = `Step ${index + 1} / ${run.steps.length}`;
  if (step.final) {
    status.textContent = step.error ? (step.error.kind === 'exception' ? 'Stopped: exception' : step.error.kind === 'compile' ? 'Stopped: compilation problem' : 'Stopped') : 'Finished';
    status.className = 'status ' + (step.error ? 'error' : 'ok');
  } else {
    status.textContent = `Line ${step.line} (not executed yet)`;
    status.className = 'status';
  }

  // explanation
  $('explain').replaceChildren(...explainStep(step, prev).map(para));

  // console
  const out = state.output.filter((o, i, a) => !(i === a.length - 1 && o.text === ''));
  const nodes = out.map(o => consoleLine(o.text, o.kind));
  if (step.final && step.error) nodes.push(consoleLine(step.error.console, 'err'));
  $('console').replaceChildren(...nodes);
  $('console').scrollTop = 1e9;

  // variables (Eclipse "Variables" view) for the current frame + call stack
  renderVariables(state, prev?.state);

  // 3D
  const top = state.frames[state.frames.length - 1];
  scene.update(state, top ? top.thisId : null);
  updateButtons();
}

function updateButtons() {
  const has = run && run.steps.length > 0;
  $('btn-back').disabled = !has || index === 0;
  $('btn-reset').disabled = !has || index === 0;
  for (const id of ['btn-step', 'btn-next', 'btn-end']) $(id).disabled = !has || index >= run.steps.length - 1;
}

function stepInto() { if (run && index < run.steps.length - 1) { index++; show(); } }
function stepOver() {
  if (!run) return;
  const d = run.steps[index].depth;
  let j = index + 1;
  while (j < run.steps.length - 1 && run.steps[j].depth > d) j++;
  if (j < run.steps.length) { index = j; show(); }
}
function back() { if (run && index > 0) { index--; show(); } }
function toEnd() { if (run) { index = run.steps.length - 1; show(); } }
function reset() { if (run) { index = 0; show(); } }

$('btn-run').addEventListener('click', compileAndRun);
$('btn-step').addEventListener('click', stepInto);
$('btn-next').addEventListener('click', stepOver);
$('btn-back').addEventListener('click', back);
$('btn-end').addEventListener('click', toEnd);
$('btn-reset').addEventListener('click', reset);
$('btn-fit').addEventListener('click', () => scene.fitAll());
$('main-class').addEventListener('change', compileAndRun);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); compileAndRun(); return; }
  if (document.activeElement === editor) return;
  if (e.key === 'F5') { e.preventDefault(); stepInto(); }
  else if (e.key === 'F6') { e.preventDefault(); stepOver(); }
  else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); back(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); stepInto(); }
});
// F5/F6 also work while the editor has focus
editor.addEventListener('keydown', (e) => {
  if (e.key === 'F5') { e.preventDefault(); stepInto(); }
  else if (e.key === 'F6') { e.preventDefault(); stepOver(); }
});

// ---------- panels ----------
function para(text) { const p = document.createElement('p'); p.textContent = text; return p; }
function consoleLine(text, kind) { const d = document.createElement('div'); d.className = 'c-' + kind; d.textContent = text; return d; }

function valueText(v, heap) {
  switch (v.kind) {
    case 'unset': return '(no value yet)';
    case 'null': return 'null';
    case 'string': return '"' + v.text + '"';
    case 'prim': return v.type === 'char' ? `'${v.text}'` : v.text;
    case 'object': return `${v.cls} (id=${v.id})`;
    case 'array': return `${v.type} (id=${v.id}) length ${v.length}`;
    default: void heap; return '';
  }
}

function renderVariables(state, prevState) {
  const root = $('variables');
  root.replaceChildren();
  const frames = state.frames;
  if (!frames.length) { root.appendChild(para('No method is running.')); return; }
  const top = frames[frames.length - 1];
  const prevTop = prevState?.frames.find(f => f.id === top.id && f.label === top.label);
  const heap = new Map(state.heap.map(o => [o.id, o]));
  const prevHeap = new Map((prevState?.heap || []).map(o => [o.id, o]));

  const title = document.createElement('div');
  title.className = 'v-frame';
  title.textContent = top.label;
  root.appendChild(title);

  const rows = [];
  if (top.thisId !== null) rows.push({ name: 'this', value: { kind: 'object', id: top.thisId, cls: top.cls } });
  for (const v of top.vars) rows.push(v);
  for (const r of rows) {
    const prev = prevTop?.vars.find(x => x.name === r.name);
    const changed = r.name !== 'this' && (!prev || valueText(prev.value) !== valueText(r.value));
    root.appendChild(varRow(r.name, r.value, changed && !!prevState, heap, prevHeap, 0));
  }

  // call stack (pile), newest first
  const stack = document.createElement('div');
  stack.className = 'v-stack';
  stack.innerHTML = '<div class="v-stack-title">Call stack (pile)</div>';
  for (let i = frames.length - 1; i >= 0; i--) {
    const d = document.createElement('div');
    d.textContent = frames[i].label + (frames[i].line ? '  line ' + frames[i].line : '');
    if (i === frames.length - 1) d.className = 'current';
    stack.appendChild(d);
  }
  root.appendChild(stack);
}

function varRow(name, value, changed, heap, prevHeap, depth) {
  const obj = (value.kind === 'object' || value.kind === 'array') ? heap.get(value.id) : null;
  const wrap = document.createElement(obj ? 'details' : 'div');
  const head = document.createElement(obj ? 'summary' : 'div');
  head.className = 'v-row' + (changed ? ' changed' : '');
  head.style.paddingLeft = (depth * 14 + (obj ? 0 : 14)) + 'px';
  head.innerHTML = `<span class="v-name"></span><span class="v-val"></span>`;
  head.querySelector('.v-name').textContent = name;
  head.querySelector('.v-val').textContent = valueText(value, heap);
  wrap.appendChild(head);
  if (obj && depth < 3) {
    if (depth === 0) wrap.open = name !== 'this';
    const before = prevHeap.get(obj.id);
    const children = obj.isArray
      ? obj.items.map((v, i) => ({ name: `[${i}]`, value: v, prev: before?.items?.[i] }))
      : obj.fields.map(f => ({ name: (f.visibility === 'private' ? '🔒 ' : '') + f.name, value: f.value, prev: before?.fields?.find(x => x.name === f.name)?.value }));
    for (const c of children) {
      const ch = !!prevHeap.size && (!c.prev || valueText(c.prev) !== valueText(c.value));
      wrap.appendChild(varRow(c.name, c.value, ch, heap, prevHeap, depth + 1));
    }
  }
  return wrap;
}

// ---------- start ----------
editor.value = EXAMPLES[0].code;
refreshGutter();
compileAndRun();

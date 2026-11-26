// main.js — connects everything: the code editor, the runner, the street and the panels.

import { runProgram } from './java/runner.js';
import { StreetScene } from './scene/scene.js';
import { explainStep } from './ui/explain.js';
import { highlightJava } from './ui/highlight.js';
import { EXAMPLES } from './examples.js';

const $ = (id) => document.getElementById(id);
const editor = $('code');
const highlight = $('highlight');
const gutter = $('gutter');
const lineMark = $('line-mark');
const errorMark = $('error-mark');
const LINE_H = 21;
const PAD_TOP = 10;

const scene = new StreetScene($('scene'), $('labels'));
scene.onFollowChange = (on) => $('btn-follow').classList.toggle('on', on);

let run = null;      // result of runProgram
let index = 0;       // current step
let dirty = false;   // code changed since last Run
let lastOutputLen = 0;
let autoStep = false;

// ---------- examples ----------
for (const ex of EXAMPLES) {
  const o = document.createElement('option');
  o.value = ex.id; o.textContent = ex.title;
  $('example').appendChild(o);
}
$('example').addEventListener('change', () => {
  const ex = EXAMPLES.find(e => e.id === $('example').value);
  if (ex) { editor.value = ex.code; refreshEditor(); compileAndRun(); }
});

// ---------- editor ----------
function refreshEditor() {
  renderGutter();
  highlight.innerHTML = highlightJava(editor.value) + '\n';
  syncScroll();
}
// ---------- clickable line numbers ----------
// lineSteps: line -> list of step indexes where this line runs
let lineSteps = new Map();
let declarations = new Map(); // line -> { kind, cls, name }
function indexLines() {
  lineSteps = new Map();
  declarations = new Map();
  if (!run) return;
  run.steps.forEach((st, i) => {
    if (st.final || !st.line) return;
    if (!lineSteps.has(st.line)) lineSteps.set(st.line, []);
    lineSteps.get(st.line).push(i);
  });
  for (const c of run.classes || []) {
    declarations.set(c.line, { kind: 'class', cls: c.name });
    for (const f of c.fields) if (!lineSteps.has(f.line)) declarations.set(f.line, { kind: 'field', cls: c.name, name: f.name });
    for (const m of c.methods) declarations.set(m.line, { kind: 'method', cls: c.name, name: m.name, line: m.line });
    for (const k of c.ctors) declarations.set(k.line, { kind: 'ctor', cls: c.name, name: c.name, line: k.line });
  }
}
function renderGutter() {
  const n = editor.value.split('\n').length;
  const current = run && run.steps[index] ? run.steps[index].line : null;
  const html = [];
  for (let i = 1; i <= n; i++) {
    const runs = dirty ? 0 : (lineSteps.get(i) || []).length;
    const decl = !dirty && declarations.has(i);
    const cls = ['gl', runs ? 'ran' : decl ? 'decl' : 'never', i === current ? 'now' : ''].join(' ');
    html.push(`<div class="${cls}" data-line="${i}">${runs > 1 ? `<span class="cnt">×${runs}</span>` : ''}${i}</div>`);
  }
  gutter.innerHTML = html.join('');
  gutter.scrollTop = editor.scrollTop;
}
// keep code and line numbers aligned whatever scrolls
gutter.addEventListener('scroll', () => { if (Math.abs(gutter.scrollTop - editor.scrollTop) > 1) gutter.scrollTop = editor.scrollTop; });
gutter.addEventListener('wheel', (e) => { editor.scrollTop += e.deltaY; syncScroll(); }, { passive: true });
gutter.addEventListener('click', (e) => {
  const el = e.target.closest('.gl');
  if (!el || !run || dirty) return;
  goToLine(Number(el.dataset.line));
});
function goToLine(line) {
  stopPlay();
  const steps = lineSteps.get(line);
  const decl = declarations.get(line);
  if (steps && steps.length) {
    // next time this line runs after the current step (or the first time)
    const next = steps.find(i => i > index);
    index = next !== undefined ? next : steps[0];
    replayLine = line;
    setFollow(true);
    show();
    const k = steps.indexOf(index) + 1;
    if (steps.length > 1) flashCaption(`Line ${line} runs ${steps.length} times — this is time ${k}. Click the number again for the next one.`);
    return;
  }
  if (decl && (decl.kind === 'method' || decl.kind === 'ctor')) {
    // a method header: go inside the next call of this method
    const inside = run.steps.map((st, i) => i).filter(i => {
      const f = run.steps[i].state.frames;
      const top = f[f.length - 1];
      return top && top.startLine === line && (i === 0 || run.steps[i - 1].state.frames.length < f.length);
    });
    if (inside.length) {
      const next = inside.find(i => i > index);
      index = next !== undefined ? next : inside[0];
      replayLine = null;
      setFollow(true);
      show();
      flashCaption(`Inside ${decl.kind === 'ctor' ? 'the constructor of ' + decl.cls : decl.name + '()'} — call ${inside.indexOf(index) + 1} of ${inside.length}.`);
      return;
    }
    flashCaption(`${decl.kind === 'ctor' ? 'This constructor' : decl.name + '()'} is never called in this program.`);
    return;
  }
  if (decl) {
    setFollow(false);
    scene.showClass(decl.cls, decl.kind === 'field');
    flashCaption(decl.kind === 'class'
      ? `class ${decl.cls} is a blueprint: it does not run. Here is its district.`
      : `This line declares the field ${decl.name} of ${decl.cls}. Every ${decl.cls} house gets this basket.`);
    return;
  }
  flashCaption(`Line ${line} does not run.`);
}
function flashCaption(text) {
  const p = document.createElement('p');
  p.textContent = text;
  p.className = 'note';
  $('explain').appendChild(p);
}

// ---------- Replay and Play ----------
let replayLine = null;
let playTimer = null;
function stopPlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  $('btn-play').classList.remove('on');
  $('play-icon').innerHTML = '<path d="M4 2.5v11l9-5.5z"/>';
}
function play(fromIndex, untilIndex, ms = 850) {
  stopPlay();
  if (fromIndex !== null) { index = fromIndex; show(); }
  $('btn-play').classList.add('on');
  $('play-icon').innerHTML = '<path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/>';
  playTimer = setInterval(() => {
    if (index >= Math.min(untilIndex, run.steps.length - 1)) { stopPlay(); return; }
    index++;
    show();
  }, ms);
}
function endOfLine(i) {
  const d = run.steps[i].depth;
  let j = i + 1;
  while (j < run.steps.length - 1 && run.steps[j].depth > d) j++;
  return j;
}
$('btn-play').addEventListener('click', () => {
  if (playTimer) stopPlay();
  else if (run && run.steps.length) play(index >= run.steps.length - 1 ? 0 : null, Infinity);
});
$('btn-replay').addEventListener('click', () => {
  if (!run || replayLine === null) return;
  const steps = lineSteps.get(replayLine) || [];
  const at = steps.includes(index) ? index : steps.filter(i => i <= index).pop();
  if (at === undefined) return;
  const keepLine = replayLine;
  play(Math.max(0, at - 1), endOfLine(at), 950);
  replayLine = keepLine;
});

function syncScroll() {
  highlight.scrollTop = editor.scrollTop;
  highlight.scrollLeft = editor.scrollLeft;
  gutter.scrollTop = editor.scrollTop;
  positionMarks();
}
editor.addEventListener('input', () => {
  refreshEditor();
  if (!dirty) { dirty = true; setStatus('Code changed — press Run', 'warn'); }
});
editor.addEventListener('scroll', syncScroll);
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    editor.setRangeText('    ', editor.selectionStart, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input'));
  } else if (e.key === 'F5') { e.preventDefault(); stepInto(); }
  else if (e.key === 'F6') { e.preventDefault(); stepOver(); }
});

function markLine(el, line) { el.dataset.line = line || ''; positionMarks(); }
function positionMarks() {
  for (const el of [lineMark, errorMark]) {
    const line = Number(el.dataset.line);
    if (!line) { el.style.display = 'none'; continue; }
    el.style.display = 'block';
    el.style.top = (PAD_TOP + (line - 1) * LINE_H - editor.scrollTop) + 'px';
  }
}
function scrollToLine(line) {
  if (!line) return;
  const y = (line - 1) * LINE_H;
  if (y < editor.scrollTop + 30 || y > editor.scrollTop + editor.clientHeight - 80) {
    editor.scrollTop = Math.max(0, y - editor.clientHeight / 3);
    syncScroll();
  }
}

// ---------- running ----------
function compileAndRun() {
  dirty = false;
  scene.reset();
  scene.setSource(editor.value);
  run = runProgram(editor.value, { mainClass: $('main-class').value || null });
  const sel = $('main-class');
  sel.replaceChildren(...run.mainClasses.map(n => { const o = document.createElement('option'); o.value = o.textContent = n; return o; }));
  sel.value = run.mainClass || '';
  $('main-wrap').hidden = run.mainClasses.length < 2;
  index = 0;
  lastOutputLen = 0;
  stopPlay();
  indexLines();
  setFollow(true);
  show();
}

function setStatus(text, kind = '') {
  const s = $('status');
  s.textContent = text;
  s.className = 'status ' + kind;
}

function show() {
  const caption = $('explain');
  if (!run.steps.length) {
    // the code could not start (syntax error, no main...)
    setStatus(run.error.kind === 'syntax' ? 'Syntax error' : 'Cannot start', 'error');
    $('console').replaceChildren(consoleLine(run.error.console, 'err'));
    openTab('console');
    caption.className = 'caption error';
    caption.replaceChildren(para(run.error.kind === 'syntax' ? `Line ${run.error.line}: ${run.error.message}` : run.error.console), ...(run.error.hint ? [para(run.error.hint)] : []));
    $('variables').replaceChildren(para('Fix the code, then press Run.', 'empty-note'));
    markLine(lineMark, null);
    markLine(errorMark, run.error.line);
    scrollToLine(run.error.line);
    $('step-count').textContent = '';
    $('progress-bar').style.width = '0';
    updateButtons();
    return;
  }

  const step = run.steps[index];
  const prev = run.steps[index - 1];
  const state = step.state;

  markLine(lineMark, step.final ? null : step.line);
  markLine(errorMark, step.final && step.error ? step.error.line : null);
  scrollToLine(step.final && step.error ? step.error.line : step.line);

  $('step-count').textContent = `${index + 1} / ${run.steps.length}`;
  $('progress-bar').style.width = (100 * (index + 1) / run.steps.length) + '%';
  if (step.final) {
    const e = step.error;
    setStatus(e ? (e.kind === 'exception' ? 'Exception' : e.kind === 'compile' ? 'Compilation problem' : 'Stopped') : 'Finished ✓', e ? 'error' : 'ok');
  } else {
    setStatus(`Line ${step.line}`);
  }

  // caption under the street
  const lines = explainStep(step, prev);
  caption.className = 'caption' + (step.final && step.error ? ' error' : '');
  caption.replaceChildren(...lines.slice(0, 3).map(t => para(t)));

  // console
  const out = state.output.filter((o, i, a) => !(i === a.length - 1 && o.text === ''));
  const nodes = out.map(o => consoleLine(o.text, o.kind));
  if (step.final && step.error) nodes.push(consoleLine(step.error.console, 'err'));
  $('console').replaceChildren(...nodes);
  $('console').parentElement.scrollTop = 1e9;
  if (nodes.length > lastOutputLen && currentTab !== 'console') $('console-dot').hidden = false;
  lastOutputLen = nodes.length;
  if (step.final && step.error) openTab('console');

  renderVariables(state, prev?.state);
  scene.update(step);
  updateButtons();
  renderGutter();
  if (!playTimer && step.line !== replayLine) replayLine = step.final ? null : step.line;
  $('btn-replay').hidden = !replayLine || !!playTimer;
  $('replay-line').textContent = replayLine || '';
}

function updateButtons() {
  const has = run && run.steps.length > 0;
  $('btn-back').disabled = !has || index === 0;
  $('btn-reset').disabled = !has || index === 0;
  for (const id of ['btn-step', 'btn-next', 'btn-end']) $(id).disabled = !has || index >= run.steps.length - 1;
}

function stepInto() { if (playTimer && !autoStep) stopPlay(); if (run && index < run.steps.length - 1) { index++; show(); } }
function stepOver() { if (playTimer && !autoStep) stopPlay();
  if (!run || index >= run.steps.length - 1) return;
  const d = run.steps[index].depth;
  let j = index + 1;
  while (j < run.steps.length - 1 && run.steps[j].depth > d) j++;
  index = j; show();
}
function back() { if (playTimer && !autoStep) stopPlay(); if (run && index > 0) { index--; show(); } }
function toEnd() { if (playTimer && !autoStep) stopPlay(); if (run) { index = run.steps.length - 1; show(); } }
function reset() { if (playTimer && !autoStep) stopPlay(); if (run) { index = 0; show(); } }

function setFollow(on) { scene.setFollow(on); $('btn-follow').classList.toggle('on', on); }
function setFocus(on) {
  scene.setFocus(on);
  $('btn-focus').classList.toggle('on', on);
  $('btn-all').classList.toggle('on', !on);
}

$('btn-run').addEventListener('click', compileAndRun);
$('btn-step').addEventListener('click', stepInto);
$('btn-next').addEventListener('click', stepOver);
$('btn-back').addEventListener('click', back);
$('btn-end').addEventListener('click', toEnd);
$('btn-reset').addEventListener('click', reset);
$('btn-fit').addEventListener('click', () => { setFollow(false); scene.fitAll(); });
$('btn-follow').addEventListener('click', () => { const on = !scene.follow; setFollow(on); if (on) scene.focusView(); });
$('btn-focus').addEventListener('click', () => setFocus(true));
$('btn-all').addEventListener('click', () => setFocus(false));
$('btn-legend').addEventListener('click', () => { const l = $('legend'); l.hidden = !l.hidden; $('btn-legend').classList.toggle('on', !l.hidden); });
$('btn-zoom-in').addEventListener('click', () => scene.zoomBy(1.25));
$('btn-zoom-out').addEventListener('click', () => scene.zoomBy(0.8));
$('main-class').addEventListener('change', compileAndRun);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); compileAndRun(); return; }
  if (document.activeElement === editor) return;
  if (e.key === ' ') { e.preventDefault(); $('btn-play').click(); return; }
  if (e.key === 'F5' || e.key === 'ArrowRight') { e.preventDefault(); stepInto(); }
  else if (e.key === 'F6' || e.key === 'ArrowDown') { e.preventDefault(); stepOver(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
});

// ---------- resizable panels (drag the handles, double-click to hide) ----------
const app = document.querySelector('.app');
const sizes = { left: 440, right: 300 };
const saved = { left: 440, right: 300 };
try { Object.assign(sizes, JSON.parse(localStorage.getItem('oopstreet.sizes') || '{}')); } catch { /* storage not available */ }
function applySizes() {
  app.style.setProperty('--left', sizes.left + 'px');
  app.style.setProperty('--right', sizes.right + 'px');
  app.classList.toggle('no-left', sizes.left === 0);
  app.classList.toggle('no-right', sizes.right === 0);
  $('btn-big').classList.toggle('on', sizes.left === 0 && sizes.right === 0);
  try { localStorage.setItem('oopstreet.sizes', JSON.stringify(sizes)); } catch { /* ignore */ }
}
function makeSplitter(el, side) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    document.body.classList.add('resizing');
    const startX = e.clientX, start = sizes[side];
    const max = app.clientWidth - 420 - (side === 'left' ? sizes.right : sizes.left);
    const move = (ev) => {
      const dx = ev.clientX - startX;
      let w = side === 'left' ? start + dx : start - dx;
      w = Math.max(0, Math.min(max, w));
      if (w < 140) w = 0; // small enough: hide it
      sizes[side] = Math.round(w);
      applySizes();
    };
    const up = () => {
      el.classList.remove('dragging');
      document.body.classList.remove('resizing');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (sizes[side] > 0) saved[side] = sizes[side];
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });
  el.addEventListener('dblclick', () => {
    sizes[side] = sizes[side] === 0 ? (saved[side] || (side === 'left' ? 440 : 300)) : 0;
    applySizes();
  });
}
makeSplitter($('split-left'), 'left');
makeSplitter($('split-right'), 'right');
$('btn-big').addEventListener('click', () => {
  const big = sizes.left === 0 && sizes.right === 0;
  if (big) { sizes.left = saved.left || 440; sizes.right = saved.right || 300; }
  else { if (sizes.left) saved.left = sizes.left; if (sizes.right) saved.right = sizes.right; sizes.left = 0; sizes.right = 0; }
  applySizes();
});
applySizes();

// ---------- tabs ----------
let currentTab = 'vars';
function openTab(name) {
  currentTab = name;
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.tab === name);
  $('tab-vars').hidden = name !== 'vars';
  $('tab-console').hidden = name !== 'console';
  if (name === 'console') $('console-dot').hidden = true;
}
for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => openTab(t.dataset.tab));

// ---------- panels ----------
function para(text, cls) { const p = document.createElement('p'); p.textContent = text; if (cls) p.className = cls; return p; }
function consoleLine(text, kind) { const d = document.createElement('div'); d.className = 'c-' + kind; d.textContent = text; return d; }

function valueText(v) {
  switch (v.kind) {
    case 'unset': return '(no value yet)';
    case 'null': return 'null';
    case 'string': return '"' + v.text + '"';
    case 'prim': return v.type === 'char' ? `'${v.text}'` : v.text;
    case 'object': return `${v.cls} (id=${v.id})`;
    case 'array': return `${v.type} (id=${v.id}) length ${v.length}`;
    default: return '';
  }
}

function renderVariables(state, prevState) {
  const root = $('variables');
  root.replaceChildren();
  const frames = state.frames;
  if (!frames.length) { root.appendChild(para('No method is running.', 'empty-note')); return; }
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
  if (!rows.length) root.appendChild(para('No variables yet.', 'empty-note'));
  for (const r of rows) {
    const prev = prevTop?.vars.find(x => x.name === r.name);
    const changed = !!prevState && r.name !== 'this' && (!prev || valueText(prev.value) !== valueText(r.value));
    root.appendChild(varRow(r.name, r.value, changed, heap, prevHeap, 0));
  }

  const stack = document.createElement('div');
  stack.className = 'v-stack';
  stack.innerHTML = '<div class="v-stack-title">Call stack (pile)</div>';
  for (let i = frames.length - 1; i >= 0; i--) {
    const d = document.createElement('div');
    d.textContent = frames[i].label + (frames[i].line ? ' : ' + frames[i].line : '');
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
  head.style.paddingLeft = (14 + depth * 14 + (obj ? 0 : 14)) + 'px';
  const n = document.createElement('span'); n.className = 'v-name'; n.textContent = name;
  const v = document.createElement('span'); v.className = 'v-val'; v.textContent = valueText(value);
  head.append(n, v);
  wrap.appendChild(head);
  if (obj && depth < 3) {
    if (depth === 0) wrap.open = name !== 'this';
    const before = prevHeap.get(obj.id);
    const children = obj.isArray
      ? obj.items.map((x, i) => ({ name: `[${i}]`, value: x, prev: before?.items?.[i] }))
      : obj.fields.map(f => ({ name: (f.visibility === 'private' ? '🔒 ' : '') + f.name, value: f.value, prev: before?.fields?.find(x => x.name === f.name)?.value }));
    for (const c of children) {
      const ch = prevHeap.size > 0 && (!c.prev || valueText(c.prev) !== valueText(c.value));
      wrap.appendChild(varRow(c.name, c.value, ch, heap, prevHeap, depth + 1));
    }
  }
  return wrap;
}

// ---------- start ----------
editor.value = EXAMPLES[0].code;
refreshEditor();
compileAndRun();

// uml.js — a live UML class diagram, generated from YOUR code.
//
// 1. analyzeUml(program)  reads the classes (the AST) and finds the relations:
//      - a field whose type is another class  → association
//      - Type        → 0..1        Type[]  → 0..*
//      - both classes point to each other     → bidirectional (no arrow head)
//      - the object is created INSIDE the class (new B(...) put in the field) → composition ◆
//      - the object comes from OUTSIDE (a parameter put in the field)        → agrégation  ◇
//    Every relation keeps a short "why" sentence, so the learner sees how it was decided.
// 2. renderUml(model, options) draws it as SVG.

const PRIMS = new Set(['int', 'double', 'boolean', 'char', 'long', 'float', 'short', 'byte', 'String', 'void', 'Object']);

export function analyzeUml(program) {
  const decls = program.classes;
  const names = new Set(decls.map(c => c.name));
  const relations = [];

  for (const c of decls) {
    for (const f of c.fields) {
      if (f.modifiers.static || !names.has(f.type.name) || PRIMS.has(f.type.name)) continue;
      const many = f.type.dims > 0;
      const found = findAssignments(c, f.name, f.type.name);
      let kind = 'association', why;
      if (found.created.length) {
        kind = 'composition';
        why = `${c.name} creates the ${f.type.name} itself (${found.created[0]}), so it owns it: composition.`;
      } else if (found.fromParam.length) {
        kind = 'aggregation';
        why = `The ${f.type.name} comes from outside (${found.fromParam[0]}), so it can live without ${c.name}: agrégation.`;
      } else {
        why = `${c.name} only keeps an address to a ${f.type.name}.`;
      }
      relations.push({
        from: c.name, to: f.type.name, field: f.name, card: many ? '0..*' : '0..1', many, kind, why, line: f.line,
      });
    }
  }

  // two fields pointing at each other = one bidirectional relation
  const merged = [];
  const used = new Set();
  relations.forEach((r, i) => {
    if (used.has(i)) return;
    const j = relations.findIndex((o, k) => k !== i && !used.has(k) && o.from === r.to && o.to === r.from && r.from !== r.to);
    if (j >= 0) {
      const o = relations[j];
      used.add(j);
      // the "whole" side is the one holding many (Classe holds many Etudiant)
      const owner = r.many && !o.many ? r : o.many && !r.many ? o : r;
      const other = owner === r ? o : r;
      merged.push({
        from: owner.from, to: owner.to, field: owner.field, card: owner.card,
        backField: other.field, backCard: other.card, bidirectional: true,
        kind: owner.kind, why: owner.why + ` And each ${other.from} knows its ${other.to} (field ${other.field}): two-way.`,
        line: owner.line,
      });
    } else merged.push({ ...r, bidirectional: false });
    used.add(i);
  });

  const classes = decls.map(c => ({
    name: c.name, pkg: c.pkg, line: c.line,
    fields: c.fields
      .filter(f => !(names.has(f.type.name) && !f.modifiers.static)) // relations are drawn as lines, not as fields
      .map(f => ({ name: f.name, type: typeText(f.type), vis: f.modifiers.visibility, static: f.modifiers.static, final: f.modifiers.final })),
    ctors: c.ctors.map(m => ({ name: c.name, params: m.params.map(p => p.name + ': ' + typeText(p.type)), vis: m.modifiers.visibility })),
    methods: c.methods.map(m => ({
      name: m.name, params: m.params.map(p => p.name + ': ' + typeText(p.type)), ret: typeText(m.returnType),
      vis: m.modifiers.visibility, static: m.modifiers.static,
    })),
  }));
  return { classes, relations: merged };
}

function typeText(t) { return t.name + '[]'.repeat(t.dims || 0); }

// Find how the field gets its value in the class: new B(...) or a parameter.
function findAssignments(cls, field, typeName) {
  const created = [], fromParam = [];
  if (cls.fields.find(f => f.name === field)?.init?.kind === 'New') created.push(`${field} = new ${typeName}(...)`);
  for (const m of [...cls.ctors, ...cls.methods]) {
    const params = new Set(m.params.map(p => p.name));
    const sig = `${m.isCtor ? cls.name : m.name}(${m.params.map(p => typeText(p.type) + ' ' + p.name).join(', ')})`;
    const locals = new Map(); // local var -> 'new' when it holds a new B(...)
    walk(m.body, (node) => {
      if (node.kind === 'LocalVar') for (const d of node.decls) if (d.init && d.init.kind === 'New' && d.init.type.name === typeName) locals.set(d.name, 'new');
      if (node.kind !== 'Assign' || node.op !== '=') return;
      if (!targetsField(node.target, field, params)) return;
      const v = node.value;
      if (v.kind === 'New' && v.type.name === typeName) created.push(`new ${typeName}(...) in ${sig}`);
      else if (v.kind === 'Name' && locals.get(v.name) === 'new') created.push(`new ${typeName}(...) in ${sig}`);
      else if (v.kind === 'Name' && params.has(v.name)) fromParam.push(sig);
    });
  }
  return { created, fromParam };
}

// this.f, f (when no parameter hides it), this.f[i], f[i]
function targetsField(t, field, params) {
  if (t.kind === 'Index') t = t.target;
  if (t.kind === 'Field' && t.target.kind === 'This' && t.name === field) return true;
  if (t.kind === 'Name' && t.name === field && !params.has(field)) return true;
  return false;
}

function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => walk(n, fn)); return; }
  if (node.kind) fn(node);
  for (const k of Object.keys(node)) {
    if (k === 'line' || k === 'kind') continue;
    const v = node[k];
    if (v && typeof v === 'object') walk(v, fn);
  }
}

// ===================== drawing =====================
const VIS = { public: '+', private: '−', protected: '#', package: '~' };
const CH = 7.3;     // width of one monospace character (12px)
const LH = 18;      // line height
const PAD = 10;

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// options: { colorOf(name) -> '#hex', active: class name, counts: {name: n}, hotFields: Set('Class.field') }
export function renderUml(model, options = {}) {
  const { colorOf = () => '#6c8cff', active = null, counts = {}, hotFields = new Set(), availableWidth = 900 } = options;

  // 0. order: start from the class with most relations, then its neighbours (they end up next to each other)
  const deg = new Map(model.classes.map(c => [c.name, 0]));
  const adj = new Map(model.classes.map(c => [c.name, []]));
  for (const r of model.relations) {
    if (r.from === r.to) continue;
    deg.set(r.from, deg.get(r.from) + 1); deg.set(r.to, deg.get(r.to) + 1);
    adj.get(r.from).push(r.to); adj.get(r.to).push(r.from);
  }
  const order = [];
  const seen = new Set();
  const byDeg = [...model.classes].sort((a, b) => deg.get(b.name) - deg.get(a.name));
  for (const start of byDeg) {
    if (seen.has(start.name) || deg.get(start.name) === 0) continue;
    const queue = [start.name]; seen.add(start.name);
    while (queue.length) {
      const n = queue.shift(); order.push(n);
      for (const m of adj.get(n)) if (!seen.has(m)) { seen.add(m); queue.push(m); }
    }
  }
  for (const c of model.classes) if (!seen.has(c.name)) order.push(c.name);
  const ordered = order.map(n => model.classes.find(c => c.name === n));

  // 1. size of each box
  const boxes = ordered.map(c => {
    const lines = [
      ...c.fields.map(f => ({ text: `${VIS[f.vis]} ${f.name}: ${f.type}`, static: f.static })),
    ];
    const ops = [
      ...c.ctors.map(k => ({ text: `${VIS[k.vis]} ${k.name}(${k.params.join(', ')})` })),
      ...c.methods.map(m => ({ text: `${VIS[m.vis]} ${m.name}(${m.params.join(', ')})${m.ret === 'void' ? '' : ': ' + m.ret}`, static: m.static })),
    ];
    const title = c.name;
    const w = Math.max(150, Math.min(340, PAD * 2 + CH * Math.max(title.length + 4, ...lines.map(l => l.text.length), ...ops.map(l => l.text.length))));
    const h = 34 + Math.max(1, lines.length) * LH + 10 + Math.max(1, ops.length) * LH + 8;
    return { c, lines, ops, w, h };
  });

  // 2. grid layout, related classes next to each other (simple order: by number of relations)
  const n = boxes.length;
  const maxW = Math.max(...boxes.map(b => b.w));
  // as many columns as fit in the space we have (never smaller than real size)
  const fit = Math.max(1, Math.floor((availableWidth - 40) / (maxW + 200)));
  // with relations: at least 2 columns, so lines go between neighbours and not through other boxes
  const cols = Math.max(model.relations.length && n > 1 ? 2 : 1, Math.min(fit, Math.ceil(Math.sqrt(n * 1.6))));
  const colW = maxW + 200;
  const rowsH = [];
  boxes.forEach((b, i) => { const r = Math.floor(i / cols); rowsH[r] = Math.max(rowsH[r] || 0, b.h); });
  const rowY = []; let y = 30;
  rowsH.forEach((h, r) => { rowY[r] = y; y += h + 130; });
  boxes.forEach((b, i) => {
    const col = i % cols, r = Math.floor(i / cols);
    b.x = 30 + col * colW + (colW - 200 - b.w) / 2;
    b.y = rowY[r];
  });
  const W = 30 + cols * colW - 170, H = y - 100;
  const byName = new Map(boxes.map(b => [b.c.name, b]));

  // 3. svg
  const parts = [];
  parts.push(`<defs>
    <marker id="uml-arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11" fill="none" stroke="#475069" stroke-width="1.6"/></marker>
    <marker id="uml-arrow-hot" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11" fill="none" stroke="#d97706" stroke-width="1.8"/></marker>
  </defs>`);

  // relations first (under the boxes)
  model.relations.forEach((r, i) => {
    const A = byName.get(r.from), B = byName.get(r.to);
    if (!A || !B) return;
    const hot = hotFields.has(r.from + '.' + r.field) || (r.backField && hotFields.has(r.to + '.' + r.backField));
    const stroke = hot ? '#d97706' : '#475069';
    if (A === B) {
      // relation to itself: a loop on the right side
      const x = A.x + A.w, yy = A.y + 20;
      parts.push(`<path d="M${x} ${yy} h40 v40 h-40" fill="none" stroke="${stroke}" stroke-width="${hot ? 2.4 : 1.5}" marker-end="url(#${hot ? 'uml-arrow-hot' : 'uml-arrow'})"/>`);
      parts.push(label(x + 46, yy + 22, `${r.field} ${r.card}`, 'start'));
      return;
    }
    const [p1, p2] = connect(A, B);
    const markerEnd = r.bidirectional ? '' : `marker-end="url(#${hot ? 'uml-arrow-hot' : 'uml-arrow'})"`;
    parts.push(`<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${stroke}" stroke-width="${hot ? 2.4 : 1.5}" ${markerEnd} data-rel="${i}"/>`);
    // diamond at the "whole" side
    if (r.kind !== 'association') parts.push(diamond(p1, p2, r.kind === 'composition', stroke));
    // labels near the ends: role name + cardinality
    const t = along(p2, p1, 26), s = along(p1, p2, r.kind !== 'association' ? 40 : 26);
    const off = perp(p1, p2, 9);
    // on a vertical line, put the texts left and right of it; on a horizontal line, above and below
    const side = Math.abs(off.x) > Math.abs(off.y);
    const aPlus = side ? (off.x > 0 ? 'start' : 'end') : 'middle';
    const aMinus = side ? (off.x > 0 ? 'end' : 'start') : 'middle';
    const dy = side ? 0 : (off.y > 0 ? 6 : -2);
    // on a horizontal line, texts grow away from the box they are next to
    const awayT = side ? null : (p1.x < p2.x ? 'end' : 'start');
    const awayS = side ? null : (p1.x < p2.x ? 'start' : 'end');
    parts.push(label(t.x + off.x, t.y + off.y + dy, r.card, awayT || aPlus, true));
    parts.push(label(t.x - off.x, t.y - off.y - dy + (side ? 0 : 4), r.field, awayT || aMinus));
    if (r.bidirectional) {
      parts.push(label(s.x + off.x, s.y + off.y + dy, r.backCard, awayS || aPlus, true));
      parts.push(label(s.x - off.x, s.y - off.y - dy + (side ? 0 : 4), r.backField, awayS || aMinus));
    }
  });

  // boxes
  for (const b of boxes) {
    const color = colorOf(b.c.name);
    const isActive = b.c.name === active;
    const cnt = counts[b.c.name] || 0;
    parts.push(`<g class="uml-box${isActive ? ' active' : ''}" data-class="${esc(b.c.name)}">`);
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="#fff" stroke="${isActive ? '#facc15' : '#d5d9e2'}" stroke-width="${isActive ? 3 : 1.2}"/>`);
    parts.push(`<path d="M${b.x} ${b.y + 10} a10 10 0 0 1 10 -10 h${b.w - 20} a10 10 0 0 1 10 10 v20 h-${b.w} z" fill="${color}"/>`);
    parts.push(`<text x="${b.x + b.w / 2}" y="${b.y + 20}" text-anchor="middle" class="uml-title">${esc(b.c.name)}</text>`);
    if (cnt) parts.push(`<text x="${b.x + b.w - 8}" y="${b.y + 20}" text-anchor="end" class="uml-count">${cnt} obj</text>`);
    let yy = b.y + 30 + LH - 3;
    if (!b.lines.length) yy += LH;
    for (const l of b.lines) { parts.push(`<text x="${b.x + PAD}" y="${yy}" class="uml-line${l.static ? ' st' : ''}">${esc(l.text)}</text>`); yy += LH; }
    const sepY = b.y + 34 + Math.max(1, b.lines.length) * LH + 2;
    parts.push(`<line x1="${b.x}" y1="${sepY}" x2="${b.x + b.w}" y2="${sepY}" stroke="#e6e8ee"/>`);
    yy = sepY + LH - 2;
    for (const l of b.ops) { parts.push(`<text x="${b.x + PAD}" y="${yy}" class="uml-line${l.static ? ' st' : ''}">${esc(l.text)}</text>`); yy += LH; }
    parts.push('</g>');
  }

  const vw = Math.max(W, 300), vh = Math.max(H, 200);
  return `<svg viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}" xmlns="http://www.w3.org/2000/svg" class="uml-svg">${parts.join('')}</svg>`;
}

// line between two boxes, from border to border
function connect(A, B) {
  const ca = { x: A.x + A.w / 2, y: A.y + A.h / 2 }, cb = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
  return [clip(A, ca, cb), clip(B, cb, ca)];
}
function clip(box, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const tx = dx ? (box.w / 2) / Math.abs(dx) : Infinity, ty = dy ? (box.h / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: from.x + dx * t, y: from.y + dy * t };
}
function along(p, q, d) {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  return { x: p.x + (q.x - p.x) / len * d, y: p.y + (q.y - p.y) / len * d };
}
function perp(p, q, d) {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  return { x: -(q.y - p.y) / len * d, y: (q.x - p.x) / len * d };
}
function diamond(p, q, filled, stroke) {
  const a = p, b = along(p, q, 12), c = along(p, q, 24);
  const o = perp(p, q, 6);
  return `<path d="M${a.x} ${a.y} L${b.x + o.x} ${b.y + o.y} L${c.x} ${c.y} L${b.x - o.x} ${b.y - o.y} Z" fill="${filled ? stroke : '#fff'}" stroke="${stroke}" stroke-width="1.5"/>`;
}
function label(x, y, text, anchor = 'middle', strong = false) {
  return `<text x="${x}" y="${y + 4}" text-anchor="${anchor}" class="uml-label${strong ? ' strong' : ''}">${esc(text)}</text>`;
}

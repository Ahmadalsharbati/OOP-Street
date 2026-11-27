// concepts.js — "OOP Concepts, visualized": cards made automatically from YOUR program.
//
// Each card = one concept that really appears in the code (or happened while it ran),
// drawn as glowing chips joined by thin lines, with one simple sentence.
// Every card is a complete SVG, so it can be downloaded as a PNG image.

const NEON = {
  violet: '#a78bfa', green: '#34d399', blue: '#38bdf8', pink: '#f472b6',
  amber: '#fbbf24', red: '#f87171', teal: '#2dd4bf', indigo: '#818cf8',
};
const W = 520, H = 250;
const CH = 7.6; // width of one monospace character (13px)

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function short(s, n = 26) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// ---------------------------------------------------------------------------
// 1. Find the concepts in the program and in what happened while it ran
// ---------------------------------------------------------------------------
export function buildConcepts(run, uml) {
  if (!run || !run.steps.length) return [];
  const classes = run.steps[run.steps.length - 1].state.classes;
  const byName = new Map(classes.map(c => [c.name, c]));
  const finalState = run.steps[run.steps.length - 1].state;
  const objects = finalState.heap.filter(o => !o.isArray);
  const events = run.steps.flatMap(s => s.events);
  const cards = [];
  const userClasses = classes.filter(c => !(c.methods.every(m => m.static) && !c.fields.some(f => !f.static) && !c.ctors.length && !c.superName));

  // Class & Object: one class with many objects, or several classes with their objects
  const counts = new Map();
  for (const o of objects) counts.set(o.cls, (counts.get(o.cls) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length && sorted[0][1] >= 2) {
    const [name, n] = sorted[0];
    const ids = objects.filter(o => o.cls === name).map(o => o.id);
    cards.push({
      key: 'object', title: 'Class & Object', color: NEON.blue,
      draw: fan([chip(name, NEON.violet, '🧩')], ids.slice(0, 4).map(id => chip(`obj #${id}`, NEON.green)).concat(ids.length > 4 ? [chip(`+${ids.length - 4} more`, NEON.green)] : [])),
      caption: `One blueprint ${name} → ${n} objects built with new. Same fields, different values.`,
    });
  } else if (sorted.length) {
    const some = sorted.slice(0, 3).map(([name]) => ({ name, id: objects.find(o => o.cls === name).id }));
    cards.push({
      key: 'object', title: 'Class & Object', color: NEON.blue,
      draw: fan(some.map(x => chip(x.name, NEON.violet, '🧩')), some.map(x => chip(`obj #${x.id}`, NEON.green))),
      caption: `Each class is a blueprint; new builds a real object from it (${some.map(x => x.name).join(', ')}).`,
    });
  }

  // Encapsulation: private fields + public methods
  const enc = userClasses
    .map(c => ({ c, priv: c.fields.filter(f => f.visibility === 'private' && !f.static), pub: c.methods.filter(m => m.visibility === 'public' && !m.static) }))
    .filter(x => x.priv.length && x.pub.length)
    .sort((a, b) => (b.priv.length + b.pub.length) - (a.priv.length + a.pub.length))[0];
  if (enc) {
    const getset = enc.pub.filter(m => /^(get|set|is)[A-Z]/.test(m.name)).slice(0, 3);
    cards.push({
      key: 'encapsulation', title: 'Encapsulation', color: NEON.green,
      draw: boxed(enc.c.name, enc.priv.slice(0, 3).map(f => '🔒 ' + f.name), (getset.length ? getset : enc.pub.slice(0, 3)).map(m => '+ ' + m.name + '()')),
      caption: `${enc.c.name} hides its data (private) and opens public methods to use it.`,
    });
  }

  // Inheritance: the biggest family
  const children = new Map();
  for (const c of classes) if (c.superName && byName.has(c.superName)) {
    if (!children.has(c.superName)) children.set(c.superName, []);
    children.get(c.superName).push(c.name);
  }
  if (children.size) {
    const [parent, kids] = [...children.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    cards.push({
      key: 'inheritance', title: 'Inheritance', color: NEON.violet,
      draw: tree(chip(parent, NEON.violet), kids.slice(0, 4).map(k => chip(k, NEON.green))),
      caption: `${kids.join(' and ')} extend${kids.length > 1 ? '' : 's'} ${parent}: they get its fields and methods.`,
    });
  }

  // Polymorphism: one method, several versions (@Override) that really ran
  const overrides = new Map();
  for (const e of events) if (e.type === 'dispatch' && e.kind === 'override') {
    if (!overrides.has(e.method)) overrides.set(e.method, new Set());
    overrides.get(e.method).add(e.cls);
  }
  const poly = [...overrides.entries()].sort((a, b) => b[1].size - a[1].size)[0];
  if (poly) {
    const cls = [...poly[1]];
    cards.push({
      key: 'polymorphism', title: 'Polymorphism', color: NEON.pink,
      draw: fan([chip(poly[0] + '()', NEON.pink)], cls.slice(0, 4).map(c => chip(c, NEON.blue))),
      caption: `One call ${poly[0]}(), ${cls.length > 1 ? 'many behaviors' : 'its own behavior'}: the real object chooses its version.`,
    });
  }

  // Abstraction: abstract class with abstract methods
  const abs = classes.find(c => c.isAbstract);
  if (abs) {
    const am = abs.methods.filter(m => m.abstract).map(m => m.name + '()');
    const kids = children.get(abs.name) || [];
    cards.push({
      key: 'abstraction', title: 'Abstraction', color: NEON.amber,
      draw: chain([chip('You', NEON.pink), chip(`abstract ${abs.name}`, NEON.amber), chip(kids[0] ? kids.slice(0, 2).join(', ') : 'children', NEON.green, null, true)]),
      caption: am.length
        ? `${abs.name} says WHAT (${am.slice(0, 2).join(', ')}), the children say HOW. No object of ${abs.name} itself.`
        : `${abs.name} is abstract: only a general idea, you build its children.`,
    });
  }

  // Composition / agrégation / two-way, from the UML analysis
  const rels = uml ? uml.relations : [];
  const comp = rels.filter(r => r.kind === 'composition');
  if (comp.length) {
    const owner = comp[0].from;
    const parts = comp.filter(r => r.from === owner).map(r => r.to);
    cards.push({
      key: 'composition', title: 'Composition', color: NEON.teal,
      draw: fan([chip(owner, NEON.violet)], parts.map(p => chip(p, NEON.green)), '◆'),
      caption: `${owner} creates its ${parts.join(', ')} itself (new inside): they live and die with it.`,
    });
  }
  const agg = rels.filter(r => r.kind === 'aggregation' && !r.bidirectional);
  if (agg.length) {
    const owner = agg[0].from;
    const parts = agg.filter(r => r.from === owner).map(r => r.to);
    cards.push({
      key: 'aggregation', title: 'Agrégation', color: NEON.indigo,
      draw: fan([chip(owner, NEON.violet)], parts.map(p => chip(p, NEON.blue)), '◇'),
      caption: `${owner} uses ${parts.join(', ')} that come from outside: they can live without it.`,
    });
  }
  const two = rels.find(r => r.bidirectional);
  if (two) {
    cards.push({
      key: 'twoway', title: 'Two-way association', color: NEON.blue,
      draw: pair(chip(two.from, NEON.violet), chip(two.to, NEON.green), `${two.field} ${two.card}`, `${two.backField} ${two.backCard}`),
      caption: `Each ${two.to} knows its ${two.from}, and the ${two.from} knows its ${two.to}s.`,
    });
  }

  // static: one shared value for all objects
  const st = userClasses.map(c => ({ c, f: c.fields.find(f => f.static && !f.final) })).find(x => x.f);
  if (st) {
    // objects of the class, or of its children (a Chien is also an Animal)
    const isA = (cls, target) => { for (let c = byName.get(cls); c; c = byName.get(c.superName)) if (c.name === target) return true; return false; };
    const ids = objects.filter(o => isA(o.cls, st.c.name)).map(o => o.id).slice(0, 3);
    const val = st.f.value ? (st.f.value.text ?? '') : '';
    cards.push({
      key: 'static', title: 'static', color: NEON.amber,
      draw: fan(ids.length ? ids.map(id => chip(`obj #${id}`, NEON.green)) : [chip('objects', NEON.green)], [chip(`${st.c.name}.${st.f.name} = ${val}`, NEON.amber, '🏪')]),
      caption: `${st.f.name} belongs to the class ${st.c.name}: one shared copy for all its objects.`,
    });
  }

  // constructor chain: super(...)
  const sup = events.find(e => e.type === 'superCall');
  if (sup) {
    cards.push({
      key: 'super', title: 'super(...)', color: NEON.violet,
      draw: chain([chip(`new ${sup.child}(...)`, NEON.pink), chip(`${sup.parent} part`, NEON.violet), chip(`${sup.child} part`, NEON.green)]),
      caption: `To build a ${sup.child}, Java first builds the ${sup.parent} part (super), then the ${sup.child} part.`,
    });
  }

  // null / Garbage Collector
  const lost = finalState.heap.filter(o => !o.isArray && !o.reachable);
  const nullSet = events.find(e => e.type === 'varSet' && e.value && e.value.kind === 'null');
  if (nullSet) {
    const id = lost[0]?.id;
    cards.push({
      key: 'gc', title: 'null & Garbage Collector', color: NEON.red,
      draw: chain([chip(`${nullSet.name} = null`, NEON.pink), chip('empty sign', NEON.amber), chip(id ? `obj #${id} alone` : 'object', NEON.red, '🧹', true)]),
      caption: id ? `Nobody points at object #${id} any more: the Garbage Collector can remove it.` : `${nullSet.name} points at nothing now.`,
    });
  }

  // the error of the run
  const err = run.error;
  if (err && (err.kind === 'exception' || err.kind === 'compile')) {
    const name = err.kind === 'exception' ? err.javaClass.replace(/^java\.(lang|util)\./, '') : 'Compilation problem';
    cards.push({
      key: 'error', title: name, color: NEON.red,
      draw: chain([chip(`line ${err.line}`, NEON.pink), chip(short(err.message || name, 34), NEON.red, '✖')]),
      caption: err.hint ? short(err.hint, 120) : 'The program stopped here.',
    });
  }
  return cards.map((c, i) => ({ ...c, n: i + 1 }));
}

// ---------------------------------------------------------------------------
// 2. Small drawing kit: chips + thin lines with dots (like the reference image)
// ---------------------------------------------------------------------------
function chip(text, color, icon = null, dim = false) {
  const label = (icon ? icon + ' ' : '') + short(text, 30);
  return { label, color, w: Math.max(54, label.length * CH + 26), h: 32, dim };
}

function drawChip(c, x, y) {
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  return `<g transform="translate(${x - c.w / 2},${y - c.h / 2})" opacity="${c.dim ? 0.75 : 1}">
    <rect width="${c.w}" height="${c.h}" rx="9" fill="${c.color}" opacity="0.22" filter="url(#glow)"/>
    <rect width="${c.w}" height="${c.h}" rx="9" fill="${c.color}" fill-opacity="${c.dim ? 0.18 : 0.92}" stroke="${c.color}" stroke-width="1.2"/>
    <text x="${c.w / 2}" y="${c.h / 2 + 4.5}" text-anchor="middle" class="ct ${c.dim ? 'light' : ''}" fill="${c.dim ? c.color : '#0b1020'}">${esc(c.label)}</text>
  </g>`.replace(/id=""/g, id);
}

function line(x1, y1, x2, y2, color = '#38bdf8') {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-opacity="0.55" stroke-width="1.4"/>
    <circle cx="${mx}" cy="${my}" r="3" fill="${color}"/>`;
}

const AREA = { top: 62, bottom: 188 }; // where diagrams go inside the card

// left chips → right chips (fan out)
function fan(left, right, mark = null) {
  return () => {
    const parts = [];
    const lx = 40 + Math.max(...left.map(c => c.w)) / 2;
    const rx = W - 40 - Math.max(...right.map(c => c.w)) / 2;
    const ly = spread(left.length), ry = spread(right.length);
    left.forEach((c, i) => right.forEach((d, j) => {
      if (left.length > 1 && right.length > 1 && i !== j && left.length === right.length) return;
      parts.push(line(lx + c.w / 2, ly[i], rx - d.w / 2, ry[j]));
    }));
    if (mark) parts.push(`<text x="${lx + left[0].w / 2 + 12}" y="${ly[0] + 6}" class="mark" fill="#a5f3fc">${mark}</text>`);
    left.forEach((c, i) => parts.push(drawChip(c, lx, ly[i])));
    right.forEach((d, j) => parts.push(drawChip(d, rx, ry[j])));
    return parts.join('');
  };
}

// a parent on top, children below
function tree(parent, kids) {
  return () => {
    const parts = [];
    const px = W / 2, py = AREA.top + 22;
    const ky = AREA.bottom - 18;
    const step = (W - 80) / kids.length;
    const kx = kids.map((_, i) => 40 + step * (i + 0.5));
    kids.forEach((k, i) => parts.push(line(px, py + parent.h / 2, kx[i], ky - k.h / 2, '#a78bfa')));
    parts.push(drawChip(parent, px, py));
    kids.forEach((k, i) => parts.push(drawChip(k, kx[i], ky)));
    return parts.join('');
  };
}

// a → b → c in one row
function chain(items) {
  return () => {
    const parts = [];
    const total = items.reduce((s, c) => s + c.w, 0);
    const gap = Math.max(24, (W - 60 - total) / Math.max(1, items.length - 1));
    let x = (W - (total + gap * (items.length - 1))) / 2;
    const y = (AREA.top + AREA.bottom) / 2;
    const xs = items.map(c => { const cx = x + c.w / 2; x += c.w + gap; return cx; });
    for (let i = 0; i < items.length - 1; i++) parts.push(line(xs[i] + items[i].w / 2, y, xs[i + 1] - items[i + 1].w / 2, y));
    items.forEach((c, i) => parts.push(drawChip(c, xs[i], y)));
    return parts.join('');
  };
}

// two chips with labels on both ends
function pair(a, b, la, lb) {
  return () => {
    const y = (AREA.top + AREA.bottom) / 2;
    const ax = 50 + a.w / 2, bx = W - 50 - b.w / 2;
    return line(ax + a.w / 2, y, bx - b.w / 2, y) +
      `<text x="${bx - b.w / 2 - 8}" y="${y - 12}" text-anchor="end" class="small">${esc(la)}</text>` +
      `<text x="${ax + a.w / 2 + 8}" y="${y + 22}" class="small">${esc(lb)}</text>` +
      drawChip(a, ax, y) + drawChip(b, bx, y);
  };
}

// a class box: locked data inside, public methods on the wall
function boxed(name, locked, open) {
  return () => {
    const x = 60, y = AREA.top - 2, w = W - 120, h = AREA.bottom - AREA.top + 4;
    const parts = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="none" stroke="#34d399" stroke-opacity="0.55" stroke-dasharray="5 5"/>`,
      `<text x="${x + 14}" y="${y + 20}" class="small" fill="#34d399">${esc(name)}</text>`];
    const lc = locked.map(t => chip(t, '#34d399'));
    const oc = open.map(t => chip(t, '#38bdf8'));
    const ly = spread(lc.length, y + 44, y + h - 22), oy = spread(oc.length, y + 44, y + h - 22);
    lc.forEach((c, i) => parts.push(drawChip(c, x + 30 + c.w / 2, ly[i])));
    oc.forEach((c, i) => parts.push(drawChip(c, x + w - 30 - c.w / 2, oy[i])));
    return parts.join('');
  };
}

function spread(n, top = AREA.top + 16, bottom = AREA.bottom - 16) {
  if (n === 1) return [(top + bottom) / 2];
  return Array.from({ length: n }, (_, i) => top + (bottom - top) * i / (n - 1));
}

function wrap(text, max = 64) {
  const words = text.split(' ');
  const lines = [''];
  for (const w of words) {
    if ((lines[lines.length - 1] + ' ' + w).trim().length > max) lines.push(w);
    else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim();
  }
  return lines.slice(0, 2);
}

// ---------------------------------------------------------------------------
// 3. One complete card as SVG
// ---------------------------------------------------------------------------
export function cardSvg(card) {
  const cap = wrap(card.caption).map((l, i) => `<text x="22" y="${H - 34 + i * 18}" class="cap">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <filter id="glow" x="-40%" y="-80%" width="180%" height="260%"><feGaussianBlur stdDeviation="7"/></filter>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#171b33"/><stop offset="1" stop-color="#10132a"/></linearGradient>
    <style>
      .t { font: 700 19px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; fill: #eef0ff; }
      .n { font: 800 19px ui-monospace, "Cascadia Code", Consolas, monospace; }
      .ct { font: 700 13px ui-monospace, "Cascadia Code", Consolas, monospace; }
      .cap { font: 500 13.5px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; fill: #aab1d6; }
      .small { font: 600 12px ui-monospace, Consolas, monospace; fill: #93a4d8; }
      .mark { font: 700 16px ui-sans-serif, system-ui, sans-serif; }
    </style>
  </defs>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="18" fill="url(#bg)" stroke="#2a3060"/>
  <text x="22" y="38"><tspan class="n" fill="${card.color}">${card.n}.</tspan><tspan class="t" dx="8">${esc(card.title)}</tspan></text>
  ${card.draw()}
  ${cap}
</svg>`;
}

// SVG → PNG (2x, sharp)
export function svgToPng(svgText, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width * scale; c.height = img.height * scale;
      const g = c.getContext('2d');
      g.scale(scale, scale);
      g.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob(b => resolve(b), 'image/png');
    };
    img.onerror = reject;
    img.src = url;
  });
}

// All cards in one big poster (2 columns), with a title
export function posterSvg(cards, title) {
  const cols = 2, gap = 18, pad = 28, headH = 92;
  const rows = Math.ceil(cards.length / cols);
  const PW = pad * 2 + cols * W + (cols - 1) * gap, PH = headH + pad + rows * H + (rows - 1) * gap + 40;
  const inner = cards.map((c, i) => {
    const x = pad + (i % cols) * (W + gap), y = headH + Math.floor(i / cols) * (H + gap);
    return `<g transform="translate(${x},${y})">${cardSvg(c).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}">
  <rect width="${PW}" height="${PH}" fill="#0b0e22"/>
  <text x="${PW / 2}" y="54" text-anchor="middle" style="font: 800 34px ui-sans-serif, system-ui, sans-serif" fill="#eef0ff">${esc(title)}</text>
  <text x="${PW / 2}" y="80" text-anchor="middle" style="font: 500 15px ui-sans-serif, system-ui, sans-serif" fill="#8b93c7">OOP concepts in this program, visualized by OOP Street</text>
  ${inner}
  <text x="${PW / 2}" y="${PH - 16}" text-anchor="middle" style="font: 500 12px ui-sans-serif, system-ui, sans-serif" fill="#5b6290">ahmadalsharbati.github.io/OOP-Street</text>
</svg>`;
}

// layout.js — decides WHERE things go in the world. No drawing here, only positions.
//
// Rule (spec §8): every class has its own district (a square of land).
// Districts are placed on a grid. Inside a district:
//   - at the back: the blueprint board (and the static kiosk if the class has static fields)
//   - in front: the houses (objects of that class), in rows
// Arrays get their own district: rows of numbered mailboxes.
// The world grows by itself when more classes or objects appear.

export const DISTRICT = { width: 30, gap: 16, backDepth: 10, frontPad: 4 };
// district: [ stand + kiosk | houses ]
export const HOUSE = { width: 4.5, spacingX: 9, spacingZ: 9.5, perRow: 2 };
export const BOX = { size: 1.1, gap: 0.15, maxShown: 10, rowGap: 3.2 };

// Arrays that only add noise: the empty "String[] args" of main.
export function visibleArrays(state) {
  const argsIds = new Set();
  for (const f of state.frames) {
    for (const v of f.vars) if (v.name === 'args' && v.value.kind === 'array' && v.value.length === 0) argsIds.add(v.value.id);
  }
  return state.heap.filter(o => o.isArray && !argsIds.has(o.id) && !(o.items.length === 0 && o.type === 'String[]' && !o.reachable));
}

export function computeLayout(state) {
  const cells = state.classes.map(c => ({ kind: 'class', name: c.name, cls: c, objects: [] }));
  const byName = new Map(cells.map(c => [c.name, c]));
  for (const o of state.heap) if (!o.isArray && byName.has(o.cls)) byName.get(o.cls).objects.push(o);
  const arrays = visibleArrays(state);
  if (arrays.length) cells.push({ kind: 'arrays', name: '[ ] arrays', objects: arrays });

  const cols = Math.max(1, Math.ceil(Math.sqrt(cells.length)));
  const cellDepth = (c) => {
    if (c.kind === 'arrays') return DISTRICT.backDepth - 3 + c.objects.length * BOX.rowGap + DISTRICT.frontPad;
    const rows = Math.max(1, Math.ceil(c.objects.length / HOUSE.perRow));
    const hasKiosk = c.cls.fields.some(f => f.static);
    return Math.max(hasKiosk ? 18 : 13, 3 + rows * HOUSE.spacingZ + 1);
  };

  const rowDepths = [];
  cells.forEach((c, i) => {
    const r = Math.floor(i / cols);
    rowDepths[r] = Math.max(rowDepths[r] || 0, cellDepth(c));
  });
  let z = 0;
  const rowZ = rowDepths.map(d => { const s = z; z += d + DISTRICT.gap; return s; });
  const totalW = cols * DISTRICT.width + (cols - 1) * DISTRICT.gap;
  const totalD = z - DISTRICT.gap;

  const districts = [];
  const houses = new Map();   // object id -> {x, z, cls}
  const arrayPos = new Map(); // array id -> {x, z, boxes: [{index, x, z}], shown, length}

  cells.forEach((c, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x0 = col * (DISTRICT.width + DISTRICT.gap) - totalW / 2;
    const z0 = rowZ[row] - totalD / 2;
    const depth = rowDepths[row];
    const d = {
      kind: c.kind, name: c.name, cls: c.cls || null,
      x: x0 + DISTRICT.width / 2, z: z0 + depth / 2, width: DISTRICT.width, depth,
      // left column: the blueprint stand, the person's spot for static code, the kiosk
      board: { x: x0 + 4.5, z: z0 + 3 },
      spot: { x: x0 + 4.5, z: z0 + 7.5 },
      kiosk: { x: x0 + 4.5, z: z0 + 14 }, // where the person stands to use the class itself (static)
    };
    districts.push(d);

    if (c.kind === 'class') {
      c.objects.forEach((o, k) => {
        const hr = Math.floor(k / HOUSE.perRow), hc = k % HOUSE.perRow;
        // right part: the houses, two per row
        const x = x0 + 14 + hc * HOUSE.spacingX;
        const hz = z0 + 5 + hr * HOUSE.spacingZ;
        houses.set(o.id, { x, z: hz, cls: c.name, spot: { x: x + 1.6, z: hz + 4.4 } });
      });
    } else {
      c.objects.forEach((a, k) => {
        const shown = Math.min(a.items.length, BOX.maxShown);
        const rowW = shown * (BOX.size + BOX.gap);
        const ax = x0 + 2.5, az = z0 + 3 + k * BOX.rowGap;
        const boxes = [];
        for (let b = 0; b < shown; b++) boxes.push({ index: b, x: ax + b * (BOX.size + BOX.gap) + BOX.size / 2, z: az });
        arrayPos.set(a.id, { x: ax + rowW / 2, z: az, boxes, shown, length: a.items.length, spot: { x: ax + rowW / 2, z: az + 1.6 } });
      });
    }
  });

  return {
    districts, houses, arrayPos,
    width: Math.max(totalW, DISTRICT.width), depth: Math.max(totalD, 12),
  };
}

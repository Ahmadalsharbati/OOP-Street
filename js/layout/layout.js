// layout.js — decides WHERE things go in the world. No drawing here, only positions.
//
// Rule (spec §8): every class has its own district (a square of land).
// Districts are placed on a grid. Inside a district: the blueprint board at the back,
// the houses (objects of that class) in rows in front of it.
// The world grows by itself when more classes or objects appear.

export const DISTRICT = { width: 14, depth: 12, gap: 4 };
export const HOUSE = { width: 3.2, depth: 3.2, gapX: 1.2, gapZ: 1.6, perRow: 3 };

export function computeLayout(state) {
  const classes = state.classes;
  const cols = Math.max(1, Math.ceil(Math.sqrt(classes.length)));
  const objectsByClass = new Map(classes.map(c => [c.name, []]));
  for (const o of state.heap) {
    if (!o.isArray && objectsByClass.has(o.cls)) objectsByClass.get(o.cls).push(o);
  }

  // a district gets deeper when it has many houses
  const rowsNeeded = (n) => Math.max(1, Math.ceil(n / HOUSE.perRow));
  const districtDepth = (n) => Math.max(DISTRICT.depth, 6 + rowsNeeded(n) * (HOUSE.depth + HOUSE.gapZ));

  const districts = [];
  const rowDepths = [];
  classes.forEach((c, i) => {
    const row = Math.floor(i / cols);
    rowDepths[row] = Math.max(rowDepths[row] || 0, districtDepth(objectsByClass.get(c.name).length));
  });

  let z = 0;
  const rowZ = rowDepths.map(d => { const start = z; z += d + DISTRICT.gap; return start; });
  const totalW = cols * DISTRICT.width + (cols - 1) * DISTRICT.gap;
  const totalD = z - DISTRICT.gap;

  classes.forEach((c, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x0 = col * (DISTRICT.width + DISTRICT.gap) - totalW / 2;
    const z0 = rowZ[row] - totalD / 2;
    const depth = rowDepths[row];
    const houses = objectsByClass.get(c.name).map((o, k) => {
      const hr = Math.floor(k / HOUSE.perRow), hc = k % HOUSE.perRow;
      const rowWidth = HOUSE.perRow * HOUSE.width + (HOUSE.perRow - 1) * HOUSE.gapX;
      return {
        id: o.id,
        x: x0 + (DISTRICT.width - rowWidth) / 2 + HOUSE.width / 2 + hc * (HOUSE.width + HOUSE.gapX),
        z: z0 + 5.5 + HOUSE.depth / 2 + hr * (HOUSE.depth + HOUSE.gapZ),
      };
    });
    districts.push({
      cls: c.name,
      x: x0 + DISTRICT.width / 2, z: z0 + depth / 2,
      width: DISTRICT.width, depth,
      board: { x: x0 + DISTRICT.width / 2, z: z0 + 1.6 },
      houses,
    });
  });

  return { districts, width: Math.max(totalW, DISTRICT.width), depth: Math.max(totalD, DISTRICT.depth) };
}

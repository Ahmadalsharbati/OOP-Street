// scene.js — the street, drawn with three.js.
//
// Design rules (v2, after Ahmad's feedback):
//   - Fixed camera angle, like a board game: drag = move, wheel = zoom. No rotation, you never get lost.
//   - Focus: only what the current line uses is big and clear. The rest is small and faded.
//   - Modern soft look: light background, rounded toy houses, one color per class.
//   - Text is HTML on top of the 3D (always sharp, never stretched).
//
// Meaning of the shapes (spec §3):
//   district per class   → plot of land + blueprint stand (members of the class)
//   static fields        → a shared kiosk
//   object (new)         → a house in the color of its class: red lock = private fields, windows = public methods
//   running method       → a person standing where the code runs, holding the variables (signs)
//   variable → object    → amber arrow (pile → tas)
//   field → other object → indigo arrow ("address paper")
//   array                → a row of numbered mailboxes
//   grey house           → nobody points at it (Garbage Collector)

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { computeLayout, visibleArrays, BOX } from '../layout/layout.js';

// one soft color per class (in order of appearance)
const CLASS_COLORS = [0x6c8cff, 0xf28b6b, 0x4cc3a3, 0xb07cf0, 0xf2b84b, 0xef7fb0, 0x5fb3e8, 0x9bc45a];
const UI = {
  bg: 0xf4f5f8, ground: 0xeceef3, plot: 0xffffff, wall: 0xfbfbfd,
  lock: 0xe5484d, window: 0xfff4c2, ghost: 0xd5d8df,
  person: 0x2b3245, personSkin: 0xffd9b8,
  pileArrow: 0xf59e0b, heapArrow: 0x6366f1, active: 0xfacc15,
};
const S = 1.5; // size of houses, people and stands
const ISO = new THREE.Vector3(0.22, 1.25, 1).normalize();

export class StreetScene {
  constructor(container, labelLayer) {
    this.container = container;
    this.labelLayer = labelLayer;
    this.labels = [];
    this.follow = true;
    this.focus = true;
    this.expanded = new Set();
    this.openBoards = new Set();
    this.classColor = new Map();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(UI.bg);
    this.scene = scene;

    // orthographic camera = no perspective stretching, like a clean isometric game
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -500, 1000);
    this.viewSize = 46; // world units visible vertically at zoom 1
    this.camera.position.copy(ISO.clone().multiplyScalar(100));
    this.camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.enableRotate = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = false; // pan on the ground
    controls.zoomToCursor = true;
    controls.minZoom = 0.35;
    controls.maxZoom = 3;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.addEventListener('start', () => { this.dragging = true; this.cameraGoal = null; });
    controls.addEventListener('end', () => { this.dragging = false; });
    renderer.domElement.addEventListener('pointerdown', () => {
      if (this.follow) { this.follow = false; this.onFollowChange?.(false); }
    });
    this.controls = controls;

    // soft studio light
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe3ec, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 10;
    sun.shadow.blurSamples = 16;
    sun.shadow.bias = -0.0004;
    this.sun = sun;
    scene.add(sun, sun.target);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: UI.ground, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    scene.add(this.ground);

    this.staticGroup = new THREE.Group();
    this.arrowGroup = new THREE.Group();
    this.personArrows = new THREE.Group();
    scene.add(this.staticGroup, this.arrowGroup, this.personArrows);

    this.houseMeshes = new Map();

    this.ring = makeRing();
    this.ring.scale.setScalar(S);
    this.ring.visible = false;
    scene.add(this.ring);

    this.person = makePerson();
    this.person.scale.setScalar(S);
    this.person.visible = false;
    scene.add(this.person);
    this.personGoal = new THREE.Vector3();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();

    labelLayer.addEventListener('click', (e) => {
      const board = e.target.closest('[data-board]');
      if (board) {
        const n = board.dataset.board;
        if (this.openBoards.has(n)) this.openBoards.delete(n); else this.openBoards.add(n);
      } else {
        const card = e.target.closest('[data-house]');
        if (!card) return;
        const id = Number(card.dataset.house);
        if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id);
      }
      if (this.lastStep) this.update(this.lastStep);
    });

    const loop = () => {
      this.controls.update();
      this.animate();
      renderer.render(scene, this.camera);
      this.updateLabels();
      requestAnimationFrame(loop);
    };
    loop();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    const vs = this.viewSize;
    Object.assign(this.camera, { left: -vs * aspect / 2, right: vs * aspect / 2, top: vs / 2, bottom: -vs / 2 });
    this.camera.updateProjectionMatrix();
  }

  reset() {
    for (const g of this.houseMeshes.values()) this.scene.remove(g);
    this.houseMeshes.clear();
    this.expanded.clear();
    this.classColor.clear();
    this.fitted = false;
    this.person.visible = false;
    this.personPlaced = false;
    this.personTargets = null;
  }

  colorOf(cls) {
    if (!this.classColor.has(cls)) this.classColor.set(cls, CLASS_COLORS[this.classColor.size % CLASS_COLORS.length]);
    return this.classColor.get(cls);
  }

  // ===================== one step =====================
  update(step) {
    this.lastStep = step;
    const state = step.state;
    for (const c of state.classes) this.colorOf(c.name);
    const L = computeLayout(state);
    this.layout = L;
    this.labels = [];
    const events = step.events || [];
    const top = state.frames[state.frames.length - 1] || null;

    const touched = { set: new Set(), get: new Set(), blocked: new Set(), staticSet: new Set(), arraySet: new Set() };
    for (const e of events) {
      if (e.type === 'fieldSet') touched.set.add(e.id + '.' + e.field);
      if (e.type === 'fieldGet') touched.get.add(e.id + '.' + e.field);
      if (e.type === 'blocked') touched.blocked.add((e.id ?? e.cls) + '.' + e.member);
      if (e.type === 'staticSet') touched.staticSet.add(e.cls + '.' + e.field);
      if (e.type === 'arraySet') touched.arraySet.add(e.id + '.' + e.index);
    }
    const rel = this.relevance(state, top, events);

    this.sizeWorld(L);
    this.buildDistricts(L, state, touched, events, rel);
    this.buildHouses(L, state, top, touched, rel);
    this.buildArrays(L, state, touched, rel);
    this.buildHeapArrows(L, state, rel);
    this.placePerson(L, state, top, step);
    this.addBubbles(L, step, events);

    if (!this.fitted) { this.focusView(); this.fitted = true; }
    else if (this.follow) this.followGoal();
  }

  // What the current line uses: these are shown big; the rest is faded (Focus mode).
  relevance(state, top, events) {
    const ids = new Set(), classes = new Set();
    if (top) {
      if (top.thisId !== null) ids.add(top.thisId);
      for (const v of top.vars) if (v.value.kind === 'object' || v.value.kind === 'array') ids.add(v.value.id);
      if (top.cls) classes.add(top.cls);
    }
    for (const e of events) {
      if (e.id !== undefined && e.id !== null) ids.add(e.id);
      if (e.thisId !== undefined && e.thisId !== null) ids.add(e.thisId);
      if (e.cls) classes.add(e.cls);
    }
    for (const o of state.heap) if (ids.has(o.id) && !o.isArray) classes.add(o.cls);
    const all = !this.focus;
    return {
      obj: (id) => all || ids.has(id) || this.expanded.has(id),
      cls: (name) => all || classes.has(name),
    };
  }

  sizeWorld(L) {
    const size = Math.max(L.width, L.depth) + 40;
    this.ground.scale.set(size * 4, size * 4, 1);
    this.sun.position.set(size * 0.35, size * 0.9, size * 0.55);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -size * 0.75; cam.right = cam.top = size * 0.75;
    cam.near = 1; cam.far = size * 3;
    cam.updateProjectionMatrix();
  }

  // ---------- districts ----------
  buildDistricts(L, state, touched, events, rel) {
    clearGroup(this.staticGroup);
    for (const d of L.districts) {
      const isClass = d.kind === 'class';
      const color = isClass ? this.colorOf(d.name) : 0x9aa3b5;
      const plot = new THREE.Mesh(new RoundedBoxGeometry(d.width, 0.3, d.depth, 3, 0.6), mat(UI.plot, { roughness: 0.95 }));
      plot.position.set(d.x, 0.15, d.z);
      plot.receiveShadow = true;
      this.staticGroup.add(plot);
      // colored edge line at the back of the plot (the district's color)
      const strip = new THREE.Mesh(new RoundedBoxGeometry(d.width - 1.2, 0.08, 0.35, 2, 0.15), mat(color, { roughness: 0.6 }));
      strip.position.set(d.x, 0.32, d.z - d.depth / 2 + 0.6);
      this.staticGroup.add(strip);

      if (!isClass) {
        this.addLabel(new THREE.Vector3(d.x - d.width / 2 + 3, 0.4, d.z - d.depth / 2 + 1.6), `<div class="chip chip-district">Arrays</div>`, 'plain');
        continue;
      }
      const c = d.cls;
      const on = rel.cls(c.name);
      const stand = makeStand(color);
      stand.position.set(d.board.x, 0.3, d.board.z);
      stand.scale.setScalar(S);
      setOpacity(stand, on ? 1 : 0.4);
      this.staticGroup.add(stand);
      const hasObjects = state.heap.some(o => !o.isArray && o.cls === c.name);
      const html = on ? blueprintCard(c, hasObjects, events, color, this.openBoards.has(c.name)) : `<div class="chip chip-class" data-board="${esc(c.name)}" style="--c:${hex(color)}">class ${esc(c.name)}</div>`;
      this.addLabel(new THREE.Vector3(d.board.x, 3.0 * S, d.board.z), html, on ? 'board' : 'board-mini', null, this.openBoards.has(c.name) ? 5 : 0);

      const statics = c.fields.filter(f => f.static);
      if (statics.length) {
        const kiosk = makeKiosk(color);
        kiosk.position.set(d.kiosk.x, 0.3, d.kiosk.z);
        kiosk.scale.setScalar(S);
        setOpacity(kiosk, on ? 1 : 0.4);
        this.staticGroup.add(kiosk);
        const rows = statics.map(f => {
          const st = touched.staticSet.has(c.name + '.' + f.name) ? ' set' : '';
          return `<div class="row${st}">${badges(f)}<span class="n">${esc(f.name)}</span><span class="v">${esc(valText(f.value))}</span></div>`;
        }).join('');
        this.addLabel(new THREE.Vector3(d.kiosk.x, 2.3 * S, d.kiosk.z), `<div class="card kiosk${on ? '' : ' dim'}"><div class="title">static · shared</div>${rows}</div>`, 'kiosk');
      }
    }
  }

  // ---------- houses ----------
  buildHouses(L, state, top, touched, rel) {
    const activeId = top ? top.thisId : null;
    const seen = new Set();
    this.ring.visible = false;
    for (const o of state.heap) {
      if (o.isArray) continue;
      const pos = L.houses.get(o.id);
      if (!pos) continue;
      seen.add(o.id);
      const cls = state.classes.find(c => c.name === o.cls);
      const color = this.colorOf(o.cls);
      let g = this.houseMeshes.get(o.id);
      if (!g) {
        g = makeHouse(cls, color);
        g.userData.grow = 0;
        g.scale.setScalar(0.01 * S);
        g.position.set(pos.x, 0.3, pos.z);
        this.houseMeshes.set(o.id, g);
        this.scene.add(g);
      }
      g.userData.target = new THREE.Vector3(pos.x, 0.3, pos.z);
      const on = rel.obj(o.id);
      styleHouse(g, color, { ghost: !o.reachable, dim: !on });
      if ([...touched.blocked].some(k => k.startsWith(o.id + '.'))) g.userData.shake = 1;
      if (o.id === activeId) { this.ring.visible = true; this.ring.position.set(pos.x, 0.32, pos.z); }

      const html = on ? houseCard(o, cls, { active: o.id === activeId, touched, color })
        : `<div class="chip chip-house${o.reachable ? '' : ' ghost'}" data-house="${o.id}" style="--c:${hex(color)}">#${o.id}</div>`;
      this.addLabel(new THREE.Vector3(pos.x, 3.2 * S, pos.z), html, on ? 'house' : 'house-mini', null, o.id === activeId ? 2 : 0);
    }
    for (const [id, g] of this.houseMeshes) {
      if (!seen.has(id)) { this.scene.remove(g); this.houseMeshes.delete(id); }
    }
  }

  // ---------- arrays ----------
  buildArrays(L, state, touched, rel) {
    for (const a of visibleArrays(state)) {
      const p = L.arrayPos.get(a.id);
      if (!p) continue;
      const on = rel.obj(a.id);
      for (const b of p.boxes) {
        const v = a.items[b.index];
        const filled = v.kind !== 'null' && !(v.kind === 'prim' && /^(0|0\.0|false)$/.test(v.text));
        const box = makeMailbox(filled, !a.reachable);
        box.position.set(b.x, 0.3, b.z);
        setOpacity(box, on ? 1 : 0.4);
        this.staticGroup.add(box);
      }
      if (!on) {
        this.addLabel(new THREE.Vector3(p.x, 1.4, p.z), `<div class="chip chip-house">${esc(a.type)} #${a.id}</div>`, 'house-mini');
        continue;
      }
      const cells = a.items.slice(0, p.shown).map((v, i) => {
        const st = touched.arraySet.has(a.id + '.' + i) ? ' set' : '';
        return `<span class="cell${st}"><i>${i}</i>${esc(shortVal(v))}</span>`;
      }).join('');
      const more = a.items.length > p.shown ? `<span class="cell more">${p.shown}..${a.items.length - 1}</span>` : '';
      this.addLabel(new THREE.Vector3(p.x, 1.5, p.z), `<div class="card array${a.reachable ? '' : ' ghost'}"><div class="title">${esc(a.type)} <span class="id">#${a.id}</span><span class="meta">length ${a.items.length}</span></div><div class="cells">${cells}${more}</div></div>`, 'array');
    }
  }

  // ---------- indigo arrows: field / array box → object ----------
  buildHeapArrows(L, state, rel) {
    clearGroup(this.arrowGroup);
    const targetPoint = (id) => {
      const h = L.houses.get(id);
      if (h) return new THREE.Vector3(h.x, 2.0 * S, h.z);
      const a = L.arrayPos.get(id);
      if (a && a.boxes.length) return new THREE.Vector3(a.boxes[0].x - BOX.size / 2, 0.9, a.z);
      return null;
    };
    for (const o of state.heap) {
      const on = rel.obj(o.id);
      if (o.isArray) {
        const p = L.arrayPos.get(o.id);
        if (!p) continue;
        for (const b of p.boxes) {
          const v = o.items[b.index];
          if (v.kind !== 'object' && v.kind !== 'array') continue;
          const to = targetPoint(v.id);
          if (to) this.arrowGroup.add(makeArrow(new THREE.Vector3(b.x, 1.1, b.z), to, UI.heapArrow, on ? 0.06 : 0.035, on ? 0.9 : 0.22));
        }
        continue;
      }
      const h = L.houses.get(o.id);
      if (!h) continue;
      let k = 0;
      for (const f of o.fields) {
        if ((f.value.kind !== 'object' && f.value.kind !== 'array') || f.value.id === o.id) continue;
        const to = targetPoint(f.value.id);
        if (!to) continue;
        const from = new THREE.Vector3(h.x + (0.7 - (k++) * 0.45) * S, 1.9 * S, h.z + 0.3);
        this.arrowGroup.add(makeArrow(from, to, UI.heapArrow, on ? 0.06 : 0.035, on && o.reachable ? 0.9 : 0.22));
      }
    }
  }

  // ---------- the person ----------
  placePerson(L, state, top, step) {
    if (!top) {
      this.personTargets = null;
      this.rebuildPersonArrows();
      if (step.final && !step.error) this.person.visible = false;
      return;
    }
    let spot;
    const blocked = [...(step.events || [])].reverse().find(e => e.type === 'blocked');
    if (blocked && blocked.id !== null && L.houses.get(blocked.id)) spot = L.houses.get(blocked.id).spot;
    else if (blocked && blocked.id === null && L.districts.find(x => x.name === blocked.cls)) spot = L.districts.find(x => x.name === blocked.cls).spot;
    else if (top.thisId !== null && L.houses.get(top.thisId)) spot = L.houses.get(top.thisId).spot;
    else {
      const d = L.districts.find(x => x.kind === 'class' && x.name === top.cls);
      spot = d ? d.spot : { x: 0, z: 0 };
    }
    this.personGoal.set(spot.x, 0.3, spot.z);
    if (!this.personPlaced) { this.person.position.copy(this.personGoal); this.personPlaced = true; }
    this.person.visible = true;

    const rows = top.vars.map(v => {
      const isRef = v.value.kind === 'object' || v.value.kind === 'array';
      const right = isRef ? `<span class="sign">#${v.value.id}</span>`
        : v.value.kind === 'null' ? `<span class="sign empty">null</span>`
          : `<span class="v">${esc(valText(v.value))}</span>`;
      return `<div class="row"><span class="n">${esc(v.name)}</span><span class="t">${esc(v.type)}</span>${right}</div>`;
    }).join('');
    const pile = state.frames.length > 1 ? `<div class="stack">${state.frames.map(f => esc(shortLabel(f.label))).join(' › ')}</div>` : '';
    this.addLabel(new THREE.Vector3(), `<div class="card person"><div class="title">${esc(shortLabel(top.label))}</div>${rows || '<div class="row muted">no variables yet</div>'}${pile}</div>`,
      'person', () => this.person.position.clone(), 3, 'below');

    this.personTargets = top.vars.filter(v => v.value.kind === 'object' || v.value.kind === 'array').map(v => {
      const h = L.houses.get(v.value.id);
      if (h) return new THREE.Vector3(h.x, 2.6 * S, h.z);
      const a = L.arrayPos.get(v.value.id);
      if (a) return new THREE.Vector3(a.x, 1.1, a.z);
      return null;
    }).filter(Boolean);
    this.rebuildPersonArrows();
  }

  rebuildPersonArrows() {
    clearGroup(this.personArrows);
    if (!this.person.visible || !this.personTargets) return;
    const hand = this.person.position.clone().add(new THREE.Vector3(0.55 * S, 1.95 * S, 0.1));
    for (const t of this.personTargets) {
      if (t.distanceTo(hand) < 1.6) continue;
      this.personArrows.add(makeArrow(hand, t, UI.pileArrow, 0.07, 1));
    }
  }

  // ---------- bubbles ----------
  addBubbles(L, step, events) {
    const at = (id) => { const h = L.houses.get(id); return h ? new THREE.Vector3(h.x, 0.9, h.z + 2.4) : null; };
    const near = () => this.person.position.clone().add(new THREE.Vector3(0, 0.2, 1.0));
    let n = 0;
    for (const e of events) {
      if (n > 3) break;
      if (e.type === 'new' && at(e.id)) { this.addLabel(at(e.id), `<div class="bubble build">new ${esc(e.cls)} · house #${e.id} built</div>`, 'bubble'); n++; }
      if (e.type === 'return' && e.method !== '<init>' && e.value && e.value.kind !== 'none') {
        const p = e.thisId !== null ? at(e.thisId) : null;
        this.addLabel(p || near(), `<div class="bubble ret">↩ ${esc(e.method)}() → ${esc(valText(e.value))}</div>`, 'bubble'); n++;
      }
      if (e.type === 'print') { this.addLabel(new THREE.Vector3(), `<div class="bubble print">${esc(e.text.replace(/\n$/, ''))}</div>`, 'bubble', near, -1); n++; }
      if (e.type === 'autoToString' && at(e.id)) { this.addLabel(at(e.id), `<div class="bubble info">println calls toString()</div>`, 'bubble'); n++; }
      if (e.type === 'blocked') {
        const p = e.id !== null ? at(e.id) : null;
        const d = L.districts.find(x => x.name === e.cls);
        const pos = p || (d ? new THREE.Vector3(d.board.x, 0.9, d.board.z + 1.2) : near());
        const why = e.visibility === 'static' ? `${e.member}() needs an object` : `${e.member} is ${e.visibility}`;
        this.addLabel(pos, `<div class="bubble error">🔒 Blocked · ${esc(why)}</div>`, 'bubble'); n++;
      }
    }
    if (step.final && step.error && !['tooLong', 'internal'].includes(step.error.kind)) {
      const msg = step.error.kind === 'exception' ? step.error.javaClass.replace(/^java\.(lang|util)\./, '') : step.error.message;
      this.addLabel(new THREE.Vector3(), `<div class="bubble error big">${esc(msg)}</div>`, 'bubble', () => this.person.position.clone().add(new THREE.Vector3(0, 0, 1.4)), 1);
    }
  }

  // ===================== camera =====================
  setZoom(z) { this.camera.zoom = z; this.camera.updateProjectionMatrix(); }

  lookAt(target) {
    this.controls.target.copy(target);
    this.camera.position.copy(target.clone().add(ISO.clone().multiplyScalar(100)));
    this.controls.update();
  }

  fitAll() {
    if (!this.layout) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const span = Math.max(this.layout.width * (h / w) * 1.05, this.layout.depth * 0.85) + 10;
    this.cameraGoal = null;
    this.lookAt(new THREE.Vector3(0, 0, 0));
    this.setZoom(Math.max(0.35, Math.min(1.4, this.viewSize / span)));
  }

  focusView() {
    const t = this.person.visible ? this.personGoal.clone() : new THREE.Vector3();
    t.z -= 5;
    this.cameraGoal = null;
    this.lookAt(t);
    this.setZoom(1.2);
  }

  followGoal() {
    if (!this.person.visible) return;
    this.cameraGoal = this.personGoal.clone().add(new THREE.Vector3(0, 0, -5));
  }

  setFollow(on) {
    this.follow = on;
    if (on) this.followGoal(); else this.cameraGoal = null;
  }

  setFocus(on) {
    this.focus = on;
    if (this.lastStep) this.update(this.lastStep);
  }

  zoomBy(f) {
    this.setZoom(Math.max(this.controls.minZoom, Math.min(this.controls.maxZoom, this.camera.zoom * f)));
  }

  animate() {
    const now = performance.now();
    for (const g of this.houseMeshes.values()) {
      if (g.userData.grow < 1) {
        g.userData.grow = Math.min(1, g.userData.grow + 0.045);
        const t = g.userData.grow;
        // a small bounce when the house is built
        const s = t < 1 ? 1 - Math.pow(1 - t, 3) * Math.cos(t * 6) : 1;
        g.scale.setScalar(Math.max(0.01, s) * S);
      }
      if (g.userData.target) g.position.lerp(g.userData.target, 0.15);
      const lock = g.getObjectByName('lock');
      if (lock) {
        if (g.userData.shake > 0) {
          g.userData.shake = Math.max(0, g.userData.shake - 0.012);
          lock.rotation.z = Math.sin(now / 35) * 0.5 * g.userData.shake;
          lock.scale.setScalar(1 + 0.7 * g.userData.shake);
        } else { lock.rotation.z = 0; lock.scale.setScalar(1); }
      }
    }
    if (this.ring.visible) {
      this.ring.scale.setScalar(S * (1 + Math.sin(now / 300) * 0.04));
    }
    if (this.person.visible) {
      const before = this.person.position.clone();
      this.person.position.x += (this.personGoal.x - before.x) * 0.1;
      this.person.position.z += (this.personGoal.z - before.z) * 0.1;
      const moved = Math.hypot(this.person.position.x - before.x, this.person.position.z - before.z);
      if (moved > 0.003) {
        const dir = this.personGoal.clone().sub(before);
        this.person.rotation.y = Math.atan2(dir.x, dir.z);
        this.person.position.y = 0.3 + Math.abs(Math.sin(now / 80)) * 0.3 * Math.min(1, moved * 8);
        this.rebuildPersonArrows();
        this.walking = true;
      } else if (this.walking) {
        this.walking = false;
        this.person.position.y = 0.3;
        this.person.rotation.y = 0;
        this.rebuildPersonArrows();
      }
    }
    if (this.cameraGoal && !this.dragging) {
      const delta = this.cameraGoal.clone().sub(this.controls.target).multiplyScalar(0.08);
      if (delta.lengthSq() < 1e-6) this.cameraGoal = null;
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
  }

  // ===================== HTML labels (fixed size: always sharp) =====================
  addLabel(pos, html, kind, getPos = null, priority = 0, anchor = 'bottom') {
    const el = document.createElement('div');
    el.className = 'label label-' + kind;
    el.innerHTML = html;
    this.labels.push({ pos: pos.clone(), el, getPos, priority, anchor });
  }

  updateLabels() {
    const layer = this.labelLayer;
    if (layer._labels !== this.labels) {
      layer.replaceChildren(...this.labels.map(l => l.el));
      layer._labels = this.labels;
    }
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const v = new THREE.Vector3();
    // zoomed out a lot: cards become smaller chips (CSS class), never blurry
    layer.classList.toggle('far', this.camera.zoom < 0.62);
    for (const l of this.labels) {
      v.copy(l.getPos ? l.getPos() : l.pos).project(this.camera);
      if (v.x < -1.3 || v.x > 1.3 || v.y < -1.3 || v.y > 1.3) { l.el.style.display = 'none'; continue; }
      l.el.style.display = '';
      const x = Math.round((v.x + 1) / 2 * w), y = Math.round((1 - v.y) / 2 * h);
      const [dx, dy] = l.anchor === 'left' ? ['0%', '-100%'] : l.anchor === 'below' ? ['-50%', '14px'] : ['-50%', '-100%'];
      l.el.style.transform = `translate(${x}px, ${y}px) translate(${dx}, ${dy})`;
      const k = l.el.classList;
      const base = k.contains('label-bubble') ? 8000 : k.contains('label-person') ? 7000 : k.contains('label-house') || k.contains('label-board') ? 3000 : 0;
      l.el.style.zIndex = String(base + l.priority * 100 + Math.round((1 - v.z) * 1000));
    }
  }
}

// ===================== HTML pieces =====================
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

function valText(v) {
  if (!v) return '';
  switch (v.kind) {
    case 'string': return '"' + v.text + '"';
    case 'null': return 'null';
    case 'object': return `→ #${v.id}`;
    case 'array': return `→ #${v.id}`;
    case 'prim': return v.type === 'char' ? `'${v.text}'` : v.text;
    case 'unset': return '—';
    default: return '';
  }
}
function shortVal(v) {
  if (v.kind === 'object' || v.kind === 'array') return '#' + v.id;
  if (v.kind === 'string') return '"' + (v.text.length > 8 ? v.text.slice(0, 7) + '…' : v.text) + '"';
  return valText(v);
}
function shortLabel(label) { return label.replace(/\(.*\)$/, '()'); }

function badges(m) {
  let b = m.visibility === 'private' ? '<b class="bd lock" title="private: locked">🔒</b>'
    : m.visibility === 'public' ? '<b class="bd pub" title="public: open">+</b>'
      : '<b class="bd pkg" title="package only">~</b>';
  if (m.static) b += '<b class="bd st" title="static: shared">S</b>';
  if (m.final) b += '<b class="bd fin" title="final: cannot change">F</b>';
  return b;
}
const paramTypes = (params) => params.map(p => p.split(' ')[0]).join(', ');

function blueprintCard(c, hasObjects, events, color, open) {
  const called = new Set(events.filter(e => e.type === 'call' && e.cls === c.name).map(e => e.method));
  const blocked = new Set(events.filter(e => e.type === 'blocked' && e.cls === c.name).map(e => e.member));
  const inst = c.fields.filter(f => !f.static);
  const rowField = (f) => `<div class="row${blocked.has(f.name) ? ' blocked' : ''}">${badges(f)}<span class="n">${esc(f.name)}</span><span class="t">${esc(f.type)}</span></div>`;
  const rowCtor = (k) => `<div class="row${called.has('<init>') ? ' set' : ''}">${badges(k)}<span class="code">new ${esc(c.name)}(${esc(paramTypes(k.params))})</span></div>`;
  const autoCtor = `<div class="row${called.has('<init>') ? ' set' : ''}">${badges({ visibility: 'public' })}<span class="code">new ${esc(c.name)}()</span><span class="note">auto</span></div>`;
  const rowMethod = (m) => `<div class="row${called.has(m.name) ? ' set' : blocked.has(m.name) ? ' blocked' : ''}">${badges(m)}<span class="code">${esc((m.static ? c.name + '.' : '.') + m.name + '(' + paramTypes(m.params) + ')')}</span><span class="t">${m.returnType === 'void' ? '' : esc(m.returnType)}</span></div>`;
  const onlyStatic = c.methods.every(m => m.static) && !inst.length && !c.ctors.length;
  const title = `<div class="title"><span class="dot"></span>class ${esc(c.name)}${c.pkg ? `<span class="pkg">${esc(c.pkg)}</span>` : ''}<span class="toggle">${open ? '−' : '+'}</span></div>`;

  if (!open) {
    // small: a summary + only the members used in this step
    const used = [
      ...inst.filter(f => blocked.has(f.name)).map(rowField),
      ...(called.has('<init>') ? (c.ctors.length ? c.ctors.map(rowCtor) : [autoCtor]) : []),
      ...c.methods.filter(m => called.has(m.name) || blocked.has(m.name)).map(rowMethod),
    ].join('');
    const summary = `${inst.length} field${inst.length === 1 ? '' : 's'} · ${c.methods.length} method${c.methods.length === 1 ? '' : 's'}`;
    return `<div class="card blueprint small" data-board="${esc(c.name)}" style="--c:${hex(color)}">${title}<div class="summary">${summary}${hasObjects || onlyStatic ? '' : ' · no object yet'}</div>${used}</div>`;
  }
  return `<div class="card blueprint" data-board="${esc(c.name)}" style="--c:${hex(color)}">${title}
    ${inst.length ? `<div class="sec">Fields</div>${inst.map(rowField).join('')}` : ''}
    ${onlyStatic ? '' : `<div class="sec">Build</div>${c.ctors.length ? c.ctors.map(rowCtor).join('') : autoCtor}`}
    ${c.methods.length ? `<div class="sec">Methods</div>${c.methods.map(rowMethod).join('')}` : ''}
    ${!hasObjects && !onlyStatic ? `<div class="hint">No object yet — only the blueprint.</div>` : ''}
  </div>`;
}

function houseCard(o, cls, { active, touched, color }) {
  const rows = o.fields.map(f => {
    const meta = cls.fields.find(x => x.name === f.name) || f;
    const key = o.id + '.' + f.name;
    const st = touched.blocked.has(key) ? ' blocked' : touched.set.has(key) ? ' set' : touched.get.has(key) ? ' get' : '';
    return `<div class="row${st}">${badges(meta)}<span class="n">${esc(f.name)}</span><span class="v">${esc(valText(f.value))}</span></div>`;
  }).join('');
  const gc = o.reachable ? '' : '<div class="hint">Nobody points here → Garbage Collector</div>';
  return `<div class="card house${active ? ' active' : ''}${o.reachable ? '' : ' ghost'}" data-house="${o.id}" style="--c:${hex(color)}">
    <div class="title"><span class="dot"></span>${esc(o.cls)}<span class="id">#${o.id}</span>${active ? '<span class="here">this</span>' : ''}</div>
    ${rows || '<div class="row muted">no fields</div>'}${gc}</div>`;
}

// ===================== 3D shapes =====================
function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...extra }); }
function tint(color, amount) { return new THREE.Color(color).lerp(new THREE.Color(0xffffff), amount).getHex(); }

function clearGroup(g) {
  for (const c of [...g.children]) {
    g.remove(c);
    c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
}

function setOpacity(obj, a) {
  obj.traverse(o => {
    if (!o.material) return;
    o.material.transparent = a < 1;
    o.material.opacity = a;
    o.castShadow = a >= 1 && o.userData.shadow !== false;
  });
}

function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }

// the blueprint stand: a rounded panel on a foot, in the class color
function makeStand(color) {
  const g = new THREE.Group();
  const foot = shadowed(new THREE.Mesh(new RoundedBoxGeometry(3.4, 0.3, 1.2, 2, 0.12), mat(tint(color, 0.55))));
  foot.position.y = 0.15; g.add(foot);
  const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 16), mat(tint(color, 0.3))));
  post.position.y = 1.0; g.add(post);
  const panel = shadowed(new THREE.Mesh(new RoundedBoxGeometry(4.6, 1.6, 0.25, 3, 0.12), mat(color, { roughness: 0.5 })));
  panel.position.y = 2.2; panel.rotation.x = -0.25; g.add(panel);
  return g;
}

function makeKiosk(color) {
  const g = new THREE.Group();
  const base = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.4, 1.8, 3, 0.25), mat(UI.wall)));
  base.position.y = 0.7; g.add(base);
  const awning = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.22, 2.2, 2, 0.1), mat(color)));
  awning.position.y = 1.55; g.add(awning);
  const s = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), mat(tint(color, 0.2))));
  s.position.y = 1.9; g.add(s);
  return g;
}

function gableRoof(w, d, h) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(0, h); shape.lineTo(w / 2, 0); shape.lineTo(-w / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 3 });
  geo.translate(0, 0, -d / 2);
  return geo;
}

function makeHouse(cls, color) {
  const g = new THREE.Group();
  const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.8, 1.9, 2.6, 4, 0.28), mat(tint(color, 0.82))));
  body.position.y = 0.95; body.name = 'body'; g.add(body);
  const roof = shadowed(new THREE.Mesh(gableRoof(3.1, 2.7, 1.15), mat(color, { roughness: 0.55 })));
  roof.position.y = 1.85; roof.name = 'roof'; g.add(roof);
  const door = new THREE.Mesh(new RoundedBoxGeometry(0.62, 1.0, 0.12, 2, 0.06), mat(tint(color, 0.15)));
  door.position.set(-0.7, 0.55, 1.29); door.name = 'door'; g.add(door);

  const pubMethods = cls ? cls.methods.filter(m => m.visibility === 'public' && !m.static).length : 0;
  const nWin = Math.min(3, Math.max(1, pubMethods));
  for (let i = 0; i < nWin; i++) {
    const win = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.46, 0.1, 2, 0.08), mat(UI.window, { emissive: 0xffe27a, emissiveIntensity: 0.35 }));
    win.position.set(0.05 + i * 0.56, 1.15, 1.29); win.name = 'window'; g.add(win);
  }
  if (cls && cls.fields.some(f => f.visibility === 'private' && !f.static)) {
    const lock = new THREE.Group();
    lock.name = 'lock';
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.42, 0.2, 2, 0.07), mat(UI.lock, { roughness: 0.4 }));
    const sh = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 10, 20, Math.PI), mat(0xb4232a, { roughness: 0.35, metalness: 0.3 }));
    sh.position.y = 0.2;
    lock.add(b, sh);
    lock.position.set(1.46, 1.15, 0.3);
    lock.rotation.y = Math.PI / 2;
    g.add(lock);
  }
  return g;
}

function styleHouse(g, color, { ghost, dim }) {
  const body = g.getObjectByName('body'), roof = g.getObjectByName('roof');
  body.material.color.setHex(ghost ? UI.ghost : tint(color, 0.82));
  roof.material.color.setHex(ghost ? tint(UI.ghost, -0.1) : color);
  const a = dim || ghost ? 0.4 : 1;
  g.traverse(o => {
    if (!o.material) return;
    o.material.transparent = a < 1;
    o.material.opacity = a;
    o.material.depthWrite = a >= 1;
    o.castShadow = a >= 1;
  });
}

function makeMailbox(filled, ghost) {
  const g = new THREE.Group();
  const s = BOX.size;
  const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(s, 0.75, s * 0.9, 2, 0.12), mat(ghost ? UI.ghost : filled ? 0xc7d2fe : 0xffffff)));
  box.position.y = 0.38;
  g.add(box);
  if (filled && !ghost) {
    const letter = new THREE.Mesh(new RoundedBoxGeometry(s * 0.6, 0.08, s * 0.45, 2, 0.03), mat(0x6366f1));
    letter.position.y = 0.8;
    g.add(letter);
  }
  return g;
}

function makePerson() {
  const g = new THREE.Group();
  const body = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 8, 20), mat(UI.person, { roughness: 0.5 })));
  body.position.y = 0.9; g.add(body);
  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.32, 28, 20), mat(UI.personSkin, { roughness: 0.6 })));
  head.position.y = 1.78; g.add(head);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 6, 12), mat(UI.person));
  arm.position.set(0.4, 1.2, 0.1); arm.rotation.z = -0.55; g.add(arm);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), mat(0x94a3b8));
  stick.position.set(0.55, 1.6, 0.1); g.add(stick);
  const sign = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.36, 0.06, 2, 0.05), mat(UI.pileArrow, { roughness: 0.5 })));
  sign.position.set(0.55, 1.95, 0.1); g.add(sign);
  return g;
}

function makeRing() {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.09, 12, 64), new THREE.MeshBasicMaterial({ color: UI.active }));
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

function makeArrow(a, b, color, radius, opacity) {
  const g = new THREE.Group();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y = Math.max(a.y, b.y) + 0.8 + a.distanceTo(b) * 0.15;
  const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: opacity < 1, opacity });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, radius, 8, false), m));
  const tip = curve.getPoint(1), before = curve.getPoint(0.95);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 3.2, radius * 8, 14), m);
  cone.position.copy(tip);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(before).normalize());
  g.add(cone);
  return g;
}

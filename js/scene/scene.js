// scene.js — the 3D street, drawn with three.js.
//
// What you see (spec §3):
//   district per class   → plot of land + blueprint board (members of the class)
//   static fields        → a shared kiosk next to the board
//   object (new)         → a house: baskets (fields) in its card, red lock if it has private fields,
//                          windows for its public methods
//   the running method   → a wooden person standing where the code is working
//   variables            → signs in the person's hand, with a yellow arrow to the house they point at
//   field = other object → a green arrow from house to house (an "address paper")
//   array                → a row of numbered mailboxes
//   nobody points at it  → grey house: waiting for the Garbage Collector
//
// The 3D shapes carry no text. All text (names, values, messages) is an HTML layer on top,
// so it stays sharp and is never hidden behind a wall.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { computeLayout, visibleArrays, BOX } from '../layout/layout.js';

const VIEW_DIR = new THREE.Vector3(0.38, 0.78, 0.94).normalize();

const C = {
  bg: 0xfaf6ee, ground: 0xf3ead8, plot: 0xebdfc4, arraysPlot: 0xe3e6d6,
  wood: 0xdcb88c, woodDark: 0xb48659, roof: 0xc8744c, board: 0x3f6b4f,
  window: 0xfff3c4, lock: 0xc8412e, kiosk: 0x6f9a7c, kioskRoof: 0xe2c05a,
  ghost: 0xc4bcae, person: 0xd9a46a, personDark: 0x9c6b3e,
  pileArrow: 0xe0a800, heapArrow: 0x4f8a63, mailbox: 0xd6c3a0, mailboxFull: 0xc99a68,
};

export class StreetScene {
  constructor(container, labelLayer) {
    this.container = container;
    this.labelLayer = labelLayer;
    this.labels = [];
    this.follow = true;
    this.expanded = new Set(); // house ids the user opened by clicking

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(C.bg);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);
    this.camera.position.set(40, 45, 52);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.45;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 400;
    this.controls.addEventListener('start', () => { this.userMoving = true; this.cameraGoal = null; });
    this.controls.addEventListener('end', () => { this.userMoving = false; });

    scene.add(new THREE.HemisphereLight(0xfff8ee, 0xd8c8a8, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    this.sun = sun;
    scene.add(sun, sun.target);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: C.ground, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    scene.add(this.ground);

    this.staticGroup = new THREE.Group();  // districts, boards, kiosks, arrays (rebuilt each step)
    this.arrowGroup = new THREE.Group();   // arrows between houses (rebuilt each step)
    this.personArrows = new THREE.Group(); // arrows from the person's signs (follow the person)
    scene.add(this.staticGroup, this.arrowGroup, this.personArrows);

    this.houseMeshes = new Map(); // id -> group, kept between steps (so new houses can grow, locks can shake)

    this.person = makePerson();
    this.person.visible = false;
    scene.add(this.person);
    this.personGoal = new THREE.Vector3();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();

    labelLayer.addEventListener('click', (e) => {
      const card = e.target.closest('[data-house]');
      if (!card) return;
      const id = Number(card.dataset.house);
      if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id);
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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  reset() {
    for (const g of this.houseMeshes.values()) this.scene.remove(g);
    this.houseMeshes.clear();
    this.expanded.clear();
    this.fitted = false;
    this.person.visible = false;
    this.personPlaced = false;
    this.personTargets = null;
  }

  // ===================== one step =====================
  update(step) {
    this.lastStep = step;
    const state = step.state;
    const L = computeLayout(state);
    this.layout = L;
    this.labels = [];
    const events = step.events || [];
    const top = state.frames[state.frames.length - 1] || null;

    // what this step touched (for yellow / red highlights)
    const touched = { set: new Set(), get: new Set(), blocked: new Set(), staticSet: new Set(), arraySet: new Set() };
    for (const e of events) {
      if (e.type === 'fieldSet') touched.set.add(e.id + '.' + e.field);
      if (e.type === 'fieldGet') touched.get.add(e.id + '.' + e.field);
      if (e.type === 'blocked') touched.blocked.add((e.id ?? e.cls) + '.' + e.member);
      if (e.type === 'staticSet') touched.staticSet.add(e.cls + '.' + e.field);
      if (e.type === 'arraySet') touched.arraySet.add(e.id + '.' + e.index);
    }

    this.sizeWorld(L);
    this.buildDistricts(L, state, touched, events);
    this.buildHouses(L, state, top, touched, events);
    this.buildArrays(L, state, touched);
    this.buildHeapArrows(L, state);
    this.placePerson(L, state, top, step);
    this.addBubbles(L, step, events);

    if (!this.fitted) { this.focusView(); this.fitted = true; }
    else if (this.follow) this.followGoal();
  }

  sizeWorld(L) {
    const size = Math.max(L.width, L.depth) + 40;
    this.ground.scale.set(size * 2, size * 2, 1);
    this.sun.position.set(size * 0.5, size * 0.9, size * 0.35);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -size * 0.8; cam.right = cam.top = size * 0.8;
    cam.near = 1; cam.far = size * 3;
    cam.updateProjectionMatrix();
  }

  // ---------- districts: plot, blueprint board, static kiosk ----------
  buildDistricts(L, state, touched, events) {
    clearGroup(this.staticGroup);
    for (const d of L.districts) {
      const plot = new THREE.Mesh(new THREE.BoxGeometry(d.width, 0.2, d.depth), std(d.kind === 'arrays' ? C.arraysPlot : C.plot, { roughness: 1 }));
      plot.position.set(d.x, 0.1, d.z);
      plot.receiveShadow = true;
      this.staticGroup.add(plot);
      if (d.kind !== 'class') {
        this.addLabel(new THREE.Vector3(d.x - d.width / 2 + 2.6, 0.3, d.z - d.depth / 2 + 1.2), `<div class="tag-district">Arrays</div>`, 'plain');
        continue;
      }

      const c = d.cls;
      const board = makeBoard();
      board.position.set(d.board.x, 0.2, d.board.z);
      this.staticGroup.add(board);
      const hasObjects = state.heap.some(o => !o.isArray && o.cls === c.name);
      this.addLabel(new THREE.Vector3(d.board.x, 2.2, d.board.z + 0.3), blueprintCard(c, hasObjects, events), 'board', null, 0, 'center');

      const statics = c.fields.filter(f => f.static);
      if (statics.length) {
        const kiosk = makeKiosk();
        kiosk.position.set(d.kiosk.x, 0.2, d.kiosk.z);
        this.staticGroup.add(kiosk);
        const rows = statics.map(f => {
          const cls = touched.staticSet.has(c.name + '.' + f.name) ? ' set' : '';
          return `<div class="row${cls}">${badges(f)}<span class="n">${esc(f.name)}</span><span class="v">${esc(valText(f.value))}</span></div>`;
        }).join('');
        this.addLabel(new THREE.Vector3(d.kiosk.x, 3.0, d.kiosk.z), `<div class="card kiosk"><div class="title">static · shared by all</div>${rows}</div>`, 'kiosk');
      }
    }
  }

  // ---------- houses ----------
  buildHouses(L, state, top, touched, events) {
    const activeId = top ? top.thisId : null;
    const pointed = new Set();
    if (top) for (const v of top.vars) if (v.value.kind === 'object') pointed.add(v.value.id);
    const eventIds = new Set(events.filter(e => e.id !== undefined && e.id !== null).map(e => e.id));
    const fewHouses = L.houses.size <= 6;

    const seen = new Set();
    for (const o of state.heap) {
      if (o.isArray) continue;
      const pos = L.houses.get(o.id);
      if (!pos) continue;
      seen.add(o.id);
      const cls = state.classes.find(c => c.name === o.cls);
      let g = this.houseMeshes.get(o.id);
      if (!g) {
        g = makeHouse(cls);
        g.userData.grow = 0;
        g.scale.setScalar(0.01);
        g.position.set(pos.x, 0.2, pos.z);
        this.houseMeshes.set(o.id, g);
        this.scene.add(g);
      }
      g.userData.target = new THREE.Vector3(pos.x, 0.2, pos.z);
      setHouseLook(g, o.id === activeId, !o.reachable);
      if ([...touched.blocked].some(k => k.startsWith(o.id + '.'))) g.userData.shake = 1;

      const full = fewHouses || o.id === activeId || pointed.has(o.id) || eventIds.has(o.id) || this.expanded.has(o.id);
      this.addLabel(new THREE.Vector3(pos.x, 3.9, pos.z), houseCard(o, cls, { active: o.id === activeId, full, touched }), 'house');
    }
    for (const [id, g] of this.houseMeshes) {
      if (!seen.has(id)) { this.scene.remove(g); this.houseMeshes.delete(id); }
    }
  }

  // ---------- arrays: rows of mailboxes ----------
  buildArrays(L, state, touched) {
    for (const a of visibleArrays(state)) {
      const p = L.arrayPos.get(a.id);
      if (!p) continue;
      for (const b of p.boxes) {
        const v = a.items[b.index];
        const filled = v.kind !== 'null' && !(v.kind === 'prim' && (v.text === '0' || v.text === '0.0' || v.text === 'false'));
        const box = makeMailbox(filled, !a.reachable);
        box.position.set(b.x, 0.2, b.z);
        this.staticGroup.add(box);
      }
      const cells = a.items.slice(0, p.shown).map((v, i) => {
        const cls = touched.arraySet.has(a.id + '.' + i) ? ' set' : '';
        return `<span class="cell${cls}"><i>[${i}]</i>${esc(shortVal(v))}</span>`;
      }).join('');
      const more = a.items.length > p.shown ? `<span class="cell more">[${p.shown}]..[${a.items.length - 1}]</span>` : '';
      this.addLabel(new THREE.Vector3(p.x, 1.9, p.z), `<div class="card array${a.reachable ? '' : ' ghost'}"><div class="title">${esc(a.type)} <span class="id">#${a.id}</span> · length ${a.items.length}</div><div class="cells">${cells}${more}</div></div>`, 'array');
    }
  }

  // ---------- green arrows: field (or array box) → other object ----------
  buildHeapArrows(L, state) {
    clearGroup(this.arrowGroup);
    const targetPoint = (id) => {
      const h = L.houses.get(id);
      if (h) return new THREE.Vector3(h.x, 2.4, h.z);
      const a = L.arrayPos.get(id);
      if (a && a.boxes.length) return new THREE.Vector3(a.boxes[0].x - BOX.size / 2, 0.8, a.z);
      if (a) return new THREE.Vector3(a.x, 0.8, a.z);
      return null;
    };
    for (const o of state.heap) {
      if (o.isArray) {
        const p = L.arrayPos.get(o.id);
        if (!p) continue;
        p.boxes.forEach(b => {
          const v = o.items[b.index];
          if (v.kind !== 'object' && v.kind !== 'array') return;
          const to = targetPoint(v.id);
          if (to) this.arrowGroup.add(makeArrow(new THREE.Vector3(b.x, 1.0, b.z), to, C.heapArrow, 0.05, !o.reachable));
        });
        continue;
      }
      const h = L.houses.get(o.id);
      if (!h) continue;
      let k = 0;
      for (const f of o.fields) {
        if (f.value.kind !== 'object' && f.value.kind !== 'array') continue;
        if (f.value.id === o.id) continue;
        const to = targetPoint(f.value.id);
        if (!to) continue;
        const from = new THREE.Vector3(h.x + 0.6 - (k++) * 0.4, 2.2, h.z + 0.4);
        this.arrowGroup.add(makeArrow(from, to, C.heapArrow, 0.05, !o.reachable));
      }
    }
  }

  // ---------- the person (the running method) and its signs ----------
  placePerson(L, state, top, step) {
    if (!top) {
      this.personTargets = null;
      this.rebuildPersonArrows();
      if (step.final && !step.error) this.person.visible = false;
      return;
    }
    let spot;
    // blocked by a lock (private) or by the blueprint (static): the person walks there and bumps into it
    const blocked = [...(step.events || [])].reverse().find(e => e.type === 'blocked');
    if (blocked && blocked.id !== null && L.houses.get(blocked.id)) spot = L.houses.get(blocked.id).spot;
    else if (blocked && blocked.id === null && L.districts.find(x => x.name === blocked.cls)) spot = L.districts.find(x => x.name === blocked.cls).spot;
    else if (top.thisId !== null && L.houses.get(top.thisId)) spot = L.houses.get(top.thisId).spot;
    else {
      const d = L.districts.find(x => x.kind === 'class' && x.name === top.cls);
      spot = d ? d.spot : { x: 0, z: 0 };
    }
    this.personGoal.set(spot.x, 0.2, spot.z);
    if (!this.personPlaced) { this.person.position.copy(this.personGoal); this.personPlaced = true; }
    this.person.visible = true;

    // the person's card: method + its variables (its part of the pile)
    const rows = top.vars.map(v => {
      const isRef = v.value.kind === 'object' || v.value.kind === 'array';
      const sign = isRef ? `<span class="sign">➜ #${v.value.id}</span>`
        : v.value.kind === 'null' ? `<span class="sign empty">empty sign (null)</span>`
          : `<span class="v">${esc(valText(v.value))}</span>`;
      return `<div class="row"><span class="t">${esc(v.type)}</span><span class="n">${esc(v.name)}</span>${sign}</div>`;
    }).join('');
    const pile = state.frames.length > 1
      ? `<div class="stack">pile: ${state.frames.map(f => esc(shortLabel(f.label))).join(' › ')}</div>` : '';
    this.addLabel(this.person.position, `<div class="card person"><div class="title">${esc(top.label)}</div>${rows || '<div class="row muted">no variables yet</div>'}${pile}</div>`,
      'person', () => this.person.position.clone().add(new THREE.Vector3(1.0, 2.4, 0)), 0, 'left');

    // yellow arrows: from the signs in the hand to the houses
    this.personTargets = top.vars.filter(v => v.value.kind === 'object' || v.value.kind === 'array').map(v => {
      const h = L.houses.get(v.value.id);
      if (h) return new THREE.Vector3(h.x, 3.0, h.z);
      const a = L.arrayPos.get(v.value.id);
      if (a) return new THREE.Vector3(a.x, 1.2, a.z);
      return null;
    }).filter(Boolean);
    this.rebuildPersonArrows();
  }

  rebuildPersonArrows() {
    clearGroup(this.personArrows);
    if (!this.person.visible || !this.personTargets) return;
    const hand = this.person.position.clone().add(new THREE.Vector3(0.62, 1.9, 0.1));
    for (const t of this.personTargets) {
      if (t.distanceTo(hand) < 1.5) continue;
      this.personArrows.add(makeArrow(hand, t, C.pileArrow, 0.06, false));
    }
  }

  // ---------- speech bubbles for this step ----------
  addBubbles(L, step, events) {
    const at = (id) => {
      const h = L.houses.get(id);
      return h ? new THREE.Vector3(h.x, 1.6, h.z + 1.6) : null;
    };
    const personAt = () => this.person.position.clone().add(new THREE.Vector3(0, 0.4, 0.8));
    let n = 0;
    for (const e of events) {
      if (n > 4) break;
      if (e.type === 'new' && at(e.id)) { this.addLabel(at(e.id), `<div class="bubble build">🔨 new ${esc(e.cls)}: house #${e.id} built</div>`, 'bubble'); n++; }
      if (e.type === 'return' && e.method !== '<init>' && e.value && e.value.kind !== 'none') {
        const p = e.thisId !== null ? at(e.thisId) : null;
        this.addLabel(p || personAt(), `<div class="bubble ret">↩ ${esc(e.method)}() gives ${esc(valText(e.value))}</div>`, 'bubble'); n++;
      }
      if (e.type === 'print') {
        this.addLabel(new THREE.Vector3(), `<div class="bubble print">🖨 ${esc(e.text.replace(/\n$/, ''))}</div>`, 'bubble', personAt, -1); n++;
      }
      if (e.type === 'autoToString' && at(e.id)) { this.addLabel(at(e.id), `<div class="bubble info">println calls toString() by itself</div>`, 'bubble'); n++; }
      if (e.type === 'blocked') {
        const p = e.id !== null ? at(e.id) : null;
        const d = L.districts.find(x => x.name === e.cls);
        const pos = p || (d ? new THREE.Vector3(d.board.x, 1.4, d.board.z + 0.8) : personAt());
        const why = e.visibility === 'static' ? `${e.member}() needs an object, not the blueprint` : `${e.member} is ${e.visibility}`;
        this.addLabel(pos, `<div class="bubble error">🔒 Blocked: ${esc(why)}</div>`, 'bubble'); n++;
      }
    }
    if (step.final && step.error && step.error.kind !== 'tooLong' && step.error.kind !== 'internal') {
      const msg = step.error.kind === 'exception' ? step.error.javaClass.replace(/^java\.(lang|util)\./, '') + (step.error.message ? ': ' + step.error.message : '') : step.error.message;
      this.addLabel(new THREE.Vector3(), `<div class="bubble error big">✖ ${esc(msg)}</div>`, 'bubble', () => this.person.position.clone().add(new THREE.Vector3(0, 0.2, 1.2)), 1);
    }
  }

  // ===================== camera =====================
  fitAll() {
    if (!this.layout) return;
    const r = Math.max(this.layout.width, this.layout.depth, 18) * 1.4;
    this.controls.target.set(0, 0, 0);
    this.camera.position.copy(VIEW_DIR.clone().multiplyScalar(r * 1.25));
    this.cameraGoal = null;
    this.controls.update();
  }

  // the normal view: close enough to read, centered on the person
  focusView() {
    const t = this.person.visible ? this.personGoal.clone() : new THREE.Vector3();
    t.z -= 4;
    this.controls.target.copy(t);
    this.camera.position.copy(t.clone().add(VIEW_DIR.clone().multiplyScalar(52)));
    this.cameraGoal = null;
    this.controls.update();
  }

  // slide the camera so the person stays in view (keeps the user's angle and zoom)
  followGoal() {
    if (!this.person.visible) return;
    this.cameraGoal = this.personGoal.clone().add(new THREE.Vector3(0, 0, -4));
  }

  setFollow(on) {
    this.follow = on;
    if (on) this.followGoal(); else this.cameraGoal = null;
  }

  animate() {
    // houses grow when built, slide when the layout changes, the lock shakes when blocked
    for (const g of this.houseMeshes.values()) {
      if (g.userData.grow < 1) {
        g.userData.grow = Math.min(1, g.userData.grow + 0.05);
        const t = g.userData.grow;
        g.scale.setScalar(0.01 + 0.99 * (1 - Math.pow(1 - t, 3)));
      }
      if (g.userData.target) g.position.lerp(g.userData.target, 0.15);
      const lock = g.getObjectByName('lock');
      if (lock) {
        if (g.userData.shake > 0) {
          g.userData.shake = Math.max(0, g.userData.shake - 0.012);
          lock.rotation.z = Math.sin(performance.now() / 35) * 0.5 * g.userData.shake;
          lock.scale.setScalar(1 + 0.6 * g.userData.shake);
        } else { lock.rotation.z = 0; lock.scale.setScalar(1); }
      }
    }
    // the person walks to the place where the code runs
    if (this.person.visible) {
      const before = this.person.position.clone();
      this.person.position.x += (this.personGoal.x - before.x) * 0.12;
      this.person.position.z += (this.personGoal.z - before.z) * 0.12;
      const moved = Math.hypot(this.person.position.x - before.x, this.person.position.z - before.z);
      if (moved > 0.003) {
        const dir = this.personGoal.clone().sub(before);
        this.person.rotation.y = Math.atan2(dir.x, dir.z);
        this.person.position.y = 0.2 + Math.abs(Math.sin(performance.now() / 90)) * 0.18 * Math.min(1, moved * 8);
        this.rebuildPersonArrows();
        this.walking = true;
      } else if (this.walking) {
        this.walking = false;
        this.person.position.y = 0.2;
        this.person.rotation.y = 0;
        this.rebuildPersonArrows();
      }
    }
    // camera follows the person
    if (this.cameraGoal && !this.userMoving) {
      const delta = this.cameraGoal.clone().sub(this.controls.target).multiplyScalar(0.07);
      if (delta.lengthSq() < 1e-6) this.cameraGoal = null;
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
  }

  // ===================== HTML labels =====================
  // getPos: optional function for labels that move with something (the person)
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
    const camPos = this.camera.position;
    // labels shrink when the camera is far, like real signs (but stay readable)
    const ref = 42 * (h / 800);
    for (const l of this.labels) {
      const p = l.getPos ? l.getPos() : l.pos;
      const scale = Math.max(0.62, Math.min(1.1, ref / camPos.distanceTo(p)));
      v.copy(p).project(this.camera);
      if (v.z > 1 || v.x < -1.4 || v.x > 1.4 || v.y < -1.4 || v.y > 1.4) { l.el.style.display = 'none'; continue; }
      l.el.style.display = '';
      const [dx, dy, origin] = l.anchor === 'center' ? ['-50%', '-50%', '50% 50%'] : l.anchor === 'left' ? ['0%', '-100%', '0% 100%'] : ['-50%', '-100%', '50% 100%'];
      l.el.style.transformOrigin = origin;
      l.el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px) translate(${dx}, ${dy}) scale(${scale.toFixed(3)})`;
      // nearer labels on top; the person and bubbles above everything
      const kind = l.el.classList;
      const base = kind.contains('label-bubble') ? 6000 : kind.contains('label-person') ? 5000 : 0;
      l.el.style.zIndex = String(base + l.priority * 10 + Math.round((1 - v.z) * 4000));
    }
  }
}

// ===================== HTML pieces =====================
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function valText(v) {
  if (!v) return '';
  switch (v.kind) {
    case 'string': return '"' + v.text + '"';
    case 'null': return 'null';
    case 'object': return `➜ ${v.cls} #${v.id}`;
    case 'array': return `➜ ${v.type} #${v.id}`;
    case 'prim': return v.type === 'char' ? `'${v.text}'` : v.text;
    case 'unset': return '(no value)';
    default: return '';
  }
}
function shortVal(v) {
  if (v.kind === 'object' || v.kind === 'array') return '➜#' + v.id;
  if (v.kind === 'string') return '"' + (v.text.length > 8 ? v.text.slice(0, 7) + '…' : v.text) + '"';
  return valText(v);
}
function shortLabel(label) { return label.replace(/\(.*\)$/, '()'); }

function badges(m) {
  let b = m.visibility === 'private' ? '<b class="bd lock" title="private: locked room">🔒</b>'
    : m.visibility === 'public' ? '<b class="bd pub" title="public: open to everyone">+</b>'
      : '<b class="bd pkg" title="no word: same package only">~</b>';
  if (m.static) b += '<b class="bd st" title="static: one shared copy">S</b>';
  if (m.final) b += '<b class="bd fin" title="final: glass box, cannot change">F</b>';
  return b;
}
const paramTypes = (params) => params.map(p => p.split(' ')[0]).join(', ');

function blueprintCard(c, hasObjects, events) {
  const calledStatic = new Set(events.filter(e => e.type === 'call' && e.static && e.cls === c.name).map(e => e.method));
  const fields = c.fields.filter(f => !f.static).map(f =>
    `<div class="row">${badges(f)}<span class="t">${esc(f.type)}</span><span class="n">${esc(f.name)}</span></div>`).join('');
  const ctors = c.ctors.length
    ? c.ctors.map(k => `<div class="row">${badges(k)}<span class="code">new ${esc(c.name)}(${esc(paramTypes(k.params))})</span></div>`).join('')
    : `<div class="row"><b class="bd pub">+</b><span class="code">new ${esc(c.name)}()</span><span class="note">automatic</span></div>`;
  const methods = c.methods.map(m => {
    const call = m.static ? `${c.name}.${m.name}(${paramTypes(m.params)})` : `obj.${m.name}(${paramTypes(m.params)})`;
    return `<div class="row${calledStatic.has(m.name) ? ' set' : ''}">${badges(m)}<span class="code">${esc(call)}</span><span class="t">${m.returnType === 'void' ? '' : ': ' + esc(m.returnType)}</span></div>`;
  }).join('');
  const onlyMain = c.methods.every(m => m.static) && !c.fields.some(f => !f.static) && !c.ctors.length;
  return `<div class="card blueprint">
    <div class="title">class ${esc(c.name)}${c.pkg ? `<span class="pkg">${esc(c.pkg)}</span>` : ''}</div>
    ${fields ? `<div class="sec">baskets (fields)</div>${fields}` : ''}
    ${onlyMain ? '' : `<div class="sec">build a house</div>${ctors}`}
    ${methods ? `<div class="sec">windows (methods)</div>${methods}` : ''}
    ${!hasObjects && !onlyMain ? `<div class="hint">No house yet: this is only the blueprint.</div>` : ''}
  </div>`;
}

function houseCard(o, cls, { active, full, touched }) {
  const title = `<div class="title">${esc(o.cls)} <span class="id">#${o.id}</span>${active ? '<span class="here">this</span>' : ''}</div>`;
  const ghost = o.reachable ? '' : '<div class="hint gc">Nobody points here. The Garbage Collector can remove it.</div>';
  const cl = `card house${active ? ' active' : ''}${o.reachable ? '' : ' ghost'}`;
  if (!full) return `<div class="${cl} compact" data-house="${o.id}" title="Click to open">${title}</div>`;
  const rows = o.fields.map(f => {
    const meta = cls.fields.find(x => x.name === f.name) || f;
    const key = o.id + '.' + f.name;
    const st = touched.blocked.has(key) ? ' blocked' : touched.set.has(key) ? ' set' : touched.get.has(key) ? ' get' : '';
    return `<div class="row${st}">${badges(meta)}<span class="n">${esc(f.name)}</span><span class="v">${esc(valText(f.value))}</span></div>`;
  }).join('');
  return `<div class="${cl}" data-house="${o.id}">${title}${rows || '<div class="row muted">no fields</div>'}${ghost}</div>`;
}

// ===================== 3D shapes =====================
function std(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }); }

function clearGroup(g) {
  for (const c of [...g.children]) {
    g.remove(c);
    c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
}

function makeBoard() {
  const g = new THREE.Group();
  const legMat = std(C.woodDark);
  for (const x of [-2.6, 2.6]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 2.9, 12), legMat);
    leg.position.set(x, 1.45, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(6, 2.3, 0.24), std(C.wood));
  frame.position.set(0, 2.2, 0);
  frame.castShadow = true;
  g.add(frame);
  const slate = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.95, 0.05), std(C.board, { roughness: 0.95 }));
  slate.position.set(0, 2.2, 0.14);
  g.add(slate);
  return g;
}

function makeKiosk() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.8), std(C.kiosk));
  base.position.y = 0.8; base.castShadow = true; g.add(base);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 0.5), std(C.wood));
  counter.position.set(0, 1.1, 1.0); g.add(counter);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.9, 4), std(C.kioskRoof));
  roof.position.y = 2.05; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
  return g;
}

function makeHouse(cls) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3, 2.1, 2.8), std(C.wood));
  body.position.y = 1.05;
  body.castShadow = body.receiveShadow = true;
  body.name = 'body';
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.55, 1.4, 4), std(C.roof));
  roof.position.y = 2.1 + 0.7;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  roof.name = 'roof';
  g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.1, 0.06), std(C.woodDark));
  door.position.set(-0.8, 0.55, 1.42);
  g.add(door);

  // one window per public method (max 3): the "service windows"
  const pubMethods = cls ? cls.methods.filter(m => m.visibility === 'public' && !m.static).length : 0;
  const nWin = Math.min(3, Math.max(1, pubMethods));
  for (let i = 0; i < nWin; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.45, 0.06), std(C.window, { emissive: 0xffe9a0, emissiveIntensity: 0.3 }));
    win.position.set(0.0 + i * 0.58, 1.25, 1.42);
    g.add(win);
  }
  // a red lock on the side if the class has private fields
  if (cls && cls.fields.some(f => f.visibility === 'private' && !f.static)) {
    const lock = new THREE.Group();
    lock.name = 'lock';
    const lockBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.18), std(C.lock, { metalness: 0.2, roughness: 0.5 }));
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 16, Math.PI), std(0x8f2a1c, { metalness: 0.5, roughness: 0.4 }));
    shackle.position.y = 0.2;
    lock.add(lockBody, shackle);
    lock.position.set(1.56, 1.3, 0.4);
    lock.rotation.y = Math.PI / 2;
    g.add(lock);
  }
  return g;
}

function setHouseLook(g, active, ghost) {
  const body = g.getObjectByName('body');
  const roof = g.getObjectByName('roof');
  body.material.color.setHex(ghost ? C.ghost : C.wood);
  body.material.emissive.setHex(active ? 0xf2c230 : 0x000000);
  body.material.emissiveIntensity = active ? 0.3 : 0;
  roof.material.color.setHex(ghost ? C.ghost : C.roof);
  for (const m of [body.material, roof.material]) { m.transparent = ghost; m.opacity = ghost ? 0.55 : 1; }
}

function makeMailbox(filled, ghost) {
  const g = new THREE.Group();
  const s = BOX.size;
  const box = new THREE.Mesh(new THREE.BoxGeometry(s, 0.8, s * 0.9), std(ghost ? C.ghost : filled ? C.mailboxFull : C.mailbox));
  box.position.y = 0.4;
  box.castShadow = true;
  g.add(box);
  if (filled && !ghost) {
    const letter = new THREE.Mesh(new THREE.BoxGeometry(s * 0.6, 0.06, s * 0.45), std(0xfffdf5));
    letter.position.y = 0.83;
    g.add(letter);
  }
  return g;
}

function makePerson() {
  const g = new THREE.Group();
  const skin = std(C.person, { roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.75, 6, 14), skin);
  body.position.y = 0.95; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 20, 16), skin);
  head.position.y = 1.85; head.castShadow = true; g.add(head);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.45, 4, 8), std(C.personDark));
  arm.position.set(0.42, 1.25, 0.1); arm.rotation.z = -0.6; g.add(arm);
  // the sign in the hand
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), std(C.woodDark));
  stick.position.set(0.62, 1.55, 0.1); g.add(stick);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.04), std(0xfff4c9));
  sign.position.set(0.62, 1.95, 0.1); g.add(sign);
  return g;
}

// A curved arrow (tube + cone) from a to b, arching up.
function makeArrow(a, b, color, radius, faded) {
  const g = new THREE.Group();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y = Math.max(a.y, b.y) + 0.8 + a.distanceTo(b) * 0.12;
  const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: faded, opacity: faded ? 0.35 : 1 });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 6, false), mat));
  const tip = curve.getPoint(1), before = curve.getPoint(0.94);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 3.2, radius * 8, 10), mat);
  cone.position.copy(tip);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(before).normalize());
  g.add(cone);
  return g;
}

// scene.js — the 3D street, drawn with three.js.
//
// Phase 1 version: the ground, one district per class with its blueprint board,
// and one house per object. Names and values are an HTML layer on top (always sharp).
// Phase 3 will add baskets, locks, windows, people and animations.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { computeLayout } from '../layout/layout.js';

const COLORS = {
  ground: 0xf3ead8, plot: 0xe9dcc0, plotEdge: 0xd8c7a3,
  wood: 0xd9b48a, woodDark: 0xb98b5e, roof: 0xc9774f, board: 0x3f6b4f,
  active: 0xf2c230, ghost: 0xbdb5a6,
};

export class StreetScene {
  constructor(container, labelLayer) {
    this.container = container;
    this.labelLayer = labelLayer;
    this.labels = [];

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfaf6ee);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 1000);
    this.camera.position.set(30, 34, 38);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.45;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 300;

    scene.add(new THREE.HemisphereLight(0xfff8ee, 0xd8c8a8, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(25, 40, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 4;
    this.sun = sun;
    scene.add(sun, sun.target);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    this.ground = ground;

    this.world = new THREE.Group();
    scene.add(this.world);
    this.houseMeshes = new Map(); // id -> group (kept between updates, so new houses can "grow")

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.fitted = false;

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

  // Draw the world for one step's state.
  update(state, activeId) {
    const layout = computeLayout(state);
    this.layout = layout;

    // ground and shadows grow with the world
    const size = Math.max(layout.width, layout.depth) + 30;
    this.ground.scale.set(size * 1.6, size * 1.6, 1);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -size / 1.4; cam.right = cam.top = size / 1.4;
    cam.far = 200; cam.updateProjectionMatrix();

    // rebuild static parts (districts, boards)
    for (const child of [...this.world.children]) if (!child.userData.houseId) this.world.remove(child);
    this.labels = [];

    for (const d of layout.districts) {
      const plot = new THREE.Mesh(new THREE.BoxGeometry(d.width, 0.2, d.depth), new THREE.MeshStandardMaterial({ color: COLORS.plot, roughness: 1 }));
      plot.position.set(d.x, 0.1, d.z);
      plot.receiveShadow = true;
      this.world.add(plot);

      const board = makeBoard();
      board.position.set(d.board.x, 0, d.board.z);
      this.world.add(board);
      const cls = state.classes.find(c => c.name === d.cls);
      this.addLabel(new THREE.Vector3(d.board.x, 3.4, d.board.z), `<b>${esc(d.cls)}</b><span>${cls.fields.length} field${cls.fields.length === 1 ? '' : 's'} · ${cls.methods.length} method${cls.methods.length === 1 ? '' : 's'}</span>`, 'label-board');
    }

    // houses: keep existing ones, grow new ones, remove gone ones
    const seen = new Set();
    for (const d of layout.districts) {
      for (const h of d.houses) {
        seen.add(h.id);
        let g = this.houseMeshes.get(h.id);
        if (!g) {
          g = makeHouse();
          g.userData.houseId = h.id;
          g.userData.grow = 0;
          g.scale.setScalar(0.01);
          this.houseMeshes.set(h.id, g);
          this.world.add(g);
        }
        g.position.set(h.x, 0.2, h.z);
        const obj = state.heap.find(o => o.id === h.id);
        setHouseLook(g, h.id === activeId, !obj.reachable);
        this.addLabel(new THREE.Vector3(h.x, 3.3, h.z + 0.6), `${esc(d.cls)} <span>id=${h.id}</span>`, 'label-house' + (h.id === activeId ? ' active' : '') + (!obj.reachable ? ' ghost' : ''));
      }
    }
    for (const [id, g] of this.houseMeshes) {
      if (!seen.has(id)) { this.world.remove(g); this.houseMeshes.delete(id); }
    }

    if (!this.fitted) { this.fitAll(); this.fitted = true; }
  }

  reset() {
    for (const g of this.houseMeshes.values()) this.world.remove(g);
    this.houseMeshes.clear();
    this.fitted = false;
  }

  fitAll() {
    if (!this.layout) return;
    const r = Math.max(this.layout.width, this.layout.depth, 16) * 1.6;
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(r * 1.0, r * 1.15, r * 1.3);
    this.controls.update();
  }

  animate() {
    for (const g of this.houseMeshes.values()) {
      if (g.userData.grow < 1) {
        g.userData.grow = Math.min(1, g.userData.grow + 0.06);
        const t = g.userData.grow;
        g.scale.setScalar(0.01 + 0.99 * (1 - Math.pow(1 - t, 3)));
      }
    }
  }

  addLabel(pos, html, cls) {
    const el = document.createElement('div');
    el.className = 'label ' + cls;
    el.innerHTML = html;
    this.labels.push({ pos, el });
  }

  updateLabels() {
    const layer = this.labelLayer;
    if (layer._labels !== this.labels) {
      layer.replaceChildren(...this.labels.map(l => l.el));
      layer._labels = this.labels;
    }
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const v = new THREE.Vector3();
    for (const l of this.labels) {
      v.copy(l.pos).project(this.camera);
      const hidden = v.z > 1;
      l.el.style.display = hidden ? 'none' : '';
      l.el.style.transform = `translate(-50%, -100%) translate(${(v.x + 1) / 2 * w}px, ${(1 - v.y) / 2 * h}px)`;
    }
  }
}

// ---------- shapes ----------
function std(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }); }

function makeBoard() {
  const g = new THREE.Group();
  const legMat = std(COLORS.woodDark);
  for (const x of [-2.3, 2.3]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 12), legMat);
    leg.position.set(x, 1.3, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.1, 0.22), std(COLORS.wood));
  frame.position.set(0, 2.0, 0);
  frame.castShadow = true;
  g.add(frame);
  const slate = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.75, 0.05), std(COLORS.board, { roughness: 0.95 }));
  slate.position.set(0, 2.0, 0.13);
  g.add(slate);
  return g;
}

function makeHouse() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.9, 2.6), std(COLORS.wood));
  body.position.y = 0.95;
  body.castShadow = body.receiveShadow = true;
  body.name = 'body';
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.25, 1.3, 4), std(COLORS.roof));
  roof.position.y = 1.9 + 0.65;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  roof.name = 'roof';
  g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.06), std(COLORS.woodDark));
  door.position.set(0, 0.5, 1.31);
  g.add(door);
  return g;
}

function setHouseLook(g, active, ghost) {
  const body = g.getObjectByName('body');
  const roof = g.getObjectByName('roof');
  body.material.color.setHex(ghost ? COLORS.ghost : COLORS.wood);
  body.material.emissive.setHex(active ? COLORS.active : 0x000000);
  body.material.emissiveIntensity = active ? 0.35 : 0;
  roof.material.color.setHex(ghost ? COLORS.ghost : COLORS.roof);
  body.material.transparent = roof.material.transparent = ghost;
  body.material.opacity = roof.material.opacity = ghost ? 0.55 : 1;
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

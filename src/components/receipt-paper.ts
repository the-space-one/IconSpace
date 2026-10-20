import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  DoubleSide,
  LinearMipmapLinearFilter,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Plane,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";

/*
 * The basket's receipt as a sheet of paper (basket.tsx draws it, this moves
 * it). A full-screen WebGL layer, drawn only while something moves, holds two
 * meshes cut along one torn edge: the body, which tears off, and the stub,
 * which stays in the dock's slot. Everything below the slot line is clipped,
 * so the paper reads as coming out of the dock.
 *
 * The body is a grid of particles stepped with Verlet integration and held
 * together by distance links: stretch and shear links keep it whole, bend
 * links (every other particle) make it stiff like paper rather than cloth.
 * Its bottom row hangs from the stub by perforation links; each column's
 * links snap once stretched past TEAR_AT, so a sideways pull rips from the
 * side under strain across to the other. A grabbed pinch follows the pointer;
 * a fully torn piece hangs from it under gravity, and when let go keeps the
 * pointer's velocity, slowed by air pushing on its face (which is what makes
 * it flutter), and fades. Until then, a weak spring to its flat pose lets an
 * unfinished tear settle back.
 *
 * World units are CSS pixels: the camera is placed so that z = 0 maps 1:1 to
 * the viewport, x right and y up from its centre.
 */

export type Ticket = {
  body: HTMLCanvasElement;
  stub: HTMLCanvasElement;
  /** CSS px. The stub overlaps the body's foot by 2 × jag. */
  width: number;
  bodyHeight: number;
  stubHeight: number;
  jag: number;
  /** Stub showing above the slot line. */
  reveal: number;
};

const FOV = 40;
const CELL = 11; // target particle spacing, px
const SUBSTEPS = 2;
// Paper doesn't stretch: many passes keep every link at its length, so a
// pull turns and curves the sheet instead of crumpling it like cloth.
const ITERATIONS = 24;
const DT = 1 / 60 / SUBSTEPS;
const GRAVITY = 2400; // px/s², once torn
const DAMPING = 0.99;
// Share of the velocity across the face lost per substep: enough to flutter,
// little enough that it still drops like paper rather than glides like a leaf.
const AIR = 0.025;
// Toward the flat pose, per substep: only once let go before tearing. While
// it's held the sheet must be free to turn, or it buckles.
const REST_PULL = 0.06;
// The perforation is weaker than the paper: it gives (and tears) first.
const PERFORATION = 0.35;
const TEAR_AT = 3; // px past rest that snaps a perforation link
const LIFT = 8; // px the pinched point rises toward the camera
const BEND = 1;
const SHEAR = 1;
const SETTLE = 700; // ms an unfinished tear, let go, takes to come back flat
const FADE_AFTER = 0.9; // s free before it starts to fade
const FADE = 0.45;

type Link = { a: number; b: number; rest: number; stiffness: number };
type Perforation = { anchor: number; particle: number; rest: number };

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class PaperStage {
  onTorn?: () => void;
  onDone?: () => void;

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 1, 10000);
  private slotPlane = new Plane(new Vector3(0, 1, 0), 0);
  private view = { width: 1, height: 1 };

  private ticket!: Ticket;
  private body!: Mesh<BufferGeometry, MeshLambertMaterial>;
  private stub!: Mesh<BufferGeometry, MeshLambertMaterial>;
  private cols = 0;
  private rows = 0;

  // Body particles: positions, previous positions, flat-pose offsets (paper px).
  private pos = new Float32Array(0);
  private prev = new Float32Array(0);
  private flat = new Float32Array(0);
  private links: Link[] = [];
  private holes: Perforation[][] = []; // per column; emptied when it tears
  private anchors: [number, number][] = []; // stub-top points, paper px

  /** Paper's left edge and slot line on screen. */
  private slot = { left: 0, y: 0 };
  /** How far (px) the paper is pushed down into the slot, and the stub after a tear. */
  private sink = 0;
  private stubSink = 0;

  private simulating = false;
  private torn = false;
  private free = 0; // s since a torn piece was let go
  private letGo = 0; // when an attached sheet was let go (ms)
  private pinch: { index: number; dx: number; dy: number }[] = [];
  private pointer = { x: 0, y: 0 };
  private tweens: { from: number; to: number; start: number; duration: number; steps?: number; set: (v: number) => void; done?: () => void }[] = [];
  private script?: { start: number; duration: number; from: { x: number; y: number }; by: { x: number; y: number } };
  private frame = 0;
  private finished = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    // Lit so a flat sheet facing the camera is exactly white; bends shade.
    this.scene.add(new AmbientLight(0xffffff, 0.64 * Math.PI));
    const light = new DirectionalLight(0xffffff, 0.42 * Math.PI);
    light.position.set(-0.35, 0.55, 1);
    this.scene.add(light);
    this.resize();
  }

  resize() {
    this.view = { width: innerWidth, height: innerHeight };
    this.renderer.setSize(this.view.width, this.view.height, false);
    this.camera.aspect = this.view.width / this.view.height;
    this.camera.position.set(0, 0, this.view.height / 2 / Math.tan((FOV * Math.PI) / 360));
    this.camera.updateProjectionMatrix();
    this.wake();
  }

  /** Screen point → world (z = 0). */
  private world(x: number, y: number) {
    return [x - this.view.width / 2, this.view.height / 2 - y] as const;
  }

  /** Paper px → world, for the paper as it sits (sunk `sink` px into the slot). */
  private place(px: number, py: number, sink = this.sink) {
    const top = this.slot.y - (this.ticket.bodyHeight + this.ticket.reveal) + sink;
    return this.world(this.slot.left + px, top + py);
  }

  show(ticket: Ticket, slot: { left: number; y: number }, feed?: { duration: number; steps: number }) {
    this.ticket = ticket;
    this.slot = slot;
    this.slotPlane.constant = -this.world(0, slot.y)[1];

    const material = (art: HTMLCanvasElement) => {
      const map = new CanvasTexture(art);
      map.colorSpace = SRGBColorSpace;
      map.minFilter = LinearMipmapLinearFilter;
      map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      return new MeshLambertMaterial({
        map,
        side: DoubleSide, // thin paper: the print shows through, mirrored, on the back
        alphaTest: 0.5,
        alphaToCoverage: true,
        clippingPlanes: [this.slotPlane],
      });
    };

    // The body: a grid of particles.
    this.cols = Math.max(4, Math.round(ticket.width / CELL));
    this.rows = Math.max(4, Math.round(ticket.bodyHeight / CELL));
    const { cols, rows } = this;
    const count = (cols + 1) * (rows + 1);
    this.pos = new Float32Array(count * 3);
    this.prev = new Float32Array(count * 3);
    this.flat = new Float32Array(count * 2);
    const uv = new Float32Array(count * 2);
    const at = (i: number, j: number) => j * (cols + 1) + i;
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const k = at(i, j);
        this.flat[k * 2] = (ticket.width * i) / cols;
        this.flat[k * 2 + 1] = (ticket.bodyHeight * j) / rows;
        uv[k * 2] = i / cols;
        uv[k * 2 + 1] = 1 - j / rows;
      }
    }
    const index: number[] = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) index.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.pos, 3));
    geometry.setAttribute("uv", new BufferAttribute(uv, 2));
    geometry.setIndex(index);
    this.body = new Mesh(geometry, material(ticket.body));
    this.body.frustumCulled = false;

    const link = (a: number, b: number, stiffness: number) => {
      const dx = this.flat[a * 2] - this.flat[b * 2];
      const dy = this.flat[a * 2 + 1] - this.flat[b * 2 + 1];
      this.links.push({ a, b, rest: Math.hypot(dx, dy), stiffness });
    };
    this.links = [];
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        if (i < cols) link(at(i, j), at(i + 1, j), 1);
        if (j < rows) link(at(i, j), at(i, j + 1), 1);
        if (i < cols && j < rows) {
          link(at(i, j), at(i + 1, j + 1), SHEAR);
          link(at(i + 1, j), at(i, j + 1), SHEAR);
        }
        if (i < cols - 1) link(at(i, j), at(i + 2, j), BEND);
        if (j < rows - 1) link(at(i, j), at(i, j + 2), BEND);
        // Diagonal bend links too, so it can't fold along a diagonal either.
        if (i < cols - 1 && j < rows - 1) {
          link(at(i, j), at(i + 2, j + 2), BEND);
          link(at(i + 2, j), at(i, j + 2), BEND);
        }
      }
    }

    // The perforation: each column of the body's foot hangs from the stub's top.
    const stubTop = ticket.bodyHeight - 2 * ticket.jag;
    this.anchors = [];
    this.holes = [];
    for (let i = 0; i <= cols; i++) {
      const x = (ticket.width * i) / cols;
      this.anchors.push([x, stubTop]);
    }
    for (let i = 0; i <= cols; i++) {
      const hole: Perforation[] = [];
      const tie = (particle: number) => {
        const dx = this.flat[particle * 2] - this.anchors[i][0];
        const dy = this.flat[particle * 2 + 1] - this.anchors[i][1];
        hole.push({ anchor: i, particle, rest: Math.hypot(dx, dy) });
      };
      tie(at(i, rows));
      tie(at(i, rows - 1));
      if (i > 0) tie(at(i - 1, rows));
      if (i < cols) tie(at(i + 1, rows));
      this.holes.push(hole);
    }

    // The stub: rigid, so a plain strip.
    const stubGeometry = new BufferGeometry();
    stubGeometry.setAttribute("position", new BufferAttribute(new Float32Array(12), 3));
    stubGeometry.setAttribute("uv", new BufferAttribute(new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), 2));
    stubGeometry.setIndex([0, 2, 1, 1, 2, 3]);
    this.stub = new Mesh(stubGeometry, material(ticket.stub));
    this.stub.frustumCulled = false;
    this.scene.add(this.stub, this.body);

    this.sink = ticket.bodyHeight + ticket.reveal;
    this.layFlat();
    if (feed) {
      this.tween(this.sink, 0, feed.duration, (v) => (this.sink = v), undefined, feed.steps);
    } else {
      this.sink = 0;
      this.layFlat();
    }
    this.wake();
  }

  /** Follows the dock if the viewport changes. */
  moveSlot(slot: { left: number; y: number }) {
    this.slot = slot;
    this.slotPlane.constant = -this.world(0, slot.y)[1];
    if (!this.simulating && !this.torn) this.layFlat();
    this.wake();
  }

  private layFlat() {
    for (let k = 0; k < this.flat.length / 2; k++) {
      const [x, y] = this.place(this.flat[k * 2], this.flat[k * 2 + 1]);
      this.pos.set([x, y, 0], k * 3);
      this.prev.set([x, y, 0], k * 3);
    }
  }

  private tween(from: number, to: number, duration: number, set: (v: number) => void, done?: () => void, steps?: number) {
    this.tweens.push({ from, to, start: performance.now(), duration, steps, set, done });
    this.wake();
  }

  /** Pinch the paper at a screen point: one point, so the sheet can turn about it. */
  grab(x: number, y: number) {
    if (this.finished) return;
    const [wx, wy] = this.world(x, y);
    let nearest = 0;
    let best = Infinity;
    for (let k = 0; k < this.pos.length / 3; k++) {
      const d = Math.hypot(this.pos[k * 3] - wx, this.pos[k * 3 + 1] - wy);
      if (d < best) [best, nearest] = [d, k];
    }
    this.pinch = [{ index: nearest, dx: this.pos[nearest * 3] - wx, dy: this.pos[nearest * 3 + 1] - wy }];
    this.pointer = { x: wx, y: wy };
    this.simulating = true;
    this.wake();
  }

  drag(x: number, y: number) {
    if (!this.pinch.length) return;
    const [wx, wy] = this.world(x, y);
    this.pointer = { x: wx, y: wy };
    this.wake();
  }

  release() {
    this.pinch = [];
    this.script = undefined;
    this.letGo = performance.now();
    this.wake();
  }

  /** A click or Enter: pinch near the top right and pull up and away. */
  pullAway() {
    const [x, y] = this.place(this.ticket.width * 0.8, this.ticket.bodyHeight * 0.22);
    const sx = x + this.view.width / 2;
    const sy = this.view.height / 2 - y;
    this.grab(sx, sy);
    this.script = { start: performance.now(), duration: 520, from: { x: sx, y: sy }, by: { x: 190, y: -90 } };
  }

  /** Back into the slot, unkept. */
  retract(duration: number) {
    this.pinch = [];
    this.script = undefined;
    this.tween(this.sink, this.ticket.bodyHeight + this.ticket.reveal + this.ticket.stubHeight, duration, (v) => {
      this.sink = v;
      this.stubSink = 0;
    }, () => this.finish());
  }

  /** Reduced motion: no physics, it just fades. */
  fadeOut(duration: number) {
    for (const mesh of [this.body, this.stub]) mesh.material.transparent = true;
    this.tween(1, 0, duration, (v) => {
      this.body.material.opacity = v;
      this.stub.material.opacity = v;
    }, () => this.finish());
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.onDone?.();
  }

  private wake() {
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    this.frame = 0;
    const now = performance.now();

    for (const tween of [...this.tweens]) {
      let t = Math.min(1, (now - tween.start) / tween.duration);
      if (tween.steps) t = Math.floor(t * tween.steps) / tween.steps;
      else t = easeInOut(t);
      tween.set(tween.from + (tween.to - tween.from) * t);
      if (now - tween.start >= tween.duration) {
        this.tweens.splice(this.tweens.indexOf(tween), 1);
        tween.done?.();
      }
    }

    if (this.script) {
      const t = Math.min(1, (now - this.script.start) / this.script.duration);
      const e = easeInOut(t);
      this.drag(this.script.from.x + this.script.by.x * e, this.script.from.y + this.script.by.y * e);
      if (t >= 1) this.release();
    }

    if (this.simulating) {
      for (let s = 0; s < SUBSTEPS; s++) this.step();
      if (this.torn && !this.pinch.length) this.free += 1 / 60;
      // An unfinished tear, let go: once it's back in place, stop simulating.
      if (!this.torn && !this.pinch.length && now - this.letGo > SETTLE) {
        this.simulating = false;
        this.layFlat();
      }
    } else if (!this.torn) {
      this.layFlat();
    }

    if (this.torn && !this.pinch.length) {
      const fade = Math.max(0, Math.min(1, (this.free - FADE_AFTER) / FADE));
      this.body.material.opacity = 1 - fade;
      let lowest = Infinity;
      for (let k = 1; k < this.pos.length; k += 3) lowest = Math.min(lowest, this.pos[k]);
      if (fade >= 1 || lowest > this.view.height / 2 + 200 || this.pos[1] < -this.view.height / 2 - 400) {
        this.body.visible = false;
        if (!this.tweens.length) this.finish();
      }
    }

    this.draw();
    const moving = this.simulating || this.tweens.length > 0 || Boolean(this.script) || (this.torn && this.body.visible);
    if (moving && !this.finished) this.wake();
  };

  private step() {
    const { pos, prev } = this;
    const gravity = GRAVITY * DT * DT;
    const normals = this.body.geometry.getAttribute("normal") as BufferAttribute | undefined;

    for (let k = 0; k < pos.length / 3; k++) {
      const o = k * 3;
      let vx = (pos[o] - prev[o]) * DAMPING;
      let vy = (pos[o + 1] - prev[o + 1]) * DAMPING;
      let vz = (pos[o + 2] - prev[o + 2]) * DAMPING;
      // Air pushes back on the face, not the edge: the flutter of falling paper.
      if (normals && this.torn) {
        const nx = normals.getX(k);
        const ny = normals.getY(k);
        const nz = normals.getZ(k);
        const across = vx * nx + vy * ny + vz * nz;
        vx -= nx * across * AIR;
        vy -= ny * across * AIR;
        vz -= nz * across * AIR;
      }
      prev[o] = pos[o];
      prev[o + 1] = pos[o + 1];
      prev[o + 2] = pos[o + 2];
      pos[o] += vx;
      pos[o + 1] += vy - (this.torn ? gravity : 0);
      pos[o + 2] += vz;
      if (!this.torn && !this.pinch.length) {
        const [fx, fy] = this.place(this.flat[k * 2], this.flat[k * 2 + 1]);
        pos[o] += (fx - pos[o]) * REST_PULL;
        pos[o + 1] += (fy - pos[o + 1]) * REST_PULL;
        pos[o + 2] += (0 - pos[o + 2]) * REST_PULL;
      }
    }

    for (let n = 0; n < ITERATIONS; n++) {
      for (const { a, b, rest, stiffness } of this.links) {
        const ax = a * 3;
        const bx = b * 3;
        const dx = pos[bx] - pos[ax];
        const dy = pos[bx + 1] - pos[ax + 1];
        const dz = pos[bx + 2] - pos[ax + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const shift = ((d - rest) / d) * 0.5 * stiffness;
        pos[ax] += dx * shift;
        pos[ax + 1] += dy * shift;
        pos[ax + 2] += dz * shift;
        pos[bx] -= dx * shift;
        pos[bx + 1] -= dy * shift;
        pos[bx + 2] -= dz * shift;
      }
      if (!this.torn) {
        for (const hole of this.holes) {
          for (const { anchor, particle, rest } of hole) {
            const [ax, ay] = this.place(this.anchors[anchor][0], this.anchors[anchor][1]);
            const o = particle * 3;
            const dx = pos[o] - ax;
            const dy = pos[o + 1] - ay;
            const dz = pos[o + 2];
            const d = Math.hypot(dx, dy, dz) || 1e-6;
            const pull = ((d - rest) / d) * PERFORATION;
            pos[o] -= dx * pull;
            pos[o + 1] -= dy * pull;
            pos[o + 2] -= dz * pull;
          }
        }
      }
      this.hold();
    }

    if (!this.torn) this.perforate();
  }

  /** The pinch follows the pointer, lifted toward the camera. */
  private hold() {
    for (const { index, dx, dy } of this.pinch) {
      const o = index * 3;
      this.pos[o] = this.pointer.x + dx;
      this.pos[o + 1] = this.pointer.y + dy;
      this.pos[o + 2] = LIFT;
    }
  }

  /** Snap any perforation column stretched too far; tear free when none are left. */
  private perforate() {
    this.holes.forEach((hole, i) => {
      if (!hole.length) return;
      const { anchor, particle, rest } = hole[0];
      const [ax, ay] = this.place(this.anchors[anchor][0], this.anchors[anchor][1]);
      const o = particle * 3;
      if (Math.hypot(this.pos[o] - ax, this.pos[o + 1] - ay, this.pos[o + 2]) - rest > TEAR_AT) this.holes[i] = [];
    });
    if (this.holes.every((hole) => !hole.length)) {
      this.torn = true;
      // Free of the slot: it can go anywhere now, the dock included.
      this.body.material.clippingPlanes = [];
      this.body.material.transparent = true;
      this.body.material.needsUpdate = true;
      // The stub, torn to match, goes back in.
      this.tween(0, this.ticket.stubHeight + this.ticket.reveal, 240, (v) => (this.stubSink = v));
      this.onTorn?.();
    }
  }

  private draw() {
    const geometry = this.body.geometry;
    const position = geometry.getAttribute("position") as BufferAttribute;
    position.needsUpdate = true;
    geometry.computeVertexNormals();

    // The stub, rigid, in the slot.
    const { width, bodyHeight, stubHeight, jag } = this.ticket;
    const top = bodyHeight - 2 * jag;
    const corners = [
      this.place(0, top, this.sink + this.stubSink),
      this.place(width, top, this.sink + this.stubSink),
      this.place(0, top + stubHeight, this.sink + this.stubSink),
      this.place(width, top + stubHeight, this.sink + this.stubSink),
    ];
    const stub = this.stub.geometry.getAttribute("position") as BufferAttribute;
    corners.forEach(([x, y], k) => stub.setXYZ(k, x, y, -0.5));
    stub.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const mesh of [this.body, this.stub]) {
      if (!mesh) continue;
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

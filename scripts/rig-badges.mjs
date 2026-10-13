// Rigs the flat badge SVGs in public/badges for part-by-part animation.
//
//   node scripts/rig-badges.mjs           check, then write src/components/badge-rigs/*.ts
//   node scripts/rig-badges.mjs --sheet   also write each part at its extreme pose, for review
//
// The exports are painter's-model art: purple backing shapes with white cut-outs
// on top, so a line is just backing showing between two whites. Nothing can be
// moved on its own without exposing purple. The rig redraws the art in layers:
//
//   patch(P)   white inside the silhouette, P's region: what P leaves behind
//              when it moves
//   layer(P)   the art masked to P's region: every backing and white, plus P's
//              own details. Static parts render the full art instead.
//
// P's region is its white fills grown by `b` (one outline width, so it owns its
// outline) plus any extra `region` paths or `mask` shapes. The rest composite
// replaces the <Image> once loaded, and must match the source pixel for pixel,
// or nothing is written.
//
// Needs sharp (a devDependency) for the pixel check.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WHITE = "#fff";

/* Part maps, back to front. Indices are <path> positions in the source SVG.
 *   paths   paths the part owns (its whites set its region, the rest are details)
 *   shared  backings drawn in every layer (never owned); the first is the silhouette
 *   region  extra path geometry the part's region covers
 *   mask    extra region shapes, in viewBox units
 *   keep    details of parts behind it that fall inside its band (drawn, not owned)
 *   clip    [cx, cy, r]: a static window the part stays inside (a paw behind the rim)
 *   under   completion art the export never drew, hidden at rest by the parts in front
 *   b       band width override (outer parts have thicker outlines)
 *   pivot   transform origin, viewBox units (default: the part's centre)
 *   still   a static part: no patch, renders the full art
 *   test    the part's extreme pose, for --sheet */
// The round window each cat sits in: centre and inner rim radius.
const WINDOW = { spark: [37.425, 38.2, 25.3] };

const RIGS = {
  spark: {
    shared: [0, 2],
    parts: [
      { name: "ribbon-l", paths: [35, 36, 37], b: 4, pivot: [24, 63], test: "rotate(9)" },
      { name: "ribbon-r", paths: [32, 33, 34], b: 4, pivot: [51, 63], test: "rotate(-9)" },
      { name: "rosette", paths: [1], b: 4, keep: [34, 37], pivot: [37.42, 37.5], test: "rotate(2.5)" },
      { name: "disc", paths: [3], region: [2], still: true },
      {
        name: "head",
        paths: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
        mask: ['<rect x="13.6" y="40.5" width="7.9" height="7.1" rx="1"/>', '<rect x="53.5" y="40.5" width="7.8" height="7.1" rx="1"/>'],
        b: 3.4,
        pivot: [37.5, 57],
        test: "rotate(-4)",
      },
      { name: "paw-l", paths: [26, 27, 28, 29, 30], clip: WINDOW.spark, pivot: [27, 62], test: "rotate(-14)" },
      { name: "paw-r", paths: [31], still: true },
      { name: "star", paths: [4, 5], test: "scale(1.35) rotate(36)" },
      { name: "ray-l", paths: [7], test: "scale(1.15)" },
      { name: "ray-r", paths: [6], test: "scale(1.15)" },
    ],
  },
};

const B = 2.6; // outline width, viewBox units
const DETAIL_B = 0.6; // parts without a white fill carry their own outline
// Patches sit this far inside their layer's soft mask edge, so at rest they are
// always under fully opaque layer pixels and never show as a seam.
const INSET = 0.6;

function readBadge(id) {
  const svg = readFileSync(join(root, "public/badges", `${id}.svg`), "utf8");
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
  const paths = [...svg.matchAll(/<path\b[^>]*>/g)].map(([tag]) => ({
    fill: tag.match(/fill="([^"]+)"/)[1],
    d: tag.match(/\bd="([^"]+)"/)[1],
  }));
  return { svg, viewBox, paths };
}

function check(id, rig, paths) {
  const owner = new Map(rig.shared.map((i) => [i, "shared"]));
  for (const part of rig.parts) {
    for (const i of part.paths) {
      if (owner.has(i)) throw new Error(`${id}: path ${i} in ${owner.get(i)} and ${part.name}`);
      owner.set(i, part.name);
    }
  }
  const loose = paths.map((_, i) => i).filter((i) => !owner.has(i));
  if (loose.length) throw new Error(`${id}: unassigned paths ${loose.join(", ")}`);
}

/** Rough bounds from path coordinates (control points included), viewBox units. */
function bounds(d) {
  const t = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:e-?\d+)?/g);
  let i = 0, c = "", x = 0, y = 0, sx = 0, sy = 0;
  const xs = [], ys = [];
  const n = () => parseFloat(t[i++]);
  const at = (px, py) => { xs.push(px); ys.push(py); };
  while (i < t.length) {
    if (/[a-zA-Z]/.test(t[i])) c = t[i++];
    const rel = c === c.toLowerCase(), C = c.toUpperCase();
    if (C === "Z") { x = sx; y = sy; continue; }
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === "M") { x = ox + n(); y = oy + n(); sx = x; sy = y; at(x, y); c = rel ? "l" : "L"; }
    else if (C === "L" || C === "T") { x = ox + n(); y = oy + n(); at(x, y); }
    else if (C === "H") { x = (rel ? x : 0) + n(); at(x, y); }
    else if (C === "V") { y = (rel ? y : 0) + n(); at(x, y); }
    else if (C === "C") { at(ox + n(), oy + n()); at(ox + n(), oy + n()); x = ox + n(); y = oy + n(); at(x, y); }
    else if (C === "S" || C === "Q") { at(ox + n(), oy + n()); x = ox + n(); y = oy + n(); at(x, y); }
    else if (C === "A") {
      n(); n(); n();
      const f = t[i]; // arc flags may be packed, e.g. "01" or "1.5"
      if (/^[01][01]/.test(f)) t.splice(i, 1, f[0], f[1], ...(f.length > 2 ? [f.slice(2)] : []));
      n(); n(); x = ox + n(); y = oy + n(); at(x, y);
    }
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function build(id) {
  const rig = RIGS[id];
  const { viewBox, paths } = readBadge(id);
  check(id, rig, paths);
  const [, , vw, vh] = viewBox.split(" ").map(Number);
  const ref = (i) => `#${id}-p${i}`;
  const use = (i, attrs = "") => `<use href="${ref(i)}"${attrs}/>`;
  const shared = new Set(rig.shared);
  const isBase = (i) => shared.has(i) || paths[i].fill === WHITE;

  const parts = rig.parts.map((part) => {
    const whites = part.paths.filter((i) => paths[i].fill === WHITE);
    const grow = whites.length ? (part.b ?? B) : DETAIL_B;
    const regionPaths = [...(whites.length ? whites : part.paths), ...(part.region ?? [])];
    const box = regionPaths.map((i) => bounds(paths[i].d)).reduce((a, b) =>
      [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
    const pivot = part.pivot ?? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
    // The region as plain shapes: fills grown by `grow`, plus extra shapes.
    const shape = (inset = 0) =>
      `<g fill="#fff" stroke="#fff" stroke-width="${Math.max(grow - inset, 0) * 2}" stroke-linejoin="round">` +
      regionPaths.map((i) => use(i)).join("") + `</g>` +
      (part.mask
        ? `<g fill="#fff">${part.mask.join("")}</g>` +
          (inset ? `<g fill="none" stroke="#000" stroke-width="${inset * 2}">${part.mask.join("")}</g>` : "")
        : "");
    const details = [...part.paths, ...(part.keep ?? [])].filter((i) => !isBase(i)).sort((a, b) => a - b);
    return { ...part, pivot, box, shape, details };
  });

  const defs =
    paths.map((p, i) => `<path id="${id}-p${i}" d="${p.d}"/>`).join("") +
    `<g id="${id}-art">${paths.map((p, i) => use(i, ` fill="${p.fill}"`)).join("")}</g>` +
    `<g id="${id}-base">${paths.map((p, i) => (isBase(i) ? use(i, ` fill="${p.fill}"`) : "")).join("")}</g>` +
    parts.map((p) => {
      const mask = (name, inner) => `<mask id="${id}-${name}-${p.name}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="${vw + 40}" height="${vh + 40}">${inner}</mask>`;
      const clip = p.clip ? `<clipPath id="${id}-c-${p.name}"><circle cx="${p.clip[0]}" cy="${p.clip[1]}" r="${p.clip[2]}"/></clipPath>` : "";
      return mask("m", p.shape()) + (p.still ? "" : mask("pm", p.shape(INSET))) + clip;
    }).join("");

  // A moving layer must not carry copies of what sits in front of it, so those
  // regions are painted out (inset, so the front layers still cover them at rest).
  const front = (p) => parts.slice(parts.indexOf(p) + 1).map((q) => q.shape(INSET)).join("");
  const content = (p) =>
    p.still
      ? `<use href="#${id}-art"/>`
      : `<use href="#${id}-base"/>${(p.under ?? []).join("")}${p.details.map((i) => use(i, ` fill="${paths[i].fill}"`)).join("")}${front(p)}`;
  const layer = (p) => `<g mask="url(#${id}-m-${p.name})">${content(p)}</g>`;
  const patch = (p) => `<use href="${ref(rig.shared[0])}" fill="#fff" mask="url(#${id}-pm-${p.name})"/>`;

  return { id, viewBox, vw, vh, parts, defs, layer, patch };
}

/** One SVG of the rig at rest (or with one part posed), for pixel checks and review. */
function composite(b, posed) {
  const body = b.parts.map((p) => {
    const clip = p.clip ? ` clip-path="url(#${b.id}-c-${p.name})"` : "";
    const patch = p.still ? "" : `<g${clip}>${b.patch(p)}</g>`;
    const move = posed?.name === p.name
      ? ` transform="translate(${p.pivot[0]} ${p.pivot[1]}) ${p.test} translate(${-p.pivot[0]} ${-p.pivot[1]})"`
      : "";
    return `${patch}<g${clip}><g${move}>${b.layer(p)}</g></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${b.viewBox}" width="${b.vw}" height="${b.vh}"><defs>${b.defs}</defs>${body}</svg>`;
}

const render = (svg, density = 288) =>
  sharp(Buffer.from(svg), { density }).flatten({ background: "#fff" }).raw().toBuffer({ resolveWithObject: true });

/** Visible differences at rest: viewBox units holding more than a few strongly
 * different pixels (at 3x). Edge anti-aliasing drawn twice only makes specks. */
async function restDiff(id, b) {
  const [a, c] = await Promise.all([render(readBadge(id).svg), render(composite(b))]);
  const { width, channels } = a.info;
  const scale = width / b.vw;
  const cells = new Map();
  let max = 0;
  for (let i = 0; i < a.data.length; i += channels) {
    let d = 0;
    for (let k = 0; k < channels; k++) d = Math.max(d, Math.abs(a.data[i + k] - c.data[i + k]));
    max = Math.max(max, d);
    if (d <= 40) continue;
    const px = i / channels;
    const cell = `${Math.floor((px % width) / scale)},${Math.floor(Math.floor(px / width) / scale)}`;
    cells.set(cell, (cells.get(cell) ?? 0) + 1);
  }
  const off = [...cells].filter(([, n]) => n > 4).map(([cell]) => cell);
  return { off, max };
}

function emit(id, b) {
  const pct = (v, size) => `${+((v / size) * 100).toFixed(3)}%`;
  const svg = (cls, inner) =>
    `<svg class="${cls}" viewBox="${b.viewBox}" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>`;
  const markup =
    `<svg class="rig-defs" width="0" height="0" aria-hidden="true"><defs>${b.defs}</defs></svg>` +
    b.parts.map((p) =>
      (p.clip ? `<div class="rig-clip" style="clip-path:circle(${p.clip[2]}px at ${p.clip[0]}px ${p.clip[1]}px)">` : "") +
      (p.still ? "" : svg("rig-patch", b.patch(p))) +
      `<div data-part="${p.name}" style="transform-origin:${pct(p.pivot[0], b.vw)} ${pct(p.pivot[1], b.vh)}">${svg("rig-layer", b.layer(p))}</div>` +
      (p.clip ? "</div>" : ""),
    ).join("");
  const file = join(root, "src/components/badge-rigs", `${id}.ts`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file,
    `// Generated by scripts/rig-badges.mjs from public/badges/${id}.svg. Do not edit.\n` +
    `export const markup = ${JSON.stringify(markup)};\n`);
}

async function sheet(id, b, out) {
  const moving = b.parts.filter((p) => !p.still && p.test);
  const tiles = await Promise.all(moving.map((p) =>
    sharp(Buffer.from(composite(b, p)), { density: 576 }).flatten({ background: "#fff" }).png().toBuffer()));
  const { width, height } = await sharp(tiles[0]).metadata();
  const cols = 4, gap = 24;
  await sharp({ create: { width: cols * (width + gap), height: Math.ceil(tiles.length / cols) * (height + gap), channels: 3, background: "#e0e0e0" } })
    .composite(tiles.map((input, k) => ({ input, left: (k % cols) * (width + gap), top: Math.floor(k / cols) * (height + gap) })))
    .png().toFile(join(out, `${id}-sheet.png`));
  console.log(`  sheet: ${moving.map((p) => `${p.name} ${p.test}`).join(" | ")}`);
}

const sheetDir = process.argv.includes("--sheet") ? process.argv[process.argv.indexOf("--sheet") + 1] : null;
let failed = false;
for (const id of Object.keys(RIGS)) {
  const b = build(id);
  const { off, max } = await restDiff(id, b);
  console.log(`${id}: ${b.parts.length} parts, rest diff ${off.length ? `at ${off.join(" ")}` : "clean"} (max ${max}/255)`);
  for (const p of b.parts) console.log(`  ${p.name.padEnd(9)} box ${p.box.map((v) => v.toFixed(1)).join(",")}  pivot ${p.pivot.map((v) => +v.toFixed(2)).join(",")}`);
  if (sheetDir) await sheet(id, b, sheetDir);
  if (off.length) { failed = true; continue; }
  emit(id, b);
}
if (failed) {
  console.error("rest diff is not zero; nothing written for the failing badges");
  process.exit(1);
}

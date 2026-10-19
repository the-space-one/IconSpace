// Builds the icon registry that `npx iconspace` and the MCP server hand out:
//
//   node scripts/build-registry.mjs      (also runs before every build)
//
// The catalog is the shelf: every icon in src/icons/registry.ts plus Clock,
// in the shelf's order, minus the shelf's HIDDEN list (both read from
// src/components/shelf-icons.tsx, so the page and the registry never drift).
// Each icon ships as its own source file plus the local helpers it imports
// (scrub.ts, types.ts), exactly as the site runs them.
//
// Writes:
//   public/r/index.json        the catalog, for `iconspace list` and search
//   public/r/<id>.json         one icon with its files, for `iconspace add`
//   src/generated/registry.json  everything at once, for the /mcp route

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const icons = join(root, "src/icons");
const read = (path) => readFileSync(join(root, path), "utf8");

const HOMEPAGE = "https://iconspace.dev";

// Dependencies are pinned to the range the site itself runs, so an install
// gets the version the icons were made and tested against.
const SITE_DEPENDENCIES = JSON.parse(read("package.json")).dependencies;
const pinned = (name) => `${name}@${SITE_DEPENDENCIES[name]}`;

// Words people search for that aren't in the label.
const KEYWORDS = {
  "library-2": ["book", "read", "docs", "pages", "library"],
  discount: ["sale", "percent", "coupon", "offer", "badge"],
  "search-3d": ["search", "find", "magnifier", "zoom", "lookup"],
  globe: ["world", "web", "internet", "language", "global"],
  email: ["mail", "envelope", "inbox", "message", "letter"],
  macbook: ["laptop", "computer", "device", "notebook"],
  cart: ["shopping", "checkout", "basket", "store", "buy"],
  play: ["video", "media", "start", "player"],
  focus: ["target", "camera", "frame", "scan", "capture"],
  ticket: ["event", "pass", "admission", "coupon", "voucher"],
  lightning: ["bolt", "flash", "power", "energy", "fast"],
  home: ["house", "dashboard", "start"],
  "home-door": ["house", "door", "enter", "home"],
  github: ["git", "code", "repository", "octocat", "open source"],
  settings: ["gear", "cog", "preferences", "options", "config"],
  "settings-slider": ["sliders", "filters", "controls", "adjust", "preferences"],
  bell: ["notification", "alert", "ring", "reminder"],
  coin: ["money", "dollar", "payment", "currency", "price"],
  calendar: ["date", "schedule", "event", "day"],
  "calendar-2": ["date", "schedule", "event", "planner"],
  key: ["password", "access", "unlock", "auth", "security"],
  compass: ["navigate", "explore", "direction", "discover"],
  scan: ["qr", "frame", "capture", "focus", "fullscreen"],
  gem: ["diamond", "premium", "pro", "jewel", "value"],
  sparkle: ["ai", "magic", "stars", "new", "shine"],
  arrow: ["right", "next", "forward", "go"],
  lock: ["secure", "private", "password", "padlock", "security"],
  eye: ["view", "visible", "show", "watch", "preview"],
  call: ["phone", "telephone", "contact", "ring"],
  heart: ["like", "love", "favorite"],
  "heart-2": ["like", "love", "favorite"],
  trash: ["delete", "remove", "bin", "garbage"],
  fall: ["drop", "meteor", "ball", "gravity"],
  "paper-plane": ["send", "submit", "message", "share"],
  mic: ["microphone", "voice", "record", "audio", "speak"],
  "pen-line": ["edit", "write", "pencil", "sign"],
  "image-sun": ["image", "photo", "picture", "gallery", "media"],
  swoosh: ["stroke", "draw", "squiggle", "line"],
  bookmark: ["save", "book", "read later", "favorite"],
  brush: ["paint", "design", "art", "draw", "theme"],
  "globe-morph": ["world", "web", "internet", "global"],
  code: ["developer", "brackets", "html", "embed", "programming"],
  earth: ["world", "planet", "global", "map"],
  rocket: ["launch", "ship", "deploy", "start", "boost"],
  clock: ["time", "alarm", "hour", "schedule", "timer"],
};

/* ── The catalog ─────────────────────────────────────────── */

const registry = read("src/icons/registry.ts");
const fileOf = new Map(
  [...registry.matchAll(/^import \{ (\w+) \} from "\.\/(\w+)";$/gm)].map(([, name, file]) => [name, file]),
);
const entries = [...registry.matchAll(/\{\s*id: "([^"]+)",\s*label: "([^"]+)",\s*Icon: (\w+),?\s*\}/g)].map(
  ([, id, label, component]) => ({ id, label, component, interactive: false }),
);
// Clock drives itself on hover, so the lab adds it outside the registry.
entries.push({ id: "clock", label: "Clock", component: "ClockIcon", interactive: true });
fileOf.set("ClockIcon", "ClockIcon");

const shelf = read("src/components/shelf-icons.tsx");
const list = (name) => JSON.parse(shelf.match(new RegExp(`const ${name} = (\\[[^\\]]*\\]);`))[1]);
const lead = list("LEAD");
const hidden = list("HIDDEN");
const shown = entries.filter((entry) => !hidden.includes(entry.id));
const catalog = [
  ...lead.map((id) => shown.find((entry) => entry.id === id)),
  ...shown.filter((entry) => !lead.includes(entry.id)),
];
if (catalog.some((entry) => !entry)) throw new Error("A LEAD id in shelf-icons.tsx isn't in the registry.");

/* ── Files ───────────────────────────────────────────────── */

// An icon's file, then every local file it imports, depth first.
function collect(file, seen = new Map()) {
  if (seen.has(file)) return seen;
  const source = readFileSync(join(icons, file), "utf8");
  seen.set(file, source);
  for (const [, spec] of source.matchAll(/from "\.\/([\w-]+)"/g)) {
    collect(["tsx", "ts"].map((ext) => `${spec}.${ext}`).find((name) => exists(name)), seen);
  }
  return seen;
}
function exists(name) {
  try {
    readFileSync(join(icons, name));
    return true;
  } catch {
    return false;
  }
}

// The icons use hooks, so they're client components wherever React Server
// Components run; the directive is ignored everywhere else.
const clientOnly = (path, source) =>
  path.endsWith(".tsx") && !source.startsWith('"use client"') ? `"use client";\n\n${source}` : source;

const items = catalog.map(({ id, label, component, interactive }) => {
  const sources = collect(`${fileOf.get(component)}.tsx`);
  const files = [...sources].map(([path, source]) => ({ path, content: clientOnly(path, source) }));
  const usesMotion = [...sources.values()].some((source) => source.includes('from "motion/react"'));
  return {
    id,
    name: label,
    component,
    file: files[0].path,
    interactive,
    dependencies: usesMotion ? [pinned("motion")] : [],
    keywords: KEYWORDS[id] ?? [],
    files,
  };
});

/* ── Output ──────────────────────────────────────────────── */

const index = {
  name: "iconspace",
  homepage: HOMEPAGE,
  icons: items.map(({ id, name, component, file, interactive, dependencies, keywords }) => ({
    id,
    name,
    component,
    file,
    interactive,
    dependencies,
    keywords,
  })),
};

const out = join(root, "public/r");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.json"), JSON.stringify(index, null, 2) + "\n");
for (const item of items) writeFileSync(join(out, `${item.id}.json`), JSON.stringify(item) + "\n");

mkdirSync(join(root, "src/generated"), { recursive: true });
writeFileSync(join(root, "src/generated/registry.json"), JSON.stringify({ homepage: HOMEPAGE, icons: items }) + "\n");

console.log(`registry: ${items.length} icons (${hidden.length} hidden) → public/r, src/generated/registry.json`);

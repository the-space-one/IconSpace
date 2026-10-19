import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import * as p from "@clack/prompts";
import { CLIENTS, instructions, MCP_URL, writeClientConfig } from "./mcp.mjs";
import {
  defaultDir,
  findRoot,
  hasDependency,
  importPath,
  install,
  installArgs,
  isTypeScript,
  packageManager,
  packageName,
  readPackage,
} from "./project.mjs";
import { CliError, fetchCatalog, fetchIcon, findIcon, registryUrl, suggest } from "./registry.mjs";

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const HELP = `iconspace ${VERSION}: animated React icons from https://iconspace.dev

Usage
  npx iconspace                  pick icons and add them to this project
  npx iconspace add <icon...>    add icons by name, e.g. npx iconspace add cart bell
  npx iconspace list             show every icon
  npx iconspace mcp              connect your AI tools to the IconSpace MCP server
  npx iconspace mcp init         write the MCP config for Claude Code, Cursor or VS Code

Options
  -d, --dir <path>       folder for the icon files
                         (default: src/components/icons, or components/icons without src/)
  -a, --all              add every icon
  -o, --overwrite        replace icon files that already exist and differ
  -y, --yes              don't ask anything; use the defaults
      --no-install       don't install the icons' dependencies (motion)
      --client <name>    for mcp init: claude, cursor or vscode (repeatable)
      --json             for list: print JSON
      --cwd <path>       run as if from this folder
      --registry <url>   icon registry (default: $ICONSPACE_REGISTRY or https://iconspace.dev/r)
  -h, --help             show this help
  -v, --version          show the version`;

const OPTIONS = {
  dir: { type: "string", short: "d" },
  all: { type: "boolean", short: "a" },
  overwrite: { type: "boolean", short: "o" },
  yes: { type: "boolean", short: "y" },
  "no-install": { type: "boolean" },
  client: { type: "string", multiple: true },
  json: { type: "boolean" },
  cwd: { type: "string" },
  registry: { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
};

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (error) {
    console.error(`${error.message}\nRun \`npx iconspace --help\` for usage.`);
    process.exitCode = 1;
    return;
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (values.version) return console.log(VERSION);
  if (values.help || command === "help") return console.log(HELP);

  const options = {
    ...values,
    cwd: resolve(values.cwd ?? "."),
    install: !values["no-install"],
    // Prompts only when a person is at a terminal; scripts and CI get the defaults.
    interactive: !values.yes && Boolean(process.stdin.isTTY && process.stdout.isTTY) && !p.isCI(),
  };

  try {
    if (command === undefined && !options.interactive && !options.all) console.log(HELP);
    else if (command === undefined || command === "add") await add(rest, options);
    else if (command === "list" || command === "ls") await list(options);
    else if (command === "mcp") await mcp(rest, options);
    else throw new CliError(`There's no "${command}" command. Run \`npx iconspace --help\` for usage.`);
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    p.log.error(error.message);
    process.exitCode = 1;
  }
}

/* ── add ─────────────────────────────────────────────────── */

async function add(names, options) {
  const { interactive } = options;
  const root = projectRoot(options.cwd);
  const base = registryUrl(options.registry);
  p.intro(`IconSpace ${VERSION}`);

  const catalog = await step("Fetching the icon list", () => fetchCatalog(base), interactive);
  let icons;
  if (options.all) icons = catalog;
  else if (names.length) icons = resolveNames(catalog, names);
  else if (interactive) icons = await pickIcons(catalog);
  else throw new CliError("Name the icons to add, e.g. `npx iconspace add cart bell`, or see them all with `npx iconspace list`.");

  let dir = options.dir ?? defaultDir(root);
  if (!options.dir && interactive) {
    dir = await ask(p.text({ message: "Where should the icon files go?", placeholder: dir, defaultValue: dir }));
  }
  const target = resolve(root, dir);
  const shown = relative(root, target) || ".";

  const items = await step(
    `Downloading ${plural(icons.length, "icon")}`,
    () => Promise.all(icons.map((icon) => fetchIcon(base, icon.id))),
    interactive,
  );

  // Icons share helpers (scrub.ts, types.ts), so each file is written once.
  const files = new Map();
  for (const item of items) {
    for (const file of item.files) {
      if (!/^[\w.-]+$/.test(file.path)) throw new CliError(`The registry sent an unsafe file name: ${file.path}`);
      files.set(file.path, file.content);
    }
  }
  const plan = [...files].map(([path, content]) => {
    const file = join(target, path);
    const current = existsSync(file) ? readFileSync(file, "utf8") : null;
    return { path, file, content, state: current === null ? "new" : current === content ? "same" : "differs" };
  });

  let overwrite = Boolean(options.overwrite);
  const clashes = plan.filter((file) => file.state === "differs");
  if (clashes.length && !overwrite && interactive) {
    overwrite = await ask(
      p.confirm({
        message: `${join_(clashes.map((file) => file.path))} already ${clashes.length === 1 ? "exists" : "exist"} in ${shown} with other content. Replace ${clashes.length === 1 ? "it" : "them"}?`,
        initialValue: false,
      }),
    );
  }

  mkdirSync(target, { recursive: true });
  const written = [];
  const kept = [];
  for (const file of plan) {
    if (file.state === "same") continue;
    if (file.state === "differs" && !overwrite) {
      kept.push(file.path);
      continue;
    }
    writeFileSync(file.file, file.content);
    written.push(file.path);
  }
  if (written.length) p.log.success(`Wrote ${join_(written)} to ${shown}`);
  else p.log.info(`${shown} already has ${icons.length === 1 ? "this icon" : "these icons"}.`);
  if (kept.length) p.log.warn(`Kept your ${join_(kept)}: ${kept.length === 1 ? "it differs" : "they differ"} from IconSpace's. Add --overwrite to replace.`);

  const deps = [...new Set(items.flatMap((item) => item.dependencies))];
  const missing = deps.filter((dep) => !hasDependency(readPackage(root), dep));
  if (missing.length) {
    const manager = packageManager(root);
    const command = `${manager} ${installArgs(manager, missing).join(" ")}`;
    const names = missing.map(packageName).join(", ");
    if (options.install) {
      p.log.step(`Installing ${names}: ${command}`);
      if (!(await install(root, manager, missing))) p.log.warn(`The install failed. Run \`${command}\` yourself.`);
    } else {
      p.log.info(`The icons need ${names}: ${command}`);
    }
  }
  if (!isTypeScript(root)) {
    p.log.warn("The icons are TypeScript (.tsx). Vite and Next.js compile them as they are; other setups may need TypeScript added.");
  }

  p.note(usage(icons[0], importPath(root, dir)), "Use it");
  p.outro(`Added ${plural(icons.length, "icon")}. Browse the rest at https://iconspace.dev`);
}

function resolveNames(catalog, names) {
  const icons = [];
  const unknown = [];
  for (const name of names) {
    const icon = findIcon(catalog, name);
    if (icon) icons.push(icon);
    else unknown.push(name);
  }
  if (unknown.length) {
    const hints = unknown.map((name) => {
      const close = suggest(catalog, name);
      return `"${name}"${close.length ? ` (did you mean ${close.join(", ")}?)` : ""}`;
    });
    throw new CliError(`No icon called ${hints.join(", ")}. See them all with \`npx iconspace list\`.`);
  }
  return [...new Map(icons.map((icon) => [icon.id, icon])).values()];
}

// How well an icon's name answers a search: "lock" should list Lock before Clock.
function rank(icon, search) {
  const name = [icon.id, icon.name.toLowerCase()];
  if (name.includes(search)) return 3;
  if (name.some((word) => word.startsWith(search))) return 2;
  return icon.keywords.some((word) => word.startsWith(search)) ? 1 : 0;
}

async function pickIcons(catalog) {
  const all = catalog.map((icon) => ({ value: icon, label: icon.name, hint: icon.keywords.slice(0, 3).join(", ") }));
  return ask(
    p.autocompleteMultiselect({
      message: "Which icons?",
      // Every icon, best matches first; `filter` then drops the misses. (The
      // full list stays, so icons picked under an earlier search still show.)
      options() {
        const search = this.userInput.trim().toLowerCase();
        return search ? all.toSorted((a, b) => rank(b.value, search) - rank(a.value, search)) : all;
      },
      filter: (search, option) => {
        const words = [option.value.id, option.value.name, ...option.value.keywords].join(" ").toLowerCase();
        return search.toLowerCase().split(/\s+/).every((term) => words.includes(term));
      },
      maxItems: 10,
      required: true,
    }),
  );
}

/** How a component uses the icon, imported through `from` (see importPath). */
function usage(icon, { path: dir, from }) {
  const path = `${dir}/${icon.file.replace(/\.tsx$/, "")}`;
  const where = from ? [`// Paths as written in a file in ${from}`] : [];
  if (icon.interactive) {
    return [
      ...where,
      `import { ${icon.component} } from "${path}";`,
      "",
      `// ${icon.name} animates itself on hover.`,
      `<${icon.component} width={24} height={24} />`,
    ].join("\n");
  }
  return [
    ...where,
    `import { ${icon.component} } from "${path}";`,
    `import type { IconHandle } from "${dir}/types";`,
    "",
    "const icon = useRef<IconHandle>(null);",
    "",
    "<button onMouseEnter={() => icon.current?.playAnimation()}>",
    `  <${icon.component} ref={icon} width={24} height={24} />`,
    "</button>",
  ].join("\n");
}

/* ── list ────────────────────────────────────────────────── */

async function list(options) {
  const catalog = await fetchCatalog(registryUrl(options.registry));
  if (options.json) return console.log(JSON.stringify(catalog, null, 2));
  const width = Math.max(...catalog.map((icon) => icon.id.length));
  const component = Math.max(...catalog.map((icon) => icon.component.length));
  console.log(`${catalog.length} icons. Add one with \`npx iconspace add <id>\`.\n`);
  for (const icon of catalog) {
    console.log(`  ${icon.id.padEnd(width)}  ${icon.component.padEnd(component)}  ${icon.keywords.join(", ")}`);
  }
}

/* ── mcp ─────────────────────────────────────────────────── */

async function mcp([sub], options) {
  if (sub === undefined) {
    p.intro("IconSpace MCP server");
    p.note(instructions(MCP_URL).join("\n\n"), MCP_URL);
    p.outro("Then ask your assistant for an icon, e.g. \"add an animated cart icon to the checkout button\".");
    return;
  }
  if (sub !== "init") throw new CliError(`There's no "mcp ${sub}" command. Try \`npx iconspace mcp init\`.`);

  const root = projectRoot(options.cwd);
  p.intro("IconSpace MCP server");
  let clients = options.client ?? [];
  const unknown = clients.filter((client) => !CLIENTS[client]);
  if (unknown.length) {
    throw new CliError(`Unknown client ${unknown.map((client) => `"${client}"`).join(", ")}. Use ${Object.keys(CLIENTS).join(", ")}.`);
  }
  if (!clients.length) {
    if (!options.interactive) throw new CliError(`Name the client: --client ${Object.keys(CLIENTS).join(" | ")}.`);
    clients = await ask(
      p.multiselect({
        message: "Which tools should use IconSpace in this project?",
        options: Object.entries(CLIENTS).map(([value, client]) => ({ value, label: client.label, hint: client.file })),
        required: true,
      }),
    );
  }
  for (const client of clients) {
    const { file, label } = CLIENTS[client];
    const result = writeClientConfig(root, client);
    const what = { created: "Added IconSpace to", updated: "Updated IconSpace in", unchanged: "Already set up:" }[result];
    p.log.success(`${what} ${file} (${label})`);
  }
  p.outro(`Restart ${join_(clients.map((client) => CLIENTS[client].label))} to load it.`);
}

/* ── helpers ─────────────────────────────────────────────── */

function projectRoot(cwd) {
  const root = findRoot(cwd);
  if (!root) throw new CliError(`There's no package.json in ${cwd} or above it. Run this in your project's folder.`);
  return root;
}

/** Awaits a prompt; leaves quietly when the person cancels it. */
async function ask(prompt) {
  const answer = await prompt;
  if (p.isCancel(answer)) {
    p.cancel("Cancelled. Nothing was changed.");
    process.exit(0);
  }
  return answer;
}

async function step(label, run, interactive) {
  if (!interactive) return run();
  const spin = p.spinner();
  spin.start(label);
  try {
    const result = await run();
    spin.stop(label);
    return result;
  } catch (error) {
    spin.error(label);
    throw error;
  }
}

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

const join_ = (items) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

// What the CLI needs to know about the project it's run in: where it starts,
// where icons should go, how files there are imported, and which package
// manager installs its dependencies.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** The nearest folder at or above `cwd` with a package.json. */
export function findRoot(cwd) {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (existsSync(join(dir, "package.json"))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

export function readPackage(root) {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    return {};
  }
}

/** "motion@^12.4" → "motion"; "@scope/pkg@1" → "@scope/pkg". */
export const packageName = (spec) => spec.replace(/(?<=.)@.*$/, "");

export const hasDependency = (pkg, spec) =>
  Boolean(pkg.dependencies?.[packageName(spec)] || pkg.devDependencies?.[packageName(spec)]);

/** Next to the project's other components: src/components/icons when there's a src folder. */
export const defaultDir = (root) => (existsSync(join(root, "src")) ? "src/components/icons" : "components/icons");

// tsconfig allows comments and trailing commas; strip both (outside strings).
function readJsonc(path) {
  const text = readFileSync(path, "utf8")
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match, string) => string ?? "")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(text);
}

/**
 * How code imports `dir`: through a path alias when the project has one that
 * covers it ("@/components/icons"). Without one, the relative path from a file
 * directly in src/ (where App.tsx lives), or from the project root.
 */
export function importPath(root, dir) {
  const target = resolve(root, dir);
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    try {
      const { compilerOptions = {} } = readJsonc(file);
      const base = resolve(root, compilerOptions.baseUrl ?? ".");
      for (const [alias, [first] = []] of Object.entries(compilerOptions.paths ?? {})) {
        if (!alias.endsWith("/*") || !first?.endsWith("/*")) continue;
        const from = resolve(base, first.slice(0, -2));
        const rest = relative(from, target);
        if (!rest.startsWith("..") && !rest.startsWith(sep) && rest !== "") {
          return { path: `${alias.slice(0, -2)}/${rest.split(sep).join("/")}` };
        }
      }
    } catch {
      // An unreadable config just means no alias.
    }
  }
  const src = join(root, "src");
  const from = relative(src, target).startsWith("..") ? root : src;
  return {
    path: `./${relative(from, target).split(sep).join("/")}`,
    from: from === src ? "src/" : "the project root",
  };
}

export const isTypeScript = (root) => existsSync(join(root, "tsconfig.json"));

const LOCKFILES = [
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

/** The project's package manager: its lockfile (here or up in a monorepo), else whatever ran this CLI. */
export function packageManager(root) {
  for (let dir = root; ; dir = dirname(dir)) {
    for (const [file, manager] of LOCKFILES) if (existsSync(join(dir, file))) return manager;
    if (dirname(dir) === dir) break;
  }
  const agent = process.env.npm_config_user_agent ?? "";
  return ["pnpm", "yarn", "bun"].find((manager) => agent.startsWith(manager)) ?? "npm";
}

export const installArgs = (manager, deps) => [manager === "npm" ? "install" : "add", ...deps];

/** Runs the install in the foreground; resolves true when it succeeds. */
export function install(root, manager, deps) {
  return new Promise((done) => {
    const child = spawn(manager, installArgs(manager, deps), {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", () => done(false));
    child.on("close", (code) => done(code === 0));
  });
}

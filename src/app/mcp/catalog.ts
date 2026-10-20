import registry from "@/generated/registry.json";

// The icons the MCP server hands out, built from src/icons by
// scripts/build-registry.mjs (the same files `npx iconspace add` installs).

export type CatalogIcon = (typeof registry.icons)[number];

export const HOMEPAGE = registry.homepage;
export const ICONS: CatalogIcon[] = registry.icons;

export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

const RUNNERS: Record<PackageManager, string> = {
  npm: "npx",
  pnpm: "pnpm dlx",
  // Yarn 1 has no dlx, so Yarn installs the CLI first.
  yarn: "yarn add -D iconspace && yarn",
  bun: "bunx",
};

export const findIcon = (id: string) => {
  const key = normalise(id);
  return ICONS.find((icon) => icon.id === key || normalise(icon.component) === key || normalise(icon.name) === key);
};

const normalise = (text: string) =>
  text.trim().toLowerCase().replace(/icon$/, "").replace(/[\s_]+/g, "-");

/** Best matches first; every icon for an empty query. */
export function searchIcons(query: string, limit = 20) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return ICONS.slice(0, limit);
  return ICONS.map((icon) => {
    const words = [icon.id, icon.name.toLowerCase(), ...icon.keywords];
    let score = 0;
    for (const term of terms) {
      if (icon.id === term) score += 100;
      else if (words.includes(term)) score += 40;
      // Either way round for longer words, so "carts" still finds "cart".
      else if (words.some((word) => word.startsWith(term) || (word.length > 3 && term.startsWith(word)))) score += 20;
      else if (words.some((word) => word.includes(term))) score += 10;
    }
    return { icon, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ icon }) => icon);
}

export function installCommand(ids: string[], manager: PackageManager = "npm") {
  return `${RUNNERS[manager]} iconspace add ${ids.join(" ")}`;
}

/** How a component uses the icon once its files sit in `dir`. */
export function usage(icon: CatalogIcon, dir = "@/components/icons") {
  const from = `${dir}/${icon.file.replace(/\.tsx$/, "")}`;
  if (icon.interactive) {
    return `import { ${icon.component} } from "${from}";

// ${icon.name} animates itself on hover; size and colour it like any SVG.
<${icon.component} width={24} height={24} className="text-foreground" />`;
  }
  return `"use client";

import { useRef } from "react";
import { ${icon.component} } from "${from}";
import type { IconHandle } from "${dir}/types";

export function Example() {
  const icon = useRef<IconHandle>(null);
  return (
    <button type="button" onMouseEnter={() => icon.current?.playAnimation()}>
      <${icon.component} ref={icon} width={24} height={24} aria-hidden />
    </button>
  );
}`;
}

export const summary = ({ id, name, component, keywords, interactive }: CatalogIcon) => ({
  id,
  name,
  component,
  keywords,
  trigger: interactive ? "self (on hover)" : "ref.playAnimation()",
});

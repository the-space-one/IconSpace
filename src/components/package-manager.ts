"use client";

import { useSyncExternalStore } from "react";

// The package manager picked in the install card. The basket's command uses
// it too, so both always say the same thing.

export const MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type Manager = (typeof MANAGERS)[number];

/** What runs the CLI, per manager. Yarn 1 has no dlx, so Yarn installs it first. */
export const RUNNERS: Record<Manager, string> = {
  npm: "npx",
  pnpm: "pnpm dlx",
  yarn: "yarn add -D iconspace && yarn",
  bun: "bunx",
};

let current: Manager = "npm";
const listeners = new Set<() => void>();

export function setManager(next: Manager) {
  current = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useManager = () => useSyncExternalStore(subscribe, () => current, () => "npm" as Manager);

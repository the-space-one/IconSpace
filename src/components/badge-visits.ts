// The footer badges this browser has earned and opened. A visit earns the next
// badge, at most one per day; it then waits in the footer, ready to open,
// until the visitor clicks it. Kept in localStorage; when storage is
// unavailable (private mode, blocked site data) it lives in memory for the
// page view and simply isn't kept.

const KEY = "iconspace:badges";
const MAX = 4;

type Saved = { earned: number; opened: number; last: string };

let memory: Saved = { earned: 0, opened: 0, last: "" };
const listeners = new Set<() => void>();

function today() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const clamp = (n: number, max: number) => Math.min(Math.max(Math.floor(n), 0), max);

function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return memory;
    const { earned, opened, last } = JSON.parse(raw);
    if (typeof earned !== "number" || typeof last !== "string") return memory;
    const kept = clamp(earned, MAX);
    // Records from before opening existed: everything earned counts as opened.
    return { earned: kept, opened: typeof opened === "number" ? clamp(opened, kept) : kept, last };
  } catch {
    return memory;
  }
}

function write(record: Saved) {
  memory = record;
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {}
  listeners.forEach((listener) => listener());
}

/** For useSyncExternalStore: told whenever a badge is earned or opened. */
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readEarned() {
  return read().earned;
}

export function readOpened() {
  return read().opened;
}

/** Counts today's visit, once per day, earning the next badge. */
export function award() {
  const record = read();
  const day = today();
  if (record.last === day || record.earned >= MAX) return;
  write({ ...record, earned: record.earned + 1, last: day });
}

/** Opens the oldest badge that is waiting to be opened. */
export function open() {
  const record = read();
  if (record.opened >= record.earned) return;
  write({ ...record, opened: record.opened + 1 });
}

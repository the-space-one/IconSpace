// One gift per return visit, with a full 24 hours between rewards. Unix
// timestamps are UTC; only the UI formats the eligibility time locally.
const KEY = "iconspace:badges";
const MAX = 4;
const DAY = 24 * 60 * 60 * 1000;

type Saved = { earned: number; opened: number; lastRewardAt: number };
let memory: Saved = { earned: 0, opened: 0, lastRewardAt: 0 };
let visited = false;
const listeners = new Set<() => void>();
const clamp = (n: number, max: number) => Math.min(Math.max(Math.floor(n), 0), max);

function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return memory;
    const saved = JSON.parse(raw);
    if (!saved || !Number.isFinite(saved.earned)) return memory;
    const earned = clamp(saved.earned, MAX);
    const opened = Number.isFinite(saved.opened) ? clamp(saved.opened, earned) : earned;
    const lastRewardAt = Number.isFinite(saved.lastRewardAt) && saved.lastRewardAt > 0
      ? saved.lastRewardAt : 0;
    // Old date-only records cannot prove when the last reward was earned.
    // Preserve opened badges and at most one gift; award() starts a new wait.
    return { earned: Math.min(earned, opened + 1), opened, lastRewardAt };
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

/** Storage events keep other open tabs in sync without awarding a badge. */
export function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readEarned() { return read().earned; }
export function readOpened() { return read().opened; }
export function readNextEligibleAt() {
  const record = read();
  return record.lastRewardAt ? record.lastRewardAt + DAY : 0;
}

/** Called on arrival only, never on a timer or when opening a gift. */
export function award() {
  if (visited) return;
  visited = true;
  const record = read();
  const now = Date.now();
  if (record.earned > 0 && !record.lastRewardAt) {
    write({ ...record, lastRewardAt: now });
    return;
  }
  if (record.earned >= MAX || record.earned > record.opened) return;
  if (record.lastRewardAt && now - record.lastRewardAt < DAY) return;
  write({ ...record, earned: record.earned + 1, lastRewardAt: now });
}

/** Claiming an old gift cannot expose another gift on this visit or reload. */
export function open() {
  const record = read();
  if (record.opened >= record.earned) return;
  write({ ...record, opened: record.opened + 1,
    lastRewardAt: Math.max(record.lastRewardAt, Date.now()) });
}

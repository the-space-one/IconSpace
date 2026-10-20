"use client";

import { useSyncExternalStore } from "react";

// The icons picked off the shelves, in the order they were picked. Adding one
// from a tile also queues a toss: where its glyph starts on screen, so the
// basket can fly it into its slot. An icon counts as in the basket at once;
// its slot shows when the toss lands.

/** A glyph's centre on screen and its scale (tile glyphs are 60px at 1×). */
export type Origin = { x: number; y: number; scale: number };
export type Toss = { key: number; id: string; from: Origin };
type State = { items: string[]; tosses: Toss[] };

const EMPTY: State = { items: [], tosses: [] };
let state = EMPTY;
let serial = 0;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const basket = {
  add(id: string, from?: Origin) {
    if (state.items.includes(id)) return;
    set({
      items: [...state.items, id],
      tosses: from ? [...state.tosses, { key: ++serial, id, from }] : state.tosses,
    });
  },
  remove(id: string) {
    set({ items: state.items.filter((item) => item !== id), tosses: state.tosses.filter((toss) => toss.id !== id) });
  },
  /** A toss reached its slot (or was skipped). */
  land(key: number) {
    if (!state.tosses.some((toss) => toss.key === key)) return;
    set({ ...state, tosses: state.tosses.filter((toss) => toss.key !== key) });
  },
  clear() {
    set(EMPTY);
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useBasket = () => useSyncExternalStore(subscribe, () => state, () => EMPTY);

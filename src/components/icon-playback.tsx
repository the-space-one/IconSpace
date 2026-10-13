"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { TIMING, type MotionRun, type PreviewTarget } from "./icon-motion";

type Source = "hover" | "focus" | "touch";
type Runs = Record<string, MotionRun>;
type Selection = { target: PreviewTarget | null; shown: boolean };
type Playback = {
  runs: Runs;
  selection: Selection;
  play: (target: PreviewTarget) => void;
  /** The icon finished its timeline; end the run (and its retrigger guard). */
  finish: (instanceId: string) => void;
  preview: (source: Source, target: PreviewTarget, shown: boolean) => void;
  registerShelf: (element: HTMLElement, slots: PreviewTarget[]) => () => void;
};
const Context = createContext<Playback | null>(null);

/* ANIMATION STORYBOARD
 *   0ms   SSR renders complete resting artwork; observe visible shelves
 * 250ms   first visible shelf begins its one-time introduction
 * +90ms   each following icon starts; copies share one timestamp
 * input   run once; ignore retriggers until the icon reports it's done
 * hidden  clear pending work and show resting artwork
 */
export function IconPlaybackProvider({ children }: { children: ReactNode }) {
  const [runs, setRuns] = useState<Runs>({});
  const [selection, setSelection] = useState<Selection>({ target: null, shown: false });
  const active = useRef<Runs>({});
  const sources = useRef<Partial<Record<Source, PreviewTarget>>>({});
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const finishes = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const shelves = useRef(new Map<HTMLElement, PreviewTarget[]>());
  const observer = useRef<IntersectionObserver | null>(null);
  const introduced = useRef(false);
  const reduced = useRef(true); // fail safely until the media query is known
  const serial = useRef(0);

  const publishSelection = useCallback(() => {
    const target = sources.current.hover ?? sources.current.focus ?? sources.current.touch;
    setSelection((last) => {
      if (last.shown === Boolean(target) && (!target || last.target?.instanceId === target.instanceId)) return last;
      return { target: target ?? last.target, shown: Boolean(target) };
    });
  }, []);

  const preview = useCallback((source: Source, target: PreviewTarget, shown: boolean) => {
    if (shown) sources.current[source] = target;
    else if (sources.current[source]?.instanceId === target.instanceId) delete sources.current[source];
    publishSelection();
  }, [publishSelection]);

  const finish = useCallback((instanceId: string) => {
    if (!active.current[instanceId]) return;
    clearTimeout(finishes.current.get(instanceId));
    finishes.current.delete(instanceId);
    const next = { ...active.current };
    delete next[instanceId];
    active.current = next;
    setRuns(next);
    if (sources.current.touch?.instanceId === instanceId) {
      delete sources.current.touch;
      publishSelection();
    }
  }, [publishSelection]);

  const play = useCallback((target: PreviewTarget) => {
    const { instanceId } = target;
    clearTimeout(pending.current.get(instanceId));
    pending.current.delete(instanceId);
    if (reduced.current || document.hidden || active.current[instanceId]) return;
    const run = { id: ++serial.current, startedAt: performance.now() };
    active.current = { ...active.current, [instanceId]: run };
    setRuns(active.current);
    finishes.current.set(instanceId, setTimeout(() => finish(instanceId), TIMING.maxRun));
  }, [finish]);

  const registerShelf = useCallback((element: HTMLElement, slots: PreviewTarget[]) => {
    shelves.current.set(element, slots);
    observer.current?.observe(element);
    return () => {
      shelves.current.delete(element);
      observer.current?.unobserve(element);
    };
  }, []);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = media.matches;
    const scheduled = pending.current;
    const endings = finishes.current;
    const cancel = () => {
      scheduled.forEach(clearTimeout);
      scheduled.clear();
      endings.forEach(clearTimeout);
      endings.clear();
      active.current = {};
      setRuns({});
      delete sources.current.touch;
      publishSelection();
    };
    const onPreference = () => {
      reduced.current = media.matches;
      if (media.matches) {
        introduced.current = true;
        cancel();
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        introduced.current = true;
        cancel();
      }
    };
    const onOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-motion-tile]")) {
        delete sources.current.touch;
        publishSelection();
      }
    };
    const onWindowBlur = () => {
      sources.current = {};
      publishSelection();
    };
    const io = new IntersectionObserver((entries) => {
      if (introduced.current || document.hidden) return;
      const first = entries.filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.25)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!first) return;
      introduced.current = true;
      io.disconnect();
      if (reduced.current) return;
      const slots = shelves.current.get(first.target as HTMLElement);
      if (!slots) return;
      slots.forEach((slot, index) => {
        // An early interaction already demonstrates this icon.
        if (active.current[slot.instanceId]) return;
        scheduled.set(slot.instanceId, setTimeout(() => {
          scheduled.delete(slot.instanceId);
          play(slot);
        }, TIMING.introduction + index * TIMING.stagger));
      });
    }, { threshold: [0, 0.25] });
    observer.current = io;
    shelves.current.forEach((_, element) => io.observe(element));
    media.addEventListener("change", onPreference);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerdown", onOutside);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      io.disconnect();
      observer.current = null;
      media.removeEventListener("change", onPreference);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", onOutside);
      window.removeEventListener("blur", onWindowBlur);
      scheduled.forEach(clearTimeout);
      scheduled.clear();
      endings.forEach(clearTimeout);
      endings.clear();
      active.current = {};
    };
  }, [play, publishSelection]);

  const value = useMemo(() => ({ runs, selection, play, finish, preview, registerShelf }),
    [runs, selection, play, finish, preview, registerShelf]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useIconPlayback() {
  const context = useContext(Context);
  if (!context) throw new Error("Icon playback needs IconPlaybackProvider");
  return context;
}

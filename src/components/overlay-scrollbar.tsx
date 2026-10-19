"use client";

import { useEffect, useRef } from "react";

// Gap between the thumb and the top and bottom of the window, and its
// shortest length on a very long page.
const INSET = 3;
const MIN_SIZE = 32;
// How long the thumb lingers after scrolling stops.
const LINGER = 900;

/**
 * The page's scrollbar, drawn over the content instead of beside it. The
 * native one is hidden in globals.css, so the page keeps its full width. The
 * thumb fades in while the page scrolls and out once it settles, and stays
 * while it's hovered or dragged. Position and size are written straight to
 * the element, so scrolling never re-renders React.
 */
export function OverlayScrollbar() {
  const thumb = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = thumb.current;
    if (!el) return;
    const root = document.documentElement;
    let size = 0;
    let track = 0;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hovered = false;
    let drag: { y: number; top: number } | null = null;

    const layout = () => {
      frame = 0;
      const max = root.scrollHeight - root.clientHeight;
      el.hidden = max <= 0;
      if (max <= 0) return;
      track = root.clientHeight - 2 * INSET;
      size = Math.max((track * root.clientHeight) / root.scrollHeight, MIN_SIZE);
      el.style.height = `${size}px`;
      el.style.transform = `translateY(${INSET + (scrollY / max) * (track - size)}px)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(layout);
    };
    const hide = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!hovered && !drag) delete el.dataset.active;
      }, LINGER);
    };
    const onScroll = () => {
      schedule();
      el.dataset.active = "";
      hide();
    };

    const onEnter = () => {
      hovered = true;
    };
    const onLeave = () => {
      hovered = false;
      hide();
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
      drag = { y: event.clientY, top: scrollY };
      el.dataset.dragging = "";
    };
    const onMove = (event: PointerEvent) => {
      if (!drag) return;
      // One pixel of thumb travel is this many pixels of page.
      const ratio = (root.scrollHeight - root.clientHeight) / (track - size);
      scrollTo({ top: drag.top + (event.clientY - drag.y) * ratio, behavior: "instant" });
    };
    const onUp = () => {
      drag = null;
      delete el.dataset.dragging;
      hide();
    };

    layout();
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    observer.observe(document.body);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", schedule);
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      observer.disconnect();
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", schedule);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // A 12px hit area around a 6px bar. Only a mouse can grab it: on touch
  // screens a finger near the edge should scroll the page, not drag the bar.
  return (
    <div
      ref={thumb}
      aria-hidden
      hidden
      className="group/scrollbar pointer-events-none fixed top-0 right-0 z-50 w-3 opacity-0 transition-opacity duration-300 ease-out select-none data-active:pointer-fine:pointer-events-auto data-active:opacity-100 data-active:duration-150 motion-reduce:transition-none"
    >
      <div className="mx-auto h-full w-1.5 rounded-full bg-black/25 transition-colors duration-150 group-hover/scrollbar:bg-black/40 group-data-dragging/scrollbar:bg-black/50" />
    </div>
  );
}

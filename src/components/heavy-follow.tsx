"use client";

import { useEffect, useRef, type ReactNode } from "react";

// How long the machine waits before reacting to a scroll, in ms. This is the
// main "heavy" feel: the page moves, and only then does the machine start.
const DELAY = 220;
// Spring toward the (delayed) scroll position. Low stiffness makes it slow to
// get going; damping below critical (~12.3 here) lets it overshoot when it
// arrives and swing back, like something heavy moving at full speed.
const STIFFNESS = 38;
const DAMPING = 7.5;

// Like `position: sticky`: once its top scrolls to `top` px from the top of the
// viewport, it follows the page, but lags behind and overshoots, like heavy
// machinery on a rail. Stops at the bottom of the nearest <main>.
export function HeavyFollow({
  children,
  className,
  top = 120,
}: {
  children: ReactNode;
  className?: string;
  top?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

    // Scroll targets waiting out the delay, oldest first.
    const queue: { t: number; y: number }[] = [];
    let goal = 0;
    let y = 0;
    let v = 0;
    let max = 0;
    let start = 0;
    let last = 0;
    let frame = 0;

    const apply = () => {
      el.style.transform = `translate3d(0, ${y}px, 0)`;
    };

    // Where following starts (scroll position at which its resting top hits
    // `top`) and the furthest it may travel (its bottom meets <main>'s bottom).
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const bounds = el.closest("main") ?? document.body;
      start = rect.top - y + window.scrollY - top;
      max = Math.max(0, bounds.getBoundingClientRect().bottom - (rect.bottom - y));
    };

    const target = () => Math.min(Math.max(window.scrollY - start, 0), max);

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      while (queue.length && queue[0].t <= now - DELAY) goal = queue.shift()!.y;

      // Semi-implicit Euler in small steps keeps the spring stable.
      const steps = 4;
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        v += (STIFFNESS * (goal - y) - DAMPING * v) * h;
        y += v * h;
      }

      if (!queue.length && Math.abs(goal - y) < 0.1 && Math.abs(v) < 0.1) {
        y = goal;
        v = 0;
        frame = 0;
      } else {
        frame = requestAnimationFrame(tick);
      }
      apply();
    };

    const onScroll = () => {
      if (reducedMotion.matches) {
        y = goal = target();
        apply();
        return;
      }
      queue.push({ t: performance.now(), y: target() });
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };

    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    y = goal = target();
    apply();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [top]);

  return (
    <div ref={ref} className={`will-change-transform ${className ?? ""}`}>
      {children}
    </div>
  );
}

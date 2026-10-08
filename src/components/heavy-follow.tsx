"use client";

import { useEffect, useRef, type ReactNode } from "react";

const DELAY = 220;
const STIFFNESS = 38;
const DAMPING = 7.5;

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

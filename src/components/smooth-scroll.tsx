"use client";

import { ReactLenis } from "lenis/react";
import type { ReactNode } from "react";

// Global smooth-scroll provider (Lenis). `root` binds Lenis to the page's own
// scroller — no wrapper div — and auto-runs its RAF loop. Lenis still drives the
// real window scroll position, so IntersectionObserver-based reveals keep working.
export function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis
      root
      options={{
        // Interpolation factor per frame — lower is smoother/heavier, higher is
        // snappier. 0.1 is Lenis's default and feels natural without lag.
        lerp: 0.1,
        smoothWheel: true,
      }}
    >
      {children}
    </ReactLenis>
  );
}

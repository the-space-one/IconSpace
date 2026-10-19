"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

/*
 * The background hedges, breathing: public/hero/hedges.riv, built from the
 * scene's own hedge paths by scripts/rig-hedges.mjs.
 *
 * `children` is the SVG of those paths at rest. It shows until the first
 * Rive frame is drawn, and again for reduced motion; frame 0 is the same
 * pose, so the swap doesn't show. The runtime loads after hydration.
 *
 * The canvas sits in the shop's back stage, in art units, over the band the
 * artboard covers. The stage is scaled with a transform, which the canvas's
 * own size doesn't see, so its drawing surface is sized by its on-screen box.
 */

// The artboard's band of the 1579×675 art (BAND in scripts/rig-hedges.mjs).
const BAND = { y: 156, width: 1579, height: 168 };

type Rect = { x: number; y: number; width: number; height: number };

// The card clearing the SVG fades around in the overlay layout, as a mask
// image over the band.
function clearingMask({ x, y, width, height }: Rect) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${BAND.y} ${BAND.width} ${BAND.height}">` +
    `<filter id="b" filterUnits="userSpaceOnUse" x="0" y="0" width="1579" height="675"><feGaussianBlur stdDeviation="10"/></filter>` +
    `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="1579" height="675"><rect width="1579" height="675" fill="#fff"/>` +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" filter="url(#b)"/></mask>` +
    `<rect width="1579" height="675" mask="url(#m)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribe = (onChange: () => void) => {
  const query = matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

export function Hedges({ clearing, children }: { clearing: Rect; children: ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const animate = useSyncExternalStore(subscribe, () => !matchMedia(REDUCED).matches, () => false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !animate) return;
    let cleanup = () => {};
    let cancelled = false;

    import("@rive-app/canvas-lite").then(({ Fit, Layout, Rive, RuntimeLoader }) => {
      if (cancelled) return;
      RuntimeLoader.setWasmUrl(new URL("@rive-app/canvas-lite/rive.wasm", import.meta.url).href);

      const rive = new Rive({
        src: "/hero/hedges.riv",
        canvas,
        stateMachine: "breathing",
        autoplay: true,
        layout: new Layout({ fit: Fit.Fill }),
        shouldDisableRiveListeners: true,
        onLoad: () => {
          rive.resizeDrawingSurfaceToCanvas();
          setPlaying(true);
        },
      });

      const resize = () => rive.resizeDrawingSurfaceToCanvas();
      // Nothing to draw while the hero is scrolled away.
      const onScreen = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) rive.startRendering();
        else rive.stopRendering();
      });
      onScreen.observe(canvas);
      window.addEventListener("resize", resize);

      cleanup = () => {
        window.removeEventListener("resize", resize);
        onScreen.disconnect();
        rive.cleanup();
        setPlaying(false);
      };
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [animate]);

  return (
    <>
      <div hidden={playing}>{children}</div>
      <canvas
        ref={ref}
        aria-hidden
        style={{ "--clearing": clearingMask(clearing) } as CSSProperties}
        className={`pointer-events-none absolute top-39 left-0 h-42 w-[1579px] mask-no-repeat mask-size-[100%_100%] xl:mask-(--clearing) ${playing ? "" : "invisible"}`}
      />
    </>
  );
}

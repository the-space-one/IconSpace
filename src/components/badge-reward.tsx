"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BadgeArt, type BadgeDef } from "./badge";
import { rig } from "./badge-motion";
import tiles from "./badge-motion.module.css";
import styles from "./badge-reward.module.css";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — opening a badge, like a chest in a game
 *
 *  click  the gift shakes in its tile until this ceremony is ready
 *         (at least 260ms), so a slow load never shows an empty tile
 *    0ms  LAUNCH, in one frame: the lid flies off and the gift pops
 *         (CSS, [data-launch]); dialog opens; the dim fades in
 *         FLY IN: the badge rises out of the gift, from 40% of the tile
 *         and transparent, to the centre on an arc. Two wrappers, two
 *         curves: x + scale ease-in-out (travels), y ease-out (rises
 *         first, so the path bends); opacity in over the first 20%
 *  650ms  LAND: squash and settle (420ms); sparkles burst; glow and
 *         rays bloom; rays turn slowly           phase "hold"
 *  900ms  title rises in
 * 1010ms  the badge plays its own storyboard, once it has settled
 * 2950ms  hold ends (sooner on a tap or Escape)
 *         rays and title fade; the badge inhales  phase "out"
 * 3170ms  FLY BACK: centre → tile, re-measured, dropping into the slot
 *                                                 phase "back"
 * 3720ms  the tile shows the badge with a squash and a burst; dialog closes
 *
 * Only transform and opacity ever animate. The flights are WAAPI (measured
 * once each, off the main thread where the browser allows); everything
 * else is CSS keyed on the dialog's data-phase (badge-reward.module.css).
 * The badge is laid out at its centre size (CSS zoom), so its resting
 * frame is drawn sharp rather than scaled up.
 * Reduced motion: no flight, nothing moves; the dialog crossfades.
 * ───────────────────────────────────────────────────────── */
const TIMING = {
  anticipate: 260, // shortest shake before the launch
  flyIn: 650,      // gift → centre
  settle: 360,     // landing squash before the badge plays its own storyboard
  hold: 2300,      // at the centre, before flying back on its own
  skipHold: 500,   // shortest hold when skipped during the flight
  fadeOut: 220,    // rays and title leave, the badge inhales
  flyBack: 550,    // centre → tile
  fade: 300,       // reduced motion: crossfade in and out
};

/** The badge leaves the gift at this fraction of the tile's size. */
const EMERGE = 0.4;

const EASE = {
  travel: "cubic-bezier(0.645, 0.045, 0.355, 1)", // ease-in-out-cubic
  rise: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",   // ease-out-quad
  drop: "cubic-bezier(0.55, 0.06, 0.68, 0.19)",   // ease-in, falls into the slot
};

/** The badge's size at the centre, as a multiple of its tile. */
const centreScale = () => Math.min(2.6, (Math.min(innerWidth, innerHeight) * 0.5) / 110);

/** Slower phones skip the turning rays and half the sparkles. */
const isLite = () => {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return (navigator.hardwareConcurrency ?? 8) <= 4 || memory <= 2;
};

export function BadgeReward({
  badge,
  tile,
  openedAt,
  onLand,
  onDone,
}: {
  badge: BadgeDef;
  tile: HTMLElement;
  /** When the tile was clicked (performance.now()), so the shake has a floor. */
  openedAt: number;
  onLand: () => void;
  onDone: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const flyX = useRef<HTMLDivElement>(null);
  const flyY = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const skip = useRef<() => void>(() => {});
  const [scale] = useState(centreScale);

  useEffect(() => {
    const box = dialog.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animations: Animation[] = [];
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let alive = true;
    let skipped = false;
    let landed = false;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          resolve();
        }, ms);
        timers.add(timer);
      });
    const hold = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        timers.add(timer);
        skip.current = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    /** Flies the badge between its tile and the centre, measured right now. */
    const fly = (direction: "in" | "back") => {
      const from = tile.getBoundingClientRect();
      const to = anchor.current!.getBoundingClientRect();
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      // In, the badge rises out of the gift: smaller than the tile, fading in.
      // Back, it lands at exactly the tile's size, where the real one appears.
      const size = (from.width / to.width) * (direction === "in" ? EMERGE : 1);
      const far = { x: `translateX(${dx}px) scale(${size})`, y: `translateY(${dy}px)` };
      const near = { x: "translateX(0) scale(1)", y: "translateY(0)" };
      const [start, end] = direction === "in" ? [far, near] : [near, far];
      const duration = direction === "in" ? TIMING.flyIn : TIMING.flyBack;
      const frames: Keyframe[] =
        direction === "in"
          ? [{ transform: start.x, opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: end.x, opacity: 1 }]
          : [{ transform: start.x }, { transform: end.x }];
      const x = flyX.current!.animate(frames, {
        duration,
        easing: EASE.travel,
        fill: "both",
      });
      const y = flyY.current!.animate([{ transform: start.y }, { transform: end.y }], {
        duration,
        easing: direction === "in" ? EASE.rise : EASE.drop,
        fill: "both",
      });
      animations.push(x, y);
      return Promise.all([x.finished, y.finished]);
    };

    const phase = (name: string) => {
      box.dataset.phase = name;
    };
    const land = () => {
      if (landed) return;
      landed = true;
      onLand();
    };
    const finish = () => {
      if (!alive) return;
      alive = false;
      land();
      // Let the tile paint the badge before the flying copy disappears.
      frame().then(() => {
        if (box.open) box.close();
        // The button that opened it is gone; focus the badge in its place.
        document
          .querySelector<HTMLElement>(`[data-landed][data-badge="${badge.id}"]`)
          ?.focus({ preventScroll: true });
        onDone();
      });
    };

    skip.current = () => {
      skipped = true;
    };

    const run = async () => {
      tile.toggleAttribute("data-opening", true);
      if (reduced) box.dataset.reduced = "";
      if (isLite()) box.dataset.lite = "";
      await rig(art.current!, () => alive);
      // The gift has been shaking since the click; give it its minimum.
      if (!reduced) await wait(Math.max(0, TIMING.anticipate - (performance.now() - openedAt)));
      if (!alive) return;

      box.showModal();
      phase("in");
      tile.toggleAttribute("data-launch", true);
      await (reduced ? wait(TIMING.fade) : fly("in"));
      if (!alive) return;

      phase("hold");
      if (!reduced) {
        wait(TIMING.settle).then(() => {
          if (alive) art.current!.dataset.playing = "";
        });
      }
      await hold(skipped ? TIMING.skipHold : TIMING.hold);
      if (!alive) return;

      phase("out");
      await wait(TIMING.fadeOut);
      if (!alive) return;

      phase("back");
      await (reduced ? wait(TIMING.fade) : fly("back"));
      finish();
    };
    run().catch(finish);

    // A hidden tab (or a closed dialog) skips straight to the end.
    const onHidden = () => {
      if (!document.hidden) return;
      animations.forEach((animation) => animation.finish());
      finish();
    };
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onHidden);
      timers.forEach(clearTimeout);
      animations.forEach((animation) => animation.cancel());
      tile.toggleAttribute("data-opening", false);
      tile.toggleAttribute("data-launch", false);
      if (box.open) box.close();
    };
    // One ceremony per mount; the shelf remounts this for the next badge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="badge-reward-name"
      className={styles.dialog}
      onClick={() => skip.current()}
      onCancel={(event) => {
        event.preventDefault();
        skip.current();
      }}
    >
      <div className={styles.dim} />
      <div className={styles.centre}>
        <div style={{ "--k": scale } as CSSProperties} className={styles.stage}>
          <div aria-hidden className={styles.rays} />
          <div aria-hidden className={styles.glow} />
          <div aria-hidden className={styles.sparkles}>
            {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
          </div>
          <div ref={anchor} className={styles.anchor}>
            <div ref={flyY} className={styles.fly}>
              <div ref={flyX} className={styles.fly}>
                <div className={styles.squash}>
                  <div className={styles.grow}>
                    <div
                      ref={art}
                      aria-hidden
                      data-badge={badge.id}
                      data-duration={badge.duration}
                      className={`relative size-27.5 ${tiles.tile}`}
                    >
                      <BadgeArt badge={badge} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.title}>
          <p className={styles.eyebrow}>Badge unlocked</p>
          <h2 id="badge-reward-name" className={styles.name}>{badge.name}</h2>
        </div>
      </div>
    </dialog>
  );
}

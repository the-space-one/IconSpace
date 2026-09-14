"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useAnimate } from "motion/react-mini";
import { animate as animateValue, spring } from "motion";
import { EYES, HeroCatArtwork } from "@/components/hero-cat-artwork";
import { cn } from "@/lib/utils";

/* ANIMATION STORYBOARD — milliseconds after the visible greeting begins
 *    0  eyes notice; left ear perks
 *  180  head follows into a gentle 4° tilt
 *  450  recover the compression and hold
 *  750  original eyes → fuller happy crescents (200ms, one continuous pair)
 *  950  pleased hold and one small nod
 * 1250  reverse the same eye transformation (200ms), settle head
 * 1450  eyes open; head finishes settling
 * 1600  rest, or blend into the latest nearby pointer position
 *
 * One greeting per mount, never per scroll or render. Nearby movement cannot
 * swallow the intro. Deliberate activation can interrupt it; taps never queue.
 * Acknowledgment: eyes begin immediately; head anticipates 0–80ms, nods
 * 80–240ms; happy hold through 500ms; eyes + head release 500–700ms.
 */
const TIMING = {
  greetDelay: 150, follow: 180, hold: 450, pleased: 750, nod: 950,
  settle: 1250, finish: 1600,
  expression: 200, gaze: 140, ears: 180, pose: 270, recover: 120, return: 350,
  ackNod: 80, ackHold: 240, ackRelease: 500, ackFinish: 700,
};
const FEEL = {
  ease: [0.645, 0.045, 0.355, 1] as const,
  settle: { type: spring, duration: TIMING.return / 1000, bounce: 0.08 },
  gazeSpring: { stiffness: 450, damping: 32, mass: 0.5 },
  headSpring: { stiffness: 230, damping: 28, mass: 0.8 },
  radius: 140, gazeX: 6, gazeY: 4, headX: 2, headY: 1.5, headAngle: 3,
};
const REST = {
  head: "translate(0px, 0px) rotate(0deg) scale(1, 1)",
  gaze: "translate(0px, 0px)", leftEar: "rotate(0deg)", rightEar: "rotate(0deg)",
};
const POSES = {
  rest: REST,
  notice: { ...REST, gaze: "translate(3px, 1px)", leftEar: "rotate(-3deg)" },
  follow: {
    ...REST, head: "translate(1px, 1px) rotate(4deg) scale(1.02, 0.98)",
    gaze: "translate(3px, 1px)", leftEar: "rotate(-3deg)", rightEar: "rotate(1deg)",
  },
  hold: {
    ...REST, head: "translate(1px, 0px) rotate(4deg) scale(1, 1)",
    gaze: "translate(3px, 1px)", leftEar: "rotate(-2deg)", rightEar: "rotate(1deg)",
  },
  pleased: { ...REST, head: "translate(0px, 0px) rotate(1deg) scale(1, 1)" },
  nod: { ...REST, head: "translate(0px, 2px) rotate(1deg) scale(1.015, 0.985)" },
  anticipate: { ...REST, head: "translate(0px, 1px) rotate(-1deg) scale(1.02, 0.98)", leftEar: "rotate(-2deg)" },
};
type Pose = typeof REST;
type Control = { stop: () => void };

export function CuriousMascot({ className }: { className?: string }) {
  const [scope, animate] = useAnimate<HTMLButtonElement>();
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(0);
  const greeted = useRef(false);
  const activate = useRef<(keyboard: boolean) => void>(() => {});
  const eyeMaskId = useId();
  const expressionProgress = useMotionValue(0);
  const eyeTransform = useTransform(expressionProgress, (progress) =>
    `scaleY(${1 + (EYES.pleasedScaleY - 1) * progress})`);
  const lidTransform = useTransform(expressionProgress, (progress) =>
    `translateY(${(EYES.lid.pleasedY - EYES.lid.openY) * progress}px)`);
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const eyeX = useSpring(targetX, FEEL.gazeSpring);
  const eyeY = useSpring(targetY, FEEL.gazeSpring);
  const headX = useSpring(targetX, FEEL.headSpring);
  const headY = useSpring(targetY, FEEL.headSpring);
  const gazeTransform = useTransform([eyeX, eyeY], ([x, y]: number[]) =>
    `translate(${x * FEEL.gazeX}px, ${y * FEEL.gazeY}px)`);
  const headTransform = useTransform([headX, headY], ([x, y]: number[]) =>
    `translate(${x * FEEL.headX}px, ${y * FEEL.headY}px) rotate(${x * FEEL.headAngle}deg)`);

  useEffect(() => {
    const button = scope.current;
    if (!button) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let controls: Control[] = [];
    let eyeControl: Control | undefined;
    let expressionTarget: number | undefined;
    let visible = false;
    let active = false;
    let greeting = false;
    let acknowledging = false;
    let near = false;
    let latest = { x: 0, y: 0 };
    let center: { x: number; y: number } | null = null;

    const later = (fn: () => void, ms: number) => {
      const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
      timers.add(timer);
      return timer;
    };
    const clear = (stopExpression = false) => {
      timers.forEach(clearTimeout);
      timers.clear();
      controls.forEach((control) => control.stop());
      controls = [];
      if (stopExpression) {
        eyeControl?.stop();
        expressionTarget = undefined;
      }
    };
    const jumpTrackingToRest = () => {
      targetX.set(0); targetY.set(0);
      eyeX.jump(0); eyeY.jump(0); headX.jump(0); headY.jump(0);
    };
    // Body stages never own this controller. Same-target interruptions keep
    // running; opposite targets retarget from the current progress, not a pose.
    const showEyes = (pleased: boolean, instant = false) => {
      const target = pleased ? 1 : 0;
      if (!instant && expressionTarget === target) return;
      eyeControl?.stop();
      expressionTarget = target;
      button.dataset.catExpression = pleased ? "pleased" : "open";
      if (instant) expressionProgress.jump(target);
      else eyeControl = animateValue(expressionProgress, target, {
        duration: TIMING.expression / 1000, ease: FEEL.ease,
      });
    };
    const pose = (next: Pose, nextStage: number, instant = false, settle = false, ms = TIMING.pose) => {
      controls.forEach((control) => control.stop());
      const transition = instant ? { duration: 0 } : settle ? FEEL.settle : { duration: ms / 1000, ease: FEEL.ease };
      controls = [
        animate(".curious-cat__pose", { transform: next.head }, transition),
        animate(".curious-cat__gaze-pose", { transform: next.gaze }, { duration: instant ? 0 : Math.min(TIMING.gaze, ms) / 1000, ease: FEEL.ease }),
        animate(".curious-cat__ear--left", { transform: next.leftEar }, { duration: instant ? 0 : Math.min(TIMING.ears, ms) / 1000, ease: FEEL.ease }),
        animate(".curious-cat__ear--right", { transform: next.rightEar }, { duration: instant ? 0 : Math.min(TIMING.ears, ms) / 1000, ease: FEEL.ease }),
      ];
      setStage(nextStage);
    };
    const followLatest = () => {
      targetX.set(near ? latest.x : 0);
      targetY.set(near ? latest.y : 0);
      setStage(near ? 7 : 0);
    };
    const greet = () => {
      if (greeted.current || reduced) return;
      greeting = true; // Own the delay, too: a nearby cursor cannot eat it.
      later(() => {
        greeted.current = true;
        pose(POSES.notice, 1);
        later(() => pose(POSES.follow, 2), TIMING.follow);
        later(() => pose(POSES.hold, 3, false, false, TIMING.recover), TIMING.hold);
        later(() => {
          showEyes(true);
          pose(POSES.pleased, 4, false, false, TIMING.nod - TIMING.pleased);
        }, TIMING.pleased);
        later(() => pose(POSES.nod, 5), TIMING.nod);
        later(() => { showEyes(false); pose(POSES.rest, 6, false, true); }, TIMING.settle);
        later(() => { greeting = false; followLatest(); }, TIMING.finish);
      }, TIMING.greetDelay);
    };
    const measure = () => {
      const rect = button.getBoundingClientRect();
      center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const invalidate = () => { center = null; };
    const leave = () => {
      if (!near) return;
      near = false;
      latest = { x: 0, y: 0 };
      if (greeting || acknowledging) return;
      targetX.set(0); targetY.set(0);
      clear();
      pose(POSES.rest, 6, false, true);
      later(() => setStage(0), TIMING.return);
    };
    const pointer = (event: PointerEvent) => {
      if (!active || reduced || !fine.matches || event.pointerType === "touch") return;
      if (!center) measure();
      const dx = event.clientX - center!.x;
      const dy = event.clientY - center!.y;
      if (Math.hypot(dx, dy) > FEEL.radius) { leave(); return; }
      const entering = !near;
      near = true;
      latest = { x: dx / FEEL.radius, y: dy / FEEL.radius };
      if (greeting || acknowledging) return;
      if (entering) { clear(); pose(POSES.rest, 7); }
      targetX.set(latest.x); targetY.set(latest.y);
    };
    const hello = (keyboard: boolean) => {
      if (!active || acknowledging) return;
      clear();
      greeted.current = true;
      greeting = false;
      acknowledging = true;
      if (keyboard || reduced) {
        jumpTrackingToRest();
        showEyes(true, true);
        pose(POSES.rest, 9, true);
        later(() => {
          acknowledging = false; showEyes(false, true); pose(POSES.rest, 0, true);
        }, TIMING.ackFinish);
        return;
      }
      targetX.set(0); targetY.set(0);
      showEyes(true);
      pose(POSES.anticipate, 8, false, false, TIMING.ackNod);
      later(() => pose(POSES.nod, 8, false, false, TIMING.ackHold - TIMING.ackNod), TIMING.ackNod);
      later(() => {
        showEyes(false);
        pose(POSES.rest, 8, false, false, TIMING.ackFinish - TIMING.ackRelease);
      }, TIMING.ackRelease);
      later(() => { acknowledging = false; followLatest(); }, TIMING.ackFinish);
    };
    activate.current = hello;

    const updateActivity = () => {
      const next = visible && document.visibilityState === "visible";
      if (next === active) return;
      active = next;
      if (active) {
        center = null;
        showEyes(false, true);
        pose(POSES.rest, 0, true);
        greet();
        if (!reduced) window.addEventListener("pointermove", pointer, { passive: true });
      } else {
        if (greeting) greeted.current = true;
        window.removeEventListener("pointermove", pointer);
        clear(true);
        greeting = false; acknowledging = false; near = false;
        latest = { x: 0, y: 0 };
        jumpTrackingToRest();
        showEyes(false, true);
        pose(POSES.rest, 0, true);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      updateActivity();
    }, { threshold: 0 });
    observer.observe(button);
    const resize = new ResizeObserver(invalidate);
    resize.observe(button);
    // Invalidate measurements only; scrolling does not drive animation.
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", invalidate, { passive: true });
    document.addEventListener("visibilitychange", updateActivity);
    document.addEventListener("pointerleave", leave);
    fine.addEventListener("change", leave);
    return () => {
      clear(true);
      expressionProgress.jump(0);
      activate.current = () => {};
      observer.disconnect(); resize.disconnect();
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("scroll", invalidate);
      window.removeEventListener("resize", invalidate);
      document.removeEventListener("visibilitychange", updateActivity);
      document.removeEventListener("pointerleave", leave);
      fine.removeEventListener("change", leave);
      jumpTrackingToRest();
    };
  }, [animate, scope, reduced, targetX, targetY, eyeX, eyeY, headX, headY, expressionProgress]);

  return (
    <button ref={scope} type="button" aria-label="Say hello to the Icon Space cat"
      data-cat-stage={stage}
      onClick={(event) => activate.current(event.detail === 0)}
      className={cn("curious-cat grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-xl p-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8e94fd]", className)}>
      <svg viewBox="0 0 211 183" fill="none" aria-hidden="true" focusable="false" className="block w-full overflow-visible">
        <motion.g style={{ transform: headTransform, transformOrigin: "105px 170px", transformBox: "view-box" }}>
          <g className="curious-cat__pose">
            <HeroCatArtwork />
            <motion.g style={{ transform: gazeTransform }}>
              <g className="curious-cat__gaze-pose" fill="#8e94fd">
                {EYES.paths.map((d, index) => (
                  <g key={index}>
                    <defs>
                      <mask id={`${eyeMaskId}-eye-${index}`} maskUnits="userSpaceOnUse"
                        maskContentUnits="userSpaceOnUse" style={{ maskType: "luminance" }}
                        x={EYES.centers[index] - EYES.mask.halfWidth} y={EYES.mask.y}
                        width={EYES.mask.halfWidth * 2} height={EYES.mask.height}>
                        <rect x={EYES.centers[index] - EYES.mask.halfWidth} y={EYES.mask.y}
                          width={EYES.mask.halfWidth * 2} height={EYES.mask.height} fill="white" />
                        <motion.g style={{ transform: lidTransform, transformOrigin: "0px 0px", transformBox: "view-box" }}>
                          <ellipse cx={EYES.centers[index]} cy={EYES.lid.openY}
                            rx={EYES.lid.rx} ry={EYES.lid.ry} fill="black" />
                        </motion.g>
                      </mask>
                    </defs>
                    {/* Mask outside compression: the lid keeps its own curvature.
                        Both remain in the gaze wrapper, with only one filled eye. */}
                    <g mask={`url(#${eyeMaskId}-eye-${index})`}>
                      <motion.g className="curious-cat__eye" style={{ transform: eyeTransform,
                        transformOrigin: `${EYES.centers[index]}px ${EYES.anchorY}px`, transformBox: "view-box" }}>
                        <path d={d} />
                      </motion.g>
                    </g>
                  </g>
                ))}
              </g>
            </motion.g>
          </g>
        </motion.g>
      </svg>
    </button>
  );
}

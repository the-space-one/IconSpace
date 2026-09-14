import type { IconScrubber } from "./types";

/**
 * Structural subset of Motion's AnimationPlaybackControls that scrubbing
 * needs; both `animate(sequence)` and `animate(value, ...)` results satisfy
 * it, so icons don't have to care which form their timeline takes.
 */
interface PlaybackControls {
  duration: number;
  time: number;
  pause(): void;
  stop(): void;
}

/**
 * Turn an icon's animation into a paused, seekable scrubber. The animation
 * is created and paused immediately (before the first frame renders), so
 * the icon holds its rest pose until the first seek.
 */
export function makeScrubber(
  createAnimation: () => PlaybackControls,
  onDestroy?: () => void,
): IconScrubber {
  const controls = createAnimation();
  controls.pause();
  const duration = controls.duration;

  const nudge = () => {
    controls.time = Math.min(1e-4, duration);
    controls.time = 0;
  };

  // Repair the t=0 pose once Motion has resolved keyframes. A freshly
  // created, immediately paused sequence flushes *unresolved* fill values
  // into the DOM (e.g. the Automations pulse gets a literal
  // opacity="undefined" attribute and renders fully visible instead of
  // hidden). Resolution happens on Motion's frame loop, so wait two frames,
  // then seek away from and back to 0 to force one resolved render.
  // Skipped if the user scrubs first - a real seek renders correctly.
  let pendingInit: number | null = requestAnimationFrame(() => {
    pendingInit = requestAnimationFrame(() => {
      pendingInit = null;
      nudge();
    });
  });
  const cancelInit = () => {
    if (pendingInit !== null) {
      cancelAnimationFrame(pendingInit);
      pendingInit = null;
    }
  };

  return {
    duration,
    seek(seconds: number) {
      cancelInit();
      const t = Math.min(Math.max(seconds, 0), duration);
      // Plain `time = 0` on the never-rendered timeline replays the
      // unresolved-fill bug above; route through the nudge instead.
      if (t === 0) nudge();
      else controls.time = t;
    },
    destroy() {
      cancelInit();
      // stop(), not cancel(): cancel() on an animation that has not rendered
      // a frame yet (React StrictMode's create->destroy->create effect cycle)
      // writes unresolved "undefined" values back into the DOM, corrupting
      // the icon. stop() never writes; callers remount the icon per scrub
      // session, so rest-state restoration comes from React.
      controls.stop();
      onDestroy?.();
    },
  };
}

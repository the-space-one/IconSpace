/**
 * A paused handle onto an icon's full animation timeline, for posing it at
 * an arbitrary moment (the Scrub Lab). Times are in seconds, matching
 * Motion's AnimationPlaybackControls.
 */
export interface IconScrubber {
  /** Total timeline length in seconds. */
  duration: number;
  /** Pose the animation at `seconds` (clamped to [0, duration]). */
  seek(seconds: number): void;
  /** Cancel the paused animation and return the icon to its rest state. */
  destroy(): void;
}

export interface IconHandle {
  playAnimation(): Promise<void>;
  /** Optional: create a paused, seekable instance of the same timeline. */
  createScrubber?(): IconScrubber;
}

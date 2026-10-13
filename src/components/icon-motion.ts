/** Shared playback types and timing (milliseconds). The artwork and each
 * icon's own animation live in src/icons, synced from iconspace-lab. */
export type PreviewTarget = { instanceId: string; name: string };
export type MotionRun = { id: number; startedAt: number };

export const TIMING = {
  introduction: 250, // wait after the first shelf becomes visible
  stagger: 90,       // spacing between that shelf's previews
  maxRun: 3000,      // a run ends when its icon reports done, or after this
} as const;

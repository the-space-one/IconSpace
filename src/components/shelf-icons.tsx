"use client";

import { useEffect, useEffectEvent, useRef, type ComponentType, type SVGProps } from "react";
import { ClockIcon } from "@/icons/ClockIcon";
import { ICON_REGISTRY, type AnimatedIcon } from "@/icons/registry";
import type { IconHandle } from "@/icons/types";
import type { MotionRun } from "./icon-motion";

type InteractiveIcon = ComponentType<SVGProps<SVGSVGElement> & { ringing?: boolean }>;

export type ShelfIcon = { id: string; label: string } & (
  | { Icon: AnimatedIcon; interactive?: false }
  /** Drives its own hover animation (no playAnimation handle). */
  | { Icon: InteractiveIcon; interactive: true }
);

// Every icon from iconspace-lab: the registry plus Clock, which the lab
// gallery adds separately because it self-drives. The shelf's original five
// lead, the rest follow in registry order. HIDDEN stays in the registry (and
// /scrub) but is left off the shelves.
const LEAD = ["library-2", "cart", "clock", "discount", "email"];
const HIDDEN = ["image-sun", "swoosh", "rocket", "fall", "bookmark", "heart"];
const ALL: ShelfIcon[] = [
  ...ICON_REGISTRY,
  { id: "clock", label: "Clock", Icon: ClockIcon, interactive: true } as const,
].filter((icon) => !HIDDEN.includes(icon.id));
export const SHELF_ICONS: ShelfIcon[] = [
  ...LEAD.map((id) => ALL.find((icon) => icon.id === id)!),
  ...ALL.filter((icon) => !LEAD.includes(icon.id)),
];

export const shelfIcon = (id: string | undefined) =>
  SHELF_ICONS.find((icon) => icon.id === id) ?? SHELF_ICONS[0];

/**
 * One copy of an icon that plays its own timeline whenever its run changes.
 * A copy that mounts mid-run (a reflection showing late) stays at rest
 * instead of restarting the demonstration. A self-driven icon ignores runs;
 * `ringing` plays it as if hovered, for a copy no pointer reaches.
 */
export function LabGlyph({ icon, run, onFinish, ringing, size = 60 }: {
  icon: ShelfIcon;
  run?: MotionRun;
  onFinish?: () => void;
  ringing?: boolean;
  size?: number;
}) {
  const handle = useRef<IconHandle>(null);
  const played = useRef<number | undefined>(undefined);
  const finish = useEffectEvent(() => onFinish?.());

  useEffect(() => {
    if (!run || played.current === run.id) return;
    played.current = run.id;
    if (performance.now() - run.startedAt > 120) {
      finish();
      return;
    }
    // A frame later, so an icon that mounted in this same commit (the bubble
    // switching glyphs) has settled: in development React remounts it once,
    // which stops an animation started any sooner.
    const frame = requestAnimationFrame(() => {
      if (!handle.current) return finish();
      handle.current.playAnimation().then(finish, finish);
    });
    return () => cancelAnimationFrame(frame);
  }, [run]);

  if (icon.interactive) return <icon.Icon width={size} height={size} aria-hidden ringing={ringing} />;
  return <icon.Icon ref={handle} width={size} height={size} aria-hidden />;
}

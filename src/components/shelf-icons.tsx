"use client";

import { useEffect, useRef } from "react";
import { ClockIcon } from "@/icons/ClockIcon";
import { ICON_REGISTRY, type AnimatedIcon } from "@/icons/registry";
import type { IconHandle } from "@/icons/types";
import type { MotionRun } from "./icon-motion";

export type ShelfIcon = {
  id: string;
  label: string;
  Icon: AnimatedIcon;
  /** Drives its own hover animation (no playAnimation handle). */
  interactive?: boolean;
};

// Every icon from iconspace-lab: the registry plus Clock, which the lab
// gallery adds separately because it self-drives. The shelf's original five
// lead, the rest follow in registry order.
const LEAD = ["library-2", "cart", "clock", "discount", "email"];
const ALL: ShelfIcon[] = [
  ...ICON_REGISTRY,
  { id: "clock", label: "Clock", Icon: ClockIcon as AnimatedIcon, interactive: true },
];
export const SHELF_ICONS: ShelfIcon[] = [
  ...LEAD.map((id) => ALL.find((icon) => icon.id === id)!),
  ...ALL.filter((icon) => !LEAD.includes(icon.id)),
];

export const shelfIcon = (id: string | undefined) =>
  SHELF_ICONS.find((icon) => icon.id === id) ?? SHELF_ICONS[0];

/**
 * One copy of an icon that plays its own timeline whenever its shelf run
 * changes. A copy that mounts mid-run (the bubble opening late) stays at rest
 * instead of restarting the demonstration.
 */
export function LabGlyph({ icon, run, onFinish, size = 60 }: {
  icon: ShelfIcon;
  run?: MotionRun;
  onFinish?: () => void;
  size?: number;
}) {
  const handle = useRef<IconHandle>(null);
  const played = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!run || played.current === run.id) return;
    played.current = run.id;
    if (performance.now() - run.startedAt > 120 || !handle.current) {
      onFinish?.();
      return;
    }
    handle.current.playAnimation().then(() => onFinish?.(), () => onFinish?.());
  }, [run, onFinish]);

  const { Icon } = icon;
  return icon.interactive
    ? <Icon width={size} height={size} aria-hidden />
    : <Icon ref={handle} width={size} height={size} aria-hidden />;
}

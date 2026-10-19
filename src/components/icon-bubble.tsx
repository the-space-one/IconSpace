"use client";

import Image from "next/image";
import { useIconPlayback } from "@/components/icon-playback";
import { LabGlyph, shelfIcon } from "@/components/shelf-icons";

// Keep the last glyph throughout the exit. It plays each time the bubble opens
// on an icon, and again whenever that icon's tile starts a run while it's
// open (a keyboard press): whichever began last. Clock drives itself, so it
// rings for as long as the bubble is open.
export function IconBubble() {
  const { selection, runs } = useIconPlayback();
  const icon = shelfIcon(selection.target?.name);
  const tileRun = selection.target ? runs[selection.target.instanceId] : undefined;
  const run = tileRun && (!selection.run || tileRun.startedAt >= selection.run.startedAt) ? tileRun : selection.run;
  return (
    <div aria-hidden data-icon-bubble data-shown={selection.shown || undefined}
      className="absolute inset-0 origin-[64.5px_147.5px] scale-75 opacity-0 transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-shown:scale-100 data-shown:opacity-100 data-shown:duration-200 motion-reduce:scale-100 motion-reduce:transition-none">
      <Image src="/hero/window/bubble.svg" alt="" fill sizes="144px" fetchPriority="low" />
      <div className="absolute top-[95px] left-[18px] flex size-[60px] scale-40 items-center justify-center text-[#0a0a0a]">
        <LabGlyph icon={icon} run={run} ringing={selection.shown} />
      </div>
    </div>
  );
}

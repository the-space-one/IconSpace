"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import type { PreviewTarget } from "@/components/icon-motion";
import { useIconPlayback } from "@/components/icon-playback";
import { LabGlyph, SHELF_ICONS, shelfIcon } from "@/components/shelf-icons";
import { Reflected, Shelf } from "@/components/shelf";

// Every icon appears once, eight to a shelf; the last shelf holds the rest.
const SLOTS = 8;
const SHELF_COUNT = Math.ceil(SHELF_ICONS.length / SLOTS);

// Plank geometry from the original five-tile shelf (798 wide): 31px in, 120px
// tiles, 35px apart, 27px out. Width grows by 155px per tile.
const plankWidth = (count: number) => 23 + 155 * count;

// Planks are sized against the hero art, not on their own, so the tiles keep
// the illustration's proportions: a tile reads about as wide as the
// shopkeeper's head. Stacked layout (< xl): fit the width, at most 0.75×.
// Overlay layout (≥ xl): 0.66 of the hero's scale (min(1.5, W/1512)). Below a
// 36rem container the eight tiles split into two planks of four, which keeps
// them ≥ 54px on a 320px phone instead of ~34px. The scale is fixed to the
// eight-tile width, so a shorter last shelf keeps the same tile size.
const SCALE = {
  long: "[--s:min(0.75,tan(atan2(100cqw,1263px)))] xl:[--s:calc(0.66*min(1.5,tan(atan2(100vw,1512px))))]",
  half: "[--s:min(0.75,tan(atan2(100cqw,643px)))]",
};
const tile = "relative flex size-30 items-center justify-center rounded-tile shadow-tile";

function Plank({ slots, scale }: { slots: PreviewTarget[]; scale: string }) {
  const { runs, play, finish, preview } = useIconPlayback();
  const width = plankWidth(slots.length);

  return (
    <div style={{ width: `calc(${width}px * var(--s))` }} className={`mx-auto h-[calc(147px*var(--s))] ${scale}`}>
      <div style={{ width }} className="relative h-[147px] origin-top-left scale-(--s)">
        <Shelf className="absolute top-[108px] w-full" reflection={
          <div className="absolute top-2.5 left-[31px] flex gap-[35px]">
            {slots.map((slot) => (
              <Reflected key={slot.instanceId} className="size-[120px]">
                <div className={`${tile} bg-black/10`}>
                  <LabGlyph icon={shelfIcon(slot.name)} run={runs[slot.instanceId]} />
                </div>
              </Reflected>
            ))}
          </div>
        } />
        <ul className="absolute top-0 left-[31px] flex gap-[35px]">
          {slots.map((target) => (
            <li key={target.instanceId}>
              <button type="button" data-icon={target.name} data-motion-tile={target.instanceId}
                aria-label={`Preview ${shelfIcon(target.name).label} animation`}
                className={`${tile} cursor-pointer bg-[rgba(10,10,10,0.03)] text-[#0a0a0a] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground`}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch" && matchMedia("(hover: hover) and (pointer: fine)").matches) {
                    preview("hover", target, true);
                    play(target);
                  }
                }}
                onPointerLeave={() => preview("hover", target, false)}
                onFocus={(event) => {
                  if (event.currentTarget.matches(":focus-visible")) preview("focus", target, true);
                }}
                onBlur={() => preview("focus", target, false)}
                onClick={(event) => {
                  if (event.detail !== 0) preview("touch", target, true);
                  play(target);
                }}
              >
                <LabGlyph icon={shelfIcon(target.name)} run={runs[target.instanceId]}
                  onFinish={() => finish(target.instanceId)} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function IconShelf({ index }: { index: number }) {
  const shelfId = useId();
  const ref = useRef<HTMLElement>(null);
  const { registerShelf } = useIconPlayback();
  const slots = useMemo(() => SHELF_ICONS.slice(index * SLOTS, (index + 1) * SLOTS)
    .map((icon, slot): PreviewTarget => ({ instanceId: `${shelfId}-${slot}`, name: icon.id })),
  [shelfId, index]);
  useEffect(() => {
    // Clock self-drives on hover, so the introduction skips it.
    const playable = slots.filter((slot) => !shelfIcon(slot.name).interactive);
    if (ref.current) return registerShelf(ref.current, playable);
  }, [registerShelf, slots]);
  const half = Math.ceil(slots.length / 2);

  // Both layouts share instance ids, so a run plays in whichever is showing.
  return (
    <section ref={ref} data-motion-shelf className="@container w-full">
      <div className="hidden @[36rem]:block">
        <Plank slots={slots} scale={SCALE.long} />
      </div>
      <div className="flex flex-col gap-6 @[36rem]:hidden">
        <Plank slots={slots.slice(0, half)} scale={SCALE.half} />
        <Plank slots={slots.slice(half)} scale={SCALE.half} />
      </div>
    </section>
  );
}

export function IconShelves() {
  return (
    <div className="flex flex-col gap-10 px-4 sm:gap-16">
      {Array.from({ length: SHELF_COUNT }, (_, index) => (
        <IconShelf key={index} index={index} />
      ))}
    </div>
  );
}

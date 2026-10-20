"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { basket, useBasket } from "@/components/basket-store";
import type { PreviewTarget } from "@/components/icon-motion";
import { useIconPlayback } from "@/components/icon-playback";
import { LabGlyph, SHELF_ICONS, shelfIcon } from "@/components/shelf-icons";
import { Reflected, Shelf } from "@/components/shelf";

// Every icon appears once, four to a shelf; the last shelf holds the rest.
const SLOTS = 4;
const SHELF_COUNT = Math.ceil(SHELF_ICONS.length / SLOTS);

// Plank geometry from the original five-tile shelf (798 wide): 31px in, 120px
// tiles, 35px apart, 27px out. Width grows by 155px per tile.
const plankWidth = (count: number) => 23 + 155 * count;

// Planks are sized against the hero art, not on their own, so they keep in
// step with the illustration as the page scales. Stacked layout (< xl): fit
// the four-tile width (643px), at most 1×, which keeps tiles ≥ 54px on a
// 320px phone. Overlay layout (≥ xl): 0.875 of the hero's scale
// (min(1.5, W/1512)). The scale is fixed to the four-tile width, so a shorter
// last shelf keeps the same tile size.
const SCALE = "[--s:min(1,tan(atan2(100cqw,643px)))] xl:[--s:calc(0.875*min(1.5,tan(atan2(100vw,1512px))))]";
const tile = "relative flex size-30 items-center justify-center rounded-tile shadow-tile";

/**
 * The tile's way into the basket. It shows on hover, on keyboard focus, on
 * the tile last tapped (touch has no hover), and always once the icon is in
 * the basket, as a ✓ that takes it back out. A pointer click tosses the
 * glyph from the tile; a keyboard one just adds it.
 */
function AddChip({ target, armed }: { target: PreviewTarget; armed: boolean }) {
  const { items } = useBasket();
  const { label } = shelfIcon(target.name);
  const picked = items.includes(target.name);
  return (
    <button type="button" aria-pressed={picked}
      aria-label={picked ? `Take ${label} out of the basket` : `Add ${label} to the basket`}
      data-shown={armed || undefined} data-picked={picked || undefined}
      onClick={(event) => {
        if (picked) return basket.remove(target.name);
        const tile = event.currentTarget.parentElement?.querySelector("[data-motion-tile]")?.getBoundingClientRect();
        const toss = tile && event.detail !== 0 && !matchMedia("(prefers-reduced-motion: reduce)").matches;
        basket.add(target.name, toss ? { x: tile.left + tile.width / 2, y: tile.top + tile.height / 2, scale: tile.width / 120 } : undefined);
      }}
      // At least 24px on screen however small the plank is scaled.
      className="absolute -top-2.5 -right-2.5 z-10 grid size-[max(34px,calc(24px/var(--s)))] scale-90 cursor-pointer place-items-center rounded-full bg-white text-[#0a0a0a] opacity-0 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_2px_6px_-1px_rgba(0,0,0,0.14)] transition-[opacity,scale,background-color] duration-150 ease-out after:absolute after:-inset-2 group-hover/tile:scale-100 group-hover/tile:opacity-100 group-has-[:focus-visible]/tile:scale-100 group-has-[:focus-visible]/tile:opacity-100 hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-95 data-picked:scale-100 data-picked:bg-brand data-picked:opacity-100 data-picked:shadow-[inset_0_0_0_2px_var(--color-brand-strong),0_2px_6px_-1px_rgba(0,0,0,0.14)] data-shown:scale-100 data-shown:opacity-100 motion-reduce:transition-none"
    >
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
        aria-hidden className="col-start-1 row-start-1 size-[42%] transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.2,0,0,1)] in-data-picked:scale-50 in-data-picked:opacity-0 motion-reduce:transition-none">
        <path d="M7 2.5v9M2.5 7h9" />
      </svg>
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
        aria-hidden className="col-start-1 row-start-1 size-[42%] scale-50 opacity-0 transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.2,0,0,1)] in-data-picked:scale-100 in-data-picked:opacity-100 motion-reduce:transition-none">
        <path d="M2.75 7.5 5.5 10.25 11.25 4" />
      </svg>
    </button>
  );
}

function Plank({ slots }: { slots: PreviewTarget[] }) {
  const { runs, play, finish, preview } = useIconPlayback();
  const width = plankWidth(slots.length);
  // The tile last tapped on a touch screen, which shows its chip until a tap lands elsewhere.
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const disarm = (event: PointerEvent) => {
      if (!(event.target instanceof Element && event.target.closest(`[data-tile="${armed}"]`))) setArmed(null);
    };
    document.addEventListener("pointerdown", disarm);
    return () => document.removeEventListener("pointerdown", disarm);
  }, [armed]);

  return (
    <div style={{ width: `calc(${width}px * var(--s))` }} className={`mx-auto h-[calc(147px*var(--s))] ${SCALE}`}>
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
            // Hover is the tile's and its chip's together, so reaching for the chip keeps the preview open.
            <li key={target.instanceId} data-tile={target.instanceId} className="group/tile relative"
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch" && matchMedia("(hover: hover) and (pointer: fine)").matches) {
                  preview("hover", target, true);
                  play(target);
                }
              }}
              onPointerLeave={() => preview("hover", target, false)}
            >
              <button type="button" data-icon={target.name} data-motion-tile={target.instanceId}
                aria-label={`Preview ${shelfIcon(target.name).label} animation`}
                className={`${tile} cursor-pointer bg-[rgba(10,10,10,0.03)] text-[#0a0a0a] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground`}
                onPointerDown={(event) => {
                  if (event.pointerType === "touch") setArmed(target.instanceId);
                }}
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
              <AddChip target={target} armed={armed === target.instanceId} />
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

  return (
    <section ref={ref} data-motion-shelf className="@container w-full">
      <Plank slots={slots} />
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

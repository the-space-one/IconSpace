"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ForwardRefExoticComponent,
  type PropsWithoutRef,
  type ReactNode,
  type RefAttributes,
  type RefObject,
  type SVGProps,
} from "react";
import { useReducedMotion } from "motion/react";

import { BellIcon } from "@/components/icons/BellIcon";
import { BookFlipIcon } from "@/components/icons/BookFlipIcon";
import { Calendar2Icon } from "@/components/icons/Calendar2Icon";
// import { CalendarIcon } from "@/components/icons/CalendarIcon"; // hidden for now
import { CartIcon } from "@/components/icons/CartIcon";
import { CoinIcon } from "@/components/icons/CoinIcon";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { HomeDoorIcon } from "@/components/icons/HomeDoorIcon";
import { SettingsSliderPreviewIcon } from "@/components/icons/SettingsSliderIcon";
import { ClockIcon } from "@/components/icons/ClockIcon";
import { DiscountIcon } from "@/components/icons/DiscountIcon";
import { EmailIcon } from "@/components/icons/EmailIcon";
import { GlobeSpinIcon } from "@/components/icons/GlobeSpinIcon";
import { LightningIcon } from "@/components/icons/LightningIcon";
import { MacbookIcon } from "@/components/icons/MacbookIcon";
import { Search3DIcon } from "@/components/icons/Search3DIcon";
import { TicketIcon } from "@/components/icons/TicketIcon";
import type { IconHandle } from "@/components/icons/types";
import { Egg } from "@/components/easter-eggs";
import { cn } from "@/lib/utils";

const ICON_WIDTH = "w-16 shrink-0 sm:w-22 md:w-26 lg:w-30";
const ROW = "flex justify-center gap-4 px-4 sm:gap-8";
const SLOTS_PER_SHELF = 4;

// Squircle shared by the standing tile and its reflection, so the two
// silhouettes line up. 22.37% is the iOS squircle approximation.
const TILE_SHAPE = "rounded-[22.37%] ring-1 ring-inset ring-border";
// The reflection needs a heavier fill than the tile: only the tile's bottom
// edge falls inside the glass, and at the tile's own 3% it vanishes, leaving
// the glyph floating with nothing under it.
const TILE_FILL = "bg-foreground/3";
const REFLECTION_FILL = "bg-foreground/10";
const ICON_SIZE = "h-1/2 w-1/2 text-foreground";

// Brand periwinkle, as the glass tint. Kept as literals rather than tokens
// because the glass mixes them at a dozen different alphas.
const GLASS_A = "159,161,255"; // #9FA1FF
const GLASS_B = "186,164,255"; // lilac companion, for the right-hand falloff

// Mirror the tile, then foreshorten it — a reflection in a surface seen at
// this angle is compressed, and the squash pulls the glyph into the visible
// band. Applied closest to the element so the hover transform below composes
// on top of it, in screen space.
const MIRROR = "scaleY(-0.55) translateY(-100%)";

// How the reflection answers a hover. The tile lifts off the glass, so its
// mirror image separates downward as the gap opens, grows with it, and goes
// dimmer and softer — the further an object sits from a reflective surface,
// the more diffuse what it throws back.
//
// The drop is the tile's own 2px lift rather than the ~1px a true mirror would
// show through the 0.55 foreshortening: at this size the honest number reads
// as nothing at all.
const REFLECTION_DROP = 2; // px, screen space
const REFLECTION_SCALE = 1.05; // matches the tile's hover:scale-105

// Entrance stagger between tiles in a row. A row's four tiles cross into view
// together, so this sweeps them left to right; it is the column index that
// offsets, not the icon's index in the table.
const SLOT_STAGGER = 70;

// How long after a tile begins its entrance before its glyph plays. The
// entrance runs 500ms, so firing a fifth of the way in lands while the tile is
// still settling — the two read as one gesture instead of an arrival followed
// by a separate performance.
const INTRO_LEAD = 220;

// How much of a tile must be on screen before it counts as seen.
const INTRO_THRESHOLD = 0.4;

/**
 * Marks each watched element true the first time it crosses into the viewport,
 * then stops watching that one: the introduction plays once per page load and
 * never again on scroll back. Elements already on screen at mount latch on the
 * observer's first callback, so the tiles above the fold never wait for a
 * scroll that may never come.
 *
 * The shelf owns this rather than each tile watching itself, because a tile
 * and its reflection have to begin together and sit in different subtrees.
 * One verdict per slot, read by both.
 *
 * Returns the flags and the ref array to hang on the watched elements.
 */
function useEnteredView(count: number) {
  const targets = useRef<(Element | null)[]>([]);
  const [entered, setEntered] = useState<boolean[]>(() =>
    Array<boolean>(count).fill(false),
  );

  useEffect(() => {
    const els = targets.current.slice(0, count);

    // Without IntersectionObserver, show everything rather than leave the wall
    // permanently blank. Deferred a frame so the entrance still transitions
    // from its offset pose instead of being painted already-arrived.
    if (!("IntersectionObserver" in window)) {
      const frame = requestAnimationFrame(() =>
        setEntered(Array<boolean>(count).fill(true)),
      );
      return () => cancelAnimationFrame(frame);
    }

    const io = new IntersectionObserver(
      (entries) => {
        const arrived = entries.filter((entry) => entry.isIntersecting);
        if (!arrived.length) return;
        // Drop each one as it lands; the rest of the row keeps its watch.
        for (const entry of arrived) io.unobserve(entry.target);
        setEntered((prev) => {
          const next = [...prev];
          for (const entry of arrived) {
            const i = els.indexOf(entry.target);
            if (i >= 0) next[i] = true;
          }
          return next;
        });
      },
      { threshold: INTRO_THRESHOLD },
    );
    for (const el of els) if (el) io.observe(el);
    return () => io.disconnect();
  }, [count]);

  return [entered, targets] as const;
}

/** Everything a slot needs to know about when to perform. */
type Playback = {
  delay: number;
  /** Whether this slot has crossed into view yet. */
  shown: boolean;
  /** Whether the pointer is on this slot. */
  hovered: boolean;
  /** Time from navigation start, in ms, before which the glyph must not play —
   *  see `useIconPlayback`. Zero for a shelf with nothing in front of it. */
  revealAt: number;
};

type SlotProps = Playback & {
  /** Reports the pointer entering and leaving, so the shelf can pass it on to
   *  this tile's reflection. */
  onHoverChange?: (hovered: boolean) => void;
};

type ReflectionProps = Playback;

/**
 * Plays an icon's one-shot: once as it arrives in view, and again on every
 * hover. A tile and its reflection each run this against the same inputs,
 * which is what keeps the mirrored glyph moving with the one it mirrors.
 *
 * Hover comes in as a prop rather than from this element's own mouse events —
 * the reflection is never itself hovered (it is inside the glass, behind
 * `pointer-events-none`), so the tile's verdict is the only one either of them
 * can act on.
 */
function useIconPlayback<H extends IconHandle>(
  icon: RefObject<H | null>,
  { delay, shown, hovered, revealAt }: Playback,
  onLeave?: (icon: H) => void,
) {
  const reducedMotion = useReducedMotion();

  // The introduction, the first time this slot scrolls into view. It starts
  // the one-shot and leaves it alone — whatever pose the icon settles on is
  // kept, because the reflection just played the identical timeline and is
  // holding the identical pose.
  //
  // Deliberately no unwind on completion. `playAnimation` does not resolve at
  // the same moment for every icon (Clock returns as soon as it has kicked off
  // its ring, so that a hover interrupting a hover cannot hang on an unsettled
  // promise), and an unwind chained to that promise fires instantly and eats
  // the animation before it is visible. Mouse-leave is the only thing that
  // unwinds, which is what `onLeave` has always meant.
  useEffect(() => {
    if (!shown || reducedMotion) return;

    // A shelf hidden behind something at first paint would have a row that is
    // already on screen perform invisibly and be over by the time it appeared,
    // because IntersectionObserver does not care about opacity. `revealAt` is
    // a wall-clock moment before which nothing should play; `performance.now()`
    // is measured from navigation start, so a moment already past holds for
    // nothing and anything scrolled to later is unaffected. The landing page
    // has nothing to wait for and leaves it at 0.
    const held = Math.max(0, revealAt - performance.now());

    const timer = setTimeout(
      () => {
        void icon.current?.playAnimation();
      },
      held + delay + INTRO_LEAD,
    );
    return () => clearTimeout(timer);
  }, [icon, shown, delay, revealAt, reducedMotion]);

  // Hover, skipped on the mount pass: `hovered` starts false, and unwinding an
  // icon that has not played yet would fight the introduction above.
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (hovered) icon.current?.playAnimation();
    else if (icon.current) onLeave?.(icon.current);
  }, [icon, hovered, onLeave]);
}

// A squircle tile standing on the shelf. The outer element owns the staggered
// entrance; its transition-delay must not bleed into the hover, so the hover
// lift lives on a separate inner element.
function ShelfSlot({
  delay,
  shown,
  children,
  onMouseEnter,
  onMouseLeave,
}: {
  delay: number;
  shown: boolean;
  children?: ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <div
      className="transition-[transform,opacity] duration-500 ease-out will-change-transform motion-reduce:transition-none"
      style={{
        transitionDelay: `${delay}ms`,
        opacity: shown ? 1 : 0,
        transform: shown ? undefined : "translateY(8px) scale(0.95)",
      }}
    >
      <div
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={cn(
          "relative flex aspect-square w-full items-center justify-center shadow-[inset_0_1px_3px_rgba(0,0,0,0.16)] transition-transform duration-250 ease-out will-change-transform hover:-translate-y-0.5 hover:scale-105 motion-reduce:transition-none",
          TILE_SHAPE,
          TILE_FILL,
        )}
      >
        {children}
      </div>
    </div>
  );
}

// A gap that draws nothing at all — not even the empty tile `EmptySlot` would
// stand there. Same square footprint, so the icons either side keep the exact
// positions they have on the wall; it just holds the space open.
//
// This is what a slot reserved for compositing has to be. An empty squircle in
// the hole is a shape that has to be painted out of every frame before an icon
// can go in, and its inset shadow makes that a rotoscope rather than a mask.
function BlankSlot() {
  return <div className="aspect-square w-full" />;
}

// An unfilled position on the shelf: the same entrance, nothing standing in
// it. Still reports hover, so the empty patch of glass below it answers the
// same way a filled one would.
function EmptySlot({ delay, shown, onHoverChange }: SlotProps) {
  return (
    <ShelfSlot
      delay={delay}
      shown={shown}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    />
  );
}

// The same tile as it appears mirrored in the glass: no entrance of its own,
// and never hovered directly — the slab is `pointer-events-none`, so both the
// glyph's animation and the reaction below are driven by what happens to the
// tile above it. See REFLECTION_DROP.
function ShelfReflection({
  hovered,
  children,
}: {
  hovered?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex size-full items-center justify-center saturate-[0.85] transition-[opacity,filter] duration-250 ease-out motion-reduce:transition-none",
        hovered ? "opacity-30 blur-[1.7px]" : "opacity-45 blur-[1.1px]",
        TILE_SHAPE,
        REFLECTION_FILL,
      )}
    >
      {children}
    </div>
  );
}

type ShelfIcon = {
  /** The interactive tile that stands on the shelf. */
  Tile: ComponentType<SlotProps>;
  /** The same icon again, for the mirrored copy in the glass. Animates in
   *  lockstep with the tile — see `useIconPlayback`. */
  Reflection: ComponentType<ReflectionProps>;
  /** The component this entry was built from. Carried so a caller can find a
   *  particular icon's position in the table by identity — `=== GlobeSpinIcon`
   *  rather than a hard-coded 5, which would go on looking right after any
   *  reorder of the table and quietly blank the wrong slot. */
  source: ComponentType<unknown>;
};

// Binds an icon to its handle type at the table entry. Most icons expose bare
// `IconHandle`, but a few widen it (Clock adds `reset`, because it holds its
// end pose and has to unwind on the way out) — inferring H here keeps those
// type-safe without widening the shared table.
function shelfIcon<H extends IconHandle>(
  Icon: ForwardRefExoticComponent<
    PropsWithoutRef<SVGProps<SVGSVGElement>> & RefAttributes<H>
  >,
  options: { className?: string; onLeave?: (icon: H) => void } = {},
): ShelfIcon {
  const className = cn(ICON_SIZE, options.className);
  const { onLeave } = options;

  return {
    source: Icon as ComponentType<unknown>,
    Tile: function IconTile({
      delay,
      shown,
      hovered,
      revealAt,
      onHoverChange,
    }: SlotProps) {
      const icon = useRef<H>(null);
      useIconPlayback(icon, { delay, shown, hovered, revealAt }, onLeave);

      // The mouse handlers only report; the playback above is what acts on the
      // verdict, so the tile and its reflection move off the same signal
      // rather than one reacting a beat ahead of the other.
      return (
        <ShelfSlot
          delay={delay}
          shown={shown}
          onMouseEnter={() => onHoverChange?.(true)}
          onMouseLeave={() => onHoverChange?.(false)}
        >
          <Icon ref={icon} className={className} />
        </ShelfSlot>
      );
    },
    Reflection: function IconReflection({
      delay,
      shown,
      hovered,
      revealAt,
    }: ReflectionProps) {
      const icon = useRef<H>(null);
      useIconPlayback(icon, { delay, shown, hovered, revealAt }, onLeave);

      return (
        <ShelfReflection hovered={hovered}>
          <Icon ref={icon} className={className} />
        </ShelfReflection>
      );
    },
  };
}

// Slots that have a real icon yet, keyed by their position on the wall.
// Everything else falls back to an empty tile.
const SHELF_ICONS: ShelfIcon[] = [
  // --icon-paper matches the page surface so the leaf reads in both themes
  shelfIcon(BookFlipIcon, { className: "[--icon-paper:var(--background)]" }),
  shelfIcon(CartIcon),
  shelfIcon(ClockIcon, { onLeave: (icon) => icon.reset() }),
  shelfIcon(DiscountIcon),
  shelfIcon(EmailIcon),
  shelfIcon(GlobeSpinIcon),
  shelfIcon(LightningIcon),
  shelfIcon(MacbookIcon),
  shelfIcon(Search3DIcon),
  shelfIcon(TicketIcon),
  shelfIcon(BellIcon),
  // shelfIcon(CalendarIcon), // hidden for now — also uncomment its import
  shelfIcon(Calendar2Icon),
  shelfIcon(SettingsSliderPreviewIcon),
  shelfIcon(HomeDoorIcon),
  shelfIcon(GithubIcon),
  shelfIcon(CoinIcon),
];

// At least 4 shelves (the original layout); grow to fit however many icons
// are filled, so the last one never overflows off the wall.
const SHELF_ROWS = Math.max(4, Math.ceil(SHELF_ICONS.length / SLOTS_PER_SHELF));

/** How many icons the table holds, for callers that page through it. */
export const SHELF_ICON_COUNT = SHELF_ICONS.length;

/**
 * `count` icons from the table starting at `start`, padded with `undefined`
 * past the end. Always exactly `count` long: a shelf keeps its full width of
 * slots whether or not there is an icon for each, and the gaps stand empty.
 *
 * The return type is spelled out because inference will not do it: indexing an
 * array past its end is `undefined` at run time but typed as the element type,
 * so without this the padding this function is named for is invisible to
 * every caller — including the ones that mean to add more of it.
 */
export function shelfSlice(
  start: number,
  count: number,
): (ShelfIcon | undefined)[] {
  return Array.from({ length: count }, (_, i) => SHELF_ICONS[start + i]);
}

export function Shelf({
  icons,
  revealAt = 0,
  staggerFrom = 0,
  tuckEgg = false,
  reflections = true,
  emptyTiles = true,
}: {
  /** One entry per slot; `undefined` stands an empty tile there. */
  icons: (ShelfIcon | undefined)[];
  /** Hide one of the easter eggs behind this shelf's glass. Off by default, so
   *  a Shelf used anywhere else does not quietly grow an egg. */
  tuckEgg?: boolean;
  /** Mirror the tiles in the glass. On by default — the reflections are most
   *  of what makes the slab read as glass rather than as a painted bar.
   *
   *  Off is for footage. A mirrored copy of an icon plays the same timeline a
   *  beat behind a blur and a mask, and anything compositing a new icon into a
   *  slot has to reproduce that too, or the shelf shows one icon with a
   *  reflection standing next to one without. Removing them from the plate is
   *  far easier than matching them. */
  reflections?: boolean;
  /** Whether an unfilled slot still draws its empty tile. On by default: a gap
   *  at the end of the wall is a shelf position waiting for an icon, and it
   *  should look like one. Off for a slot being held open to composite into —
   *  see `BlankSlot`. */
  emptyTiles?: boolean;
  /** See `Playback.revealAt`. */
  revealAt?: number;
  /** Where in the entrance sweep this shelf's first slot sits. Shelves that
   *  arrive together (a grid, rather than a wall scrolled past one row at a
   *  time) pass this so the cascade runs on through the rows below instead of
   *  every row starting over at zero. */
  staggerFrom?: number;
}) {
  const count = icons.length;

  // Which slot the pointer is on, and which slots have arrived in view. Both
  // are held up here because a tile and its reflection are not related in the
  // DOM — the reflection is clipped inside the glass, in a different subtree —
  // so nothing reaches from one to the other on its own. The row is the
  // nearest place that can see both.
  const [hovered, setHovered] = useState<number | null>(null);
  const [shown, targets] = useEnteredView(count);

  return (
    <div className="relative w-full">
      {/* Tiles standing on the shelf */}
      <div className={cn("relative z-10 items-end", ROW)}>
        {icons.map((icon, i) => {
          const Tile = icon?.Tile ?? (emptyTiles ? EmptySlot : BlankSlot);
          return (
            <div
              key={i}
              // Block body: a ref callback that returns a value is read as a
              // cleanup function.
              ref={(el) => {
                targets.current[i] = el;
              }}
              className={ICON_WIDTH}
            >
              <Tile
                delay={(staggerFrom + i) * SLOT_STAGGER}
                shown={shown[i] ?? false}
                hovered={hovered === i}
                revealAt={revealAt}
                // Clearing only when this slot is still the hovered one keeps
                // a fast slide along the row from blanking its successor, if
                // the two events ever land out of order.
                onHoverChange={(isHovered) =>
                  setHovered((prev) =>
                    isHovered ? i : prev === i ? null : prev,
                  )
                }
              />
            </div>
          );
        })}
      </div>

      {/* The glass shelf. Negative margin sinks the tile bases into the slab
          so they read as standing on the front lip rather than floating. */}
      <div className="relative -mt-2 h-12 perspective-[1000px] sm:-mt-3 sm:h-14">
        {/* One of the four easter eggs, tucked behind this slab. It has to be a
            child of the slab's own container rather than a sibling of the whole
            wall: as a sibling it ends up under the shelf's container boxes,
            which capture the pointer even where they are visually empty, and
            the egg becomes impossible to click. In here the slab is a later
            sibling, so it paints over the egg's top while the part hanging
            below the glass stays both visible and clickable. */}
        {tuckEgg && (
          <Egg
            index={1}
            size={23}
            className="bottom-0 left-[9%] rotate-6 sm:left-[13%]"
          />
        )}

        {/* Periwinkle bloom the glass throws onto the wall beneath it. Kept
            tight to the slab — spread any wider and it stops reading as a
            shadow and becomes a second bar under the shelf. */}
        <div className="absolute inset-x-12 top-7 h-2 rounded-full bg-[#9fa1ff]/30 blur-md sm:top-9" />

        {/* The slab. Tilting from the top edge shows its upper face; the
            overflow clip is what cuts the reflections into the glass. */}
        <div
          className="relative h-8 overflow-hidden rounded-[18px] sm:h-10"
          style={{
            transformOrigin: "center top",
            transform: "rotateX(13deg)",
            background: [
              // Tint concentrates at the two ends and leaves the middle near
              // white, so the glass stays behind the icons rather than
              // competing with them.
              `radial-gradient(90% 120% at 12% 0%, rgba(${GLASS_A},0.34) 0%, rgba(${GLASS_A},0) 42%)`,
              `radial-gradient(90% 140% at 88% 0%, rgba(${GLASS_B},0.26) 0%, rgba(${GLASS_B},0) 48%)`,
              `linear-gradient(90deg, rgba(${GLASS_A},0.20), rgba(255,255,255,0.55) 24%, rgba(255,255,255,0.42) 52%, rgba(${GLASS_B},0.18) 78%, rgba(${GLASS_A},0.15))`,
              // Body: bright at the lit top lip, deepening into the surface,
              // then catching light again on the front edge.
              "linear-gradient(rgba(255,255,255,0.95) 0%, rgba(244,244,254,0.70) 36%, rgba(224,224,243,0.55) 76%, rgba(249,249,255,0.80) 100%)",
            ].join(","),
            boxShadow: [
              "rgba(94,96,140,0.22) 0 1px 2px",
              "rgba(120,122,255,0.45) 0 12px 26px -18px",
              "rgba(168,120,255,0.35) 0 12px 22px -18px",
              "rgba(255,255,255,0.98) 0 1px 0 inset",
              "rgba(104,106,155,0.30) 0 -1px 0 inset",
            ].join(","),
          }}
        >
          {/* Mirrored tiles, fading out as they recede toward the front edge.
              The slab keeps every other layer when these are off — the sheen,
              the lit top lip, the shaded front edge — so it is still glass,
              just glass with nothing in it. */}
          {reflections && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                maskImage:
                  "linear-gradient(to bottom, #000 0%, #000 45%, transparent 97%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, #000 0%, #000 45%, transparent 97%)",
              }}
            >
              <div
                className={cn(
                  "absolute inset-x-0 top-1.5 items-start sm:top-2.5",
                  ROW,
                )}
              >
                {icons.map((icon, i) => {
                  const Reflection = icon?.Reflection ?? ShelfReflection;
                  const isHovered = hovered === i;
                  return (
                    <div key={i} className={ICON_WIDTH}>
                      {/* MIRROR sits rightmost so it applies first, in the
                        element's own space; the hover pair composes on top of
                        it and so reads in screen space, unflipped by the
                        scaleY(-1). Origin `top` is the waterline — the edge
                        the tile touches — so growth pushes down into the
                        glass instead of straddling the contact point. */}
                      <div
                        className="aspect-square w-full transition-transform duration-250 ease-out motion-reduce:transition-none"
                        style={{
                          transform: isHovered
                            ? `translateY(${REFLECTION_DROP}px) scale(${REFLECTION_SCALE}) ${MIRROR}`
                            : MIRROR,
                          transformOrigin: "top",
                        }}
                      >
                        <Reflection
                          delay={(staggerFrom + i) * SLOT_STAGGER}
                          shown={shown[i] ?? false}
                          hovered={isHovered}
                          revealAt={revealAt}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Specular sheen skimming across the glass */}
          <div
            className="pointer-events-none absolute inset-0 mix-blend-screen"
            style={{
              background: [
                `radial-gradient(at 14% 62%, rgba(${GLASS_A},0.22) 0%, rgba(${GLASS_A},0) 18%)`,
                "radial-gradient(at 38% 50%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 16%)",
                `radial-gradient(at 70% 56%, rgba(${GLASS_B},0.18) 0%, rgba(${GLASS_B},0) 20%)`,
                "linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.40) 17%, rgba(255,255,255,0) 28%, rgba(255,255,255,0.30) 52%, rgba(255,255,255,0) 65%)",
              ].join(","),
            }}
          />

          {/* Lit top edge, and the soft bloom just inside it */}
          <div
            className="pointer-events-none absolute inset-x-3 top-0 h-px rounded-full"
            style={{
              background: `linear-gradient(90deg, rgba(${GLASS_A},0) 0%, rgba(175,177,255,0.58) 12%, rgba(255,255,255,0.86) 36%, rgba(206,190,255,0.72) 68%, rgba(${GLASS_A},0.48) 88%, rgba(${GLASS_A},0) 100%)`,
            }}
          />
          <div className="pointer-events-none absolute inset-x-6 top-2 h-2 rounded-full bg-white/20 blur-[1px]" />

          {/* Shaded front edge, where the glass turns away from the light */}
          <div
            className="pointer-events-none absolute inset-x-4 bottom-0 h-px rounded-full"
            style={{
              background:
                "linear-gradient(90deg, rgba(80,82,140,0), rgba(110,112,190,0.40) 24%, rgba(140,112,190,0.32) 66%, rgba(80,82,140,0))",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Where the globe sits in the table, found by identity rather than counted by
 *  hand — see `ShelfIcon.source`. */
export const GLOBE_SLOT = SHELF_ICONS.findIndex(
  (icon) => icon.source === GlobeSpinIcon,
);

/**
 * The whole wall: every shelf, in order, at the width the landing page uses.
 *
 * Each tile watches itself rather than the block watching for all of them: the
 * wall is taller than most viewports, so a single observer here would fire the
 * whole grid — including three rows still below the fold — the moment the top
 * row appeared, and every icon would have performed by the time the reader
 * scrolled down to it.
 *
 * The defaults are the landing page's, so it can go on calling this with no
 * arguments. The options exist for the video plate, which needs the same wall
 * with three things taken out of it — and needs them taken out of THIS wall
 * rather than out of a copy, or the footage slowly stops matching the site.
 */
export function IconShelves({
  reflections = true,
  emptyTiles = true,
  eggs = true,
  emptyAt,
  revealAt,
}: {
  /** See `Shelf.reflections`. */
  reflections?: boolean;
  /** See `Shelf.emptyTiles`. */
  emptyTiles?: boolean;
  /** Whether one of the four easter eggs hides behind the second shelf. Off
   *  for footage: it is small, but it bobs, and a moving speck behind the
   *  glass is exactly the kind of thing nobody notices until it is on film. */
  eggs?: boolean;
  /** Position in the icon table to stand empty. The video plate leaves the
   *  globe's slot open so one can be composited into it. */
  emptyAt?: number;
  /** See `Playback.revealAt`. */
  revealAt?: number;
} = {}) {
  return (
    <div className="relative left-1/2 flex w-[min(40rem,100vw-3rem)] -translate-x-1/2 flex-col gap-10 py-14">
      {Array.from({ length: SHELF_ROWS }, (_, i) => {
        const start = i * SLOTS_PER_SHELF;
        const icons = shelfSlice(start, SLOTS_PER_SHELF);
        // Blanked in place rather than removed, so every other icon stays on
        // the shelf and in the column it was on. Splicing it out would shunt
        // the remaining eleven up a slot each and rearrange the whole wall.
        if (emptyAt !== undefined && emptyAt >= start) {
          const column = emptyAt - start;
          if (column < SLOTS_PER_SHELF) icons[column] = undefined;
        }

        return (
          <Shelf
            key={i}
            icons={icons}
            reflections={reflections}
            emptyTiles={emptyTiles}
            revealAt={revealAt}
            // Second shelf down, so the egg is not the first thing on the wall.
            tuckEgg={eggs && i === 1}
          />
        );
      })}
    </div>
  );
}

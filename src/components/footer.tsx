import Image from "next/image";
import type { CSSProperties } from "react";
import { BadgeShelf } from "@/components/badge-shelf";
import { Forklift } from "@/components/forklift";

// The scene's scale. Below xl it fits the 1512-wide scene to the viewport but
// never drops under 0.55× (phones get a crop instead of a speck). From xl it
// follows the hero art at 0.72 of its scale, like the icon shelves, so the
// footer stays in proportion with the page above it instead of filling the
// width. The ground is its own full-bleed band, so a narrower scene never
// leaves it short of the edges.
const SCALE =
  "[--w:100cqw] [--s:max(tan(atan2(var(--w),1512px)),min(tan(atan2(var(--w),780px)),0.55))] xl:[--s:calc(0.72*min(1.5,tan(atan2(var(--w),1512px))))] xl:[--edge:calc((var(--w)_-_1512px*var(--s))_/_(2*var(--s)))]";

// Centres the scene; when it's wider than the viewport, keeps x=656 in the
// middle so the signpost stays in frame. (The badges centre on their own.)
// Kept as --left so the forklift can find the screen's right edge.
const sceneLeft = {
  "--left": "max((var(--w) - 1512px * var(--s)) / 2, min(0px, max(var(--w) - 1512px * var(--s), var(--w) / 2 - 656px * var(--s))))",
  left: "var(--left)",
} as CSSProperties;

/* Ground, redrawn from the shelves art as repeating bands so it can run edge to
 * edge: a cross-hatched grass band over rows of hatched soil, 4px strokes,
 * hatch every 10.5 units at the original 19:28.5 slant. Scene units (y = 416
 * is the floor line the shelves, signpost and forklift stand on). The art has
 * two soil rows; more run on below them for when the footer is deeper. */
const HATCH = { gap: 10.5, run: 19, depth: 28.5 };
const BANDS = [
  { y: 416, lean: "back", color: "#b8d4a8" },
  { y: 418, lean: "forward", color: "#b8d4a8" },
  ...Array.from({ length: 8 }, (_, row) =>
    ({ y: 448 + 30 * row, lean: row % 2 ? "forward" : "back", color: "#563724" }) as const),
];

// Deep enough below the floor line for the basket dock (basket.tsx: 44px
// tall, max(1rem, safe area) up, 1.5rem from sm) to sit on the soil with
// 12px to spare rather than over the scene, which it would on phones;
// otherwise to the end of the art's second soil row (506.5, plus its 2px
// half-stroke).
const HEIGHT =
  "[--dock:calc(max(1rem,env(safe-area-inset-bottom))+56px)] sm:[--dock:80px] h-[max(509px*var(--s),416px*var(--s)+var(--dock))]";

function Ground() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full">
      <defs>
        {BANDS.map((band, index) => (
          <pattern key={index} id={`ground-${index}`} patternUnits="userSpaceOnUse"
            y={band.y} width={HATCH.gap} height={HATCH.depth}>
            {[-3, -2, -1, 0, 1, 2, 3].map((k) => {
              const x = k * HATCH.gap;
              const dx = band.lean === "forward" ? -HATCH.run : HATCH.run;
              return <path key={k} d={`M${x} 0l${dx} ${HATCH.depth}`} stroke={band.color} strokeWidth={4} />;
            })}
          </pattern>
        ))}
      </defs>
      <g style={{ transform: "scale(var(--s))" }}>
        {BANDS.map((band, index) => (
          <rect key={index} x={-50} y={band.y} width={20000} height={HATCH.depth}
            fill={`url(#ground-${index})`} stroke={band.color} strokeWidth={4} />
        ))}
      </g>
    </svg>
  );
}

const EXHAUST_DELAYS = ["0ms", "370ms", "730ms"];

type Cat = { delay: string; eyes: { d: string; fill: string }[] };

// The cats' eyes, lifted out of their SVGs so they can blink like the window
// cat's (cat-blink). Each cat starts at its own point in the cycle, so they
// never blink together.
const SIGNPOST_CAT: Cat = {
  delay: "-1s",
  eyes: [
    { fill: "#000", d: "M84.36 15.45c3.03.02 3.29 4.98.7 6.2-3.16-.05-3.18-4.98-.7-6.2" },
    { fill: "#000", d: "M71.53 15.56c2.89-.09 3.25 5.02.63 6.1-2.93-.06-3.18-4.86-.63-6.1" },
  ],
};
const SHELF_CATS: Cat[] = [
  {
    delay: "-0.2s",
    eyes: [
      { fill: "#767bfc", d: "M250.3 207.62c.83-.03 1.5.13 1.86.98.57 1.33.47 3.4.08 4.79-.17.6-.65.82-1.17 1.05-2.73-.06-2.26-3.56-1.95-5.44.12-.72.58-1.03 1.18-1.38" },
      { fill: "#767bfc", d: "M239.73 207.6c.72 0 1.39.15 1.75.87.68 1.34.5 3.35.17 4.8-.16.66-.58.86-1.12 1.15-2.83.03-2.28-3.65-1.96-5.54.1-.66.6-.98 1.16-1.28" },
    ],
  },
  {
    delay: "-3.3s",
    eyes: [
      { fill: "#767bfc", d: "M1521.1 103.11c1.92-.11 2.02 1.05 2.03 2.77.01 1.05-.08 1.86-.88 2.56-2.02.13-2.1-1.48-2-3.13.06-1.08.06-1.43.85-2.2" },
      { fill: "#767bfc", d: "M1529.49 103.11c1.86-.18 2.05 1.17 2.03 2.77-.02 1.12-.06 1.81-.91 2.57-1.63.04-2.04-1.06-2.03-2.6 0-1.14.05-1.95.91-2.74" },
    ],
  },
];

/** Blinking eyes drawn over an art SVG: same viewBox, laid over the same box. */
function Eyes({ viewBox, cats, className }: { viewBox: string; cats: Cat[]; className: string }) {
  return (
    <svg viewBox={viewBox} preserveAspectRatio="none" fill="none" aria-hidden className={`pointer-events-none ${className}`}>
      {cats.map((cat) => (
        <g
          key={cat.delay}
          style={{ animationDelay: cat.delay }}
          className="origin-center animate-cat-blink [transform-box:fill-box] motion-reduce:animate-none"
        >
          {cat.eyes.map((eye) => (
            <path key={eye.d} d={eye.d} fill={eye.fill} />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** The signpost, in scene units: it stands just right of the left shelf. */
function SignpostArt() {
  return (
    <>
      <Image
        src="/footer/signpost.svg"
        alt=""
        // 1.25x the Figma size, still standing on the floor.
        width={203.314}
        height={260.53}
        className="absolute top-[154.87px] left-[280px] max-w-none"
      />
      <Eyes
        viewBox="0 0 162.65 208.42"
        cats={[SIGNPOST_CAT]}
        className="absolute top-[154.87px] left-[280px] h-[260.53px] w-[203.314px]"
      />
    </>
  );
}

// Each shelf's outermost box sits this far (scene units) inside its screen
// edge, so no box is cut. As placed in the Figma scene, the left shelf's boxes
// start at x = 18.47 and the right's end at 1509.38.
const BOX_MARGIN = 16;
const SHELF_SHIFT = { left: BOX_MARGIN - 18.47, right: 1512 - BOX_MARGIN - 1509.38 };

// Both shelves are one image, so each side clips it to its own half first,
// leaving its outer side unclipped for the planks.
const SHELF_SIDES = {
  left: { clipPath: "inset(0 50% 0 -100%)", translate: `${SHELF_SHIFT.left}px 0` },
  right: { clipPath: "inset(0 -100% 0 50%)", translate: `${SHELF_SHIFT.right}px 0` },
} satisfies Record<string, CSSProperties>;

// The forklift drives to the right shelf, so its route moves with it.
const forkliftRoute = { "--to-shelf": `${552 + SHELF_SHIFT.right}px` } as CSSProperties;

/** One storage shelf, in scene units. Its outer side is drawn open, the
 * planks running on to the art's edge, so they always run off the screen. */
function ShelvesArt({ side }: { side: keyof typeof SHELF_SIDES }) {
  return (
    <div style={SHELF_SIDES[side]} className="absolute inset-0">
      <Image
        src="/footer/shelves.svg"
        alt=""
        width={1895}
        height={553}
        // The footer's largest image, so it's the LCP when a page opens at the
        // footer (scroll restore, #anchors). Eager but low priority: it starts
        // at once without competing with the hero art above it.
        loading="eager"
        fetchPriority="low"
        className="absolute top-[84px] left-[-190.53px] max-w-none"
      />
      <Eyes
        viewBox="0 0 1895.15 553"
        cats={SHELF_CATS}
        className="absolute top-[84px] left-[-190.53px] h-[553px] w-[1895.15px]"
      />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="@container w-full overflow-clip">
      <div className={`relative ${HEIGHT} ${SCALE}`}>
        <Ground />
        <div
          style={sceneLeft}
          className="relative h-full w-[calc(1512px*var(--s))]"
        >
          <div className="relative h-[508px] w-[1512px] origin-top-left scale-(--s)">
            {/* From xl the signpost rides with the left shelf (below). */}
            <div className="xl:hidden">
              <SignpostArt />
            </div>

            {/* From xl the shelves pin to the screen edges instead (below). */}
            <div className="xl:hidden">
              <ShelvesArt side="left" />
              <ShelvesArt side="right" />
            </div>

            {/* From xl the signpost and shelves sit out at the screen edges,
                --edge (scene units) away from the scene. The forklift parks
                that much further left, beside the signpost, and drives that
                much further right, to the shelf. Below xl, where the scene
                is cropped, it stops short of the right screen edge instead:
                496 start + 192 body + 24 margin = 712. */}
            <div
              style={forkliftRoute}
              className="absolute top-[277.65px] left-[496px] animate-forklift-drive [--drive:min(var(--to-shelf),calc((var(--w)_-_var(--left))_/_var(--s)_-_712px))] motion-reduce:animate-none xl:left-[calc(496px_-_var(--edge))] xl:[--drive:calc(var(--to-shelf)_+_2*var(--edge))]"
            >
              {EXHAUST_DELAYS.map((delay) => (
                <span
                  key={delay}
                  style={{ animationDelay: delay }}
                  className="absolute top-[84px] left-[6px] size-[14px] animate-exhaust-puff rounded-full border-2 border-[#c4c4c4] bg-[#f4f4f4] opacity-0 motion-reduce:hidden"
                />
              ))}
              {/* pitch on starts and stops, from the wheels */}
              <div className="origin-bottom animate-forklift-pitch motion-reduce:animate-none">
                {/* engine rumble; the parts animate inside <Forklift> */}
                <div className="relative origin-bottom animate-forklift-rumble motion-reduce:animate-none">
                  <Forklift />
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* The badges centre on the screen rather than the scene: below 832px
            the scene is cropped around the signpost, off its middle. Where
            it isn't cropped the two centres are the same. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
          <div className="pointer-events-auto origin-top scale-(--s)">
            <BadgeShelf className="flex gap-8" />
          </div>
        </div>
        {/* Each shelf keeps its open side on its own screen edge; the signpost
            stays beside the left one. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[calc(756px*var(--s))] overflow-hidden xl:block">
          <div className="relative h-[508px] w-[1512px] origin-top-left scale-(--s)">
            <SignpostArt />
            <ShelvesArt side="left" />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[calc(756px*var(--s))] overflow-hidden xl:block">
          <div className="absolute top-0 right-0 h-[508px] w-[1512px] origin-top-right scale-(--s)">
            <ShelvesArt side="right" />
          </div>
        </div>
      </div>
    </footer>
  );
}

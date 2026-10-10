import Image from "next/image";
import type { CSSProperties } from "react";
import { Badges } from "@/components/badge";

const scale = {
  "--s": "tan(atan2(100cqw, 1512px))",
} as CSSProperties;

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
const FORKLIFT_CAT: Cat = {
  delay: "-2.4s",
  eyes: [
    { fill: "#727af7", d: "M47.83 29.01c2.2-1.56 4.17 6.94.96 5.95-2.05-1.44-2.19-3.9-.96-5.95" },
    { fill: "#6a72f6", d: "M58.14 26.9c2.36 0 3.36 5.55 1.97 6.06-3-.51-3.37-3.86-1.97-6.06" },
  ],
};
const SHELF_CATS: Cat[] = [
  {
    delay: "-0.2s",
    eyes: [
      { fill: "#6a72f6", d: "M250.3 207.62c.83-.03 1.5.13 1.86.98.57 1.33.47 3.4.08 4.79-.17.6-.65.82-1.17 1.05-2.73-.06-2.26-3.56-1.95-5.44.12-.72.58-1.03 1.18-1.38" },
      { fill: "#6a72f6", d: "M239.73 207.6c.72 0 1.39.15 1.75.87.68 1.34.5 3.35.17 4.8-.16.66-.58.86-1.12 1.15-2.83.03-2.28-3.65-1.96-5.54.1-.66.6-.98 1.16-1.28" },
    ],
  },
  {
    delay: "-3.3s",
    eyes: [
      { fill: "#6a72f6", d: "M1521.1 103.11c1.92-.11 2.02 1.05 2.03 2.77.01 1.05-.08 1.86-.88 2.56-2.02.13-2.1-1.48-2-3.13.06-1.08.06-1.43.85-2.2" },
      { fill: "#6a72f6", d: "M1529.49 103.11c1.86-.18 2.05 1.17 2.03 2.77-.02 1.12-.06 1.81-.91 2.57-1.63.04-2.04-1.06-2.03-2.6 0-1.14.05-1.95.91-2.74" },
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

export function Footer() {
  return (
    <footer className="@container w-full overflow-clip">
      <div
        style={scale}
        className="mx-auto h-[calc(508px*var(--s))] w-[calc(1512px*var(--s))]"
      >
        <div className="relative h-[508px] w-[1512px] origin-top-left scale-(--s)">
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

          <Image
            src="/footer/shelves.svg"
            alt=""
            width={1895.15}
            height={553}
            className="absolute top-[84px] left-[-190.53px] max-w-none"
          />
          <Eyes
            viewBox="0 0 1895.15 553"
            cats={SHELF_CATS}
            className="absolute top-[84px] left-[-190.53px] h-[553px] w-[1895.15px]"
          />

          <div className="absolute top-[277.65px] left-[496px] animate-forklift-drive motion-reduce:animate-none">
            {EXHAUST_DELAYS.map((delay) => (
              <span
                key={delay}
                style={{ animationDelay: delay }}
                className="absolute top-[84px] left-[6px] size-[14px] animate-exhaust-puff rounded-full border-2 border-[#a2a7fa] bg-[#eef0fe] opacity-0 motion-reduce:hidden"
              />
            ))}
            {/* the driver's eyes ride the rumble with the forklift */}
            <div className="relative origin-bottom animate-forklift-rumble motion-reduce:animate-none">
              <Image
                src="/footer/forklift.svg"
                alt=""
                // Drawn at 1.5x the Figma size so it reads closer in scale to the
                // shelf boxes. It still rests on the floor line at y≈416.
                width={192.234}
                height={138.296}
                className="block max-w-none"
              />
              <Eyes viewBox="0 0 128.16 92.2" cats={[FORKLIFT_CAT]} className="absolute inset-0 size-full" />
            </div>
          </div>

          <div className="absolute top-0 left-[488px] flex gap-8">
            <Badges />
          </div>
        </div>
      </div>
    </footer>
  );
}

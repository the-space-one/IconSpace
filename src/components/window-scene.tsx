import Image from "next/image";
import type { CSSProperties } from "react";

// The shop window from the hero, split into layers so the cat can bang its paw
// next to the laptop, blink, and the lamps can sway. Every full-size layer
// shares the window's 143.5×304 box; the inline SVGs use the same viewBox.
const VIEW_BOX = "1381.5 369.5 143.5 304";

// The cat's right paw (resting beside the laptop) is part of the cat's single
// outline path, so we draw the cat twice: once with this box cut out, and once
// with only this box showing, which then pivots at the wrist.
const PAW = { left: 89.5, top: 192.5, right: 112.5, bottom: 215 };
const catWithoutPaw = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${PAW.left}px ${PAW.top}px, ${PAW.right}px ${PAW.top}px, ${PAW.right}px ${PAW.bottom}px, ${PAW.left}px ${PAW.bottom}px, ${PAW.left}px ${PAW.top}px)`;
const pawOnly = `polygon(${PAW.left}px ${PAW.top}px, ${PAW.right}px ${PAW.top}px, ${PAW.right}px ${PAW.bottom}px, ${PAW.left}px ${PAW.bottom}px)`;

const LAMPS = [
  {
    src: "/hero/window/lamp-1.svg",
    left: 24.9,
    top: 12.1,
    width: 23,
    lens: [10.95, 22.9],
    delay: "-0.4s",
  },
  {
    src: "/hero/window/lamp-2.svg",
    left: 65.1,
    top: 11.1,
    width: 22,
    lens: [10.05, 22.25],
    delay: "-1.3s",
  },
  {
    src: "/hero/window/lamp-3.svg",
    left: 107.1,
    top: 12.1,
    width: 22,
    lens: [14.4, 22.85],
    delay: "-2.1s",
  },
];

function Layer({ src, style }: { src: string; style?: CSSProperties }) {
  return (
    <Image
      src={src}
      alt=""
      width={143.5}
      height={304}
      style={style}
      className="absolute inset-0 max-w-none"
    />
  );
}

export function WindowScene() {
  return (
    // Fills its parent's width; `--s` (the hero's scale) sizes the stage.
    <div className="relative aspect-[143.5/304] w-full">
      <div className="relative h-[304px] w-[143.5px] origin-top-left scale-(--s)">
        <Layer src="/hero/window/plant.svg" />

        <Layer src="/hero/window/cat.svg" style={{ clipPath: catWithoutPaw }} />

        {/* Pivots at the wrist (the paw's lower-right corner) and slams down. */}
        <div className="absolute inset-0 origin-[112.5px_211.5px] animate-cat-paw-bang motion-reduce:animate-none">
          <Layer src="/hero/window/cat.svg" style={{ clipPath: pawOnly }} />
        </div>

        <svg
          viewBox={VIEW_BOX}
          fill="none"
          className="absolute inset-0"
          aria-hidden
        >
          <g className="origin-center animate-cat-blink [transform-box:fill-box] motion-reduce:animate-none">
            <path
              d="M1486.51 536.012C1492.47 535.951 1490.21 543.801 1488.2 546.953C1487.77 547.64 1486.92 548.209 1486.26 548.665C1480.32 549.271 1482.05 538.942 1486.51 536.012Z"
              fill="black"
            />
            <path
              d="M1467.1 530.781C1472.63 531.044 1471.13 540.83 1466.18 543.157C1460.93 542.396 1462.45 533.189 1467.1 530.781Z"
              fill="black"
            />
          </g>
        </svg>

        <div className="absolute inset-0 origin-[42.2%_70.72%] animate-laptop-jolt motion-reduce:animate-none">
          <Layer src="/hero/window/laptop.svg" />
        </div>

        {/* Impact lines where the paw lands. */}
        <svg
          viewBox={VIEW_BOX}
          fill="none"
          className="absolute inset-0"
          aria-hidden
        >
          <g
            stroke="black"
            strokeWidth="1"
            strokeLinecap="round"
            className="origin-bottom opacity-0 animate-bang-lines [transform-box:fill-box] motion-reduce:hidden"
          >
            <path d="M1469 570L1466 567M1474 567.5V563M1479 569L1481.5 566" />
          </g>
        </svg>

        <Layer src="/hero/window/static.svg" />

        {LAMPS.map((lamp) => (
          <div
            key={lamp.src}
            style={{
              left: lamp.left,
              top: lamp.top,
              width: lamp.width,
              animationDelay: lamp.delay,
            }}
            className="absolute h-[27px] origin-[50%_5%] animate-lamp-sway motion-reduce:animate-none"
          >
            {/* Warm light cone under the lens. */}
            <div
              style={{
                left: lamp.lens[0] - 22,
                top: lamp.lens[1] - 1,
                animationDelay: lamp.delay,
              }}
              className="absolute h-[70px] w-[44px] animate-lamp-glow bg-[linear-gradient(to_bottom,rgba(255,210,90,0.35),rgba(255,210,90,0))] mix-blend-multiply [clip-path:polygon(38.6%_0,61.4%_0,100%_100%,0_100%)] motion-reduce:animate-none"
            />
            <Image
              src={lamp.src}
              alt=""
              width={lamp.width}
              height={27}
              className="relative max-w-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { IconBubble } from "@/components/icon-bubble";

const VIEW_BOX = "1381.5 369.5 143.5 304";

const PAW = { left: 89.5, top: 192.5, right: 112.5, bottom: 216.5 };
const catWithoutPaw = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${PAW.left}px ${PAW.top}px, ${PAW.right}px ${PAW.top}px, ${PAW.right}px ${PAW.bottom}px, ${PAW.left}px ${PAW.bottom}px, ${PAW.left}px ${PAW.top}px)`;
const pawOnly = `polygon(${PAW.left}px ${PAW.top}px, ${PAW.right}px ${PAW.top}px, ${PAW.right}px ${PAW.bottom}px, ${PAW.left}px ${PAW.bottom}px)`;

const LAMP = {
  src: "/hero/window/lamp.svg",
  width: 19.8625,
  height: 25.8295,
  lens: [12.6, 21.5],
};
// The lens faces down and to the right, so each light cone is tipped to match:
// its chord in lamp.svg runs (6.5, 24.04) → (18.68, 16.83), 30.6° off level.
const LAMPS = [
  { left: 30.5, top: 14.5, delay: "-0.4s" },
  { left: 69.5, top: 13.5, delay: "-1.3s" },
  { left: 111.5, top: 14.5, delay: "-2.1s" },
];

// Each cone is 10 wide at the lens and widens 0.24 per unit on each side,
// long enough to reach the shelf from any lamp at any point of its sway.
// The window clips the rest: inside the left post and top bar, down to the
// shelf the cat sits on (static.svg's inner edges, in scene units).
const BEAM = { length: 260, lens: 10, spread: 0.24 };
const BEAM_WIDTH = BEAM.lens + 2 * BEAM.spread * BEAM.length;
const BEAM_INSET = ((1 - BEAM.lens / BEAM_WIDTH) / 2) * 100;
const GLASS = { top: 15, bottom: 214, left: 13.5 };

function Swing({ lamp, children }: { lamp: (typeof LAMPS)[number]; children: ReactNode }) {
  return (
    <div
      style={{
        left: lamp.left,
        top: lamp.top,
        width: LAMP.width,
        height: LAMP.height,
        animationDelay: lamp.delay,
      }}
      className="absolute origin-[3.7px_1px] animate-lamp-sway motion-reduce:animate-none"
    >
      {children}
    </div>
  );
}

function Layer({ src, style }: { src: string; style?: CSSProperties }) {
  return (
    <Image
      src={src}
      alt=""
      fill
      sizes="144px"
      style={style}
      fetchPriority="low"
    />
  );
}

export function WindowScene() {
  return (
    <div className="relative aspect-[143.5/304] w-full">
      <div className="relative h-[304px] w-[143.5px] origin-top-left scale-(--s)">
        <Layer src="/hero/window/plant.svg" />

        <Layer src="/hero/window/cat.svg" style={{ clipPath: catWithoutPaw }} />

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
              d="M1486.12 536.136C1487.56 536.129 1488.48 536.597 1489.04 537.329C1489.61 538.073 1489.83 539.114 1489.79 540.274C1489.72 542.45 1488.79 544.984 1487.86 546.58L1487.67 546.886C1487.26 547.538 1486.46 548.085 1485.79 548.542C1484.36 548.679 1483.41 548.167 1482.84 547.288C1482.26 546.391 1482.06 545.098 1482.18 543.675C1482.3 542.256 1482.75 540.724 1483.44 539.367C1484.12 538.021 1485.04 536.855 1486.12 536.136Z"
              fill="#9FA1FF"
              stroke="#9FA1FF"
              strokeWidth="0.25"
            />
            <path
              d="M1466.7 530.908C1468.02 530.981 1468.91 531.614 1469.45 532.56C1469.99 533.52 1470.17 534.813 1470.02 536.182C1469.72 538.912 1468.13 541.876 1465.73 543.026C1464.48 542.834 1463.64 542.148 1463.14 541.184C1462.63 540.204 1462.48 538.933 1462.63 537.601C1462.93 534.942 1464.44 532.097 1466.7 530.908Z"
              fill="#9FA1FF"
              stroke="#9FA1FF"
              strokeWidth="0.25"
            />
          </g>
        </svg>

        <Layer src="/hero/window/glass.svg" />

        <IconBubble />

        <div className="absolute inset-0 origin-[42.2%_70.72%] animate-laptop-jolt motion-reduce:animate-none">
          <Layer src="/hero/window/laptop.svg" />
        </div>

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

        {/* The light, one layer for all three cones so the window can clip it;
            each cone swings in step with its lamp, drawn above. */}
        <div
          style={{ clipPath: `inset(${GLASS.top}px 0 ${304 - GLASS.bottom}px ${GLASS.left}px)` }}
          className="absolute inset-0 mix-blend-multiply"
        >
          {LAMPS.map((lamp) => (
            <Swing key={lamp.left} lamp={lamp}>
              <div
                style={{
                  left: LAMP.lens[0] - BEAM_WIDTH / 2,
                  top: LAMP.lens[1] - 1,
                  width: BEAM_WIDTH,
                  height: BEAM.length,
                  clipPath: `polygon(${BEAM_INSET}% 0, ${100 - BEAM_INSET}% 0, 100% 100%, 0 100%)`,
                  animationDelay: lamp.delay,
                }}
                className="absolute origin-top rotate-[-30.6deg] animate-lamp-glow bg-linear-to-b from-[rgba(255,210,90,0.18)] to-[rgba(255,210,90,0.08)] motion-reduce:animate-none"
              />
            </Swing>
          ))}
        </div>

        {LAMPS.map((lamp) => (
          <Swing key={lamp.left} lamp={lamp}>
            <Image
              src={LAMP.src}
              alt=""
              width={LAMP.width}
              height={LAMP.height}
              fetchPriority="low"
              className="relative max-w-none"
            />
          </Swing>
        ))}
      </div>
    </div>
  );
}

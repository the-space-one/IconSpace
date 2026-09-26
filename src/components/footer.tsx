import Image from "next/image";
import type { CSSProperties } from "react";
import { BadgeReflections, Badges } from "@/components/badge";
import { Shelf } from "@/components/shelf";

// Same approach as the hero: lay the 1512×545 band out at design size and
// scale it to the page width (see hero.tsx for the tan/atan2 trick). Unlike
// the hero it also scales up, because the floor art stops at the frame edges.
const scale = {
  "--s": "tan(atan2(100cqw, 1512px))",
} as CSSProperties;

// Staggered so a new puff leaves the exhaust every ~370ms.
const EXHAUST_DELAYS = ["0ms", "370ms", "730ms"];

export function Footer() {
  return (
    <footer className="@container w-full overflow-x-clip">
      <div
        style={scale}
        className="mx-auto h-[calc(545px*var(--s))] w-[calc(1512px*var(--s))]"
      >
        <div className="relative h-[545px] w-[1512px] origin-top-left scale-(--s)">
          {/* Layer order follows Figma: signpost, shelves, forklift, floor. */}
          <Image
            src="/footer/signpost.svg"
            alt=""
            width={162.651}
            height={208.403}
            className="absolute top-[120px] left-[287.85px] max-w-none"
          />

          {/* Shelves and floor are wider than the frame and bleed off both sides. */}
          <Image
            src="/footer/shelves-back.svg"
            alt=""
            width={1892.28}
            height={549}
            className="absolute top-[-2px] left-[-189.66px] max-w-none"
          />

          <div className="absolute top-[235.5px] left-[273.34px] animate-forklift-drive motion-reduce:animate-none">
            {EXHAUST_DELAYS.map((delay) => (
              <span
                key={delay}
                style={{ animationDelay: delay }}
                className="absolute top-[56px] left-[4px] size-[10px] animate-exhaust-puff rounded-full border-[1.5px] border-[#a2a7fa] bg-[#eef0fe] opacity-0 motion-reduce:hidden"
              />
            ))}
            <Image
              src="/footer/forklift.svg"
              alt=""
              width={128}
              height={92}
              className="relative max-w-none origin-bottom animate-forklift-rumble motion-reduce:animate-none"
            />
          </div>

          <Image
            src="/footer/shelves-front.svg"
            alt=""
            width={1892.28}
            height={549}
            className="absolute top-[-2px] left-[-189.66px] max-w-none"
          />

          {/* Badges stand on a glossy shelf like the icon rows, overhanging
              it by the same 29px on each side and overlapping it by 12px. */}
          <Shelf
            className="absolute top-[104px] left-[458.97px] w-[594px]"
            reflection={
              <div className="absolute top-2.5 left-[29px] flex gap-8">
                <BadgeReflections />
              </div>
            }
          />
          <div className="absolute top-[6px] left-[487.97px] flex gap-8">
            <Badges />
          </div>
        </div>
      </div>
    </footer>
  );
}

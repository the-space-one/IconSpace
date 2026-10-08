import Image from "next/image";
import type { CSSProperties } from "react";
import { Badges } from "@/components/badge";

const scale = {
  "--s": "tan(atan2(100cqw, 1512px))",
} as CSSProperties;

const EXHAUST_DELAYS = ["0ms", "370ms", "730ms"];

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
            width={162.651}
            height={208.424}
            className="absolute top-[207px] left-[297px] max-w-none"
          />

          <Image
            src="/footer/shelves.svg"
            alt=""
            width={1895.15}
            height={553}
            className="absolute top-[84px] left-[-190.53px] max-w-none"
          />

          <div className="absolute top-[323.75px] left-[471px] animate-forklift-drive motion-reduce:animate-none">
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
              width={128.156}
              height={92.1975}
              className="relative max-w-none origin-bottom animate-forklift-rumble motion-reduce:animate-none"
            />
          </div>

          <div className="absolute top-0 left-[488px] flex gap-8">
            <Badges />
          </div>
        </div>
      </div>
    </footer>
  );
}

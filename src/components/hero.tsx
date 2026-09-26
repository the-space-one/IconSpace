import Image from "next/image";
import type { CSSProperties } from "react";
import { HeavyFollow } from "@/components/heavy-follow";
import { InstallCard } from "@/components/install-card";
import { WindowScene } from "@/components/window-scene";

// The design is a fixed 1579×675 composition. We lay it out at that size and
// scale the whole stage down on narrower screens. `tan(atan2(a, b))` is the
// CSS trick for dividing two lengths into a unitless ratio.
const scale = {
  "--s": "min(1, tan(atan2(100cqw, 1579px)))",
} as CSSProperties;

export function Hero() {
  return (
    <section className="@container w-full overflow-x-clip">
      {/* The stage's lower middle is empty, so let the next section (the icon
          shelves) ride up into it: it starts at y≈430 instead of y=675. */}
      <div style={scale} className="relative mb-[calc(-190px*var(--s))]">
        <div className="mx-auto h-[calc(675px*var(--s))] w-[calc(1579px*var(--s))]">
          <div className="relative h-[675px] w-[1579px] origin-top-left scale-(--s)">
            <Image
              src="/hero/art-back.svg"
              alt=""
              width={1579}
              height={675}
              priority
              className="absolute inset-0"
            />

            <h1 className="absolute top-0 left-[496.43px] w-[542px] text-center font-makenfy text-[80px] leading-none text-black">
              Premium animated Icons
            </h1>

            <p className="absolute top-[184px] left-[575.93px] w-[383px] text-center font-froundy text-lg whitespace-nowrap text-[#737373]">
              Fast, energetic motion that brings character
              <br />
              and adds even more delight to every interaction.
            </p>

            <div className="absolute top-[272px] left-[537.43px]">
              <InstallCard />
            </div>

            {/* Grass tufts and bushes sit in front of the card. */}
            <Image
              src="/hero/art-front.svg"
              alt=""
              width={1579}
              height={675}
              className="pointer-events-none absolute inset-0"
            />
          </div>
        </div>

        {/* The window scene hangs off the page's right edge, not the stage's,
            and trails the viewport as the page scrolls. */}
        <HeavyFollow className="absolute top-[calc(369.5px*var(--s))] right-0 z-10 w-[calc(143.5px*var(--s))]">
          <WindowScene />
        </HeavyFollow>
      </div>
    </section>
  );
}

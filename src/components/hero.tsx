import Image from "next/image";
import type { CSSProperties } from "react";
import { HeavyFollow } from "@/components/heavy-follow";
import { InstallCard } from "@/components/install-card";
import { WindowScene } from "@/components/window-scene";

const scale = {
  "--s": "tan(atan2(100cqw, 1512px))",
} as CSSProperties;

const stage =
  "absolute top-0 left-[calc(-8.43px*var(--s))] h-[675px] w-[1579px] origin-top-left scale-(--s)";

export function Hero() {
  return (
    <section className="@container w-full overflow-x-clip">
      <div style={scale} className="relative mb-[calc(-190px*var(--s))]">
        <div className="relative z-10 flex flex-col items-center px-4 lg:absolute lg:top-0 lg:left-[calc(-8.43px*var(--s))] lg:block lg:h-[675px] lg:w-[1579px] lg:origin-top-left lg:scale-(--s) lg:px-0">
          <h1 className="w-[6.775em] text-center font-makenfy text-[clamp(2.25rem,11vw,5rem)] leading-none text-foreground lg:absolute lg:top-0 lg:left-[496.43px] lg:text-[80px]">
            Premium animated Icons
          </h1>

          <p className="mt-6 max-w-[383px] text-center font-froundy text-lg text-muted-foreground lg:absolute lg:top-[184px] lg:left-[575.93px] lg:mt-0 lg:w-[383px] lg:max-w-none lg:whitespace-nowrap">
            Fast, energetic motion that brings character
            <br className="max-lg:hidden" /> and adds even more delight to every
            interaction.
          </p>

          <div className="mt-8 w-full max-w-[460px] lg:absolute lg:top-[272px] lg:left-[537.43px] lg:mt-0 lg:w-[460px]">
            <InstallCard />
          </div>
        </div>

        <div className="relative h-[calc(675px*var(--s))]">
          <div className={stage}>
            <Image
              src="/hero/art-back.svg"
              alt=""
              width={1579}
              height={675}
              fetchPriority="high"
              loading="eager"
              className="absolute inset-0"
            />
          </div>

          <div className={`${stage} pointer-events-none z-20`}>
            <Image
              src="/hero/art-front.svg"
              alt=""
              width={1579}
              height={675}
              loading="eager"
              className="absolute inset-0"
            />
          </div>

          <HeavyFollow className="absolute top-[calc(369.5px*var(--s))] right-0 z-30 w-[calc(143.5px*var(--s))]">
            <WindowScene />
          </HeavyFollow>
        </div>
      </div>
    </section>
  );
}

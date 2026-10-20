import { HeavyFollow } from "@/components/heavy-follow";
import { InstallCard } from "@/components/install-card";
import { ShopBack, ShopFront } from "@/components/shop-scene";
import { WindowScene } from "@/components/window-scene";

/*
 * Two layouts, split where the content stops fitting:
 *
 * < xl  Stacked. Copy in flow, then the shop as a centred island: art x 0–545
 *       (the hedge isn't drawn past it — the card used to cover the middle),
 *       y 70–430, both ends faded. Phones fit ~520 units so the cats stay
 *       legible; larger screens stop at 1.1× and gain margin instead.
 * ≥ xl  Overlay. The 460px card sits between the shop and the hedges, which
 *       only clears the shop from ~1224px. The art scales with the viewport
 *       up to 1.5× and then centres; the copy is pinned to art coordinates
 *       but its text and card keep their real size.
 *
 * --s is the art's scale in both layouts. It's resolved against the section
 * (the nearest container), so nothing reading it may sit in another container.
 */
const stage =
  "absolute top-[calc(-70px*var(--s))] left-[calc(50%-272px*var(--s))] h-[675px] w-[1579px] origin-top-left scale-(--s) [mask-image:linear-gradient(to_right,transparent,#000_2.5%,#000_31%,transparent_34.5%)] xl:top-0 xl:left-[calc(-8.43px*var(--s))] xl:[mask-image:none] min-[1815px]:[mask-image:linear-gradient(to_right,transparent,#000_2%,#000_98%,transparent)]";

export function Hero() {
  return (
    <section className="@container w-full overflow-x-clip">
      <div className="relative mx-auto [--w:100cqw] [--s:min(1.1,tan(atan2(var(--w),520px)))] xl:mb-[calc(-190px*var(--s))] xl:w-[calc(1512px*var(--s))] xl:[--s:min(1.5,tan(atan2(var(--w),1512px)))]">
        <div className="relative z-30 flex flex-col items-center px-4 xl:pointer-events-none xl:absolute xl:inset-x-0 xl:top-0 xl:px-0 xl:*:pointer-events-auto">
          <h1 className="w-[6.775em] text-center font-makenfy text-[clamp(2.25rem,11vw,5rem)] leading-none text-foreground xl:text-[length:calc(80px*var(--s))]">
            Premium animated Icons
          </h1>

          <p className="mt-6 max-w-[383px] text-center font-froundy text-lg text-muted-foreground xl:absolute xl:top-[calc(184px*var(--s))] xl:left-1/2 xl:mt-0 xl:max-w-none xl:-translate-x-1/2 xl:text-[length:calc(18px*max(1,var(--s)))] xl:leading-[1.556] xl:whitespace-nowrap">
            Fast, energetic motion that brings character
            <br className="max-xl:hidden" /> and adds even more delight to every
            interaction.
          </p>

          <div className="mt-8 w-full max-w-[520px] xl:absolute xl:top-[calc(272px*var(--s))] xl:left-1/2 xl:mt-0 xl:w-[520px] xl:-translate-x-1/2">
            <div className="origin-top xl:[scale:max(1,var(--s))]">
              <InstallCard />
            </div>
          </div>
        </div>

        <div className="relative mt-4 h-[calc(360px*var(--s))] xl:mt-0 xl:h-[calc(675px*var(--s))]">
          <div className={stage}>
            <ShopBack />
          </div>

          <div className={`${stage} pointer-events-none z-20`}>
            <ShopFront />
          </div>

          {/* Below xl it would cover the full-width shelves, so it waits for the overlay layout. */}
          <HeavyFollow className="absolute top-[calc(369.5px*var(--s))] right-[calc((1512px*var(--s)-100cqw)/2)] z-30 hidden w-[calc(143.5px*var(--s))] xl:block">
            <WindowScene />
          </HeavyFollow>
        </div>
      </div>
    </section>
  );
}

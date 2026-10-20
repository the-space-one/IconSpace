import Image from "next/image";
import { CuriousMascot } from "@/components/curious-mascot";
import { MascotPeek } from "@/components/mascot-peek";

// The remote of ~/Desktop/Icon-Waitlist.
const GITHUB_URL = "https://github.com/the-space-one/IconSpace";

export function Navbar() {
  return (
    <nav className="mx-auto flex w-full max-w-[1253px] items-center [--w:100vw] xl:max-w-[max(1253px,calc(1253px*min(1.5,tan(atan2(var(--w),1512px)))))] justify-between font-froundy max-[359px]:zoom-[0.9]">
      <div className="grid size-[61px] shrink-0 place-items-center">
        <CuriousMascot className="w-[45px]" />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="flex h-9 items-center justify-center gap-1.5 overflow-clip rounded-lg bg-white px-3 py-2 text-sm leading-5 text-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-surface"
        >
          Browse Projects
          <Image
            src="/nav/chevron-down.svg"
            alt=""
            width={10}
            height={11}
            loading="eager"
            className="-mx-[0.75px] h-[11px] w-[9.5px] max-w-none"
          />
        </button>

        {/* Room for the peeking cat, which hangs off the button's right edge. */}
        <div className="pr-[19.66px]">
          {/* `isolate` keeps the mascot's z-index local, so it can never slide
              out from behind a neighbouring element instead of the button. */}
          <div className="cta relative isolate">
            <div className="cta__visual relative isolate">
              <span className="cta-cat-anchor pointer-events-none absolute top-1/2 z-0" aria-hidden="true">
                <MascotPeek className="cta-cat block h-[24.25px] w-auto overflow-visible" />
              </span>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="cta__button relative z-10 flex h-9 items-center justify-center rounded-lg bg-brand px-3 py-2 text-sm leading-5 whitespace-nowrap text-brand-foreground shadow-[inset_0_0_0_2px_var(--color-brand-strong)] transition-colors hover:bg-brand-hover"
              >
                On github
              </a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

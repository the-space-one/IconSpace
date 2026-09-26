import Image from "next/image";
import Link from "next/link";

// TODO: point at the real repo.
const GITHUB_URL = "https://github.com";

export function Navbar() {
  return (
    <nav className="mx-auto flex w-full max-w-[1253px] items-center justify-between font-froundy">
      <Link
        href="/"
        aria-label="Home"
        className="relative size-[61px] shrink-0 overflow-clip rounded-[72px]"
      >
        <Image
          src="/nav/logo.svg"
          alt=""
          width={44.6931}
          height={39.2576}
          priority
          className="absolute top-[12.08px] left-[9.26px] max-w-none rotate-[-4.88deg]"
        />
      </Link>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="flex h-9 items-center justify-center gap-1.5 overflow-clip rounded-lg border-2 border-[#9fa1ff] px-3 py-2 text-sm leading-5 text-black transition-colors hover:bg-[#9fa1ff]/10"
        >
          Browse Projects
          <Image
            src="/nav/chevron-down.svg"
            alt=""
            width={9.5001}
            height={11}
            className="-mx-[0.75px] h-[11px] w-[9.5px] max-w-none"
          />
        </button>

        {/* The mascot sits behind the button's right edge and peeks out. */}
        <div className="relative isolate pr-[19.66px]">
          <Image
            src="/nav/github-mascot.svg"
            alt=""
            width={21.662}
            height={24.2516}
            className="absolute top-[4.5px] left-[84px] -z-10 max-w-none"
          />
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 items-center justify-center rounded-lg bg-[#a8aafe] px-3 py-2 text-sm leading-5 whitespace-nowrap text-white shadow-[inset_0_0_0_2px_#8d8fff] transition-colors hover:bg-[#9c9efe]"
          >
            On github
          </a>
        </div>
      </div>
    </nav>
  );
}

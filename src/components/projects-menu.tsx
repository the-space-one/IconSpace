"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";

// Our other projects. The menu stays in the server HTML while it's closed
// (hidden, not unmounted), so every link is a crawlable, followed backlink
// from the home page: no rel="nofollow", and no noreferrer either, so the
// project sees where its visitors came from.
const PROJECTS = [
  { name: "PikoReels", host: "pikoreels.com", href: "https://pikoreels.com/", icon: "/nav/pikoreels.svg" },
];

/** The navbar's "Browse Projects" button and the menu it opens. */
export function ProjectsMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Closes on a click anywhere else, or on Esc (focus goes back to the button).
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node && root.current?.contains(event.target))) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className="group flex h-9 cursor-pointer items-center justify-center gap-1.5 overflow-clip rounded-lg bg-white px-3 py-2 text-sm leading-5 text-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-surface aria-expanded:bg-surface"
      >
        Browse Projects
        <Image
          src="/nav/chevron-down.svg"
          alt=""
          width={10}
          height={11}
          loading="eager"
          className="-mx-[0.75px] h-[11px] w-[9.5px] max-w-none transition-transform duration-200 ease-out group-aria-expanded:rotate-180 motion-reduce:transition-none"
        />
      </button>

      {/* Opens from the button's corner; on a phone the button sits near the
          left of the row, so the menu runs right, over "On github". */}
      <div
        id={menuId}
        data-open={open || undefined}
        className="invisible absolute top-full left-0 z-50 mt-2 w-56 origin-top-left scale-95 rounded-[14px] bg-white p-1.5 opacity-0 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_12px_32px_-12px_rgba(0,0,0,0.25)] transition-[opacity,scale,visibility] duration-150 ease-out data-open:visible data-open:scale-100 data-open:opacity-100 motion-reduce:scale-100 motion-reduce:transition-none"
      >
        <ul>
          {PROJECTS.map((project) => (
            <li key={project.href}>
              <a
                href={project.href}
                target="_blank"
                rel="noopener"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-[10px] p-2 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground"
              >
                <Image src={project.icon} alt="" width={25} height={28} className="h-7 w-[25px] shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm leading-5 text-foreground">{project.name}</span>
                  <span className="text-xs leading-4 text-muted-foreground">{project.host}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

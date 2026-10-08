import type { ReactNode } from "react";


const fill = [
  "radial-gradient(90% 120% at 12% 0%, rgba(159,161,255,0.34) 0%, rgba(159,161,255,0) 42%)",
  "radial-gradient(90% 140% at 88% 0%, rgba(186,164,255,0.26) 0%, rgba(186,164,255,0) 48%)",
  "linear-gradient(90deg, rgba(159,161,255,0.2), rgba(255,255,255,0.55) 24%, rgba(255,255,255,0.42) 52%, rgba(186,164,255,0.18) 78%, rgba(159,161,255,0.15))",
  "linear-gradient(rgba(255,255,255,0.95) 0%, rgba(244,244,254,0.7) 36%, rgba(224,224,243,0.55) 76%, rgba(249,249,255,0.8) 100%)",
].join(", ");

const sheen = [
  "radial-gradient(at 14% 62%, rgba(159,161,255,0.22) 0%, rgba(159,161,255,0) 18%)",
  "radial-gradient(at 38% 50%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 16%)",
  "radial-gradient(at 70% 56%, rgba(186,164,255,0.18) 0%, rgba(186,164,255,0) 20%)",
  "linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.4) 17%, rgba(255,255,255,0) 28%, rgba(255,255,255,0.3) 52%, rgba(255,255,255,0) 65%)",
].join(", ");

const fade = "linear-gradient(to bottom, #000 0%, #000 45%, transparent 97%)";

export function Shelf({
  className,
  reflection,
}: {
  className?: string;
  reflection?: ReactNode;
}) {
  return (
    <div aria-hidden className={`h-[39.18px] perspective-[1000px] ${className ?? ""}`}>
      <div className="absolute inset-x-12 top-9 h-2 rounded-full bg-brand-outline/30 blur-md" />
      <div
        style={{ background: fill, transform: "rotateX(13deg)" }}
        className="relative h-full origin-top overflow-hidden rounded-[18px] shadow-[0_1px_2px_rgba(94,96,140,0.22),0_12px_26px_-18px_rgba(120,122,255,0.45),0_12px_22px_-18px_rgba(168,120,255,0.35),inset_0_1px_0_rgba(255,255,255,0.98),inset_0_-1px_0_rgba(104,106,155,0.3)]"
      >
        {reflection && (
          <div
            style={{ maskImage: fade, WebkitMaskImage: fade }}
            className="pointer-events-none absolute inset-0"
          >
            {reflection}
          </div>
        )}
        <div
          style={{ background: sheen }}
          className="pointer-events-none absolute inset-0 mix-blend-screen"
        />
        <div className="pointer-events-none absolute inset-x-3 top-0 h-px rounded-full bg-[linear-gradient(90deg,rgba(159,161,255,0)_0%,rgba(175,177,255,0.58)_12%,rgba(255,255,255,0.86)_36%,rgba(206,190,255,0.72)_68%,rgba(159,161,255,0.48)_88%,rgba(159,161,255,0)_100%)]" />
        <div className="pointer-events-none absolute inset-x-6 top-2 h-2 rounded-full bg-white/20 blur-[1px]" />
        <div className="pointer-events-none absolute inset-x-4 bottom-0 h-px rounded-full bg-[linear-gradient(90deg,rgba(110,112,190,0)_0%,rgba(110,112,190,0.4)_24%,rgba(140,112,190,0.32)_66%,rgba(140,112,190,0)_100%)]" />
      </div>
    </div>
  );
}

export function Reflected({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`shrink-0 ${className ?? ""}`}>
      <div
        style={{ transform: "scaleY(-0.55) translateY(-100%)" }}
        className="size-full origin-top"
      >
        <div className="size-full opacity-45 blur-[1.1px] saturate-[0.85]">
          {children}
        </div>
      </div>
    </div>
  );
}

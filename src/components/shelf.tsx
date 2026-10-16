import type { ReactNode } from "react";


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
      <div
        style={{ transform: "rotateX(13deg)" }}
        className="relative h-full origin-top overflow-hidden rounded-[18px] bg-surface shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.06),0_10px_20px_-14px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.9)]"
      >
        {reflection && (
          <div
            style={{ maskImage: fade, WebkitMaskImage: fade }}
            className="pointer-events-none absolute inset-0"
          >
            {reflection}
          </div>
        )}
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

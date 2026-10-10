"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Glyph, icons, type Icon } from "@/components/icon-glyph";

// The cat's speech cloud. It stays hidden until a shelf tile (any element with
// data-icon) is hovered, then pops out of its tail showing that tile's glyph.
// The last glyph is kept while the cloud fades out so it doesn't blank early.
export function IconBubble() {
  const [icon, setIcon] = useState<Icon>(icons[0]);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onOver = (event: PointerEvent) => {
      const name = (event.target as Element)
        .closest("[data-icon]")
        ?.getAttribute("data-icon");
      const match = icons.find((i) => i.name === name);
      if (match) setIcon(match);
      setShown(Boolean(match));
    };
    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) setShown(false);
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
    };
  }, []);

  return (
    <div
      aria-hidden
      data-shown={shown || undefined}
      className="absolute inset-0 origin-[64.5px_147.5px] scale-75 opacity-0 transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-shown:scale-100 data-shown:opacity-100 data-shown:duration-200 motion-reduce:scale-100"
    >
      <Image
        src="/hero/window/bubble.svg"
        alt=""
        width={143.5}
        height={304}
        fetchPriority="low"
        className="absolute inset-0 max-w-none"
      />
      <div className="absolute top-[95px] left-[18px] flex size-[60px] scale-40 items-center justify-center">
        <Glyph icon={icon} />
      </div>
    </div>
  );
}

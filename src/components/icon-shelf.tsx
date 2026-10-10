import type { CSSProperties } from "react";
import { Glyph, icons } from "@/components/icon-glyph";
import { Reflected, Shelf } from "@/components/shelf";

const scale = {
  "--s": "min(1, tan(atan2(100cqw, 798px)))",
} as CSSProperties;

const tile =
  "relative flex size-30 items-center justify-center rounded-tile shadow-tile";

export function IconShelf() {
  return (
    <section className="@container w-full">
      <div
        style={scale}
        className="mx-auto h-[calc(147px*var(--s))] w-[calc(798px*var(--s))]"
      >
        <div className="relative h-[147px] w-[798px] origin-top-left scale-(--s)">
          <Shelf
            className="absolute top-[108px] w-full"
            reflection={
              <div className="absolute top-2.5 left-[31px] flex gap-[35px]">
                {icons.map((icon) => (
                  <Reflected key={icon.name} className="size-[120px]">
                    <div className={`${tile} bg-black/10`}>
                      <Glyph icon={icon} />
                    </div>
                  </Reflected>
                ))}
              </div>
            }
          />

          <ul className="absolute top-0 left-[31px] flex gap-[35px]">
            {icons.map((icon) => (
              <li
                key={icon.name}
                data-icon={icon.name}
                className={`${tile} bg-[rgba(10,10,10,0.03)]`}
              >
                <Glyph icon={icon} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

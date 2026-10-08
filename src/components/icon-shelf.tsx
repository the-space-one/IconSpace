import Image from "next/image";
import type { CSSProperties } from "react";
import { Reflected, Shelf } from "@/components/shelf";

const scale = {
  "--s": "min(1, tan(atan2(100cqw, 798px)))",
} as CSSProperties;

const icons = [
  { name: "book", src: "/shelf/book.svg", width: 64.5, height: 60 },
  { name: "cart", src: "/shelf/cart.svg", width: 60, height: 60 },
  { name: "alarm" },
  { name: "discount", src: "/shelf/discount.svg", width: 60.0019, height: 60 },
  { name: "mail", src: "/shelf/mail.svg", width: 60, height: 60 },
] as const;

type Icon = (typeof icons)[number];

const tile =
  "relative flex size-30 items-center justify-center rounded-tile shadow-tile";

function Glyph({ icon }: { icon: Icon }) {
  if ("src" in icon) {
    return (
      <Image
        src={icon.src}
        alt={icon.name}
        width={icon.width}
        height={icon.height}
        className="max-w-none"
      />
    );
  }
  return (
    <div role="img" aria-label={icon.name} className="relative size-[60px]">
      <Image
        src="/shelf/alarm-body.svg"
        alt=""
        width={60}
        height={60}
        className="absolute top-[0.75px] left-0 max-w-none"
      />
      <Image
        src="/shelf/alarm-bells.svg"
        alt=""
        width={64.5}
        height={13.5}
        className="absolute top-[-0.75px] left-[-2.25px] max-w-none"
      />
    </div>
  );
}

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
              <li key={icon.name} className={`${tile} bg-[rgba(10,10,10,0.03)]`}>
                <Glyph icon={icon} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

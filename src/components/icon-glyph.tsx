import Image from "next/image";

export const icons = [
  { name: "book", src: "/shelf/book.svg", width: 64.5, height: 60 },
  { name: "cart", src: "/shelf/cart.svg", width: 60, height: 60 },
  { name: "alarm" },
  { name: "discount", src: "/shelf/discount.svg", width: 60.0019, height: 60 },
  { name: "mail", src: "/shelf/mail.svg", width: 60, height: 60 },
] as const;

export type Icon = (typeof icons)[number];

export function Glyph({ icon }: { icon: Icon }) {
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

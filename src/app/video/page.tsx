import type { Metadata } from "next";

import { GLOBE_SLOT, IconShelves } from "@/components/icon-shelf";

export const metadata: Metadata = {
  title: "Video Shelf",
  description:
    "The icon wall with the reflections off and the globe's slot open.",
};

// Deliberately bare: this page exists to be recorded, so the frame holds the
// wall and nothing else.
//
// It is the landing page's own `IconShelves`, not a copy of it — same widths,
// same rows, same positions, same tiles, same entrance — with three things
// turned off:
//
//   reflections  a mirrored icon plays the same timeline a beat behind a blur
//                and a mask, and a globe composited into the gap would have to
//                reproduce all of that or stand there as the one icon on the
//                wall without a reflection
//   eggs         small, but it bobs, and a moving speck behind the glass is
//                the kind of thing nobody notices until it is on film
//   emptyTiles   ONE slot loses its tile: the globe's. Every other icon keeps
//                its squircle, because the plate has to look like the wall
//                does — the hole is the only thing that should differ, and it
//                has to be a real hole rather than an empty squircle waiting
//                to be painted out of every frame
//
// A block rather than a flex container: the wall centres itself with `left-1/2`
// and a -50% translate, and inside a `justify-center` flex parent that would
// centre it twice and land it off to the right.
export default function VideoShelfPage() {
  return (
    // `min-h-dvh` rather than `flex-1`: Lenis's stylesheet sets the html and
    // body height back to auto, so there is no filled parent to grow into.
    <main className="min-h-dvh w-full py-16">
      <IconShelves
        reflections={false}
        eggs={false}
        emptyAt={GLOBE_SLOT}
        emptyTiles={false}
        // Nothing on this page runs ahead of the wall, so it never waits — see
        // the landing page's introduction for what this holds for there.
        revealAt={0}
      />
    </main>
  );
}

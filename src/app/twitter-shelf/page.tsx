import type { Metadata } from "next";

import { TwitterShelf } from "@/components/twitter-shelf";

export const metadata: Metadata = {
  title: "Twitter Shelf",
  description: "Four icons at a time, on the shelf.",
};

// Deliberately bare: this page exists to be recorded, so the frame holds the
// shelf and the controls and nothing else.
export default function TwitterShelfPage() {
  return (
    // `min-h-dvh` rather than `flex-1`: Lenis's stylesheet sets the html and
    // body height back to auto, so there is no filled parent to grow into.
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <TwitterShelf />
    </main>
  );
}

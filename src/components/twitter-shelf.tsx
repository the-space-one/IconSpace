"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SHELF_ICON_COUNT, Shelf, shelfSlice } from "@/components/icon-shelf";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Two shelves of two. The page turns four icons at a time, which is the whole
// grid — nothing carries over between pages, so every turn is a full new set.
const COLUMNS = 2;
const ROWS = 2;
const PER_PAGE = COLUMNS * ROWS;
const PAGES = Math.max(1, Math.ceil(SHELF_ICON_COUNT / PER_PAGE));

// Narrow enough that two tiles fill the slab. The wall on the landing page is
// four across in the same width, so at two the glass would otherwise read as
// mostly empty.
const FRAME = "w-[min(22rem,100vw-3rem)]";
const STORAGE_KEY = "twitter-shelf-page";

function readStoredPage(): number {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return 0;
    const page = Number.parseInt(raw, 10);
    if (!Number.isInteger(page) || page < 0 || page >= PAGES) return 0;
    return page;
  } catch {
    return 0;
  }
}

function writeStoredPage(page: number) {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(page));
  } catch {
    // sessionStorage unavailable — page still turns, just won't stick on reload
  }
}

export function TwitterShelf() {
  const [page, setPage] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPage(readStoredPage());
    setReady(true);
  }, []);

  // Wraps at both ends: this is a page to record from, and running out of
  // icons mid-take is worse than looping back to the first four.
  const step = useCallback((direction: 1 | -1) => {
    setPage((prev) => {
      const next = (prev + direction + PAGES) % PAGES;
      writeStoredPage(next);
      return next;
    });
  }, []);

  // Keyboard still works for recording; the arrows are for browsing in the browser.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  if (!ready) {
    return (
      <div
        aria-hidden
        className={cn("flex flex-col items-center gap-12 opacity-0", FRAME)}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-12">
      <div className="flex items-center gap-3 sm:gap-4">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous icons"
          className="shrink-0 rounded-full border-foreground/10 bg-background/80 shadow-sm backdrop-blur-sm"
          onClick={() => step(-1)}
        >
          <ChevronLeft />
        </Button>

        <div className={cn("flex flex-col gap-10", FRAME)}>
          {Array.from({ length: ROWS }, (_, row) => (
            <Shelf
              // Keyed by page, so turning it remounts both shelves: the tiles
              // run their entrance again and the glyphs play again, which is the
              // point of the turn. Without the key React would keep the mounted
              // slots and only swap the artwork inside them, silently.
              key={`${page}-${row}`}
              icons={shelfSlice(page * PER_PAGE + row * COLUMNS, COLUMNS)}
              // Nothing on this page runs ahead of the shelves, so they never
              // wait — see the landing page's introduction for what this holds
              // for there.
              revealAt={0}
              // Continues the sweep into the second row rather than restarting
              // it, so the four tiles arrive as one cascade.
              staggerFrom={row * COLUMNS}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next icons"
          className="shrink-0 rounded-full border-foreground/10 bg-background/80 shadow-sm backdrop-blur-sm"
          onClick={() => step(1)}
        >
          <ChevronRight />
        </Button>
      </div>

      <div aria-hidden className="flex items-center gap-1.5">
        {Array.from({ length: PAGES }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none",
              i === page ? "w-5 bg-[#9fa1ff]" : "w-1.5 bg-foreground/15",
            )}
          />
        ))}
      </div>
    </div>
  );
}

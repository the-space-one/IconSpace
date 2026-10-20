"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "motion/react";
import { basket, useBasket, type Toss } from "@/components/basket-store";
import type { MotionRun } from "@/components/icon-motion";
import { RUNNERS, useManager } from "@/components/package-manager";
import { drawTicket, saveReceipt, tearLine, TICKET } from "@/components/receipt-image";
import type { PaperStage } from "@/components/receipt-paper";
import { LabGlyph, shelfIcon } from "@/components/shelf-icons";
import styles from "./basket.module.css";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 * ADDING (a tile's + chip)
 *      0ms   the glyph is tossed off the tile: it drifts across while it
 *            rises and falls (out, then in, like gravity), shrinking to the
 *            basket's size and tipping at the top of the arc. 450–750ms,
 *            longer the further it flies. The dock slides up if it was away
 *            (300ms out-quint).
 *      0ms   its slot opens in the dock at once, and the dock springs wider
 *            to fit it (spring 400ms, bounce 0.15); taking one out springs
 *            it back, the others sliding over
 *   land     the slot pops in (spring 300ms, bounce 0.35) and plays the
 *            icon's own animation; the basket squashes under the weight
 *
 * COPYING (the dock's Copy)
 *      0ms   Copy → Copied; the slot opens in the dock's edge (150ms)
 *      0ms   a paper ticket (WebGL, receipt-paper.ts) feeds up out of it in
 *            5 printer steps (400ms)
 *   1800ms   Copied → Copy
 *   5000ms   untouched, it slides back into the slot (240ms in-out). Sooner
 *            on Esc, a click elsewhere, or emptying the basket; hovering the
 *            ticket holds it, and leaving gives it 2000ms more.
 *
 * KEEPING (tearing the ticket off: a paper simulation, receipt-paper.ts)
 *   drag     the paper is pinched where it's grabbed and bends after the
 *            pointer, whichever way; its perforation stretches, and each
 *            column snaps past 4px, from the side under strain across
 *   torn     the piece hangs from the pinch under gravity and the full
 *            receipt downloads as a PNG; the stub goes back in (240ms)
 *   release  it keeps the pointer's velocity and flutters down (air drags
 *            on its face), fading after 0.9s; let go before it's torn, it
 *            springs back flat
 *   click    (or Enter) the same, pulled for you: pinched near the top
 *            right and drawn up and away (520ms)
 *
 * Keyboard adds and copies, and reduced motion, skip the toss and the feed:
 * things appear and fade.
 * ───────────────────────────────────────────────────────── */
const TIMING = {
  tossMin: 450,
  tossMax: 750,
  tossPerPx: 0.4, // ms added per pixel travelled
  squash: 260,
  feed: 400,
  feedSteps: 5,
  hold: 5000,
  linger: 2000, // after the pointer leaves the ticket
  retract: 240,
  copied: 1800,
};

const EASE = {
  out: "cubic-bezier(0.23, 1, 0.32, 1)", // out-quint
  across: "cubic-bezier(0.455, 0.03, 0.515, 0.955)", // in-out-quad
  rise: "cubic-bezier(0.25, 0.46, 0.45, 0.94)", // out-quad
  fall: "cubic-bezier(0.55, 0.085, 0.68, 0.53)", // in-quad: gravity
};

// The dock springs to fit what's in it; a slot pops in when its icon lands.
const RESIZE = { type: "spring", duration: 0.4, bounce: 0.15 } as const;
const POP = { type: "spring", duration: 0.3, bounce: 0.35 } as const;
const OUT = [0.23, 1, 0.32, 1] as const; // out-quint

const SLOTS = 5; // icons the dock shows; the rest are counted in a "+N"
const MINI = 20; // their glyph size in px (tile glyphs are 60)

type Point = { x: number; y: number };
type Receipt = {
  key: number;
  items: string[];
  command: string;
  copied: boolean;
  instant: boolean;
  printedAt: Date;
  /** printed: out of the slot; kept: torn off and saved; gone: back in the slot. */
  state: "printed" | "kept" | "gone";
};

/**
 * Where an element sits on screen once the dock has settled: its offsets
 * within `root` ignore transforms, so a slot can be aimed at while the dock
 * is still sliding in. `root` must be positioned and untransformed.
 */
function restingCentre(element: HTMLElement, root: HTMLElement): Point {
  let x = element.offsetWidth / 2;
  let y = element.offsetHeight / 2;
  for (let node: HTMLElement | null = element; node && node !== root; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  const box = root.getBoundingClientRect();
  return { x: box.left + x, y: box.top + y };
}

/** A glyph in the air, from its tile to its slot in the basket. */
function Flight({ toss, target, onLand }: {
  toss: Toss;
  target: (id: string) => Point | null;
  onLand: (toss: Toss) => void;
}) {
  const across = useRef<HTMLDivElement>(null);
  const arc = useRef<HTMLDivElement>(null);
  const aim = useEffectEvent(() => target(toss.id));
  const land = useEffectEvent(() => onLand(toss));

  useLayoutEffect(() => {
    const to = aim();
    if (!to || !across.current || !arc.current) return land();
    const { from } = toss;
    const end = MINI / 60;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const duration = Math.min(TIMING.tossMax, TIMING.tossMin + distance * TIMING.tossPerPx);
    const apex = Math.min(from.y, to.y) - 40 - distance * 0.08;
    const options = { duration, fill: "forwards" as const };
    const x = across.current.animate(
      [{ transform: `translateX(${from.x}px)` }, { transform: `translateX(${to.x}px)` }],
      { ...options, easing: EASE.across },
    );
    const y = arc.current.animate(
      [
        { transform: `translateY(${from.y}px) scale(${from.scale}) rotate(0deg)`, easing: EASE.rise },
        { transform: `translateY(${apex}px) scale(${(from.scale + end) / 2}) rotate(-10deg)`, offset: 0.4, easing: EASE.fall },
        { transform: `translateY(${to.y}px) scale(${end}) rotate(0deg)` },
      ],
      options,
    );
    y.finished.then(land, () => {});
    return () => {
      x.cancel();
      y.cancel();
    };
  }, [toss]);

  return (
    <div ref={across} aria-hidden style={{ transform: `translateX(${toss.from.x}px)` }}
      className="pointer-events-none fixed top-0 left-0 z-[45] will-change-transform">
      <div ref={arc} style={{ transform: `translateY(${toss.from.y}px) scale(${toss.from.scale})` }}
        className="origin-top-left will-change-transform">
        <div className="grid size-[60px] -translate-1/2 place-items-center text-[#0a0a0a]">
          <LabGlyph icon={shelfIcon(toss.id)} />
        </div>
      </div>
    </div>
  );
}

/**
 * The ticket: a sheet of paper on a full-screen WebGL layer (receipt-paper.ts)
 * that prints out of the dock's slot and tears off however it's pulled. The
 * DOM keeps the slot's mouth and, over the paper, the button that takes the
 * pointer and the keyboard.
 */
function ReceiptPaper({ receipt, onKeep, onHold, onGone }: {
  receipt: Receipt;
  onKeep: () => void;
  onHold: (held: boolean) => void;
  onGone: () => void;
}) {
  const mouth = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<PaperStage | null>(null);
  const press = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const [height, setHeight] = useState(0);
  const printed = receipt.state === "printed";
  const kept = useEffectEvent(onKeep);
  const gone = useEffectEvent(onGone);

  // The slot: where the paper's left edge and the dock's top edge are on screen.
  const slot = () => {
    const box = mouth.current!.getBoundingClientRect();
    return { left: box.left + 5, y: box.top + box.height / 2 };
  };

  useEffect(() => {
    let cancelled = false;
    let made: PaperStage | undefined;
    (async () => {
      const art = await drawTicket({
        number: receipt.key,
        time: receipt.printedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
        count: receipt.items.length,
        copied: receipt.copied,
        edge: tearLine(receipt.key),
      });
      const { PaperStage } = await import("@/components/receipt-paper");
      if (cancelled || !canvas.current || !mouth.current) return;
      try {
        made = new PaperStage(canvas.current);
      } catch {
        return gone(); // no WebGL: no ticket, the copy still worked
      }
      made.onTorn = () => kept();
      made.onDone = () => gone();
      made.show({ ...art, width: TICKET.width, jag: TICKET.jag, reveal: TICKET.reveal }, slot(),
        receipt.instant ? undefined : { duration: TIMING.feed, steps: TIMING.feedSteps });
      stage.current = made;
      setHeight(art.bodyHeight + TICKET.reveal);
    })();
    const onResize = () => {
      if (!stage.current || !mouth.current) return;
      stage.current.resize();
      stage.current.moveSlot(slot());
    };
    addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      removeEventListener("resize", onResize);
      made?.dispose();
      stage.current = null;
    };
    // One stage per receipt (the parent keys this by receipt).
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Put away unkept: back into the slot.
  useEffect(() => {
    if (receipt.state !== "gone") return;
    if (stage.current) stage.current.retract(TIMING.retract);
    else gone();
  }, [receipt.state]);

  const reduced = () => receipt.instant || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pullAway = () => {
    if (!stage.current || !printed) return;
    if (reduced()) {
      onKeep();
      stage.current.fadeOut(150);
    } else {
      stage.current.pullAway();
    }
  };

  return (
    <>
      <motion.span layout="position" ref={mouth} aria-hidden data-closing={!printed || undefined} className={styles.mouth} />
      {/* Stays mounted after the tear: it holds the pointer capture, and the
          torn piece follows that pointer until it's let go. */}
      {height > 0 && (
        <motion.button layout="position" type="button" aria-label="Keep the receipt: tear it off and save it as an image"
          aria-hidden={!printed || undefined} tabIndex={printed ? 0 : -1} data-done={!printed || undefined}
          style={{ width: TICKET.width, height }}
          onPointerEnter={() => onHold(true)}
          onPointerLeave={() => onHold(false)}
          onPointerDown={(event) => {
            if (event.button !== 0 || !printed) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            press.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
            stage.current?.grab(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            const held = press.current;
            if (!held || held.id !== event.pointerId) return;
            if (Math.hypot(event.clientX - held.x, event.clientY - held.y) > 4) held.moved = true;
            stage.current?.drag(event.clientX, event.clientY);
          }}
          onPointerUp={(event) => {
            const held = press.current;
            if (!held || held.id !== event.pointerId) return;
            press.current = null;
            stage.current?.release();
            if (!held.moved) pullAway();
          }}
          onPointerCancel={() => {
            press.current = null;
            stage.current?.release();
          }}
          // However the pointer is lost, the paper is let go.
          onLostPointerCapture={() => {
            if (!press.current) return;
            press.current = null;
            stage.current?.release();
          }}
          onClick={(event) => {
            // Pointer clicks are handled on pointerup; this is the keyboard's.
            if (event.detail === 0) pullAway();
          }}
          className={styles.grip}
        />
      )}
      {createPortal(
        <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-[45] size-full" />,
        document.body,
      )}
    </>
  );
}

function BasketGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden className="size-5">
      <path d="M7.5 10.5 10 4.75m6.5 5.75L14 4.75" />
      <path d="M3 10.5h18l-1.62 7.6a2 2 0 0 1-1.96 1.58H6.58a2 2 0 0 1-1.96-1.58Z" />
      <path d="M9 13.75v2.75m3-2.75v2.75m3-2.75v2.75" />
    </svg>
  );
}

/** The basket docked at the foot of the screen: what's been picked off the shelves and the one command that installs it. */
export function Basket() {
  const { items, tosses } = useBasket();
  const manager = useManager();
  const root = useRef<HTMLDivElement>(null);
  const basketGlyph = useRef<HTMLSpanElement>(null);
  const [runs, setRuns] = useState<Record<string, MotionRun>>({});
  const [copied, setCopied] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const timers = useRef<{ copied?: ReturnType<typeof setTimeout>; dismiss?: ReturnType<typeof setTimeout> }>({});
  const printed = useRef(0);

  const reduce = useReducedMotion();
  const open = items.length > 0;
  const list = items;
  const command = `${RUNNERS[manager]} iconspace add ${list.join(" ")}`;
  const flying = new Set(tosses.map((toss) => toss.id));
  const shown = list.slice(0, SLOTS);
  const extra = list.length - shown.length;
  const count = `${list.length} icon${list.length === 1 ? "" : "s"}`;

  const target = (id: string) => {
    const dock = root.current;
    const index = items.indexOf(id);
    const slot = dock?.querySelector<HTMLElement>(index >= 0 && index < SLOTS ? `[data-slot="${id}"]` : "[data-slot-more]");
    return dock && slot ? restingCentre(slot, dock) : null;
  };

  const land = (toss: Toss) => {
    basket.land(toss.key);
    setRuns((current) => ({ ...current, [toss.id]: { id: toss.key, startedAt: performance.now() } }));
    basketGlyph.current?.animate(
      [
        { transform: "scale(1, 1)" },
        { transform: "scale(1.14, 0.84)", offset: 0.35 },
        { transform: "scale(0.96, 1.05)", offset: 0.7 },
        { transform: "scale(1, 1)" },
      ],
      { duration: TIMING.squash, easing: "ease-in-out" },
    );
  };

  // Back into the slot, unkept.
  const dismiss = () => {
    clearTimeout(timers.current.dismiss);
    setReceipt((current) => (current?.state === "printed" ? { ...current, state: "gone" } : current));
  };

  // Torn off: it flies away and the full receipt downloads.
  const keep = () => {
    if (receipt?.state !== "printed") return;
    clearTimeout(timers.current.dismiss);
    setReceipt({ ...receipt, state: "kept" });
    void saveReceipt({
      number: receipt.key,
      labels: receipt.items.map((id) => shelfIcon(id).label),
      command: receipt.command,
      printedAt: receipt.printedAt,
    });
  };

  const hold = (held: boolean) => {
    clearTimeout(timers.current.dismiss);
    if (!held) timers.current.dismiss = setTimeout(dismiss, TIMING.linger);
  };

  async function copy(instant: boolean) {
    let ok = true;
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      ok = false;
    }
    clearTimeout(timers.current.copied);
    setCopied(ok);
    timers.current.copied = setTimeout(() => setCopied(false), TIMING.copied);
    clearTimeout(timers.current.dismiss);
    setReceipt({
      key: ++printed.current,
      items: list,
      command,
      copied: ok,
      instant: instant || matchMedia("(prefers-reduced-motion: reduce)").matches,
      printedAt: new Date(),
      state: "printed",
    });
    timers.current.dismiss = setTimeout(dismiss, TIMING.hold);
  }

  // The paper's code (three.js) loads while the basket fills, not on Copy.
  useEffect(() => {
    if (open) void import("@/components/receipt-paper");
  }, [open]);

  // A printed receipt goes back in on Esc or a click anywhere but the dock.
  const printing = receipt?.state === "printed";
  const putAway = useEffectEvent(dismiss);
  useEffect(() => {
    if (!printing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") putAway();
    };
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node && root.current?.contains(event.target))) putAway();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [printing]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      clearTimeout(pending.copied);
      clearTimeout(pending.dismiss);
    };
  }, []);

  return (
    <>
      <div ref={root}
        className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4 sm:bottom-6">
        {/* Everything in the dock that moves with a resize shares one spring
            (MotionConfig), so the contents travel with its edges instead of
            trailing them. Leaving, AnimatePresence keeps the dock as it last
            was, icons and all. */}
        <MotionConfig transition={reduce ? { duration: 0 } : RESIZE}>
        <AnimatePresence>
          {open && (
            <motion.section
              key="dock"
              aria-label="Basket"
              // Width follows the contents with a spring (scale-corrected, so
              // nothing inside stretches); the children marked layout="position"
              // ride along.
              layout
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 72 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, transition: { duration: 0.2, ease: OUT } }}
              transition={{ layout: reduce ? { duration: 0 } : RESIZE, default: { duration: 0.3, ease: OUT } }}
              style={{ borderRadius: 18, boxShadow: "0 0 0 1px rgba(59,59,59,0.08), 0 12px 32px -12px rgba(0,0,0,0.25)" }}
              className="group/dock pointer-events-auto relative flex max-w-full items-center gap-2 bg-white p-1.5 pl-2.5 font-froundy leading-5"
            >
              {receipt && (
                <ReceiptPaper key={receipt.key} receipt={receipt} onKeep={keep} onHold={hold} onGone={() => setReceipt(null)} />
              )}

              {/* Emptying is rare, so it waits on the corner (like a notification's
                  close) instead of taking a place in the row: on hover or focus,
                  and always on touch screens, which have no hover. */}
              <motion.button layout="position" type="button" aria-label="Empty the basket"
                onClick={() => {
                  dismiss();
                  basket.clear();
                }}
                className="absolute -top-2 -left-2 z-10 grid size-6 scale-90 cursor-pointer place-items-center rounded-full bg-white text-muted-foreground opacity-0 shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_2px_6px_-1px_rgba(0,0,0,0.14)] transition-[opacity,scale,color] duration-150 ease-out after:absolute after:-inset-2.5 group-hover/dock:scale-100 group-hover/dock:opacity-100 group-has-[:focus-visible]/dock:scale-100 group-has-[:focus-visible]/dock:opacity-100 pointer-coarse:scale-100 pointer-coarse:opacity-100 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-95 motion-reduce:transition-none"
              >
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden className="size-2.5">
                  <path d="m3.5 3.5 7 7m0-7-7 7" />
                </svg>
              </motion.button>

              <motion.span layout="position" className="relative grid size-8 shrink-0 place-items-center text-[#0a0a0a]">
                <span ref={basketGlyph} className="grid origin-bottom place-items-center">
                  <BasketGlyph />
                </span>
                <span aria-hidden
                  className="absolute -top-1 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-foreground tabular-nums shadow-[inset_0_0_0_1px_var(--color-brand-strong)]">
                  {list.length}
                </span>
              </motion.span>

              <motion.ul layout="position" className="relative flex items-center gap-1">
                {/* popLayout: a slot taken out leaves the row at once, so the
                    others slide over while it fades. */}
                <AnimatePresence mode="popLayout" initial={false}>
                  {shown.map((id) => {
                    const icon = shelfIcon(id);
                    return (
                      <motion.li key={id} layout
                        // Hidden while its icon is in the air; pops in when it lands.
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={flying.has(id) ? { opacity: 0, scale: 0.6 } : { opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.15, ease: OUT } }}
                        transition={reduce ? { duration: 0 } : { layout: RESIZE, default: POP }}
                      >
                        <button type="button" data-slot={id}
                          aria-label={`Take ${icon.label} out of the basket`}
                          onClick={() => basket.remove(id)}
                          className="group/slot relative grid size-8 cursor-pointer place-items-center rounded-[9px] bg-surface text-[#0a0a0a] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground"
                        >
                          <LabGlyph icon={icon} run={runs[id]} size={MINI} />
                          <span aria-hidden
                            className="absolute inset-0 grid place-items-center rounded-[9px] bg-white/85 opacity-0 transition-opacity duration-150 ease-out group-hover/slot:opacity-100">
                            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="size-3">
                              <path d="m3.5 3.5 7 7m0-7-7 7" />
                            </svg>
                          </span>
                        </button>
                      </motion.li>
                    );
                  })}
                  {extra > 0 && (
                    <motion.li key="more" layout data-slot-more
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.15, ease: OUT } }}
                      transition={reduce ? { duration: 0 } : { layout: RESIZE, default: POP }}
                      className="grid h-8 min-w-8 place-items-center rounded-[9px] bg-surface px-1.5 text-[12px] text-muted-foreground tabular-nums"
                    >
                      +{extra}
                    </motion.li>
                  )}
                </AnimatePresence>
              </motion.ul>

              <motion.code layout="position" title={command}
                className="mx-2.5 hidden max-w-[240px] min-w-0 truncate font-mono text-[12px] tracking-[-0.2px] text-foreground sm:block">
                <span className="text-muted-foreground select-none">$ </span>
                {command}
              </motion.code>

              <motion.button layout="position" type="button" aria-label={`Copy the install command for ${count}`}
                onClick={(event) => copy(event.detail === 0)}
                className="relative grid h-8 shrink-0 cursor-pointer place-items-center rounded-[10px] bg-brand px-3 text-[13px] text-brand-foreground shadow-[inset_0_0_0_2px_var(--color-brand-strong)] transition-[background-color,scale] duration-150 ease-out after:absolute after:-inset-1.5 hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.97] motion-reduce:transition-none"
              >
                <span data-hidden={copied || undefined}
                  className="col-start-1 row-start-1 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] data-hidden:scale-75 data-hidden:opacity-0 data-hidden:blur-[2px] motion-reduce:transition-none">
                  Copy
                </span>
                <span aria-hidden data-hidden={!copied || undefined}
                  className="col-start-1 row-start-1 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] data-hidden:scale-75 data-hidden:opacity-0 data-hidden:blur-[2px] motion-reduce:transition-none">
                  Copied
                </span>
              </motion.button>
            </motion.section>
          )}
        </AnimatePresence>
        </MotionConfig>
      </div>

      {tosses.map((toss) => (
        <Flight key={toss.key} toss={toss} target={target} onLand={land} />
      ))}

      <span role="status" className="sr-only">
        {open ? `${count} in the basket` : ""}
        {copied ? `. Copied ${command}` : ""}
        {receipt?.state === "kept" ? ". Receipt saved as an image." : ""}
      </span>
    </>
  );
}

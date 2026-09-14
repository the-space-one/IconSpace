"use client";

import Image from "next/image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { useLenis } from "lenis/react";
import {
  AnimatePresence,
  motion,
  useAnimate,
  useReducedMotion,
} from "motion/react";

import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";

/**
 * A small hunt. Four painted eggs are tucked into the page at roughly the size
 * of a full stop. Click one and it flies to the middle of the screen, pops,
 * then drops into a Minecraft hotbar that rises to catch it before sliding
 * back out of the way.
 *
 * The tints are sampled from the artwork rather than eyeballed — the mean of
 * each egg's opaque, saturated pixels, so the white speckles and stripes do
 * not wash the hue toward grey.
 *
 * `w`/`h` are each egg's own trimmed dimensions. They are not identical — the
 * four were painted and photographed separately — so a single shared aspect
 * ratio declares the wrong shape for most of them, which Next flags as a
 * distorted image and which really would squash them a percent or two.
 */
const EGGS = [
  { src: "/eggs/egg-2.png", name: "lime", tint: "#cfdc4f", w: 344, h: 480 },
  { src: "/eggs/egg-3.png", name: "sunshine", tint: "#fbdf3a", w: 344, h: 480 },
  { src: "/eggs/egg-4.png", name: "lilac", tint: "#cdabd5", w: 347, h: 480 },
  { src: "/eggs/egg-5.png", name: "aqua", tint: "#97e1e0", w: 349, h: 480 },
] as const;

/**
 * Where the hunt is kept between visits. Versioned in the KEY rather than in
 * the payload: if the egg list ever changes shape, an old key is simply never
 * read, which beats teaching the parser to recognise something written by a
 * schema that no longer exists.
 */
const STORE_KEY = "icon-space:eggs:v2";

/**
 * What is in the bar is not React state seeded from an effect — it is an
 * external store that React subscribes to, which is what useSyncExternalStore
 * is for and what makes this work on a prerendered page. React renders the
 * server's snapshot (nothing found) through hydration and swaps to the
 * browser's the instant hydration is done, so there is never a first client
 * render that disagrees with the HTML.
 *
 * Reads and writes swallow everything. localStorage is not a given: Safari in
 * private mode throws on write, a hardened browser can throw on access, and
 * quota errors are real. An egg hunt that forgets is a much smaller failure
 * than one that takes the page down with it.
 */
const NO_EGGS: ReadonlySet<number> = new Set();

/** Cached rather than re-read per call: getSnapshot runs on every render, and
 *  a fresh Set each time is a new reference, which React reads as "changed"
 *  and re-renders over, forever. Only the two paths that can actually change
 *  it — a collect here, a write from another tab — replace it. */
let snapshot: ReadonlySet<number> | null = null;
const listeners = new Set<() => void>();

function parseSaved(raw: string | null): ReadonlySet<number> {
  if (!raw) return NO_EGGS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return NO_EGGS;
    // Filtered, not trusted. This is a string anyone can edit in devtools, and
    // an index out of range would reach EGGS[i] for an egg that is not there
    // and take the bar down reading .src off undefined.
    return new Set(
      parsed.filter(
        (i): i is number => Number.isInteger(i) && i >= 0 && i < EGGS.length,
      ),
    );
  } catch {
    return NO_EGGS;
  }
}

function readSnapshot(): ReadonlySet<number> {
  try {
    return parseSaved(window.localStorage.getItem(STORE_KEY));
  } catch {
    return NO_EGGS;
  }
}

function getSnapshot(): ReadonlySet<number> {
  snapshot ??= readSnapshot();
  return snapshot;
}

/** Hydration renders this. It has to be the same reference every time for the
 *  same reason getSnapshot's result does. */
function getServerSnapshot(): ReadonlySet<number> {
  return NO_EGGS;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // `storage` fires in the OTHER tabs, never the one that wrote — so this is
  // free cross-tab agreement rather than an echo of our own save.
  const sync = () => {
    snapshot = readSnapshot();
    listeners.forEach((fn) => fn());
  };
  window.addEventListener("storage", sync);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", sync);
  };
}

/** Reads the current set at call time rather than taking one in, so a save
 *  cannot write over an egg another tab added while this one was mid-collect. */
function saveEgg(index: number) {
  const next = new Set(getSnapshot());
  next.add(index);
  snapshot = next;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify([...next]));
  } catch {
    // Nothing to do about it, and nothing worth saying. The hunt still works
    // for this visit; it just will not be there on the next one.
  }
  listeners.forEach((fn) => fn());
}

/** Every egg is this tall in hiding unless the call site says otherwise. */
const HIDDEN_HEIGHT = 21;

/** The button around it, though. A 21px target is not a target — this is the
 *  44px everyone should be able to hit, sitting invisibly around the artwork. */
const HIT_AREA = 44;

/** How long the hotbar takes to slide in or out. Mirrored in the class below;
 *  the collect sequence waits this out before measuring a slot, because a slot
 *  measured mid-slide gives a landing spot that has already moved on. */
const BAR_SLIDE_MS = 320;

/** How long the egg sits still after bouncing, before dropping into the bar.
 *  Long enough to read as a held pose rather than a hesitation — and shorter
 *  than it used to be, because the bounce itself now runs half a second
 *  longer and the two together were starting to feel like a wait. */
const BOUNCE_HOLD_MS = 340;

/** Longest the reveal will wait on the full-size artwork to decode before it
 *  flies anyway. Roughly a frame budget's worth of patience — past this the
 *  click stops feeling connected to anything. */
const DECODE_WAIT_MS = 450;

/** ease-out-quart, for things arriving. */
const EASE_OUT = [0.165, 0.84, 0.44, 1] as const;
/** ease-in-out-quart, for something already on screen travelling. */
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

type Opened = { index: number; from: DOMRect } | null;

type EggHuntApi = {
  open: (index: number, from: DOMRect) => void;
  /** Eggs already found. They are gone from their hiding places, so the hunt
   *  is over what is left rather than over the same four forever. */
  found: ReadonlySet<number>;
  /** All four in the bar. Comes back out of storage, so it is still true the
   *  next morning — this is what the badge in the header hangs off. */
  complete: boolean;
  /** ...and the last went in during THIS visit. The difference between a
   *  badge that lands and a badge that was simply already there. Once true it
   *  stays true, and a hunt finished on a previous visit can never turn it on,
   *  so anything reading it can trust it not to change underneath. */
  earned: boolean;
};

const EggHuntContext = createContext<EggHuntApi | null>(null);

/**
 * One hidden egg. Position it from the call site, next to whatever hides it.
 *
 * `size` is the artwork's height in px. Vary it between eggs that share a
 * hiding place — three identical ones in a row read as copies of the same
 * sticker rather than as things that happen to be lying there.
 */
export function Egg({
  index,
  size = HIDDEN_HEIGHT,
  className,
}: {
  index: number;
  size?: number;
  className?: string;
}) {
  const hunt = useContext(EggHuntContext);
  const ref = useRef<HTMLButtonElement>(null);
  const egg = EGGS[index];

  // Once found it leaves the page. The reveal was handed a copy of this
  // element's rect on click, so it still has somewhere to fly from — what the
  // reader sees is the egg lifting out of its hiding place, not a duplicate
  // appearing beside one that stayed put.
  if (hunt?.found.has(index)) return null;

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        const el = ref.current?.querySelector("img");
        if (el && hunt) hunt.open(index, el.getBoundingClientRect());
      }}
      aria-label={`Hidden ${egg.name} egg — open it`}
      style={{ width: HIT_AREA, height: HIT_AREA }}
      className={cn(
        "group absolute grid place-items-center rounded-full",
        // No z-index of its own: an egg is hidden by being BEHIND something,
        // so the stacking is the caller's decision. `pointer-events-auto`
        // because the best hiding places — inside the grass, for one — are in
        // containers that switched pointer events off wholesale.
        "pointer-events-auto",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9fa1ff]",
        className,
      )}
    >
      {/* The hop gets its own wrapper between the button and the image. It
          cannot go on either of them: the image owns the hover scale and two
          animations on one transform fight, and the button is a 44px hit area
          with the egg floating in the middle of it, so a bottom-anchored
          squash there would plant the egg's feet 11px below where they are.
          This span is exactly the artwork's box, so `transform-origin: bottom`
          is the egg's own bottom edge.

          `block`, because an inline wrapper leaves a baseline gap under the
          image and the box would be a few px taller than what it holds.

          Staggered per egg so four of them never bob in unison. */}
      <span
        className="egg-idle block"
        style={
          {
            animationDelay: `${index * 0.9}s`,
            // Half the egg's own height. The four are deliberately different
            // sizes, and a hop fixed in px is a leap on the smallest and a
            // twitch on the largest.
            "--hop": `${Math.round(size * 0.5)}px`,
          } as React.CSSProperties
        }
      >
        <Image
          src={egg.src}
          alt=""
          width={Math.round((size * egg.w) / egg.h)}
          height={size}
          // About a kilobyte each at this size. Lazy makes them an LCP
          // candidate while the webfonts still have the text unpainted, which
          // is both a warning in the console and a real (if tiny) drag on the
          // metric.
          loading="eager"
          // Hover only where there is a real pointer: on touch it fires on tap
          // and the egg would flinch as it opens.
          className={cn(
            "block select-none drop-shadow-sm transition-transform duration-200 ease-out",
            "[@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-125",
            "motion-reduce:transition-none",
          )}
          // Both dimensions, not just height: sizing one in CSS and leaving the
          // other to the intrinsic ratio makes them disagree by a rounding
          // step, which Next flags as a distorted image.
          style={{ height: size, width: Math.round((size * egg.w) / egg.h) }}
        />
      </span>
    </button>
  );
}

/**
 * The prize, kept. A seal in the header opposite the logo, which appears once
 * all four are in and — because the hunt lives in localStorage — is still
 * there on the next visit. The plaque at the bottom of the screen is the
 * moment; this is the record of it.
 *
 * Position it from the call site, and position it ABSOLUTELY. Laid out in
 * flow it would widen or heighten its row on the frame it appears, shoving the
 * headline sideways at the exact moment the visitor is looking somewhere else
 * on the page — a badge that rearranges the page to announce itself is worse
 * than no badge.
 *
 * Two ways in, and which one it takes is the difference between news and
 * furniture:
 *
 *   earned    it lands. Down from larger and off-angle, on a spring, the way
 *             a stamp hits paper.
 *   restored  it was already won, so it simply arrives with the page, on the
 *             same cascade as the headline it sits beside. Announcing a
 *             two-day-old achievement on every page load is a notification,
 *             and nobody wants a notification about something they did.
 */
export function AchievementBadge({ className }: { className?: string }) {
  const hunt = useContext(EggHuntContext);
  const reducedMotion = useReducedMotion();

  if (!hunt?.complete) return null;

  // The resting tilt, on its own element so both ways in share it. The stamp
  // animates the WRAPPER's rotation on top of this, which is what lets it
  // twist down into place and still come to rest at exactly the angle a
  // restored badge simply starts at — one number, one place, no drift.
  const art = (
    <div className="size-full -rotate-8">
      <Image
        src="/achievement-badge.png"
        alt="Egg Hunter — all four hidden eggs found"
        // The artwork's own pixels. `object-contain` inside a square box rather
        // than a fixed aspect ratio: it is a hair off square, and declaring it
        // square is how Next decides an image is being distorted.
        width={1354}
        height={1364}
        className="size-full object-contain"
        // Inline, not `drop-shadow-[...]`: an arbitrary value carrying commas
        // inside rgba() does not survive Tailwind v4's parser — it emits no
        // rule at all and the shadow is simply missing, with nothing to say
        // so. The rest of this file keeps its layered shadows here too.
        //
        // Two layers, as under the bar and the plaque: a tight contact shadow
        // so the seal sits ON the page, and a wide periwinkle bloom so it
        // glows rather than just casts.
        style={{
          filter: [
            "drop-shadow(0 2px 3px rgba(94,96,140,0.20))",
            "drop-shadow(0 12px 22px rgba(120,122,255,0.34))",
          ].join(" "),
        }}
      />
    </div>
  );

  // `earned` cannot flip while this is mounted — a hunt finished on a previous
  // visit has no eggs left to open — so there is no freezing to do here.
  if (!hunt.earned || reducedMotion) {
    return (
      <div className={cn("pointer-events-none select-none", className)}>
        {art}
      </div>
    );
  }

  return (
    // The stamp is on the inner element, not this one, so the shockwave below
    // is not dragged through the badge's own scale — a ring that shrinks from
    // 1.7 while it is supposed to be expanding just sits there.
    <div className={cn("pointer-events-none select-none", className)}>
      <motion.div
        className="size-full"
        initial={{ opacity: 0, scale: 1.7, rotate: -14, filter: "blur(9px)" }}
        animate={{
          opacity: 1,
          filter: "blur(0px)",
          // A stamp is not a spring. A spring eases out of its start, and
          // something being pressed down does the opposite: it accelerates all
          // the way to the paper and then STOPS. So this is keyframed, and the
          // beats are the ones a stamp actually has —
          //
          //   drive     scale falls to 1 on an accelerating curve
          //   impact    past it, to 0.9. The compression IS the impact; a
          //             stamp that arrives exactly on its mark has not hit
          //             anything
          //   rebound   0.9 → 1.055, the recoil
          //   settle    a much smaller wobble, then rest
          //
          // The rotation does the same in miniature: it twists down into
          // place, overshoots the tilt by a couple of degrees, and comes back.
          scale: [1.7, 1, 0.9, 1.055, 0.985, 1],
          rotate: [-14, -1.5, 0, 2.6, -0.7, 0],
        }}
        transition={{
          delay: BADGE_AT,
          duration: 0.78,
          times: [0, 0.38, 0.46, 0.6, 0.78, 1],
          ease: [
            [0.55, 0, 0.85, 0.45], // the drive down, accelerating
            "easeOut", // into the compression
            "easeOut", // and back out of it
            "easeInOut", // the wobble
            "easeOut", // rest
          ],
          // Both of these belong to the descent, not to the settle. Run over
          // the full duration they would still be resolving while the badge
          // sat still, which reads as a ghost fading in on top of a stamp that
          // has already landed.
          opacity: { delay: BADGE_AT, duration: 0.2, ease: "easeOut" },
          filter: {
            delay: BADGE_AT,
            duration: 0.32,
            ease: [0.5, 0, 0.8, 0.4],
          },
        }}
      >
        {art}
      </motion.div>

      {/* The shockwave, fired at the moment of contact rather than at the
          start of the move — 0.38 of 0.78s in, which is where the scale
          crosses 1 and the badge meets the page. Nothing sells an impact like
          something leaving it. */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full ring-2 ring-[#9fa1ff]"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: [0, 0.85, 0], scale: [0.92, 1.65] }}
        transition={{
          delay: BADGE_AT + 0.3,
          duration: 0.55,
          ease: [...EASE_OUT],
        }}
      />
    </div>
  );
}

export function EggHunt({ children }: { children: ReactNode }) {
  const [collecting, setCollecting] = useState<Opened>(null);
  const [raised, setRaised] = useState(false);
  const [partyOver, setPartyOver] = useState(false);
  /** The finale rewinds as a short state machine rather than disappearing all
   *  at once: first the plaque details, then the plaque and bar lift, then the
   *  slot wave. Each beat uses the duration of the entrance motion it mirrors,
   *  keeping the reverse choreography explicit and deterministic. */
  const [outro, setOutro] = useState<
    "details" | "main" | "slots" | null
  >(null);
  /** A repeat performance, asked for from the counter. Two phases, because the
   *  bar has to be up before the show starts — see the effect below. */
  const [encore, setEncore] = useState<"lifting" | "playing" | null>(null);
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const reducedMotion = useReducedMotion();

  // What is in the bar, straight off localStorage. It survives a refresh
  // because this is where it lives — there is no React copy of it to keep in
  // step, only a subscription.
  const stored = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // Eggs clicked during THIS visit. Only needed for the one in flight — it has
  // to leave its hiding place on click, which is before it reaches the bar —
  // but it doubles as the answer to "did anything just happen here?".
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set());

  // Gone from its hiding place: everything in the bar, plus whatever is in the
  // air. Almost always just the bar, so the common case returns it unchanged
  // rather than building a copy for the context to hand out.
  const found = useMemo(() => {
    if (!opened.size) return stored;
    const all = new Set(stored);
    opened.forEach((i) => all.add(i));
    return all;
  }, [stored, opened]);

  const complete = stored.size === EGGS.length;

  // Complete AND at least one of them put there just now. That second half is
  // what keeps a finished hunt from throwing its confetti again on every page
  // load, which would turn the one moment the hunt has into wallpaper. It also
  // means a set completed in another tab arrives quietly here, which is right:
  // the celebration belongs to whoever earned it.
  const earned = complete && opened.size > 0;

  // On stage right now: the one the last egg set off, or one asked for again.
  // Once the entrance clock expires, `outro` keeps the finale mounted while
  // its pieces walk back through their starting poses.
  const partyRequested = (earned && !partyOver) || encore === "playing";
  const party = partyRequested && outro === null;
  const celebrationVisible = partyRequested || outro !== null;

  // Two reasons the bar can be up, so it is an `or` rather than one flag two
  // things fight over. A collect raises it and lowers it again; the party
  // holds it up regardless, because the finale is the case with all four in
  // it and the bar cannot slide out from under its own curtain call.
  const barUp = raised || celebrationVisible;

  useEffect(() => {
    if (!party) return;
    const timer = setTimeout(() => setOutro("details"), PARTY_MS);
    return () => clearTimeout(timer);
  }, [party]);

  // An encore opens with the bar rather than with the wave. The first run had
  // it up already — a collect raises it — but a replay is fired from a page at
  // rest, and a wave across four slots still parked below the fold is a beat
  // nobody sees. So raise it, wait out the slide, and start the show against a
  // bar that has stopped moving.
  useEffect(() => {
    if (encore !== "lifting") return;
    const timer = setTimeout(() => setEncore("playing"), BAR_SLIDE_MS);
    return () => clearTimeout(timer);
  }, [encore]);

  const replay = useCallback(() => {
    setOutro(null);
    setRaised(true);
    setEncore("lifting");
  }, []);

  const finishOutro = useCallback(() => {
    setPartyOver(true);
    setEncore(null);
    // Only ever does anything after an encore. The first run let go of the
    // bar the moment the egg was in its slot; the party held it up from there.
    setRaised(false);
    setOutro(null);
  }, []);

  // Motion completion events from nodes that switch direction can be
  // delivered by the animation being replaced. Keep the order deterministic
  // here instead: each phase owns exactly the duration of the inverse motion
  // it starts, then hands off to the next phase.
  useEffect(() => {
    if (!outro) return;

    const duration = reducedMotion
      ? 0
      : outro === "details"
        ? DETAILS_REWIND_MS
        : outro === "main"
          ? PLAQUE_REWIND_MS
          : SLOT_REWIND_MS;

    const timer = setTimeout(() => {
      if (outro === "details") setOutro("main");
      else if (outro === "main") setOutro("slots");
      else finishOutro();
    }, duration);

    return () => clearTimeout(timer);
  }, [finishOutro, outro, reducedMotion]);

  // Go and see the badge. The last egg is almost always found somewhere down
  // the page — three of them are in the grass — and the seal lands in the
  // header, so without this the one big thing that just happened happens
  // off-screen and is a surprise on the next scroll up.
  //
  // Nothing is lost on the way: the confetti, the bar and the plaque are all
  // fixed, so they play out over the top of the travel rather than scrolling
  // away from it.
  //
  // Through Lenis rather than window.scrollTo, because Lenis owns this
  // scroller — a native smooth scroll would be fighting its RAF loop for the
  // same property the whole way up. Its duration is fixed rather than derived
  // from the distance, which is what lets BADGE_AT be a constant: the stamp
  // has to fire after the travel has landed, from anywhere on the page.
  const lenis = useLenis();
  const travelled = useRef(false);

  useEffect(() => {
    if (!earned || travelled.current) return;
    travelled.current = true;

    if (reducedMotion) {
      if (lenis) lenis.scrollTo(0, { immediate: true });
      else window.scrollTo(0, 0);
      return;
    }
    if (lenis) lenis.scrollTo(0, { duration: SCROLL_HOME_S });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }, [earned, lenis, reducedMotion]);

  const open = useCallback((index: number, from: DOMRect) => {
    setCollecting({ index, from });
    // Out of its hiding place the moment it is clicked, so the egg reads as
    // lifting out rather than being cloned.
    setOpened((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
  }, []);

  const api = useMemo(
    () => ({ open, found, complete, earned }),
    [open, found, complete, earned],
  );

  return (
    <EggHuntContext.Provider value={api}>
      {children}

      <Hotbar
        stored={stored}
        up={barUp}
        elevated={party || outro === "details"}
        wave={party ? "forward" : outro === "slots" ? "reverse" : null}
        slots={slots}
      />
      <EggCounter count={stored.size} hidden={barUp} onReplay={replay} />
      <Achievement
        show={party || outro === "details"}
        rewinding={outro === "details"}
      />
      {party && <Confetti />}

      {collecting && (
        <EggCollect
          key={collecting.index}
          egg={EGGS[collecting.index]}
          from={collecting.from}
          // Read before this one is stored, so it is still the count of the
          // others: three already in means this is the one that finishes it.
          last={stored.size === EGGS.length - 1}
          getSlot={() => slots.current[collecting.index] ?? null}
          onRaiseBar={() => setRaised(true)}
          // Straight to storage. The store notifies, the subscription
          // re-renders, and the slot fills — the same path a write from
          // another tab takes, so there is only one of them to get right.
          onStored={() => saveEgg(collecting.index)}
          onDone={() => {
            setRaised(false);
            setCollecting(null);
          }}
        />
      )}
    </EggHuntContext.Provider>
  );
}

/** Deterministic scatter in [0,1). */
function scatter(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Pieces in the all-four burst, split evenly between the two cannons. */
const CONFETTI_PIECES = 80;

/**
 * The finale, once the last egg is in. Four things on one clock, and the
 * numbers below are all offsets from the moment it lands in its slot:
 *
 *   0.00  the scrim is already gone — it started clearing during the drop, so
 *         the burst goes off against the page rather than a dark pane
 *   0.00  confetti
 *   0.15  the four slots pop in a wave, left to right
 *   0.75  the bar lifts and the achievement plaque rises into the gap
 *   5.20  the sequence rewinds: plaque details, plaque, slots, then bar
 *
 * PARTY_MS has to outlast the slowest scrap — the longest flight plus the
 * second volley's delay, about 4.4s — or the tail of the burst is cut off
 * mid-air.
 */
const PARTY_MS = 5200;

/** When the wave across the slots starts, and the gap between each slot and
 *  the next. Seconds; these feed Motion's `delay` directly. */
const WAVE_AT = 0.15;
const WAVE_STEP = 0.08;

/** Each rewind phase lasts exactly as long as the entrance motion it mirrors.
 * The slot total includes the right-to-left stagger before the final slot
 * settles. */
const DETAILS_REWIND_MS = 950;
const PLAQUE_REWIND_MS = 720;
const SLOT_REWIND_MS = Math.round((0.5 + (EGGS.length - 1) * WAVE_STEP) * 1000);

/** When the bar lifts and the plaque rises. Late enough that the wave has
 *  most of the eye to itself first. */
const PLAQUE_AT = 0.75;

/** How long the trip back to the top of the page takes. Fixed rather than
 *  proportional to the distance, so the stamp that has to follow it can be a
 *  constant instead of something measured at run time. */
const SCROLL_HOME_S = 0.9;

/** When the seal lands in the header — after the page has finished travelling
 *  there, with a beat to spare. Landing it mid-scroll would waste the whole
 *  point of going: the stamp would play while the header was still moving. */
const BADGE_AT = SCROLL_HOME_S + 0.28;

/** How far the bar climbs to make room for the plaque underneath it. The
 *  plaque is a fixed height by design — see the note on its container. */
const PLAQUE_CLEARANCE = 88;

/**
 * The reward for all four: two cannons parked just off the bottom corners of
 * the window, fired in two volleys about a third of a second apart.
 *
 * Everything enters from outside the viewport, which is the whole point —
 * confetti that fades in at the top edge reads as scraps that were already
 * hanging there waiting, not as something that was launched.
 *
 * Plain spans on CSS animations, no canvas and no library: a few hundred
 * absolutely-positioned scraps translating and rotating is work the compositor
 * does for free. Each piece is three nested spans because the arc needs its
 * two axes on different timing functions at the same instant — see the
 * keyframes in globals.css.
 */
function Confetti() {
  // Seeded rather than Math.random: an impure call during render is exactly
  // the kind of thing that produces a different shower on every stray
  // re-render, and the React compiler rejects it outright. The same sin-hash
  // the grass uses. No hydration worry here — this never reaches the server.
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_PIECES }, (_, i) => {
        // Alternating sides, and the front half of the list fires first. Both
        // are index parity rather than another hash, so the two cannons get
        // exactly equal loads and each volley is exactly half the burst.
        const right = i % 2 === 1;
        const second = i >= CONFETTI_PIECES / 2;

        // Launch angle above the horizon and muzzle speed, drawn from separate
        // seeds so a steep piece is not also always a fast one. Every piece
        // leaves climbing; gravity is what turns it over.
        const angle = ((24 + scatter(i * 1.7 + 1) * 50) * Math.PI) / 180;
        const power = 0.66 + scatter(i * 2.3 + 5) * 0.7;

        // Travel in viewport units, so the burst covers the same fraction of
        // the screen on a phone as on a desktop. A px budget tuned on one ends
        // up either a puff in the corner or entirely off-stage on the other.
        const dx = Math.cos(angle) * power * 96 * (right ? -1 : 1);
        const rise = Math.sin(angle) * power * 74;

        return {
          key: i,
          // The muzzle itself, spread a little so the pieces are not all
          // stacked on one pixel at t=0.
          left: right
            ? `${104 + scatter(i * 3.1 + 9) * 4}vw`
            : `${-4 - scatter(i * 3.1 + 9) * 4}vw`,
          top: `${99 + scatter(i * 4.7 + 13) * 7}vh`,
          dx: `${dx.toFixed(1)}vw`,
          rise: `${(-rise).toFixed(1)}vh`,
          // Far enough past the bottom edge that even a piece that barely left
          // the muzzle is gone rather than piling up in view.
          drop: `${(24 + scatter(i * 5.3 + 17) * 16).toFixed(1)}vh`,
          spin:
            Math.round(540 + scatter(i * 6.1 + 23) * 1080) *
            (scatter(i * 7.3 + 29) < 0.5 ? -1 : 1),
          // Tumble axis. The fixed z component keeps the vector from ever
          // being all zeroes, which would make rotate3d a no-op.
          ax: (scatter(i * 8.9 + 31) * 1.6 - 0.3).toFixed(2),
          ay: (scatter(i * 9.7 + 37) * 1.6 - 0.3).toFixed(2),
          // A harder shot stays up longer, so flight time tracks power.
          dur: (2.5 + power * 1.1).toFixed(2),
          lag: ((second ? 0.34 : 0) + scatter(i * 11.3 + 41) * 0.09).toFixed(2),
          width: 5 + Math.round(scatter(i * 12.7 + 43) * 5),
          height: 8 + Math.round(scatter(i * 13.9 + 47) * 8),
          tint: EGGS[i % EGGS.length].tint,
          round: scatter(i * 15.1 + 53) < 0.28,
        };
      }),
    [],
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-130 overflow-hidden"
    >
      {pieces.map((p) => (
        // Custom properties inherit, so all eight live on the outer span and
        // the two inside it read whichever ones they need.
        <span
          key={p.key}
          className="egg-confetti absolute block"
          style={
            {
              left: p.left,
              top: p.top,
              "--dx": p.dx,
              "--rise": p.rise,
              "--drop": p.drop,
              "--spin": `${p.spin}deg`,
              "--ax": p.ax,
              "--ay": p.ay,
              "--dur": `${p.dur}s`,
              "--lag": `${p.lag}s`,
            } as React.CSSProperties
          }
        >
          <span className="egg-confetti-arc block">
            <span
              className="egg-confetti-piece block"
              style={{
                width: p.width,
                height: p.height,
                background: p.tint,
                borderRadius: p.round ? "9999px" : "1px",
              }}
            />
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * How many of the four are in. Sits out of the way until the first one is
 * found — a 0/5 on a fresh page gives away that there is anything to look for.
 *
 * Steps aside while the bar is up rather than fighting it for the bottom of
 * the screen: on a narrow viewport the bar is wide enough to reach the corner
 * this would otherwise sit in, and the bar is the better feedback in that
 * moment anyway.
 *
 * At 4/4 it also becomes the way back to the celebration. The finale plays
 * once, in the visit the hunt was finished in, and the counter is the only
 * thing on screen that is already about the hunt being over — so it is where a
 * "again" belongs, rather than in a control invented for the purpose.
 */
function EggCounter({
  count,
  hidden,
  onReplay,
}: {
  count: number;
  hidden: boolean;
  onReplay: () => void;
}) {
  if (count === 0) return null;

  const complete = count === EGGS.length;

  return (
    // Two elements, because they answer two different questions and one
    // opacity cannot serve both. The outer plays the one-time entrance; the
    // inner steps aside for the bar. Put on one element, the entrance's `both`
    // fill would sit on top of the inline opacity forever and the counter
    // would never get out of the bar's way again.
    <div className="egg-counter-in group pointer-events-none fixed right-4 bottom-5 z-110 sm:right-6 sm:bottom-6">
      <div
        aria-live="polite"
        className={cn(
          "flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2 font-display text-xs font-medium text-foreground backdrop-blur-sm transition-[opacity,transform] duration-300 motion-reduce:transition-none",
          // Only once there is something to press. The hover belongs to the
          // pill rather than to the button over it, so the thing that lifts is
          // the thing the pointer is on.
          complete &&
            "[@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-105",
        )}
        style={{
          opacity: hidden ? 0 : 1,
          background:
            "linear-gradient(rgba(255,255,255,0.95), rgba(244,244,254,0.82))",
          boxShadow: [
            "rgba(94,96,140,0.18) 0 1px 2px",
            "rgba(120,122,255,0.35) 0 8px 18px -12px",
            "rgba(255,255,255,0.98) 0 1px 0 inset",
          ].join(","),
        }}
      >
        <Image
          src={EGGS[0].src}
          alt=""
          aria-hidden
          width={Math.round((15 * EGGS[0].w) / EGGS[0].h)}
          height={15}
          loading="eager"
          className="select-none"
          style={{
            height: 15,
            width: Math.round((15 * EGGS[0].w) / EGGS[0].h),
          }}
        />
        <span className="tabular-nums">
          {count}
          <span className="text-muted-foreground">/{EGGS.length}</span>
        </span>
        <span className="sr-only">easter eggs found</span>
      </div>

      {/* The replay, as a bare target over the pill rather than as the pill
          itself. The pill is a live region announcing a count, and a live
          region inside a button is read as the button's name — "4 of 4 easter
          eggs found, button" every time the number changes.

          Sized off the wrapper, which is exactly the pill's box: `fixed` is a
          positioned box, so there is no `relative` to add here.

          Pointer events inline, not `pointer-events-auto`, because they have to
          go off again while the bar is up — the pill is at opacity 0 then, and
          an invisible button is not something to leave clickable. */}
      {complete && (
        <button
          type="button"
          onClick={onReplay}
          aria-label="All four eggs found — play the celebration again"
          className="absolute inset-0 cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9fa1ff]"
          style={{ pointerEvents: hidden ? "none" : "auto" }}
        />
      )}
    </div>
  );
}

/**
 * The collection bar. It is a hotbar in behaviour — a row of slots that rises
 * to catch what you found — but drawn as another pane of the same periwinkle
 * glass the icon wall stands on, not as Minecraft's grey chrome. Dropping the
 * game's palette straight onto this page put a slab of #8B8B8B and hard black
 * borders in the middle of a soft white layout, and it read as pasted in from
 * somewhere else.
 *
 * So: the slab's own gradient and bloom, and slots cut as the same 22.37%
 * squircles as the shelf tiles, with the same inset contact shadow. The tint
 * literals match icon-shelf.tsx for exactly the reason given there — the glass
 * mixes them at a dozen different alphas.
 *
 * Always mounted, parked below the fold, so a slot can be measured the moment
 * it is needed.
 */
function Hotbar({
  stored,
  up,
  elevated,
  wave,
  slots,
}: {
  stored: ReadonlySet<number>;
  up: boolean;
  elevated: boolean;
  wave: "forward" | "reverse" | null;
  slots: RefObject<(HTMLDivElement | null)[]>;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <div
      aria-hidden={!up}
      data-hotbar
      className="pointer-events-none fixed inset-x-0 bottom-0 z-110 flex justify-center pb-6 transition-transform ease-out motion-reduce:transition-none"
      style={{
        // Three positions, not two: parked below the fold, up where a collect
        // wants it, and — for the finale — a step higher still, leaving the
        // bottom of the screen for the plaque.
        transform: up
          ? elevated
            ? `translateY(-${PLAQUE_CLEARANCE}px)`
            : "translateY(0)"
          : "translateY(180%)",
        transitionDuration: `${BAR_SLIDE_MS}ms`,
        // The lift waits for the wave; the drop at the end does not wait for
        // anything, so the delay only ever applies on the way up.
        transitionDelay: wave === "forward" ? `${PLAQUE_AT}s` : "0s",
      }}
    >
      <div className="relative">
        {/* The bloom the glass throws down onto the page, as under the wall. */}
        <div className="absolute inset-x-8 bottom-0 h-3 rounded-full bg-[#9fa1ff]/30 blur-md" />

        <div
          className="relative flex gap-2 rounded-2xl p-2.5 backdrop-blur-sm sm:gap-2.5 sm:p-3"
          style={{
            background: [
              `radial-gradient(80% 140% at 10% 0%, rgba(159,161,255,0.30) 0%, rgba(159,161,255,0) 46%)`,
              `radial-gradient(80% 140% at 90% 0%, rgba(186,164,255,0.24) 0%, rgba(186,164,255,0) 50%)`,
              "linear-gradient(rgba(255,255,255,0.95) 0%, rgba(244,244,254,0.78) 60%, rgba(249,249,255,0.88) 100%)",
            ].join(","),
            boxShadow: [
              "rgba(94,96,140,0.20) 0 1px 2px",
              "rgba(120,122,255,0.40) 0 14px 30px -18px",
              "rgba(255,255,255,0.98) 0 1px 0 inset",
              "rgba(104,106,155,0.26) 0 -1px 0 inset",
            ].join(","),
          }}
        >
          {EGGS.map((egg, i) => (
            // The wave. Each slot hops and swells, one after the next along
            // the row — the same read as a scoreboard totting up, and the
            // reason the four are shown left to right in the first place.
            //
            // `y`/`scale` rather than a CSS class: the delay has to come from
            // the index, and four keyframe rules that differ only in
            // animation-delay is worse than one prop.
            <motion.div
              // A fresh Motion node per phase gives the reverse wave a clean
              // starting pose instead of inheriting the tail of the forward
              // or idle animation.
              key={`${egg.src}-${wave ?? "idle"}`}
              ref={(el) => {
                slots.current[i] = el;
              }}
              animate={
                wave && !reducedMotion
                  ? { y: [0, -13, 0], scale: [1, 1.14, 1] }
                  : { y: 0, scale: 1 }
              }
              transition={
                wave && !reducedMotion
                  ? {
                      duration: 0.5,
                      delay:
                        wave === "forward"
                          ? WAVE_AT + i * WAVE_STEP
                          : (EGGS.length - 1 - i) * WAVE_STEP,
                      times: wave === "forward" ? [0, 0.42, 1] : [0, 0.58, 1],
                      // Up off the shelf and back down onto it: the same
                      // out-then-in pair every hop on this page uses. The exit
                      // swaps both halves and their curves, which is the
                      // temporal inverse rather than just the opposite order.
                      ease:
                        wave === "forward"
                          ? ["easeOut", [0.42, 0, 0.7, 0.62]]
                          : [[0.3, 0.38, 0.58, 1], "easeIn"],
                    }
                  : { duration: 0 }
              }
              className="relative grid size-11 place-items-center rounded-[22.37%] bg-foreground/4 shadow-[inset_0_1px_3px_rgba(0,0,0,0.14)] ring-1 ring-border ring-inset sm:size-13"
            >
              {/* The flash the hop leaves behind — a ring blown out past the
                  slot and faded. Mounted only for the party, so
                  AnimatePresence can take it away again when the finale ends
                  even though the element that owns it never unmounts. */}
              <AnimatePresence>
                {wave && !reducedMotion && (
                  <motion.span
                    key={wave}
                    aria-hidden
                    initial={{ opacity: 0, scale: wave === "forward" ? 1 : 1.85 }}
                    animate={{
                      opacity: [0, 0.9, 0],
                      scale: wave === "forward" ? [1, 1.85] : [1.85, 1],
                    }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: 0.62,
                      delay:
                        wave === "forward"
                          ? WAVE_AT + i * WAVE_STEP
                          : (EGGS.length - 1 - i) * WAVE_STEP,
                      ease:
                        wave === "forward"
                          ? [...EASE_OUT]
                          : [0.56, 0, 0.835, 0.16],
                    }}
                    className="pointer-events-none absolute inset-0 rounded-[22.37%] ring-2 ring-[#9fa1ff] ring-inset"
                  />
                )}
              </AnimatePresence>

              {stored.has(i) && (
                <Image
                  src={egg.src}
                  alt={`${egg.name} egg, collected`}
                  width={Math.round((28 * egg.w) / egg.h)}
                  height={28}
                  loading="eager"
                  className="relative select-none drop-shadow-sm"
                  style={{
                    height: 28,
                    width: Math.round((28 * egg.w) / egg.h),
                  }}
                />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The plaque, for finding all four. A game achievement — the label, the name,
 * the line underneath — drawn on the same periwinkle glass as the bar it rises
 * out from under, so it reads as part of this page rather than as a Steam
 * screenshot pasted onto it.
 *
 * Fixed 64px tall on purpose. The bar above has to climb far enough to clear
 * it and that climb is a transform, which cannot be told "however tall the
 * thing below turns out to be" — so the height is declared here and
 * PLAQUE_CLEARANCE is read off it. Three tight lines sit inside comfortably;
 * the description is short enough not to wrap on a 320px screen, which is the
 * only thing that would break the arrangement.
 *
 * The badge is the site's own mark, and the cat climbs out of the hill on it
 * once the plaque has landed — the same beat the header logo plays on load.
 */
function Achievement({
  show,
  rewinding,
}: {
  show: boolean;
  rewinding: boolean;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="achievement"
          // Announced, not just drawn. This is the one moment in the hunt with
          // something to say, and it says it out of view of a screen reader
          // otherwise.
          role="status"
          aria-live="polite"
          initial={reducedMotion ? { opacity: 0 } : { y: "150%", opacity: 0 }}
          animate={{
            y: "0%",
            opacity: 1,
            transition: reducedMotion
              ? { duration: 0.3 }
              : {
                  // A prize arriving, so a little overshoot — the same licence
                  // the egg's own landing takes.
                  type: "spring",
                  duration: 0.72,
                  bounce: 0.3,
                  delay: PLAQUE_AT,
                  opacity: { duration: 0.24, delay: PLAQUE_AT },
                },
          }}
          exit={{
            // The exact spatial inverse of the entrance: back to the full
            // below-screen pose, with the same spring resolving in reverse.
            y: reducedMotion ? "0%" : "150%",
            opacity: 0,
            transition: reducedMotion
              ? { duration: 0.3 }
              : {
                  type: "spring",
                  duration: 0.72,
                  bounce: 0.3,
                  opacity: { duration: 0.24 },
                },
          }}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-115 flex justify-center px-4 pb-5"
        >
          <div
            className="relative flex h-16 max-w-full items-center gap-3 overflow-hidden rounded-2xl pr-5 pl-2.5 backdrop-blur-sm"
            style={{
              background: [
                `radial-gradient(90% 160% at 8% 0%, rgba(159,161,255,0.34) 0%, rgba(159,161,255,0) 52%)`,
                `radial-gradient(80% 150% at 92% 100%, rgba(186,164,255,0.26) 0%, rgba(186,164,255,0) 55%)`,
                "linear-gradient(rgba(255,255,255,0.96) 0%, rgba(244,244,254,0.82) 60%, rgba(249,249,255,0.9) 100%)",
              ].join(","),
              boxShadow: [
                "rgba(94,96,140,0.20) 0 1px 2px",
                "rgba(120,122,255,0.42) 0 16px 34px -18px",
                "rgba(255,255,255,0.98) 0 1px 0 inset",
                "rgba(104,106,155,0.24) 0 -1px 0 inset",
              ].join(","),
            }}
          >
            {/* The sweep across the glass. One pass, once — a shine that
                loops turns a moment into a decoration. */}
            {!reducedMotion && (
              <motion.span
                // Remount at the turn so the reverse pass starts exactly at
                // the completed shine position instead of inheriting a stale
                // transform from the forward node.
                key={rewinding ? "shine-reverse" : "shine-forward"}
                aria-hidden
                // The lean is `skewX` here rather than Tailwind's `-skew-x-12`
                // because Motion writes the whole `transform` property inline
                // to move this, and that wins over the class — the skew would
                // simply vanish the moment the sweep started. Given to Motion,
                // the two compose.
                //
                // Percentages are of this band's own width, which is a third
                // of the plaque: -140% parks it clear of the left edge and
                // 380% carries it clear of the right.
                initial={{
                  x: rewinding ? "380%" : "-140%",
                  skewX: -12,
                }}
                animate={{
                  x: rewinding ? "-140%" : "380%",
                  skewX: -12,
                }}
                transition={
                  rewinding
                    ? { duration: 0.95, ease: [0.75, 0, 0.6, 1] }
                    : {
                        duration: 0.95,
                        delay: PLAQUE_AT + 0.34,
                        ease: [0.4, 0, 0.25, 1],
                      }
                }
                className="absolute inset-y-0 left-0 w-1/3"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)",
                }}
              />
            )}

            {/* The mark, built the same way logo.tsx builds it: the hill is the
                front layer, so the cat can climb up from behind it. The
                percentages are the same fitted numbers — see the note there. */}
            <div
              aria-hidden
              className="relative size-11 shrink-0 overflow-hidden"
              style={{ borderRadius: "15.8%" }}
            >
              <Image
                src="/logo-bg.png"
                alt=""
                width={158}
                height={158}
                loading="eager"
                className="absolute inset-0 size-full"
              />
              <motion.div
                className="absolute"
                style={{ width: "74%", left: "13%", bottom: "15%" }}
                initial={reducedMotion ? { y: "0%" } : { y: "100%" }}
                animate={{
                  y: reducedMotion ? "0%" : rewinding ? "100%" : "0%",
                  transition: reducedMotion
                    ? { duration: 0 }
                    : rewinding
                      ? {
                          type: "spring",
                          duration: 0.6,
                          bounce: 0.42,
                          delay: 0.35,
                        }
                      : {
                          type: "spring",
                          duration: 0.6,
                          bounce: 0.42,
                          delay: PLAQUE_AT + 0.36,
                        },
                }}
              >
                <Mascot className="block h-auto w-full max-w-none" />
              </motion.div>
              <Image
                src="/logo-mound.png"
                alt=""
                width={158}
                height={17}
                loading="eager"
                className="absolute max-w-none"
                style={{ width: "190%", height: "auto", left: "-45%", bottom: "-8%" }}
              />
            </div>

            {/* `truncate` on all three, and `max-w-full` on the plaque. The
                height is fixed and the clearance the bar climbs is read off
                it, so a line that wraps on a narrow screen does not just look
                cramped — it pushes the plaque up into the bar. An ellipsis is
                the containable failure. */}
            <div className="relative min-w-0">
              <p className="truncate font-display text-[10px] leading-none font-bold tracking-[0.16em] text-[#6668cc] uppercase">
                Achievement unlocked
              </p>
              <p className="mt-1 truncate font-display text-sm leading-tight font-semibold text-foreground">
                Egg Hunter
              </p>
              <p className="truncate font-display text-[11px] leading-tight text-muted-foreground">
                Congratulations — all four found
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * The collect. Four beats, each waiting on the last rather than being fired
 * off a stopwatch, because the third one has to measure where the hotbar
 * actually ended up:
 *
 *   1. the egg flies from its hiding place to the middle of the screen
 *   2. it pops, and the hotbar rises
 *   3. it drops into its slot
 *   4. the scrim clears and the hotbar leaves
 */
function EggCollect({
  egg,
  from,
  last,
  getSlot,
  onRaiseBar,
  onStored,
  onDone,
}: {
  egg: (typeof EGGS)[number];
  from: DOMRect;
  /** Whether this is the last, which turns the tail of the sequence into the
   *  opening of the celebration rather than a tidy-up. */
  last: boolean;
  getSlot: () => HTMLDivElement | null;
  onRaiseBar: () => void;
  onStored: () => void;
  onDone: () => void;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  // The scrim sits on its own layer below the hotbar, which puts it outside
  // `scope` — and a scoped animate() only ever looks inside its scope, so a
  // "[data-scrim]" selector here silently matches nothing and Motion throws.
  // Hold the element directly instead.
  const scrim = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const stage = scope.current;
    const big = stage?.querySelector<HTMLImageElement>("img[data-egg]");
    const veil = scrim.current;
    if (!stage || !big || !veil) return;

    let cancelled = false;
    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const run = async () => {
      if (reducedMotion) {
        // No flight and no pop, but the egg still has to end up in the bar.
        onRaiseBar();
        await wait(BAR_SLIDE_MS + 260);
        if (cancelled) return;
        onStored();
        await wait(420);
        if (!cancelled) onDone();
        return;
      }

      // The scrim starts the moment the egg is clicked — the click has to be
      // answered on the next frame, whatever else is not ready yet.
      //
      // It fades itself. It must NOT be an ancestor doing the fading: an
      // ancestor below opacity 1 isolates the group, so the scrim's
      // backdrop-filter has nothing behind it to sample and produces no blur —
      // then the moment opacity reaches exactly 1 the isolation lifts and the
      // blur snaps on all at once, which reads as a second layer dropping in
      // late.
      void animate(
        veil,
        { opacity: [0, 1] },
        { duration: 0.35, ease: [...EASE_OUT] },
      );

      // Hold the flight until the artwork has pixels. This mounts with a fresh
      // `src` at a much larger width than the speck that was clicked, so it is
      // a new request no matter how long the page has been open — and decoding
      // a 480px PNG is main-thread work that would otherwise land in the
      // middle of the flight and eat the frames it needs. `decode()` also
      // covers the case where the bytes are cached but the bitmap is not.
      //
      // Capped, though. On a slow connection an unbounded wait leaves the page
      // dimmed with nothing in it, and a blank egg flying is a better outcome
      // than a click that appears to have done nothing.
      await Promise.race([big.decode().catch(() => {}), wait(DECODE_WAIT_MS)]);
      if (cancelled) return;

      // 1. Arrive. Same FLIP as the logo: the egg is already where it needs to
      //    be, so measure that, start it back at the speck that was clicked,
      //    and let it travel to zero. Measured rather than assumed because the
      //    reveal size is a clamp() — there is no constant to divide by.
      const to = big.getBoundingClientRect();
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);

      await animate(
        big,
        { x: [dx, 0], y: [dy, 0], scale: [from.height / to.height, 1] },
        // Barely any overshoot. The bounce is the next beat and it opens with
        // a crouch — an arrival that already wobbled past its mark ran the two
        // together and the whole thing read as jitter.
        { type: "spring", duration: 0.58, bounce: 0.12 },
      ).finished;
      if (cancelled) return;

      // 2. Land: the light blooms, the hotbar comes up underneath, and the egg
      //    bounces.
      //
      //    The rays are two big masked conic gradients. Fading them up during
      //    the flight put their composite in exactly the frames the flight
      //    needed, and staging them on the landing is the better beat anyway —
      //    an accent on the arrival rather than a glow that travels with it.
      onRaiseBar();
      void animate(
        "[data-rays]",
        { opacity: [0, 1], scale: [0.82, 1] },
        { duration: 0.5, ease: [...EASE_OUT] },
      );

      //    An actual bounce, not a scale pulse — swelling and shrinking in
      //    place reads as the image resizing, which is what it is. What sells
      //    a bounce is gravity and contact:
      //
      //      · it crouches before it leaves, so the hop has a cause
      //      · the climb decelerates into the apex and the fall accelerates
      //        out of it, on separate curves — one ease across both is a
      //        float, not a fall
      //      · the squash happens at the floor and over ~50ms. Spread across
      //        the whole segment, as it was, it is a pulse that happens to
      //        peak near the ground
      //      · it is stretched tall while moving fast and back to its own
      //        shape at the apex, where it is weightless
      //      · each hop is ~40% of the last, which is what makes three of them
      //        read as one object bouncing
      //
      //    Origin at the bottom for the duration, so the squash plants on a
      //    floor instead of pinching in from both sides. Safe to swap here and
      //    only here: the transform is identity at both ends of this beat, so
      //    neither switch is visible, and the flight and the drop keep the
      //    centre origin their measurements assume.
      //
      //    Hop heights scale with the egg, which is a clamp() between 180 and
      //    320px — a fixed 24px hop is lively on the small end and a twitch on
      //    the large one. Everything lands back on 1 so the drop into the slot
      //    starts from a clean transform.
      const h = to.height;
      const hop = (f: number) => -Math.round(h * f);

      big.style.transformOrigin = "50% 100%";
      await animate(
        big,
        {
          y: [
            0,
            0,
            hop(0.042),
            hop(0.21),
            hop(0.042),
            0,
            hop(0.032),
            hop(0.085),
            0,
            hop(0.026),
            0,
          ],
          scaleX: [1, 1.1, 0.93, 1, 0.94, 1.16, 0.97, 1, 1.09, 0.99, 1],
          scaleY: [1, 0.89, 1.1, 1, 1.09, 0.85, 1.05, 1, 0.92, 1.02, 1],
        },
        {
          duration: 0.95,
          times: [0, 0.07, 0.14, 0.35, 0.52, 0.56, 0.62, 0.73, 0.85, 0.92, 1],
          ease: [
            "easeOut", // rest → crouch
            "easeOut", // crouch → push off
            [0.1, 0.72, 0.35, 1], // climb, decelerating
            "easeIn", // apex → falling
            "easeIn", // falling → floor
            "easeOut", // contact squash → rebound
            [0.1, 0.72, 0.35, 1], // second climb
            "easeIn", // second apex → floor
            "easeOut", // second contact → last hop
            "easeIn", // and down
          ],
        },
      ).finished;
      big.style.transformOrigin = "";
      if (cancelled) return;

      // A beat with the egg sitting still. Going straight from the last hop
      // into the drop gives no moment to actually look at the thing that was
      // just found, and the two motions run together as one long slide.
      //
      // No wait for the bar is needed on top of this: it was called up before
      // the bounce, which runs twice as long as the slide, so the slot has
      // long since stopped moving and can be measured honestly.
      await wait(BOUNCE_HOLD_MS);
      if (cancelled) return;

      // 3. Drop it in. Not on one curve: x, y and scale sharing a single
      //    ease-in-out is a straight diagonal slide with a shrink bolted to
      //    it, and a straight line between two points that are nowhere near
      //    each other is the one path nothing physical ever takes.
      //
      //    So the axes are split. X eases in and out across the whole move,
      //    while Y lifts a little first and only then falls — the toss into
      //    the slot. Two axes on different curves is what bends the path into
      //    an arc; there is no arc primitive to reach for.
      const slot = getSlot()?.getBoundingClientRect();
      const now = big.getBoundingClientRect();
      if (slot) {
        const sx = slot.left + slot.width / 2 - (now.left + now.width / 2);
        const sy = slot.top + slot.height / 2 - (now.top + now.height / 2);

        void animate(
          "[data-rays]",
          { opacity: 0 },
          { duration: 0.3, ease: [...EASE_OUT] },
        );

        // On the last, the page is handed back DURING the drop rather than
        // after it. The celebration starts the instant the egg lands, and a
        // burst of confetti over a dark, blurred page is the reveal's backdrop
        // still standing there while the next scene plays on top of it.
        //
        // Which means the drop finishes against the page itself — the right
        // read anyway: the reveal is over, the collection is what matters now.
        if (last) {
          void animate(
            veil,
            { opacity: 0 },
            { duration: 0.42, ease: [...EASE_OUT] },
          );
        }
        await animate(
          big,
          {
            x: sx,
            y: [0, -Math.round(h * 0.05), sy],
            scale: (slot.height * 0.62) / now.height,
          },
          {
            duration: 0.56,
            x: { ease: [...EASE_IN_OUT] },
            y: {
              times: [0, 0.22, 1],
              // Up out of the hold, then over and down under gravity.
              ease: ["easeOut", [0.4, 0, 0.75, 0.6]],
            },
            // Scale lags the position: near full size for the first third,
            // then most of the shrink at the end, settling as it arrives.
            // Shrinking evenly across the move reads as the egg receding into
            // the distance rather than as the egg being put away.
            scale: { ease: [0.7, 0, 0.45, 1] },
          },
        ).finished;
      }
      if (cancelled) return;

      // The slot takes over the egg the instant the flying one lands. Both
      // writes have to land in the same frame — the old order let React paint
      // the stored egg while the flying one was still up, and for one frame
      // there were two of them at slightly different sizes. A direct style
      // write beats an animation to a value that is never interpolated.
      big.style.opacity = "0";
      onStored();

      // 4. Clear out. On the last the scrim is already going, and this beat is
      //    only still here to unmount the stage — holding a quarter of a second
      //    would sit an invisible full-screen dialog over the confetti.
      if (!last) {
        await wait(260);
        if (cancelled) return;
        await animate(
          veil,
          { opacity: 0 },
          { duration: 0.3, ease: [...EASE_OUT] },
        ).finished;
      }
      if (!cancelled) onDone();
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, scope, from, reducedMotion]);

  return (
    <>
      {/* Scrim, on its own layer under the hotbar so the bar reads as sitting
          in front of the darkened page. */}
      <div
        ref={scrim}
        data-scrim
        aria-hidden
        className="fixed inset-0 z-100 bg-[#0d0b1a]/70 opacity-0 backdrop-blur-xs"
      />

      {/* The egg and its rays, above the hotbar — it has to fly over the bar
          to land in it, not slide underneath. */}
      <div
        ref={scope}
        role="dialog"
        aria-modal="true"
        aria-label={`${egg.name} egg`}
        className="pointer-events-none fixed inset-0 z-120 grid place-items-center"
      >
        <div className="relative grid place-items-center">
          {/* The wheel of light. Constant rotation, so linear — an eased spin
              visibly stalls at each turn. Two layers running opposite ways at
              different speeds keeps it from reading as one flat pinwheel.

              Sized to the egg rather than to the viewport. At viewport size
              the mask's falloff lands off-screen, so the rays never fade —
              they tile the whole page at full strength and the reveal turns
              into wallpaper. */}
          <div
            data-rays
            aria-hidden
            className="absolute size-[min(88vmin,820px)] opacity-0"
          >
            <div
              className="egg-rays absolute inset-0"
              style={{
                background: `repeating-conic-gradient(${egg.tint}59 0deg 7deg, transparent 7deg 22deg)`,
                maskImage:
                  "radial-gradient(circle, transparent 13%, #000 27%, #000 37%, transparent 50%)",
                WebkitMaskImage:
                  "radial-gradient(circle, transparent 13%, #000 27%, #000 37%, transparent 50%)",
              }}
            />
            <div
              className="egg-rays-slow absolute inset-0"
              style={{
                background: `repeating-conic-gradient(${egg.tint}2e 0deg 3deg, transparent 3deg 17deg)`,
                maskImage:
                  "radial-gradient(circle, transparent 18%, #000 32%, transparent 48%)",
                WebkitMaskImage:
                  "radial-gradient(circle, transparent 18%, #000 32%, transparent 48%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle, ${egg.tint}4d 0%, ${egg.tint}00 30%)`,
              }}
            />
          </div>

          <Image
            data-egg
            src={egg.src}
            alt={`A ${egg.name} easter egg`}
            width={egg.w}
            height={egg.h}
            // This only mounts once an egg has been clicked, so there is
            // nothing to defer to — and the small hidden copy was served at a
            // different width, so it is a fresh request. Lazy would fly a
            // blank egg in.
            loading="eager"
            className="relative select-none drop-shadow-2xl"
            style={{ height: "clamp(180px, 38vh, 320px)", width: "auto" }}
          />
        </div>
      </div>
    </>
  );
}

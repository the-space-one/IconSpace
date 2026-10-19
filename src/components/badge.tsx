import Image from "next/image";
import { useEffect, useRef, type CSSProperties } from "react";
import { PARTS, VIEWBOX } from "./badge-parts";
import styles from "./badge-motion.module.css";

export type BadgeDef = {
  id: string;
  name: string;
  visits: number;
  /** Length of one run (intro or hover), ms: the longest storyboard layer. */
  duration: number;
  /** Has a generated rig in badge-rigs/ (scripts/rig-badges.mjs). */
  rig?: boolean;
  shine?: boolean;
  art: { width: number; height: number; top: number; left: number };
};

export const BADGES: BadgeDef[] = [
  {
    id: "spark",
    name: "First Spark",
    visits: 1,
    duration: 1400,
    rig: true,
    art: { width: 74.8361, height: 87.436, top: 12, left: 18 },
  },
  {
    id: "regular",
    name: "Regular",
    visits: 2,
    duration: 900,
    art: { width: 77.261, height: 86.5629, top: 14, left: 16 },
  },
  {
    id: "loyal",
    name: "Loyal",
    visits: 3,
    duration: 1000,
    shine: true,
    art: { width: 82.5206, height: 88.2607, top: 14, left: 14 },
  },
  {
    id: "legend",
    name: "Legend",
    visits: 4,
    duration: 1250,
    shine: true,
    art: { width: 80.6877, height: 89.7798, top: 12, left: 15 },
  },
];

function Badge({ badge, landed }: { badge: BadgeDef; landed: boolean }) {
  const label = `${badge.name} badge, ${badge.visits} ${badge.visits === 1 ? "visit" : "visits"}`;

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      // Focus lands here when the badge returns from its reward ceremony.
      tabIndex={landed ? -1 : undefined}
      data-badge={badge.id}
      data-duration={badge.duration}
      data-landed={landed ? "" : undefined}
      className={`relative size-27.5 rounded-tile shadow-tile outline-none ${styles.tile}`}
    >
      <BadgeArt badge={badge} />
      {landed && (
        <span aria-hidden className={styles.burst}>
          {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
        </span>
      )}
    </div>
  );
}

/** The badge itself, inside a tile (or the reward ceremony's copy of one). */
export function BadgeArt({ badge }: { badge: BadgeDef }) {
  return (
    <div className={styles.frame}>
      <div style={badge.art} className={styles.lift}>
        <div className={styles.swing}>
          <div className={styles.hop}>
            <Image
              src={`/badges/${badge.id}.svg`}
              alt=""
              width={badge.art.width}
              height={badge.art.height}
              className="block max-w-none"
            />
            {badge.rig ? <div data-rig-slot className={styles.slot} /> : <Parts badge={badge} />}
            {badge.shine && <Shine id={badge.id} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** An earned badge waiting to be opened: a gift box that rattles now and then
 * (only while the row is on screen) until it's clicked. */
function Ready({ onOpen }: { onOpen: (tile: HTMLElement) => void }) {
  const tile = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = tile.current;
    if (!element) return;
    const seen = new IntersectionObserver(([entry]) => {
      element.toggleAttribute("data-in-view", entry.isIntersecting);
    });
    seen.observe(element);
    return () => seen.disconnect();
  }, []);

  return (
    <button
      ref={tile}
      type="button"
      aria-label="Open your new badge"
      title="Open your new badge"
      onClick={(event) => onOpen(event.currentTarget)}
      className={`relative size-27.5 cursor-pointer rounded-tile shadow-tile ${styles.tile} ${styles.ready}`}
    >
      <span aria-hidden className={styles.glyph}>
        <Gift />
      </span>
    </button>
  );
}

/** A wrapped gift, drawn like the site's icons (24 grid, 1.5 stroke). The lid
 * and bow are one group so they can hop off the box. */
function Gift() {
  return (
    <svg viewBox="0 0 24 24" width={48} height={48} fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={styles.gift}>
      <path d="M5 11.5h14v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5zM12 11.5V20" />
      <g className={styles.lid}>
        <rect x="3.5" y="7.75" width="17" height="3.75" rx="1" />
        <path d="M12 7.75v3.75M12 7.75C10 7.75 7.75 6.9 7.75 5.1c0-1.2 1.25-1.85 2.3-1.15C11.3 4.8 12 7.75 12 7.75zM12 7.75c2 0 4.25-.85 4.25-2.65 0-1.2-1.25-1.85-2.3-1.15C12.7 4.8 12 7.75 12 7.75z" />
      </g>
    </svg>
  );
}

/** An unearned badge: only its silhouette and a "?", so there's something to
 * look forward to without giving the art away. Hovering says when it unlocks. */
function Mystery({ badge, hint }: { badge: BadgeDef; hint: string }) {
  return (
    <div
      role="img"
      aria-label={`Mystery badge. ${hint}.`}
      className={`relative size-27.5 rounded-tile shadow-tile ${styles.tile} ${styles.mystery}`}
    >
      <div aria-hidden style={badge.art} className={styles.silhouette}>
        <span style={{ maskImage: `url(/badges/${badge.id}.svg)` }} className={styles.shape} />
        <span className={styles.mark}>?</span>
      </div>
      <span aria-hidden className={styles.hint}>{hint}</span>
    </div>
  );
}

/** When a mystery tile unlocks: one badge a day, and only after the gift before it is opened. */
function unlockHint(index: number, earned: number, opened: number, nextEligibleAt: number) {
  if (index < earned) return "Open the gift first";
  if (index > earned) return "Keep visiting, at least 24 hours apart";
  if (earned > opened) return "Return 24 hours after opening your gift";
  if (!nextEligibleAt) return "Earn a badge on your first visit";
  const localTime = new Date(nextEligibleAt).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  return `Visit again after ${localTime}`;
}

/** v1 details for badges without a rig yet, drawn over the art on its own viewBox. */
function Parts({ badge }: { badge: BadgeDef }) {
  const parts = PARTS[badge.id];
  return (
    <svg
      viewBox={VIEWBOX[badge.id]}
      preserveAspectRatio="none"
      aria-hidden
      className={styles.parts}
    >
      <g fill="#fff" stroke="#fff" strokeWidth={0.5}>
        {parts.flatMap((part) => part.paths.map(([, d]) => <path key={d} d={d} />))}
      </g>
      {parts.map((part) => (
        <g
          key={part.paths[0][1]}
          style={{ "--at": `${part.at}ms` } as CSSProperties}
          className={`${styles.part} ${styles[part.motion]}`}
        >
          {part.paths.map(([fill, d]) => (
            <path key={d} d={d} fill={fill} />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** A glint swept across the badge, masked to its silhouette. */
function Shine({ id }: { id: string }) {
  return (
    <span aria-hidden style={{ maskImage: `url(/badges/${id}.svg)` }} className={styles.shine}>
      <span className={styles.band} />
    </span>
  );
}

/** Opened badges, then the next earned one ready to open, then mystery tiles.
 * `landed` is the badge that just came back from its reward ceremony. */
export function Badges({
  earned = 0,
  opened = 0,
  nextEligibleAt = 0,
  landed,
  onOpen,
}: {
  earned?: number;
  opened?: number;
  nextEligibleAt?: number;
  landed?: string;
  onOpen: (badge: BadgeDef, tile: HTMLElement) => void;
}) {
  return BADGES.map((badge, index) => {
    if (index < opened) return <Badge key={badge.id} badge={badge} landed={badge.id === landed} />;
    if (index === opened && index < earned) return <Ready key={badge.id} onOpen={(tile) => onOpen(badge, tile)} />;
    return <Mystery key={badge.id} badge={badge} hint={unlockHint(index, earned, opened, nextEligibleAt)} />;
  });
}

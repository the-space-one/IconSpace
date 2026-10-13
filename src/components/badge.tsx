import Image from "next/image";
import type { CSSProperties } from "react";
import { PARTS, VIEWBOX } from "./badge-parts";
import styles from "./badge-motion.module.css";

type BadgeDef = {
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

const BADGES: BadgeDef[] = [
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
    visits: 5,
    duration: 900,
    art: { width: 77.261, height: 86.5629, top: 14, left: 16 },
  },
  {
    id: "loyal",
    name: "Loyal",
    visits: 15,
    duration: 1000,
    shine: true,
    art: { width: 82.5206, height: 88.2607, top: 14, left: 14 },
  },
  {
    id: "legend",
    name: "Legend",
    visits: 30,
    duration: 1250,
    shine: true,
    art: { width: 80.6877, height: 89.7798, top: 12, left: 15 },
  },
];

function Badge({
  badge,
  unlocked = true,
}: {
  badge: BadgeDef;
  unlocked?: boolean;
}) {
  const label = unlocked
    ? `${badge.name} badge, ${badge.visits} ${badge.visits === 1 ? "visit" : "visits"}`
    : `${badge.name} badge, locked until ${badge.visits} visits`;

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      data-badge={unlocked ? badge.id : undefined}
      data-duration={unlocked ? badge.duration : undefined}
      className={`relative size-27.5 rounded-tile shadow-tile ${styles.tile}`}
    >
      <div className={styles.frame}>
        <div style={badge.art} className={styles.lift}>
          <div className={styles.swing}>
            <div className={styles.hop}>
              <Image
                src={`/badges/${badge.id}.svg`}
                alt=""
                width={badge.art.width}
                height={badge.art.height}
                className={`block max-w-none ${unlocked ? "" : "opacity-50 grayscale"}`}
              />
              {unlocked && (badge.rig ? <div data-rig-slot className={styles.slot} /> : <Parts badge={badge} />)}
              {unlocked && badge.shine && <Shine id={badge.id} />}
            </div>
          </div>
        </div>
      </div>

      {!unlocked && (
        <span className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full bg-background shadow-[0_1px_3px_rgba(0,0,0,0.2),inset_0_0_0_1px_var(--color-border)]">
          <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden>
            <rect x="3" y="7" width="10" height="7.5" rx="2" fill="#404040" />
            <path
              d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
              fill="none"
              stroke="#404040"
              strokeWidth="1.6"
            />
          </svg>
        </span>
      )}
    </div>
  );
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

export function Badges({ visits = Infinity }: { visits?: number }) {
  return BADGES.map((badge) => (
    <Badge key={badge.id} badge={badge} unlocked={visits >= badge.visits} />
  ));
}

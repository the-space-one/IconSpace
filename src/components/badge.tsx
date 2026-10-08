import Image from "next/image";

type BadgeDef = {
  id: string;
  name: string;
  visits: number;
  art: { width: number; height: number; top: number; left: number };
};

const BADGES: BadgeDef[] = [
  {
    id: "spark",
    name: "First Spark",
    visits: 1,
    art: { width: 74.8361, height: 87.436, top: 12, left: 18 },
  },
  {
    id: "regular",
    name: "Regular",
    visits: 5,
    art: { width: 77.261, height: 86.5629, top: 14, left: 16 },
  },
  {
    id: "loyal",
    name: "Loyal",
    visits: 15,
    art: { width: 82.5206, height: 88.2607, top: 14, left: 14 },
  },
  {
    id: "legend",
    name: "Legend",
    visits: 30,
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
      className="group relative size-27.5 rounded-tile shadow-tile"
    >
      <Image
        src={`/badges/${badge.id}.svg`}
        alt=""
        width={badge.art.width}
        height={badge.art.height}
        style={{ top: badge.art.top, left: badge.art.left }}
        className={`absolute max-w-none ${
          unlocked
            ? "transition-[translate] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-safe:group-hover:-translate-y-1.5"
            : "opacity-50 grayscale"
        }`}
      />

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

export function Badges({ visits = Infinity }: { visits?: number }) {
  return BADGES.map((badge) => (
    <Badge key={badge.id} badge={badge} unlocked={visits >= badge.visits} />
  ));
}

"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Badges, type BadgeDef } from "./badge";
import { BadgeMotion } from "./badge-motion";
import { award, open, readEarned, readOpened, subscribe } from "./badge-visits";

// The reward ceremony, fetched only by visitors with a badge to open.
const loadReward = () => import("./badge-reward");
const BadgeReward = dynamic(() => loadReward().then((module) => module.BadgeReward), { ssr: false });

/* The footer's badges as an Easter egg: each day's visit earns the next one,
 * which waits as a rattling gift tile until the visitor opens it; the rest are
 * mystery tiles. The server renders every tile as a mystery; what this
 * browser has earned arrives after mount. */
export function BadgeShelf({ className }: { className?: string }) {
  const earned = useSyncExternalStore(subscribe, readEarned, () => 0);
  const opened = useSyncExternalStore(subscribe, readOpened, () => 0);
  const [opening, setOpening] = useState<{ badge: BadgeDef; tile: HTMLElement; at: number }>();
  const [landed, setLanded] = useState<string>();

  useEffect(award, []);
  useEffect(() => {
    if (earned > opened) void loadReward();
  }, [earned, opened]);

  return (
    <>
      <BadgeMotion opened={opened} className={className}>
        <Badges
          earned={earned}
          opened={opened}
          landed={landed}
          onOpen={(badge, tile) => {
            if (opening) return;
            // The gift starts shaking on the click itself, while the ceremony mounts.
            tile.toggleAttribute("data-opening", true);
            setOpening({ badge, tile, at: performance.now() });
          }}
        />
      </BadgeMotion>
      {opening && (
        <BadgeReward
          badge={opening.badge}
          tile={opening.tile}
          openedAt={opening.at}
          onLand={() => {
            open();
            setLanded(opening.badge.id);
          }}
          onDone={() => setOpening(undefined)}
        />
      )}
    </>
  );
}

"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MANAGERS, RUNNERS, setManager, useManager } from "@/components/package-manager";

const CLIENTS = ["ChatGPT", "Claude", "Cursor", "Grokbot"] as const;
const MODES = ["CLI", "MCP"] as const;

const MCP_URL = "https://mcp.iconspace.dev/mcp";
// Apps take the URL as a custom connector; coding tools get a command.
const MCP_SNIPPETS: Record<(typeof CLIENTS)[number], string> = {
  ChatGPT: MCP_URL,
  Claude: `claude mcp add --transport http iconspace ${MCP_URL}`,
  Cursor: "npx iconspace mcp init --client cursor",
  Grokbot: MCP_URL,
};

// Card radius 18 = well/track radius 12 + card padding 6;
// thumb radius 8 = track radius 12 + track padding 4.
const item =
  "relative flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[8px] px-2 text-[13px] whitespace-nowrap @[31rem]:flex-none sm:px-2.5 after:absolute after:inset-x-0 after:-inset-y-1.5";
const pillItem =
  "relative flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold tracking-wide whitespace-nowrap uppercase @[31rem]:flex-none after:absolute after:inset-x-0 after:-inset-y-1.5";

// Four labels with their icons outgrow a phone's card (at phone padding the
// managers need 265px, the clients 341px), so below these widths inside the
// card the icons are left out. Both rows share one slot, so the wider sets
// its width.
const ICONS_FROM = {
  managers: "hidden @[17rem]:contents",
  clients: "hidden @[22rem]:contents",
};

const CLIENT_ICONS: Record<(typeof CLIENTS)[number], ReactNode> = {
  ChatGPT: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-4 shrink-0">
      <path d="M9.8 9.35V7.5c0-.16.06-.28.19-.36l3.73-2.14a3.7 3.7 0 0 1 1.74-.43c2.34 0 3.82 1.81 3.82 3.74 0 .14 0 .3-.02.45L15.4 6.5a.86.86 0 0 0-.71 0L9.8 9.35Zm8.7 7.21v-4.42c0-.28-.12-.47-.35-.6l-4.9-2.85 1.6-.92c.13-.08.25-.08.39 0l3.72 2.15a3.68 3.68 0 0 1 1.83 3.24 3.7 3.7 0 0 1-2.28 3.4ZM8.65 12.66l-1.6-.93a.42.42 0 0 1-.2-.35v-4.3c0-2.08 1.6-3.66 3.77-3.66.82 0 1.58.27 2.22.76L9 6.4a.76.76 0 0 0-.35.6v5.66Zm3.44 1.99-2.29-1.29v-2.73l2.29-1.29 2.29 1.29v2.73l-2.29 1.29Zm1.47 5.93a3.6 3.6 0 0 1-2.22-.76l3.84-2.22a.76.76 0 0 0 .35-.6v-5.66l1.62.94c.13.08.19.2.19.35v4.29c0 2.09-1.62 3.66-3.78 3.66ZM8.94 16.23 5.21 14.09a3.68 3.68 0 0 1-1.79-3.24c0-1.5.9-2.85 2.28-3.41v4.45c0 .27.12.46.35.6l4.88 2.82-1.6.92a.4.4 0 0 1-.39 0Zm-.22 3.2a3.7 3.7 0 0 1-3.82-3.7c0-.16.02-.32.04-.48l3.84 2.22c.24.14.47.14.7 0l4.9-2.83v1.86c0 .15-.06.27-.19.35l-3.72 2.15c-.5.29-1.11.43-1.75.43Zm4.84 2.32c2.36 0 4.33-1.68 4.78-3.9a4.58 4.58 0 0 0 3.59-4.7 4.62 4.62 0 0 0-1.64-3.65c.1-.4.15-.81.15-1.22 0-2.79-2.26-4.88-4.87-4.88-.53 0-1.03.08-1.54.25A4.58 4.58 0 0 0 10.62 2.25 4.87 4.87 0 0 0 5.84 6.15 4.6 4.6 0 0 0 2.25 10.85c0 1.36.58 2.69 1.64 3.64-.1.41-.15.82-.15 1.23 0 2.79 2.26 4.88 4.87 4.88.53 0 1.04-.08 1.55-.25a4.58 4.58 0 0 0 3.24 1.4Z" />
    </svg>
  ),
  Claude: (
    <svg viewBox="0 0 100 100" aria-hidden className="size-4 shrink-0">
      <path fill="currentColor" d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
    </svg>
  ),
  Cursor: (
    <svg viewBox="0 0 17 16" fill="currentColor" aria-hidden className="size-4 shrink-0">
      <path opacity=".55" d="M8.165 16 15.302 12 8.165 8 1.027 12z" />
      <path opacity=".8" d="M15.302 12V4L8.164 0v8z" />
      <path opacity=".35" d="M8.165 0 1.027 4v8l7.138-4z" />
      <path d="M15.302 4 8.164 16V8z" />
      <path opacity=".2" d="M15.302 4 8.165 8 1.027 4z" />
    </svg>
  ),
  Grokbot: (
    <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-current">
      <svg viewBox="0 0 24 24" className="size-full">
        <path fill="white" d="M11.625 4.75916C15.6777 4.50184 19.1704 7.58146 19.4225 11.6345C19.6746 15.6875 16.5905 19.1762 12.5372 19.423C8.49119 19.6695 5.01021 16.5923 4.75856 12.5466C4.50691 8.50096 7.57971 5.01603 11.625 4.75916Z" />
        <path fill="black" d="M12.0828 8.25977C12.929 8.26003 12.953 8.87363 13.3058 9.48718C13.6262 10.0445 13.8786 10.6459 13.0794 10.9323C12.3606 11.0373 12.0822 9.85397 11.7776 9.37397C11.4848 8.91258 11.4272 8.41032 12.0828 8.25977Z" />
        <path fill="black" d="M15.0385 7.52298C15.2174 7.48551 15.3807 7.58436 15.7677 7.97224C16.1548 8.36012 16.8465 9.81042 16.4798 10.1111C16.2553 10.1701 15.9677 10.1242 15.8276 9.92287C15.6301 9.63895 15.5109 9.31031 15.3602 8.99988C15.1755 8.61927 14.9692 8.24409 14.7961 7.85878C14.7279 7.75201 14.8596 7.56046 15.0385 7.52298Z" />
      </svg>
    </span>
  ),
};

const MANAGER_ICONS: Record<(typeof MANAGERS)[number], ReactNode> = {
  npm: (
    <svg viewBox="0 0 32 32" aria-hidden className="size-4 shrink-0">
      <path fill="currentColor" d="m7.415 7.656 17.291.024-.011 17.29h-4.329l.012-12.974h-4.319l-.01 12.964H7.393zM3.207 1.004h-.005a2.2 2.2 0 0 0-2.198 2.198v25.596c0 1.214.984 2.198 2.198 2.198h25.596a2.2 2.2 0 0 0 2.198-2.198V3.202a2.2 2.2 0 0 0-2.198-2.198h-.006z" />
    </svg>
  ),
  pnpm: (
    <svg viewBox="0 0 32 32" aria-hidden className="size-4 shrink-0">
      <path fill="currentColor" d="M30 10.75h-8.749V2H30Zm-9.626 0h-8.75V2h8.75Zm-9.625 0H2V2h8.749ZM30 20.375h-8.749v-8.75H30Z" />
      <path fill="currentColor" opacity="0.4" d="M20.374 20.375h-8.75v-8.75h8.75Zm0 9.625h-8.75v-8.75h8.75ZM30 30h-8.749v-8.75H30Zm-19.251 0H2v-8.75h8.749Z" />
    </svg>
  ),
  yarn: (
    <svg viewBox="0 0 32 32" aria-hidden className="size-4 shrink-0">
      <path fill="currentColor" d="M28.208 24.409a10.5 10.5 0 0 0-3.959 1.822 23.7 23.7 0 0 1-5.835 2.642 1.63 1.63 0 0 1-.983.55 62 62 0 0 1-6.447.577c-1.163.009-1.876-.3-2.074-.776a1.573 1.573 0 0 1 .866-2.074 4 4 0 0 1-.514-.379c-.171-.171-.352-.514-.406-.388-.225.55-.343 1.894-.947 2.5-.83.839-2.4.559-3.328.072-1.019-.541.072-1.813.072-1.813a.73.73 0 0 1-.992-.343 4.85 4.85 0 0 1-.667-2.949 5.37 5.37 0 0 1 1.749-2.895 9.3 9.3 0 0 1 .658-4.4 10.45 10.45 0 0 1 3.165-3.661S6.628 10.747 7.35 8.817c.469-1.262.658-1.253.812-1.308a3.6 3.6 0 0 0 1.452-.857 5.27 5.27 0 0 1 4.41-1.7S15.2 1.4 16.277 2.09a18.4 18.4 0 0 1 1.533 2.886s1.281-.748 1.425-.469a11.33 11.33 0 0 1 .523 6.132 14 14 0 0 1-2.6 5.411c-.135.225 1.551.938 2.615 3.887.983 2.7.108 4.96.262 5.212.027.045.036.063.036.063s1.127.09 3.391-1.308a8.5 8.5 0 0 1 4.277-1.604 1.081 1.081 0 0 1 .469 2.11Z" />
    </svg>
  ),
  bun: (
    <svg viewBox="0 0 32 32" aria-hidden className="size-4 shrink-0">
      <path fill="none" d="M29 17c0 5.65-5.82 10.23-13 10.23S3 22.61 3 17c0-3.5 2.24-6.6 5.66-8.44S14.21 4.81 16 4.81s3.32 1.54 7.34 3.71C26.76 10.36 29 13.46 29 17" />
      <path fill="none" stroke="currentColor" d="M16 27.65c7.32 0 13.46-4.65 13.46-10.65 0-3.72-2.37-7-5.89-8.85-1.39-.75-2.46-1.41-3.37-2l-1.13-.69A6.14 6.14 0 0 0 16 4.35a6.9 6.9 0 0 0-3.3 1.23c-.42.24-.86.51-1.32.8-.87.54-1.83 1.13-3 1.73C4.91 10 2.54 13.24 2.54 17c0 6 6.14 10.65 13.46 10.65Z" />
      <ellipse cx="21.65" cy="18.62" fill="currentColor" opacity=".3" rx="2.17" ry="1.28" />
      <ellipse cx="10.41" cy="18.62" fill="currentColor" opacity=".3" rx="2.17" ry="1.28" />
      <path fill="currentColor" fillRule="evenodd" d="M11.43 18.11a2 2 0 1 0-2-2.05 2.05 2.05 0 0 0 2 2.05m9.2 0a2 2 0 1 0-2-2.05 2 2 0 0 0 2 2.05" />
      <path fill="#fff" fillRule="evenodd" d="M10.79 16.19a.77.77 0 1 0-.76-.77.76.76 0 0 0 .76.77m9.2 0a.77.77 0 1 0 0-1.53.77.77 0 0 0 0 1.53" />
      <path fill="currentColor" stroke="currentColor" strokeWidth=".75" d="M18.62 19.67a3.3 3.3 0 0 1-1.09 1.75 2.48 2.48 0 0 1-1.5.69 2.53 2.53 0 0 1-1.5-.69 3.28 3.28 0 0 1-1.08-1.75.26.26 0 0 1 .29-.3h4.58a.27.27 0 0 1 .3.3Z" />
      <path fill="currentColor" fillRule="evenodd" d="M14.93 5.75a6.1 6.1 0 0 1-2.09 4.62c-.1.09 0 .27.11.22 1.25-.49 2.94-1.94 2.23-4.88-.03-.15-.25-.11-.25.04m.85 0a6 6 0 0 1 .57 5c0 .13.12.24.21.13.83-1 1.54-3.11-.59-5.31-.1-.11-.27.04-.19.17Zm1-.06a6.1 6.1 0 0 1 2.53 4.38c0 .14.21.17.24 0 .34-1.3.15-3.51-2.66-4.66-.12-.02-.21.18-.09.27ZM9.94 9.55a6.27 6.27 0 0 0 3.89-3.33c.07-.13.28-.08.25.07-.64 3-2.79 3.59-4.13 3.51-.14-.01-.14-.21-.01-.25" />
    </svg>
  ),
};

const MODE_ICONS: Record<(typeof MODES)[number], ReactNode> = {
  MCP: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-4 shrink-0">
      <path d="M11.053 2.793a3.564 3.564 0 0 1 5.04 0l.126.133A3.56 3.56 0 0 1 17.1 5.82a3.56 3.56 0 0 1 2.897.88l.132.127.042.042.126.132a3.564 3.564 0 0 1-.126 4.908L12.88 19.2a.24.24 0 0 0 0 .336l1.497 1.497a.713.713 0 1 1-1.008 1.008l-1.497-1.498a1.663 1.663 0 0 1 0-2.351l7.292-7.293a2.14 2.14 0 0 0 .147-2.862l-.147-.163-.042-.041a2.14 2.14 0 0 0-3.024 0l-6.006 6.005c-.006.007-.014.01-.021.017l-.066.067a.713.713 0 0 1-1.008-1.008l6.09-6.09a2.139 2.139 0 0 0-3.025-3.024l-8.063 8.064a.713.713 0 0 1-1.008-1.008z" />
      <path d="M13.078 4.81a.713.713 0 0 1 1.008 1.007L8.121 11.78a2.138 2.138 0 0 0 3.024 3.023l5.964-5.963a.713.713 0 0 1 1.008 1.008l-5.964 5.964a3.564 3.564 0 0 1-5.04-5.04z" />
    </svg>
  ),
  CLI: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-4 shrink-0">
      <path d="m9.75 20.25 4.5-16.5m4 4 3.355 3.565a1 1 0 0 1 0 1.37L18.25 16.25m-12.5 0-3.355-3.565a1 1 0 0 1 0-1.37L5.75 7.75" />
    </svg>
  ),
};

/**
 * Segmented control with the clip-path highlight: a copy of the labels styled
 * as selected sits on top and is clipped to the selected item, so moving the
 * highlight is one transition and the colours never need timing. Until the
 * first measurement the selected button styles itself, so the server render
 * is already correct.
 */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  icons,
  iconsFrom = "contents",
  pill = false,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  icons?: Record<T, ReactNode>;
  /** Shows the icons only from a card width (see ICONS_FROM). */
  iconsFrom?: string;
  pill?: boolean;
}) {
  const cell = pill ? pillItem : item;
  const icon = (option: T) => icons && <span className={iconsFrom}>{icons[option]}</span>;
  const radius = pill ? "999px" : "8px";
  const track = useRef<HTMLDivElement>(null);
  const highlight = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = track.current;
    const overlay = highlight.current;
    if (!el || !overlay) return;
    const measure = () => {
      const active = el.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!active) return;
      const left = active.offsetLeft;
      const right = el.offsetWidth - left - active.offsetWidth;
      overlay.style.clipPath = `inset(4px ${right}px 4px ${left}px round ${radius})`;
      if (!el.dataset.ready) {
        el.dataset.ready = "";
        // Let the first position paint before the slide transition is on.
        requestAnimationFrame(() => overlay.classList.add("transition-[clip-path]"));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, radius]);

  return (
    <div ref={track} role="group" aria-label={label} className={`group/seg relative flex w-full p-1 @[31rem]:w-auto ${pill ? "rounded-full bg-[#efefef] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]" : "rounded-[12px] bg-[#efefef]"}`}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={`${cell} cursor-pointer text-muted-foreground transition-[color] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-black/50 aria-pressed:bg-white aria-pressed:text-foreground group-data-ready/seg:aria-pressed:bg-transparent`}
        >
          {icon(option)}
          {option}
        </button>
      ))}
      <div
        ref={highlight}
        aria-hidden
        className="pointer-events-none absolute inset-0 flex bg-white p-1 opacity-0 duration-[220ms] ease-[cubic-bezier(0.645,0.045,0.355,1)] group-data-ready/seg:opacity-100 motion-reduce:transition-none"
      >
        {options.map((option) => (
          <span key={option} className={`${cell} text-foreground`}>
            {icon(option)}
            {option}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Controls that take turns in one slot. All stay mounted in the same grid
 * cell, so the incoming one is already laid out with its highlight in place:
 * switching crossfades the labels while one shared well, clipped to the
 * visible control's width, stretches or shrinks behind them. The slot is
 * clipped to the same edge, so labels never show outside the well mid-resize.
 * Until the first measurement each control draws its own well, so the server
 * render is already correct.
 */
function Swap<T extends string>({ value, panes }: { value: T; panes: Record<T, ReactNode> }) {
  const slot = useRef<HTMLDivElement>(null);
  const well = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = slot.current;
    const bg = well.current;
    if (!el || !bg) return;
    const measure = () => {
      const pane = el.querySelector<HTMLElement>("[data-pane]:not([inert])");
      if (!pane) return;
      const right = el.offsetWidth - pane.offsetWidth;
      bg.style.clipPath = `inset(0 ${right}px 0 0 round 12px)`;
      // Loose on the other sides so focus rings and hit areas aren't cut.
      el.style.clipPath = `inset(-8px ${right}px -8px -8px)`;
      if (!el.dataset.ready) {
        el.dataset.ready = "";
        requestAnimationFrame(() => {
          bg.classList.add("transition-[clip-path]");
          el.classList.add("transition-[clip-path]");
        });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.querySelectorAll("[data-pane]").forEach((pane) => observer.observe(pane));
    return () => observer.disconnect();
  }, [value]);

  // The well moves like the highlight; labels leave fast and arrive like the
  // snippet below, a beat late so the two sets never sit on top of each other.
  return (
    <div
      ref={slot}
      className="group/swap relative grid w-full duration-[220ms] ease-[cubic-bezier(0.645,0.045,0.355,1)] @[31rem]:w-auto motion-reduce:transition-none"
    >
      <div
        ref={well}
        aria-hidden
        className="absolute inset-0 rounded-[12px] bg-[#efefef] opacity-0 duration-[220ms] ease-[cubic-bezier(0.645,0.045,0.355,1)] group-data-ready/swap:opacity-100 motion-reduce:transition-none"
      />
      {(Object.keys(panes) as T[]).map((key) => (
        <div
          key={key}
          data-pane
          inert={key !== value}
          className="relative col-start-1 row-start-1 w-full justify-self-start transition-[opacity,translate,filter] delay-[60ms] duration-[180ms] ease-out group-data-ready/swap:*:bg-transparent @[31rem]:w-auto inert:translate-y-0.5 inert:opacity-0 inert:blur-[2px] inert:delay-0 inert:duration-[120ms] motion-reduce:transition-none"
        >
          {panes[key]}
        </div>
      ))}
    </div>
  );
}

export function InstallCard() {
  const [client, setClient] = useState<(typeof CLIENTS)[number]>("ChatGPT");
  const [mode, setMode] = useState<(typeof MODES)[number]>("CLI");
  const manager = useManager();
  const [copied, setCopied] = useState(false);
  // The snippet only animates when the reader switches it, not on page load.
  const [switched, setSwitched] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);

  const snippet = mode === "MCP" ? MCP_SNIPPETS[client] : `${RUNNERS[manager]} iconspace add cart`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(reset.current);
    reset.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="@container flex w-full flex-col gap-1.5 rounded-[18px] bg-white p-1.5 font-froundy leading-5 shadow-[0_0_0_1px_rgba(59,59,59,0.06)]">
      <div className="flex flex-wrap gap-1.5">
        <Swap
          value={mode}
          panes={{
            CLI: (
              <Segmented
                label="Package manager"
                options={MANAGERS}
                icons={MANAGER_ICONS}
                iconsFrom={ICONS_FROM.managers}
                value={manager}
                onChange={(next) => {
                  setManager(next);
                  setSwitched(true);
                }}
              />
            ),
            MCP: (
              <Segmented label="Client" options={CLIENTS} icons={CLIENT_ICONS} iconsFrom={ICONS_FROM.clients}
                value={client}
                onChange={(next) => {
                  setClient(next);
                  setSwitched(true);
                }}
              />
            ),
          }}
        />
        <div className="order-first w-full @[31rem]:order-none @[31rem]:ml-auto @[31rem]:w-auto">
          <Segmented
            label="Install method"
            options={MODES}
            icons={MODE_ICONS}
            pill
            value={mode}
            onChange={(next) => {
              setMode(next);
              setSwitched(true);
            }}
          />
        </div>
      </div>

      <div className="flex h-10 items-center gap-2 rounded-[12px] bg-surface pr-1 pl-3">
        <code
          key={mode === "MCP" ? client : manager}
          className={`min-w-0 flex-1 truncate font-mono @max-[31rem]:overflow-x-auto @max-[31rem]:pr-6 @max-[31rem]:text-clip @max-[31rem]:[scrollbar-width:none] @max-[31rem]:[mask-image:linear-gradient(to_right,#000_calc(100%-1.5rem),transparent)] text-[12px] @[21rem]:text-[13px] tracking-[-0.2px] text-foreground select-all ${switched ? "animate-snippet-in motion-reduce:animate-none" : ""}`}
        >
          {snippet !== MCP_URL && (
            <span aria-hidden className="mr-2 text-muted-foreground select-none">
              $
            </span>
          )}
          {snippet}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy to clipboard"}
          data-copied={copied || undefined}
          className="group/copy relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-[8px] text-foreground transition-[background-color,scale] duration-150 ease-out after:absolute after:-inset-1 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-none"
        >
          <svg
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="col-start-1 row-start-1 size-3.5 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-data-copied/copy:scale-25 group-data-copied/copy:opacity-0 group-data-copied/copy:blur-[4px] motion-reduce:transition-none"
          >
            <path d="M5.25 8.75c0-1.65 0-2.47.51-2.99.52-.51 1.34-.51 2.99-.51h.58c1.65 0 2.48 0 3 .51.5.52.5 1.34.5 2.99v.58c0 1.65 0 2.48-.5 3-.52.5-1.35.5-3 .5h-.58c-1.65 0-2.47 0-2.99-.5-.51-.52-.51-1.35-.51-3z" />
            <path d="M9.92 5.25c0-1.72-.03-2.62-.53-3.23q-.14-.18-.33-.32c-.64-.53-1.6-.53-3.52-.53s-2.87 0-3.52.53q-.18.15-.32.32c-.53.65-.53 1.6-.53 3.52s0 2.88.53 3.52q.15.18.32.33c.61.5 1.5.53 3.23.53" />
          </svg>
          <svg
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="col-start-1 row-start-1 size-3.5 scale-25 text-foreground opacity-0 blur-[4px] transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-data-copied/copy:scale-100 group-data-copied/copy:opacity-100 group-data-copied/copy:blur-none motion-reduce:transition-none"
          >
            <path d="M2.75 7.5 5.5 10.25 11.25 4" />
          </svg>
        </button>
      </div>

      <span role="status" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </div>
  );
}

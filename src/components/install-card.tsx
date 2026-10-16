"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

const CLIENTS = ["ChatGPT", "Claude", "Cursor", "Grokbot"] as const;
const MODES = ["MCP", "CLI"] as const;

const MCP_URL = "https://mcp.iconspace.dev/mcp";
const CLI_COMMAND = "npx iconspace";

// Card radius 18 = well/track radius 12 + card padding 6;
// thumb radius 8 = track radius 12 + track padding 4.
const item =
  "relative flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[8px] px-2 text-[13px] whitespace-nowrap @[21rem]:flex-none sm:px-2.5 after:absolute after:inset-x-0 after:-inset-y-1.5";
const pillItem =
  "relative flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold tracking-wide whitespace-nowrap uppercase @[21rem]:flex-none after:absolute after:inset-x-0 after:-inset-y-1.5";

const CLIENT_ICONS: Record<(typeof CLIENTS)[number], ReactNode> = {
  ChatGPT: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-4 shrink-0">
      <path d="M9.8 9.35V7.5c0-.16.06-.28.19-.36l3.73-2.14a3.7 3.7 0 0 1 1.74-.43c2.34 0 3.82 1.81 3.82 3.74 0 .14 0 .3-.02.45L15.4 6.5a.86.86 0 0 0-.71 0L9.8 9.35Zm8.7 7.21v-4.42c0-.28-.12-.47-.35-.6l-4.9-2.85 1.6-.92c.13-.08.25-.08.39 0l3.72 2.15a3.68 3.68 0 0 1 1.83 3.24 3.7 3.7 0 0 1-2.28 3.4ZM8.65 12.66l-1.6-.93a.42.42 0 0 1-.2-.35v-4.3c0-2.08 1.6-3.66 3.77-3.66.82 0 1.58.27 2.22.76L9 6.4a.76.76 0 0 0-.35.6v5.66Zm3.44 1.99-2.29-1.29v-2.73l2.29-1.29 2.29 1.29v2.73l-2.29 1.29Zm1.47 5.93a3.6 3.6 0 0 1-2.22-.76l3.84-2.22a.76.76 0 0 0 .35-.6v-5.66l1.62.94c.13.08.19.2.19.35v4.29c0 2.09-1.62 3.66-3.78 3.66ZM8.94 16.23 5.21 14.09a3.68 3.68 0 0 1-1.79-3.24c0-1.5.9-2.85 2.28-3.41v4.45c0 .27.12.46.35.6l4.88 2.82-1.6.92a.4.4 0 0 1-.39 0Zm-.22 3.2a3.7 3.7 0 0 1-3.82-3.7c0-.16.02-.32.04-.48l3.84 2.22c.24.14.47.14.7 0l4.9-2.83v1.86c0 .15-.06.27-.19.35l-3.72 2.15c-.5.29-1.11.43-1.75.43Zm4.84 2.32c2.36 0 4.33-1.68 4.78-3.9a4.58 4.58 0 0 0 3.59-4.7 4.62 4.62 0 0 0-1.64-3.65c.1-.4.15-.81.15-1.22 0-2.79-2.26-4.88-4.87-4.88-.53 0-1.03.08-1.54.25A4.58 4.58 0 0 0 10.62 2.25 4.87 4.87 0 0 0 5.84 6.15 4.6 4.6 0 0 0 2.25 10.85c0 1.36.58 2.69 1.64 3.64-.1.41-.15.82-.15 1.23 0 2.79 2.26 4.88 4.87 4.88.53 0 1.04-.08 1.55-.25a4.58 4.58 0 0 0 3.24 1.4Z" />
    </svg>
  ),
  Claude: (
    <svg viewBox="0 0 100 100" aria-hidden className="size-4 shrink-0">
      <path fill="#D97757" d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
    </svg>
  ),
  Cursor: <Image src="/mcp/cursor.svg" alt="" width={16} height={16} className="size-4 shrink-0 object-contain" />,
  Grokbot: (
    <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-foreground">
      <svg viewBox="0 0 24 24" className="size-full">
        <path fill="white" d="M11.625 4.75916C15.6777 4.50184 19.1704 7.58146 19.4225 11.6345C19.6746 15.6875 16.5905 19.1762 12.5372 19.423C8.49119 19.6695 5.01021 16.5923 4.75856 12.5466C4.50691 8.50096 7.57971 5.01603 11.625 4.75916Z" />
        <path fill="black" d="M12.0828 8.25977C12.929 8.26003 12.953 8.87363 13.3058 9.48718C13.6262 10.0445 13.8786 10.6459 13.0794 10.9323C12.3606 11.0373 12.0822 9.85397 11.7776 9.37397C11.4848 8.91258 11.4272 8.41032 12.0828 8.25977Z" />
        <path fill="black" d="M15.0385 7.52298C15.2174 7.48551 15.3807 7.58436 15.7677 7.97224C16.1548 8.36012 16.8465 9.81042 16.4798 10.1111C16.2553 10.1701 15.9677 10.1242 15.8276 9.92287C15.6301 9.63895 15.5109 9.31031 15.3602 8.99988C15.1755 8.61927 14.9692 8.24409 14.7961 7.85878C14.7279 7.75201 14.8596 7.56046 15.0385 7.52298Z" />
      </svg>
    </span>
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
  pill = false,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  icons?: Record<T, ReactNode>;
  pill?: boolean;
}) {
  const cell = pill ? pillItem : item;
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
    <div ref={track} role="group" aria-label={label} className={`group/seg relative flex w-full p-1 @[21rem]:w-auto ${pill ? "rounded-full bg-surface shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]" : "rounded-[12px] bg-brand-surface"}`}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={`${cell} cursor-pointer text-muted-foreground transition-[color] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground aria-pressed:bg-white aria-pressed:text-foreground group-data-ready/seg:aria-pressed:bg-transparent`}
        >
          {icons?.[option]}
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
            {icons?.[option]}
            {option}
          </span>
        ))}
      </div>
    </div>
  );
}

export function InstallCard() {
  const [client, setClient] = useState<(typeof CLIENTS)[number]>("ChatGPT");
  const [mode, setMode] = useState<(typeof MODES)[number]>("MCP");
  const [copied, setCopied] = useState(false);
  // The snippet only animates when the reader switches it, not on page load.
  const [switched, setSwitched] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);

  const snippet = mode === "MCP" ? MCP_URL : CLI_COMMAND;

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
    <div className="@container flex w-full flex-col gap-1.5 rounded-[18px] bg-white p-1.5 font-froundy leading-5 shadow-[0_0_0_1px_rgba(59,59,59,0.06),0_1px_2px_rgba(16,16,40,0.06),0_14px_32px_-14px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap gap-1.5">
        <Segmented label="Client" options={CLIENTS} icons={CLIENT_ICONS} value={client} onChange={setClient} />
        <div className="w-full @[21rem]:ml-auto @[21rem]:w-auto">
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
          key={snippet}
          className={`min-w-0 flex-1 truncate font-mono text-[12px] @[21rem]:text-[13px] tracking-[-0.2px] text-foreground select-all ${switched ? "animate-snippet-in motion-reduce:animate-none" : ""}`}
        >
          {mode === "CLI" && (
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

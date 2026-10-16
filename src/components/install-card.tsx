"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

const CLIENTS = ["Chat gpt", "Claude", "Cursor", "Grokbot"] as const;
const MODES = ["MCP", "CLI"] as const;

const MCP_URL = "https://mcp.iconspace.dev/mcp";
const CLI_COMMAND = "npx iconspace";

// Card radius 18 = well/track radius 12 + card padding 6;
// thumb radius 8 = track radius 12 + track padding 4.
const item =
  "relative flex h-7 flex-1 items-center justify-center rounded-[8px] px-2 text-[13px] whitespace-nowrap @[21rem]:flex-none sm:px-2.5 after:absolute after:inset-x-0 after:-inset-y-1.5";
const pillItem =
  "relative flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold tracking-wide whitespace-nowrap uppercase @[21rem]:flex-none after:absolute after:inset-x-0 after:-inset-y-1.5";

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
  const [client, setClient] = useState<(typeof CLIENTS)[number]>("Chat gpt");
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
        <Segmented label="Client" options={CLIENTS} value={client} onChange={setClient} />
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

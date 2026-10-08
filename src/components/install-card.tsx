"use client";

import Image from "next/image";
import { useState } from "react";

const CLIENTS = ["Chat gpt", "Claude", "Cursor", "Grokbot"] as const;
const MODES = ["CLI", "MCP"] as const;

const MCP_URL = "https://mcp.iconspace.dev/mcp";
const CLI_COMMAND = "npx iconspace";

export function InstallCard() {
  const [client, setClient] = useState<(typeof CLIENTS)[number]>("Chat gpt");
  const [mode, setMode] = useState<(typeof MODES)[number]>("MCP");
  const [copied, setCopied] = useState(false);

  const snippet = mode === "MCP" ? MCP_URL : CLI_COMMAND;

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex w-full flex-col gap-0.5 rounded-[14px] border border-[rgba(59,59,59,0.04)] bg-brand-surface p-0.5 font-froundy leading-5">
      <div className="flex flex-wrap items-start justify-between">
        <div role="group" aria-label="Client" className="flex items-center gap-3">
          {CLIENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={c === client}
              onClick={() => setClient(c)}
              className={
                c === client
                  ? "relative flex h-6.5 items-center after:absolute after:inset-x-0 after:-inset-y-2 rounded-full bg-brand px-3 text-xs whitespace-nowrap text-brand-foreground"
                  : "relative flex h-6.5 items-center after:absolute after:inset-x-0 after:-inset-y-2 px-1 text-[10px] whitespace-nowrap text-foreground hover:text-brand-strong"
              }
            >
              {c}
            </button>
          ))}
        </div>

        <div role="group" aria-label="Install method" className="ml-auto flex items-center">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === mode}
              onClick={() => setMode(m)}
              className={
                m === mode
                  ? "relative flex h-6.5 items-center after:absolute after:inset-x-0 after:-inset-y-2 rounded-full bg-brand px-3 text-xs text-brand-foreground shadow-[inset_0_0_0_2px_var(--color-brand-strong)]"
                  : "relative flex h-6.5 items-center after:absolute after:inset-x-0 after:-inset-y-2 px-3 text-xs text-foreground hover:text-brand-strong"
              }
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between p-2">
        {mode === "MCP" ? (
          <a
            href={MCP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="relative -my-1 py-1 text-xs tracking-[-0.39px] whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-2 text-foreground underline decoration-from-font [text-underline-position:from-font]"
          >
            {MCP_URL}
          </a>
        ) : (
          <code className="font-froundy text-xs tracking-[-0.39px] text-foreground">
            {CLI_COMMAND}
          </code>
        )}
        <button
          type="button"
          onClick={copy}
          aria-label="Copy to clipboard"
          className="relative -m-[5px] p-[5px] transition-transform after:absolute after:-inset-[7px] active:scale-90"
        >
          <Image
            src="/hero/copy.svg"
            alt=""
            width={14}
            height={14}
            loading="eager"
          />
        </button>
      </div>

      <span role="status" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </div>
  );
}

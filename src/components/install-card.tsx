"use client";

import Image from "next/image";
import { useState } from "react";

const CLIENTS = ["Chat gpt", "Claude", "Cursor", "Grokbot"] as const;
const MODES = ["CLI", "MCP"] as const;

const MCP_URL = "https://mcp.iconspace.dev/mcp";
// TODO: the design only shows the MCP state; replace with the real CLI command.
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
    <div className="flex w-[460px] flex-col gap-0.5 rounded-[14px] border border-[rgba(59,59,59,0.04)] bg-[#ebebff] p-0.5 font-froundy leading-5">
      <div className="flex items-start justify-between">
        <div role="tablist" aria-label="Client" className="flex items-center gap-3">
          {CLIENTS.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === client}
              onClick={() => setClient(c)}
              className={
                c === client
                  ? "flex h-[26px] items-center rounded-2xl bg-[#a8aafe] px-3 text-xs whitespace-nowrap text-white"
                  : "flex h-[26px] items-center px-1 text-[10px] whitespace-nowrap text-black hover:text-[#8d8fff]"
              }
            >
              {c}
            </button>
          ))}
        </div>

        <div role="tablist" aria-label="Install method" className="flex items-center">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={m === mode}
              onClick={() => setMode(m)}
              className={
                m === mode
                  ? "flex h-[26px] items-center rounded-[80px] bg-[#a8aafe] px-3 text-xs text-white shadow-[inset_0_0_0_2px_#8d8fff]"
                  : "flex h-[26px] items-center px-3 text-xs text-black hover:text-[#8d8fff]"
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
            className="text-xs tracking-[-0.39px] whitespace-nowrap text-black underline decoration-from-font [text-underline-position:from-font]"
          >
            {MCP_URL}
          </a>
        ) : (
          <code className="font-froundy text-xs tracking-[-0.39px] text-black">
            {CLI_COMMAND}
          </code>
        )}
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy to clipboard"}
          className="transition-transform active:scale-90"
        >
          <Image src="/hero/copy.svg" alt="" width={14} height={14} />
        </button>
      </div>
    </div>
  );
}

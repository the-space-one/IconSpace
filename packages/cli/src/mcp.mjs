// Connecting AI tools to the IconSpace MCP server. Editors that read a
// project-level config get one written for them (`iconspace mcp init`);
// chat apps take the URL in their settings.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CliError } from "./registry.mjs";

export const MCP_URL = process.env.ICONSPACE_MCP_URL || "https://mcp.iconspace.dev/mcp";

const SERVER = "iconspace";

/** Project-level MCP config, per editor. */
export const CLIENTS = {
  claude: { label: "Claude Code", file: ".mcp.json", key: "mcpServers", entry: (url) => ({ type: "http", url }) },
  cursor: { label: "Cursor", file: ".cursor/mcp.json", key: "mcpServers", entry: (url) => ({ url }) },
  vscode: { label: "VS Code", file: ".vscode/mcp.json", key: "servers", entry: (url) => ({ type: "http", url }) },
};

/**
 * Adds the IconSpace server to a client's config in `root`, keeping every
 * other server already there. Returns "created", "updated" or "unchanged".
 */
export function writeClientConfig(root, client, url = MCP_URL) {
  const { file, key, entry } = CLIENTS[client];
  const path = join(root, file);
  let config = {};
  if (existsSync(path)) {
    try {
      config = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw new CliError(`${file} isn't valid JSON, so it was left alone. Fix it and run this again.`);
    }
  }
  const before = JSON.stringify(config[key]?.[SERVER]);
  config[key] = { ...config[key], [SERVER]: entry(url) };
  if (before === JSON.stringify(config[key][SERVER])) return "unchanged";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
  return before === undefined ? "created" : "updated";
}

/** How to connect each kind of client by hand. */
export const instructions = (url = MCP_URL) => [
  `ChatGPT, Claude, Grok and other apps: add a custom connector (remote MCP server) with the URL ${url}`,
  `Claude Code: claude mcp add --transport http ${SERVER} ${url}`,
  `Cursor, VS Code, Claude Code (this project): npx iconspace mcp init`,
  `Codex: codex mcp add ${SERVER} --url ${url}`,
  `Windsurf: add "${SERVER}": { "serverUrl": "${url}" } under mcpServers in ~/.codeium/windsurf/mcp_config.json`,
];

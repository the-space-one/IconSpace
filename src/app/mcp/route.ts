import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  findIcon,
  HOMEPAGE,
  ICONS,
  installCommand,
  PACKAGE_MANAGERS,
  searchIcons,
  summary,
  usage,
  type CatalogIcon,
} from "./catalog";

/*
 * The IconSpace MCP server, over Streamable HTTP at /mcp (the URL the install
 * card shows: https://mcp.iconspace.dev/mcp). Stateless: every request gets a
 * fresh server and a plain JSON reply, so it runs on any serverless function
 * and needs no session store.
 */

const INSTRUCTIONS = `IconSpace is a set of ${ICONS.length} animated React icons (Motion, TypeScript, stroke = currentColor).
Find icons with search_icons, then call get_icon for the source files and a usage example, or give the user the command from get_install_command, which copies the same files into their project.
Each icon is a forwardRef SVG component: size it with width/height, colour it with CSS color, and play its animation by calling ref.current.playAnimation() (usually on hover). Icons marked "self (on hover)" animate on their own and take no ref.
An icon's files must sit together in one folder (they import ./scrub and ./types), and the project needs the "motion" package.`;

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

function unknown(ids: string[]) {
  const suggestions = ids.flatMap((id) => searchIcons(id, 3).map((icon) => icon.id));
  return {
    ...text(
      `No icon called ${ids.map((id) => `"${id}"`).join(", ")}.` +
        (suggestions.length ? ` Closest: ${[...new Set(suggestions)].join(", ")}.` : "") +
        " Use search_icons to browse.",
    ),
    isError: true,
  };
}

function iconSource(icons: CatalogIcon[], dir: string) {
  const files = new Map<string, string>();
  for (const icon of icons) for (const file of icon.files) files.set(file.path, file.content);
  const deps = [...new Set(icons.flatMap((icon) => icon.dependencies))];
  return [
    `# ${icons.map((icon) => `${icon.name} (${icon.component})`).join(", ")}`,
    "",
    `Install with the CLI: \`${installCommand(icons.map((icon) => icon.id))}\``,
    "",
    `Or by hand: save every file below in one folder (${dir.replace(/^@\//, "src/")}), then install: ${deps.join(", ") || "nothing else"}.`,
    "",
    ...[...files].flatMap(([path, content]) => [`## ${path}`, "", "```tsx", content.trimEnd(), "```", ""]),
    "## Usage",
    "",
    ...icons.flatMap((icon) => ["```tsx", usage(icon, dir), "```", ""]),
  ].join("\n");
}

function createServer() {
  const server = new McpServer(
    { name: "iconspace", title: "IconSpace", version: "1.0.0", websiteUrl: HOMEPAGE },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "search_icons",
    {
      title: "Search IconSpace icons",
      description:
        "Search the IconSpace animated icons by name or meaning (e.g. \"cart\", \"settings\", \"send message\"). " +
        "Returns each match's id, name, React component name and how its animation is triggered. Leave query empty to list them all.",
      inputSchema: {
        query: z.string().max(100).default("").describe("What the icon should show or mean"),
        limit: z.number().int().min(1).max(100).default(20).describe("Most results to return"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit }) => {
      const matches = searchIcons(query, limit);
      if (matches.length === 0) return text(`Nothing matches "${query}". ${ICONS.length} icons: ${ICONS.map((icon) => icon.id).join(", ")}.`);
      return text(JSON.stringify(matches.map(summary), null, 2));
    },
  );

  server.registerTool(
    "get_icon",
    {
      title: "Get icon source",
      description:
        "Get the full TypeScript source of one or more icons (by id from search_icons), the helper files they import, " +
        "the npm dependencies, the CLI command that installs them, and a usage example.",
      inputSchema: {
        ids: z.array(z.string().max(60)).min(1).max(10).describe('Icon ids, e.g. ["cart", "bell"]'),
        dir: z
          .string()
          .max(120)
          .default("@/components/icons")
          .describe("Import path of the folder the files will live in, used in the usage example"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ ids, dir }) => {
      const icons = ids.map(findIcon);
      const missing = ids.filter((_, index) => !icons[index]);
      if (missing.length) return unknown(missing);
      return text(iconSource(icons as CatalogIcon[], dir));
    },
  );

  server.registerTool(
    "get_install_command",
    {
      title: "Get install command",
      description:
        "Get the shell command that copies icons into a React project with the IconSpace CLI (it also installs motion). " +
        "Run it from the project root.",
      inputSchema: {
        ids: z.array(z.string().max(60)).min(1).max(50).describe("Icon ids from search_icons"),
        packageManager: z.enum(PACKAGE_MANAGERS).default("npm").describe("The project's package manager"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ ids, packageManager }) => {
      const icons = ids.map(findIcon);
      const missing = ids.filter((_, index) => !icons[index]);
      if (missing.length) return unknown(missing);
      return text(installCommand(icons.map((icon) => icon!.id), packageManager));
    },
  );

  return server;
}

// Open to browser-based clients (the MCP Inspector, web agents).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

async function handle(request: Request) {
  // Someone opening the URL in a browser gets a pointer instead of a protocol error.
  if (request.method === "GET" && request.headers.get("accept")?.includes("text/html")) {
    return new Response(
      `This is the IconSpace MCP server. Add ${new URL(request.url).origin}/mcp to your AI tool as a remote MCP server, or run: npx iconspace mcp\n\n${HOMEPAGE}\n`,
      { headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS } },
    );
  }
  // Stateless, so there's nothing to push on a standalone SSE stream; without
  // this the stream stays open, holding a function until it times out.
  if (request.method === "GET") {
    return new Response(null, { status: 405, headers: { Allow: "POST, DELETE, OPTIONS", ...CORS } });
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await createServer().connect(transport);
  const response = await transport.handleRequest(request);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export { handle as GET, handle as POST, handle as DELETE };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

# iconspace

Animated React icons from [IconSpace](https://iconspace.dev), added to your project as source files you own.

```sh
npx iconspace
```

Pick icons from a searchable list (Tab selects, Enter confirms), choose a folder, and the CLI copies them in and installs [Motion](https://motion.dev), which the icons animate with. It works with npm, pnpm, yarn and bun: it runs whichever one your lockfile belongs to.

## Commands

```sh
npx iconspace add cart bell      # add icons by name
npx iconspace add --all          # add every icon
npx iconspace list               # see every icon (--json for scripts)
npx iconspace mcp                # connect AI tools to the IconSpace MCP server
npx iconspace mcp init           # write MCP config for Claude Code, Cursor or VS Code
```

| Option | |
| --- | --- |
| `-d, --dir <path>` | Folder for the icon files. Default: `src/components/icons`, or `components/icons` without a `src/` folder. |
| `-o, --overwrite` | Replace icon files you've changed. Without it, your versions are kept. |
| `-y, --yes` | Ask nothing and use the defaults (CI does this automatically). |
| `--no-install` | Don't install Motion; the CLI prints the command instead. |
| `--client <name>` | For `mcp init`: `claude`, `cursor` or `vscode`. Repeat it for several. |
| `--cwd <path>` | Run as if from another folder. |
| `--registry <url>` | Fetch icons from another registry (or set `ICONSPACE_REGISTRY`). |

## Using an icon

Each icon is a TypeScript React component that renders an SVG. Size it with `width` and `height`, colour it with CSS `color` (it strokes with `currentColor`), and play its animation through a ref:

```tsx
import { useRef } from "react";
import { CartIcon } from "@/components/icons/CartIcon";
import type { IconHandle } from "@/components/icons/types";

export function CartButton() {
  const icon = useRef<IconHandle>(null);
  return (
    <button onMouseEnter={() => icon.current?.playAnimation()}>
      <CartIcon ref={icon} width={24} height={24} />
    </button>
  );
}
```

`playAnimation()` returns a promise that settles when the animation ends. A few icons, such as Clock, animate on their own when hovered and take no ref.

Icons share two small helpers, `scrub.ts` and `types.ts`, so keep the files together in one folder. Each file starts with `"use client"`, so they work in Next.js Server Component trees as they are.

## MCP

The IconSpace MCP server lets AI assistants search the icons and fetch their source:

```
https://mcp.iconspace.dev/mcp
```

- **ChatGPT, Claude, Grok and other apps:** add a custom connector (remote MCP server) with that URL.
- **Claude Code:** `claude mcp add --transport http iconspace https://mcp.iconspace.dev/mcp`
- **Cursor, VS Code, or Claude Code for one project:** `npx iconspace mcp init`

Its tools are `search_icons`, `get_icon` (the source files, dependencies and a usage example) and `get_install_command`.

## Requirements

Node 20.12 or newer, and a React 18+ project. The icons are `.tsx`: Vite and Next.js compile them as they are, and other setups may need TypeScript added.

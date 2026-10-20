// The basket's paper, drawn on canvases: the small ticket it prints on copy
// (the faces receipt-paper.ts puts on its sheet), and the receipt someone
// tears off and keeps, the full bill (every icon and the whole command, which
// the ticket leaves out), downloaded as a PNG.

export type KeptReceipt = { number: number; labels: string[]; command: string; printedAt: Date };

const WIDTH = 300; // paper width, CSS px
const PAD = 22;
const ZIG = 6; // torn-edge tooth height; WIDTH is a whole number of teeth
const MARGIN = 28; // room for the shadow
const SCALE = 3;
const INK = "#0a0a0a";
const MUTED = "rgba(0, 0, 0, 0.5)";
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

type Op =
  | { kind: "text"; y: number; font: string; color: string; left?: string; right?: string; centre?: string }
  | { kind: "rule"; y: number };

/** Lays the bill out top to bottom; returns what to draw and the paper's height. */
function layout(receipt: KeptReceipt, brand: string, measure: CanvasRenderingContext2D) {
  const ops: Op[] = [];
  let y = ZIG + PAD;
  const text = (size: number, op: Omit<Extract<Op, { kind: "text" }>, "kind" | "y" | "font" | "color"> & { color?: string; weight?: number; family?: string }, gap = 6) => {
    y += size;
    ops.push({ kind: "text", y, font: `${op.weight ?? 400} ${size}px ${op.family ?? MONO}`, color: op.color ?? INK, ...op });
    y += gap;
  };
  const rule = () => {
    y += 6;
    ops.push({ kind: "rule", y });
    y += 12;
  };

  const date = receipt.printedAt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  const time = receipt.printedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  text(26, { centre: "IconSpace", family: brand }, 10);
  text(11, { centre: `icon shop · No. ${String(receipt.number).padStart(4, "0")}`, color: MUTED }, 4);
  text(11, { centre: `${date} · ${time}`, color: MUTED });
  rule();
  for (const label of receipt.labels) text(12, { left: label, right: "x1" });
  rule();
  text(12, { left: "ICONS", right: String(receipt.labels.length), weight: 700 });
  rule();

  // The command, wrapped to the paper, "$ " on its first line.
  measure.font = `400 12px ${MONO}`;
  const lines: string[] = [];
  let line = "$";
  for (const word of receipt.command.split(" ")) {
    const next = `${line} ${word}`;
    if (measure.measureText(next).width > WIDTH - 2 * PAD && line !== "$") {
      lines.push(line);
      line = `  ${word}`;
    } else {
      line = next;
    }
  }
  lines.push(line);
  for (const command of lines) text(12, { left: command });
  rule();
  text(12, { centre: "thank you, come again =^.^=" }, 4);
  text(11, { centre: "iconspace.dev", color: MUTED });
  return { ops, height: y + PAD - 6 + ZIG };
}

/** The paper: straight sides, torn top and bottom edges. */
function paper(ctx: CanvasRenderingContext2D, height: number) {
  ctx.beginPath();
  ctx.moveTo(0, ZIG);
  for (let x = 0; x < WIDTH; x += 2 * ZIG) {
    ctx.lineTo(x + ZIG, 0);
    ctx.lineTo(x + 2 * ZIG, ZIG);
  }
  ctx.lineTo(WIDTH, height - ZIG);
  for (let x = WIDTH; x > 0; x -= 2 * ZIG) {
    ctx.lineTo(x - ZIG, height);
    ctx.lineTo(x - 2 * ZIG, height - ZIG);
  }
  ctx.closePath();
}

export async function saveReceipt(receipt: KeptReceipt) {
  const brand = getComputedStyle(document.documentElement).getPropertyValue("--font-makenfy-local").trim() || "sans-serif";
  await document.fonts.load(`26px ${brand}`).catch(() => {});

  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) return;
  const { ops, height } = layout(receipt, brand, measure);
  canvas.width = (WIDTH + 2 * MARGIN) * SCALE;
  canvas.height = (height + 2 * MARGIN) * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.translate(MARGIN, MARGIN);

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.14)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  paper(ctx, height);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();

  ctx.textBaseline = "alphabetic";
  for (const op of ops) {
    if (op.kind === "rule") {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, op.y + 0.5);
      ctx.lineTo(WIDTH - PAD, op.y + 0.5);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    ctx.font = op.font;
    ctx.fillStyle = op.color;
    if (op.centre) {
      ctx.textAlign = "center";
      ctx.fillText(op.centre, WIDTH / 2, op.y);
    }
    if (op.left) {
      ctx.textAlign = "left";
      ctx.fillText(op.left, PAD, op.y);
    }
    if (op.right) {
      ctx.textAlign = "right";
      ctx.fillText(op.right, WIDTH - PAD, op.y);
    }
  }

  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `iconspace-receipt-${String(receipt.number).padStart(4, "0")}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── The ticket ─────────────────────────────────────────── */

/** The ticket's paper, CSS px. `reveal` is the stub above the slot line, `tuck` below it. */
export const TICKET = { width: 148, jag: 2.5, reveal: 6, tuck: 8, zig: 4 };
const TICKET_SCALE = 4;

/**
 * The perforation's torn edge: points (x as a share of the width, y in px
 * either side of the perforation) that wander irregularly, seeded so each
 * receipt tears its own way.
 */
export function tearLine(seed: number) {
  let state = seed * 7919 + 104729;
  const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
  const points: [number, number][] = [[0, (random() * 2 - 1) * TICKET.jag]];
  for (let x = 0; x < 1; ) {
    x = Math.min(1, x + 0.025 + random() * 0.035);
    points.push([x, (random() * 2 - 1) * TICKET.jag]);
  }
  return points;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  return [...lines, line];
}

/**
 * The ticket's two faces, cut along `edge`: the body (zigzag top, torn foot)
 * and the stub left in the slot (torn top). The stub overlaps the body's foot
 * by 2 × jag, so the two interlock.
 */
export async function drawTicket({ number, time, count, copied, edge }: {
  number: number;
  time: string;
  count: number;
  copied: boolean;
  edge: [number, number][];
}) {
  const brand = getComputedStyle(document.documentElement).getPropertyValue("--font-makenfy-local").trim() || "sans-serif";
  await document.fonts.load(`14px ${brand}`).catch(() => {});
  const { width, jag, reveal, tuck, zig } = TICKET;
  const inner = width - 24;

  // Lay out first, to know the height.
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `400 10px ${MONO}`;
  const message = wrap(measure, copied ? "✓ copied. Paste it in your terminal." : "Couldn't copy. Keep this for the command.", inner);
  const rows = { brand: zig + 9, meta: 0, rule1: 0, icons: 0, rule2: 0, message: 0, hint: 0 };
  rows.meta = rows.brand + 14 + 4;
  rows.rule1 = rows.meta + 15 + 6;
  rows.icons = rows.rule1 + 7;
  rows.rule2 = rows.icons + 15 + 6;
  rows.message = rows.rule2 + 7;
  rows.hint = rows.message + message.length * 15 + 8;
  const bodyHeight = Math.ceil(rows.hint + 14 + 9 + jag);
  const stubHeight = 2 * jag + reveal + tuck;
  const tear = bodyHeight - jag; // the perforation, in the body's px

  const canvas = (height: number) => {
    const art = document.createElement("canvas");
    art.width = width * TICKET_SCALE;
    art.height = height * TICKET_SCALE;
    const ctx = art.getContext("2d")!;
    ctx.scale(TICKET_SCALE, TICKET_SCALE);
    return [art, ctx] as const;
  };

  // The body.
  const [body, ctx] = canvas(bodyHeight);
  ctx.beginPath();
  ctx.moveTo(0, zig);
  for (let x = 0; x < width; x += 2 * zig) {
    ctx.lineTo(x + zig, 0);
    ctx.lineTo(Math.min(width, x + 2 * zig), zig);
  }
  for (const [x, y] of edge.toReversed()) ctx.lineTo(x * width, tear + y);
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();

  ctx.textBaseline = "top";
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.font = `400 14px ${brand}`;
  ctx.fillText("IconSpace", width / 2, rows.brand);
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(`No. ${String(number).padStart(4, "0")} · ${time}`, width / 2, rows.meta + 2.5);
  const rule = (y: number, color = "rgba(0, 0, 0, 0.25)") => {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, y + 0.5);
    ctx.lineTo(width - 12, y + 0.5);
    ctx.stroke();
    ctx.restore();
  };
  rule(rows.rule1);
  ctx.fillStyle = INK;
  ctx.font = `700 10px ${MONO}`;
  ctx.textAlign = "left";
  ctx.fillText("ICONS", 12, rows.icons + 2.5);
  ctx.textAlign = "right";
  ctx.fillText(String(count), width - 12, rows.icons + 2.5);
  rule(rows.rule2);
  ctx.font = `400 10px ${MONO}`;
  ctx.textAlign = "left";
  message.forEach((line, i) => ctx.fillText(line, 12, rows.message + i * 15 + 2.5));
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.font = `400 9px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillText("✂ tear to keep", width / 2, rows.hint + 2);
  // The perforation, along the middle of the torn edge.
  ctx.save();
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.moveTo(0, tear - 0.5);
  ctx.lineTo(width, tear - 0.5);
  ctx.stroke();
  ctx.restore();

  // The stub: the other side of the same edge.
  const [stub, stubCtx] = canvas(stubHeight);
  stubCtx.beginPath();
  edge.forEach(([x, y], i) => (i ? stubCtx.lineTo(x * width, jag + y) : stubCtx.moveTo(x * width, jag + y)));
  stubCtx.lineTo(width, stubHeight);
  stubCtx.lineTo(0, stubHeight);
  stubCtx.closePath();
  stubCtx.fillStyle = "#fff";
  stubCtx.fill();

  return { body, stub, bodyHeight, stubHeight };
}

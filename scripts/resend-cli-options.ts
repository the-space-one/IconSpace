export function parseResendArgs(args: string[]) {
  let dryRun = false;
  let help = false;
  let limit: number | undefined;
  for (const arg of args) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--help" || arg === "-h") help = true;
    else if (/^--limit=\d+$/.test(arg) && limit === undefined) {
      limit = Number(arg.slice("--limit=".length));
      if (!Number.isSafeInteger(limit))
        throw new Error("--limit must be a nonnegative safe integer.");
    } else
      throw new Error(
        "Unknown or invalid arguments. Use --help, --dry-run, and --limit=N.",
      );
  }
  return { dryRun, limit, help };
}

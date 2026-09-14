import { config } from "dotenv";
import { parseResendArgs } from "./resend-cli-options";
import { resendRunFailed } from "../src/server/resend-cron";

// Next loads .env.local automatically; a standalone script does not (mirrors
// drizzle.config.ts). Must run before importing anything that reads env at load.
async function main() {
  const { dryRun, limit, help } = parseResendArgs(process.argv.slice(2));
  if (help) {
    console.log(
      "Usage: npm run email:resend-pending -- [--dry-run] [--limit=N]\n--limit caps this run; it never overrides the daily budget.\nWithout --dry-run this sends real confirmation emails.",
    );
    return;
  }
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  // Suppress the provider SDK's development-only raw error logging in CLI.
  Object.assign(process.env, { NODE_ENV: "production" });

  // Dynamic import so dotenv runs first (the core pulls in the DB client, which
  // reads the connection string at module load).
  const { resendPendingConfirmations } =
    await import("../src/server/resend-confirmations");

  const summary = await resendPendingConfirmations({ limit, dryRun });
  console.log(
    dryRun ? "[dry run]" : "[resend]",
    JSON.stringify(summary, null, 2),
  );
  process.exit(resendRunFailed(summary) ? 1 : 0);
}

main().catch(() => {
  console.error(
    "resend_cli_error: Run failed. Check --help, configuration, database/provider availability, and server logs.",
  );
  process.exit(1);
});

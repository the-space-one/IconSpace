import { config } from "dotenv";
import { parseMirrorArgs } from "./mirror-cli-options";

async function main() {
  const mode = parseMirrorArgs(process.argv.slice(2));
  if (mode === "--help") {
    console.log(
      "Usage: npm run db:mirror -- --dry-run|--apply|--setup\n--dry-run: read-only full audit; --setup: additive checkpoint table; --apply: resumable copy.\nNo mode sends email. Deploy replica-aware sending BEFORE applying. Uses .env.local, then .env.",
    );
    return;
  }
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  Object.assign(process.env, { NODE_ENV: "production" });
  if (mode === "--setup") {
    const { setupMirrorCheckpoints } = await import("../src/db/mirror");
    console.log("mirror_setup", await setupMirrorCheckpoints());
  } else {
    const { repairWaitlistMirrors } =
      await import("../src/server/waitlist-mirror");
    const summary = await repairWaitlistMirrors({
      dryRun: mode === "--dry-run",
    });
    console.log(mode, JSON.stringify(summary, null, 2));
    if (summary.failures || !summary.complete) process.exitCode = 1;
  }
}

main().catch(() => {
  console.error(
    "mirror_cli_error: Check --help, database configuration/connectivity, and checkpoint setup. No secrets or recipients are logged.",
  );
  process.exitCode = 1;
});

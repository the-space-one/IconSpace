// Safe replacement for the interrupted verifier: no dotenv, SQL, real sends,
// or deletion of subscribers. Run the isolated regression suite instead.
import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "--test",
    "tests/resend-confirmations.test.ts",
    "tests/resend-email.test.ts",
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);

import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { mirrorUpsertSql } from "../src/db/mirror";
import {
  mergeMirrorRows,
  type MirrorRow,
} from "../src/server/waitlist-mirror-core";

/** Explicit opt-in: owns a fresh isolated PostgreSQL cluster/socket, never
 * reads a DATABASE_URL, and never connects to an existing database service.
 * Requires local initdb, pg_ctl and psql. Temporary test data is left in /tmp. */
test(
  "real PostgreSQL upserts match merge rules, preserve precision, and never downgrade sent",
  {
    skip: process.env.MIRROR_TEST_POSTGRES !== "1",
  },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "icon-mirror-pg-"));
    const data = join(directory, "data");
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
      ),
    };
    execFileSync("initdb", ["-D", data, "-A", "trust", "--no-locale"], {
      env,
      stdio: "pipe",
    });
    execFileSync(
      "pg_ctl",
      [
        "-D",
        data,
        "-l",
        join(directory, "server.log"),
        "-o",
        `-F -h '' -k '${directory}' -p 6547`,
        "-w",
        "start",
      ],
      { env, stdio: "pipe" },
    );
    try {
      const execute = (statement: string) =>
        execFileSync(
          "psql",
          [
            "-X",
            "-h",
            directory,
            "-p",
            "6547",
            "-d",
            "postgres",
            "-Atq",
            "-v",
            "ON_ERROR_STOP=1",
          ],
          {
            env,
            input: `SET TIME ZONE 'UTC';\n${statement}`,
            encoding: "utf8",
          },
        ).trim();
      const compile = (rows: MirrorRow[]) => {
        const query = new PgDialect().sqlToQuery(mirrorUpsertSql(rows));
        // Test data only; production uses the driver's parameter binding.
        return (
          query.sql.replace(/\$(\d+)/g, (_, n) => {
            const value = query.params[Number(n) - 1];
            return value === null
              ? "NULL"
              : `'${String(value).replaceAll("'", "''")}'`;
          }) + ";"
        );
      };
      const schema = readFileSync(
        new URL("../drizzle/0000_noisy_greymalkin.sql", import.meta.url),
        "utf8",
      );
      execute(schema);
      const open: MirrorRow = {
        email: "person@example.invalid",
        createdAt: new Date("2026-09-14T08:00:00.001Z"),
        createdAtExact: "2026-09-14T08:00:00.001234Z",
        emailSendStatus: "pending",
        emailSendError: null,
        emailSentAt: null,
      };
      const sent: MirrorRow = {
        ...open,
        email: "PERSON@example.invalid",
        emailSendStatus: "sent",
        emailSentAt: new Date("2026-09-14T08:01:00.002Z"),
        emailSentAtExact: "2026-09-14T08:01:00.002345Z",
      };
      assert.ok(execute(compile([open])));
      assert.ok(execute(compile([sent])));
      assert.equal(execute(compile([open])), ""); // stale retry must be a no-op
      const result = JSON.parse(
        execute(
          `SELECT json_build_object('count', count(*), 'status', min(email_send_status), 'sentAt', min(email_sent_at)::text, 'createdAt', min(created_at)::text, 'error', min(email_send_error)) FROM waitlist_subscribers;`,
        ),
      );
      assert.equal(result.count, 1);
      assert.equal(result.status, "sent");
      assert.equal(result.sentAt, "2026-09-14 08:01:00.002345+00");
      assert.equal(result.createdAt, "2026-09-14 08:00:00.001234+00");
      assert.equal(result.error, null);

      // Compare every pair of statuses, including a concurrently newer target.
      const statuses = [
        "pending",
        "skipped_config",
        "skipped_quota",
        "failed",
        "sent",
      ];
      for (const first of statuses)
        for (const second of statuses) {
          const email = `${first}-${second}@example.invalid`;
          const a = {
            ...open,
            email,
            emailSendStatus: first,
            emailSendError: "Z",
          };
          const b = {
            ...sent,
            email,
            emailSendStatus: second,
            emailSendError: "A",
          };
          execute(compile([a]));
          execute(compile([b]));
          const expected = mergeMirrorRows(a, b);
          const actual = JSON.parse(
            execute(
              `SELECT json_build_object('status', email_send_status, 'error', email_send_error) FROM waitlist_subscribers WHERE email = '${email}';`,
            ),
          );
          assert.equal(actual.status, expected.emailSendStatus);
          assert.equal(actual.error, expected.emailSendError);
        }
      // Mixed-case EXISTING rows hit the lower(email) index too.
      execute(
        "INSERT INTO waitlist_subscribers(email) VALUES ('UPPER@example.invalid');",
      );
      execute(compile([{ ...sent, email: "upper@example.invalid" }]));
      assert.equal(
        execute(
          "SELECT count(*) FROM waitlist_subscribers WHERE lower(email) = 'upper@example.invalid' AND email_send_status = 'sent';",
        ),
        "1",
      );
      assert.equal(
        execute(compile([{ ...sent, email: "upper@example.invalid" }])),
        "",
      );
      // A multi-row page is one SQL statement with parameterized values.
      execute(
        compile([
          { ...open, email: "batch-one@example.invalid" },
          { ...sent, email: "batch-two@example.invalid" },
        ]),
      );
      assert.equal(
        execute(
          "SELECT count(*) FROM waitlist_subscribers WHERE email LIKE 'batch-%';",
        ),
        "2",
      );
    } finally {
      execFileSync("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"], {
        env,
        stdio: "pipe",
      });
    }
  },
);

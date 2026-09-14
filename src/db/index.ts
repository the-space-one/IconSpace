import { neon, neonConfig } from "@neondatabase/serverless";
import https from "node:https";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/** Neon over the HTTP driver, pinned to IPv4.
 *
 *  Some networks (and some serverless hosts) resolve Neon to an AAAA record
 *  they cannot actually reach, which surfaces as a hang rather than a clean
 *  error. Routing the driver's fetch through node:https with `family: 4` plus
 *  an explicit timeout makes those failures fast and retryable instead. */
function ipv4Fetch(
  url: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const target =
    typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
  const parsedUrl = new URL(target);

  return new Promise((resolve, reject) => {
    const req = https.request(
      parsedUrl,
      {
        method: init?.method ?? "GET",
        headers: init?.headers as Record<string, string> | undefined,
        family: 4,
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf-8");
          const status = res.statusCode ?? 500;
          resolve(
            new Response(bodyText, {
              status,
              statusText: res.statusMessage,
              headers: res.headers as Record<string, string>,
            }),
          );
        });
      },
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("ETIMEDOUT"));
    });

    if (init?.body) {
      req.write(init.body);
    }

    req.end();
  });
}

neonConfig.fetchFunction = ipv4Fetch as typeof fetch;

export function resolvePrimaryDatabaseUrl() {
  return (
    process.env.PRIMARY_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    null
  );
}

/** Mirror Neon URLs also used for failover when the primary is failing. The primary is
 *  filtered out so a copy-paste in the env file can't make us retry the same
 *  dead endpoint twice. */
export function resolveFallbackDatabaseUrls() {
  const primaryUrl = resolvePrimaryDatabaseUrl();
  const raw = process.env.FALLBACK_DATABASE_URLS ?? "";
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(values)].filter((url) => url !== primaryUrl);
}

function createDbFromUrl(url: string) {
  const sql = neon(url);
  return drizzle({ client: sql, schema });
}

export type AppDb = ReturnType<typeof createDbFromUrl>;

export function createStandaloneDb(url: string) {
  const database = createDbFromUrl(url);
  return { database };
}

type GlobalWithDb = typeof globalThis & {
  primaryDb?: AppDb;
};

const globalForDb = globalThis as GlobalWithDb;

function getPrimaryDb() {
  const databaseUrl = resolvePrimaryDatabaseUrl();

  if (!databaseUrl) {
    return null;
  }

  if (globalForDb.primaryDb) {
    return globalForDb.primaryDb;
  }

  const database = createDbFromUrl(databaseUrl);

  // Cached across hot reloads in dev only; production gets a fresh client per
  // lambda instance.
  if (process.env.NODE_ENV !== "production") {
    globalForDb.primaryDb = database;
  }

  return database;
}

export const primaryDb = getPrimaryDb();

export const db = primaryDb;

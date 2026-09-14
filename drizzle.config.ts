import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next loads .env.local automatically; the drizzle-kit CLI does not.
config({ path: ".env.local" });
config();

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.PRIMARY_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/icon_space_waitlist",
  },
  strict: true,
  verbose: true,
});

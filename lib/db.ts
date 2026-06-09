import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __gotePool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return new Pool({
    connectionString,
    max: 5,
  });
}

export const pool = global.__gotePool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  global.__gotePool = pool;
}

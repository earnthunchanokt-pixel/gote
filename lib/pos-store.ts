import { pool } from "@/lib/db";
import { createDefaultState, normalizeState, type PosState } from "@/lib/pos-data";

const STATE_ROW_ID = "default";

let schemaPromise: Promise<void> | null = null;

export async function ensurePosSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await pool.query(`
        create table if not exists pos_state (
          id text primary key,
          state_json jsonb not null,
          updated_at timestamptz not null default now()
        )
      `);
    })();
  }

  await schemaPromise;
}

export async function getPosState() {
  await ensurePosSchema();

  const result = await pool.query("select state_json from pos_state where id = $1 limit 1", [STATE_ROW_ID]);
  if (result.rowCount && result.rows[0]?.state_json) {
    return normalizeState(result.rows[0].state_json);
  }

  const seeded = createDefaultState();
  await savePosState(seeded);
  return seeded;
}

export async function savePosState(input: unknown) {
  await ensurePosSchema();

  const nextState: PosState = normalizeState(input);
  await pool.query(
    `
      insert into pos_state (id, state_json, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (id)
      do update set state_json = excluded.state_json, updated_at = now()
    `,
    [STATE_ROW_ID, JSON.stringify(nextState)],
  );

  return nextState;
}

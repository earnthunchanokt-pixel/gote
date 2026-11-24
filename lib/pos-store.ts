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
  const select = "select state_json, updated_at::text as revision from pos_state where id = $1";
  let result = await pool.query(select, [STATE_ROW_ID]);
  if (result.rowCount === 0) {
    await pool.query(
      "insert into pos_state (id, state_json) values ($1, $2::jsonb) on conflict (id) do nothing",
      [STATE_ROW_ID, JSON.stringify(createDefaultState())],
    );
    result = await pool.query(select, [STATE_ROW_ID]);
  }
  const record = result.rows[0];
  return { state: normalizeState(record.state_json), revision: String(record.revision) };
}

export async function savePosState(input: unknown, revision: string) {
  await ensurePosSchema();

  const nextState: PosState = normalizeState(input);
  const result = await pool.query(
    `
      update pos_state
      set state_json = $2::jsonb, updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
      where id = $1 and updated_at::text = $3
      returning updated_at::text as revision
    `,
    [STATE_ROW_ID, JSON.stringify(nextState), revision],
  );
  return result.rows[0] ? String(result.rows[0].revision) : null;
}

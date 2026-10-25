import postgres from "postgres";
const globalDb = globalThis as unknown as {
  atlasSql?: ReturnType<typeof postgres>;
};
export const sql =
  globalDb.atlasSql ??
  postgres(process.env.DATABASE_URL || "", {
    max: 8,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
if (process.env.NODE_ENV !== "production") globalDb.atlasSql = sql;
export type Tx = postgres.TransactionSql;
export async function asActor<T>(
  actor: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE atlas_app`;
    await tx`SELECT set_config('atlas.actor', ${actor || ""}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

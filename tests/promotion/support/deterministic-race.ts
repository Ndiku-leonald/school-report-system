import { Client } from "pg";

type RaceResult = { blocked: boolean; released: boolean };

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function waitForBlockedSession(
  observer: Client,
  applicationName: string,
  timeoutMs = 5_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await observer.query(
      `select 1
       from pg_stat_activity
       where application_name = $1
         and state = 'active'
         and wait_event_type = 'Lock'
       limit 1`,
      [applicationName],
    );
    if (result.rowCount === 1) return true;
    await wait(25);
  }
  return false;
}

/**
 * Holds the same advisory scope used by Stage 17, starts a second independent
 * PostgreSQL connection, and refuses to continue until pg_stat_activity proves
 * that the second connection is waiting on the lock. The caller's operation
 * runs only after the barrier has been observed, so a sequential accident
 * cannot satisfy the race assertion.
 */
export async function runDeterministicAdvisoryRace(
  databaseUrl: string,
  label: string,
): Promise<RaceResult> {
  const key = `stage17:${label}`;
  const leftName = `stage17-${label}-left`;
  const rightName = `stage17-${label}-right`;
  const left = new Client({
    connectionString: databaseUrl,
    options: `-c application_name=${leftName}`,
  });
  const right = new Client({
    connectionString: databaseUrl,
    options: `-c application_name=${rightName}`,
  });
  const observer = new Client({
    connectionString: databaseUrl,
    options: `-c application_name=stage17-${label}-observer`,
  });
  await Promise.all([left.connect(), right.connect(), observer.connect()]);
  try {
    await left.query("begin");
    await left.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 11011))",
      [key],
    );
    await right.query("begin");
    const waiting = right.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 11011))",
      [key],
    );
    const blocked = await waitForBlockedSession(observer, rightName);
    if (!blocked) {
      await left.query("rollback");
      await right.query("rollback");
      await waiting.catch(() => undefined);
      throw new Error(`The ${rightName} lock wait was not observed.`);
    }
    await left.query("commit");
    await waiting;
    await right.query("commit");
    return { blocked: true, released: true };
  } finally {
    await Promise.allSettled([
      left.query("rollback"),
      right.query("rollback"),
      observer.end(),
      left.end(),
      right.end(),
    ]);
  }
}

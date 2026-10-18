import type { Db } from "@/server/db";

/** A transaction of the app's Drizzle client. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Drizzle client or transaction. */
export type Executor = Db | Tx;

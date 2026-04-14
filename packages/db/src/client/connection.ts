import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as usersSchema from "../schema/users.js";
import * as emailsSchema from "../schema/emails.js";
import * as domainsSchema from "../schema/domains.js";
import * as eventsSchema from "../schema/events.js";
import * as apiKeysSchema from "../schema/api-keys.js";
import * as suppressionsSchema from "../schema/suppressions.js";
import * as contactsSchema from "../schema/contacts.js";
import * as recallSchema from "../schema/recall.js";
import * as screenerSchema from "../schema/screener.js";

const schema = {
  ...usersSchema,
  ...emailsSchema,
  ...domainsSchema,
  ...eventsSchema,
  ...apiKeysSchema,
  ...suppressionsSchema,
  ...contactsSchema,
  ...recallSchema,
  ...screenerSchema,
};

export type DatabaseSchema = typeof schema;

export interface ConnectionConfig {
  /** PostgreSQL connection URL. Defaults to DATABASE_URL env var. */
  connectionString?: string;
  /** Maximum number of connections in the pool. */
  maxConnections?: number;
  /** Idle connection timeout in seconds. */
  idleTimeout?: number;
  /** Connection acquisition timeout in seconds. */
  connectTimeout?: number;
  /** Whether to prepare statements. Disable for serverless. */
  prepare?: boolean;
}

const DEFAULT_CONFIG: Required<Omit<ConnectionConfig, "connectionString">> = {
  maxConnections: 10,
  idleTimeout: 20,
  connectTimeout: 10,
  prepare: true,
};

let clientInstance: postgres.Sql | null = null;
let dbInstance: ReturnType<typeof drizzle<DatabaseSchema>> | null = null;

/**
 * Get or create a database connection pool.
 *
 * Uses a singleton pattern so the pool is shared across the process.
 * Call `closeConnection()` during graceful shutdown.
 */
export function getDatabase(config?: ConnectionConfig) {
  if (dbInstance) return dbInstance;

  const connectionString =
    config?.connectionString ?? process.env["DATABASE_URL"];

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL environment variable is required, or pass connectionString in config",
    );
  }

  // Auto-detect Neon serverless Postgres and apply sensible defaults:
  // - SSL is required (postgres.js reads sslmode=require from the URL, but we
  //   also pass it explicitly as a safety net).
  // - Prepared statements must be disabled when using Neon's connection pooler
  //   (pgbouncer in transaction mode).
  const isNeon = connectionString.includes(".neon.tech");
  const needsSsl =
    isNeon || connectionString.includes("sslmode=require");

  clientInstance = postgres(connectionString, {
    max: config?.maxConnections ?? DEFAULT_CONFIG.maxConnections,
    idle_timeout: config?.idleTimeout ?? DEFAULT_CONFIG.idleTimeout,
    connect_timeout: config?.connectTimeout ?? DEFAULT_CONFIG.connectTimeout,
    prepare: config?.prepare ?? (isNeon ? false : DEFAULT_CONFIG.prepare),
    ...(needsSsl ? { ssl: "require" as const } : {}),
  });

  dbInstance = drizzle(clientInstance, { schema });
  return dbInstance;
}

/**
 * Create a one-off database connection for migrations.
 * Always close this after use with `client.end()`.
 */
export function createMigrationClient(connectionString?: string) {
  const url = connectionString ?? process.env["DATABASE_URL"];
  if (!url) {
    throw new Error("DATABASE_URL is required for migrations");
  }

  const client = postgres(url, { max: 1 });
  return { client, db: drizzle(client, { schema }) };
}

/** Close the shared connection pool. Call during graceful shutdown. */
export async function closeConnection(): Promise<void> {
  if (clientInstance) {
    await clientInstance.end();
    clientInstance = null;
    dbInstance = null;
  }
}

/**
 * Check if the database connection is healthy.
 * Executes a simple `SELECT 1` and returns the round-trip latency.
 */
export async function checkConnectionHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const db = getDatabase();
    await db.execute(sql`SELECT 1`);
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error: unknown) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Type alias for the database instance. */
export type Database = ReturnType<typeof getDatabase>;

/**
 * Convenience alias — returns the singleton database instance.
 * Identical to `getDatabase()` but matches the simpler `getDb` naming
 * convention used in route handlers.
 */
export const getDb = getDatabase;

/**
 * Pre-initialised database instance for direct import.
 * Lazily initialised on first access so the module can be imported
 * safely even if DATABASE_URL is not yet set (e.g. during tests).
 */
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const instance = getDatabase();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/** The pool configuration defaults, exported for testing / inspection. */
export const poolConfig = { ...DEFAULT_CONFIG };

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as usersSchema from "../schema/users.js";
import * as emailsSchema from "../schema/emails.js";
import * as domainsSchema from "../schema/domains.js";
import * as eventsSchema from "../schema/events.js";
import * as apiKeysSchema from "../schema/api-keys.js";

const schema = {
  ...usersSchema,
  ...emailsSchema,
  ...domainsSchema,
  ...eventsSchema,
  ...apiKeysSchema,
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

  clientInstance = postgres(connectionString, {
    max: config?.maxConnections ?? DEFAULT_CONFIG.maxConnections,
    idle_timeout: config?.idleTimeout ?? DEFAULT_CONFIG.idleTimeout,
    connect_timeout: config?.connectTimeout ?? DEFAULT_CONFIG.connectTimeout,
    prepare: config?.prepare ?? DEFAULT_CONFIG.prepare,
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

/** Type alias for the database instance. */
export type Database = ReturnType<typeof getDatabase>;

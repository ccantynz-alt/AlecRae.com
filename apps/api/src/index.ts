/**
 * @alecrae/api — Entry Point
 *
 * Re-exports from server.ts for Bun's built-in HTTP server.
 * All route registration, middleware, and shutdown handling lives in server.ts.
 */

export { default, app } from "./server.js";

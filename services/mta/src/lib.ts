/**
 * @alecrae/mta — Library surface for cross-service imports.
 *
 * Re-exports pure helpers that other services (apps/api, etc.) can call
 * without booting the entire MTA runtime. The main `index.ts` is a
 * service entry point that starts sockets and workers; importing it
 * would start a server. Use this module for validators, parsers, and
 * other stateless utilities.
 */

export {
  validateCustomHeaders,
  HEADER_INJECTION_REJECTED,
  type HeaderValidationResult,
} from "./smtp/header-validator.js";

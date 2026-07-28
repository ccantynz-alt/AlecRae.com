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

export { checkSpf } from "./spf/validator.js";
export { evaluateDmarc, determineAction } from "./dmarc/enforcer.js";

export {
  parseBounceMessage,
  processBounce,
  type BounceAction,
  type SuppressionEntry,
} from "./bounce/processor.js";

// VERP envelope-sender construction/parsing. `parseReturnPath` is what lets
// the inbound service attribute an incoming DSN to the exact message that
// bounced, without a lookup table.
export {
  buildReturnPath,
  parseReturnPath,
  type ParsedReturnPath,
} from "./bounce/return-path.js";
export type { BounceInfo, BounceCategory, BounceType } from "./types.js";

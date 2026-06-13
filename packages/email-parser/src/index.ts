/**
 * @alecrae/email-parser — RFC 5322 email parsing + a structured document model.
 *
 * Public entry point (package.json `main` → dist/index.js).
 */

export { parseEmail, parseAddressList, decodeEncodedWords } from "./parser.js";
export type {
  ParsedEmail,
  ParsedAddress,
  ParsedAttachment,
  MimePart,
  EmailBuildOptions,
} from "./types.js";

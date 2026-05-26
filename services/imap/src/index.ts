/**
 * @alecrae/imap — IMAP4rev2 Server
 *
 * Compatibility bridge that speaks IMAP (RFC 9051 / RFC 3501) to legacy
 * email clients while sharing the same underlying mailbox storage as JMAP.
 *
 * Supported clients: Outlook, Thunderbird, Android Gmail, Apple Mail,
 * and any standard IMAP client.
 *
 * Ports:
 *   - 993: IMAPS (implicit TLS)
 *   - 143: IMAP + STARTTLS
 */

// Server — command parsing + response formatting are stable and exported.
// NOTE: `server/imap-server.ts` and `handlers/messages.ts` are being rebuilt
// to match the current ImapFetchItem / ImapMessage shapes (types were
// refactored without updating these files). They are intentionally excluded
// from the typecheck until the rewrite lands. See services/imap/TODO.md.
export {
  parseCommand as parseImapCommand,
  parseCommand,
  formatTagged as formatTaggedResponse,
  formatTagged,
  formatUntagged as formatUntaggedResponse,
  formatUntagged,
  formatContinuation,
  buildCapabilityString,
  parseSequenceSet,
  parseQuotedString,
  parseAtom,
} from "./server/commands.js";

// Handlers — auth + mailbox handlers are stable.
export { handleLogin, handleAuthenticate } from "./handlers/auth.js";
export {
  handleSelect,
  handleExamine,
  handleCreate,
  handleDelete,
  handleRename,
  handleList,
  handleLsub,
  handleSubscribe,
  handleUnsubscribe,
  handleStatus,
  handleClose,
  handleNamespace,
} from "./handlers/mailbox.js";

// Storage contract (type-only) is stable and used by adapters.
export type {
  MessageStore,
  FlagOperation,
  UidMapping,
  AppendData,
} from "./store-types.js";

// Types
export type {
  ImapState,
  ImapCommandName,
  ImapCommand,
  ImapSession,
  SelectedMailbox,
  ImapServerConfig,
  ImapMailbox,
  ImapMessage,
  ImapEnvelope,
  ImapAddress,
  ImapBodyStructure,
  ImapFetchItem,
  ImapSearchCriteria,
  ImapFlag,
  Result,
} from "./types.js";

export { ok, err } from "./types.js";

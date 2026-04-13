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

// Server
export { ImapServer } from "./server/imap-server.js";
export {
  parseImapCommand,
  formatTaggedResponse,
  formatUntaggedResponse,
  formatContinuation,
  buildCapabilityString,
} from "./server/commands.js";

// Handlers
export { handleLogin, handleAuthenticate, AuthRateLimiter } from "./handlers/auth.js";
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
export {
  handleFetch,
  handleStore,
  handleCopy,
  handleMove,
  handleExpunge,
  handleSearch,
  handleAppend,
  IdleManager,
  parseSequenceSet,
} from "./handlers/messages.js";

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

/**
 * JMAP types per RFC 8620 and RFC 8621.
 */

// --- Core JMAP Types (RFC 8620) ---

export type JmapId = string;

export interface JmapCapabilities {
  "urn:ietf:params:jmap:core": CoreCapability;
  "urn:ietf:params:jmap:mail": MailCapability;
  [key: string]: unknown;
}

export interface CoreCapability {
  maxSizeUpload: number;
  maxConcurrentUpload: number;
  maxSizeRequest: number;
  maxConcurrentRequests: number;
  maxCallsInRequest: number;
  maxObjectsInGet: number;
  maxObjectsInSet: number;
  collationAlgorithms: string[];
}

export interface MailCapability {
  maxMailboxesPerEmail: number | null;
  maxMailboxDepth: number | null;
  maxSizeMailboxName: number;
  maxSizeAttachmentsPerEmail: number;
  emailQuerySortOptions: string[];
  mayCreateTopLevelMailbox: boolean;
}

export interface JmapSession {
  capabilities: JmapCapabilities;
  accounts: Record<JmapId, JmapAccount>;
  primaryAccounts: Record<string, JmapId>;
  username: string;
  apiUrl: string;
  downloadUrl: string;
  uploadUrl: string;
  eventSourceUrl: string;
  state: string;
}

export interface JmapAccount {
  name: string;
  isPersonal: boolean;
  isReadOnly: boolean;
  accountCapabilities: Record<string, unknown>;
}

// --- Request/Response ---

export interface JmapRequest {
  using: string[];
  methodCalls: JmapMethodCall[];
  createdIds?: Record<JmapId, JmapId>;
}

export type JmapMethodCall = [method: string, args: Record<string, unknown>, callId: string];

export interface JmapResponse {
  methodResponses: JmapMethodResponse[];
  createdIds?: Record<JmapId, JmapId>;
  sessionState: string;
}

export type JmapMethodResponse = [method: string, args: Record<string, unknown>, callId: string];

// --- Standard Method Arguments ---

export interface GetArgs {
  accountId: JmapId;
  ids: JmapId[] | null;
  properties?: string[];
}

export interface GetResponse<T> {
  accountId: JmapId;
  state: string;
  list: T[];
  notFound: JmapId[];
}

export interface ChangesArgs {
  accountId: JmapId;
  sinceState: string;
  maxChanges?: number;
}

export interface ChangesResponse {
  accountId: JmapId;
  oldState: string;
  newState: string;
  hasMoreChanges: boolean;
  created: JmapId[];
  updated: JmapId[];
  destroyed: JmapId[];
}

export interface SetArgs<T> {
  accountId: JmapId;
  ifInState?: string;
  create?: Record<JmapId, Partial<T>>;
  update?: Record<JmapId, Partial<T>>;
  destroy?: JmapId[];
}

export interface SetResponse<T> {
  accountId: JmapId;
  oldState: string;
  newState: string;
  created?: Record<JmapId, T>;
  updated?: Record<JmapId, T | null>;
  destroyed?: JmapId[];
  notCreated?: Record<JmapId, JmapSetError>;
  notUpdated?: Record<JmapId, JmapSetError>;
  notDestroyed?: Record<JmapId, JmapSetError>;
}

export interface JmapSetError {
  type: string;
  description?: string;
  properties?: string[];
}

export interface QueryArgs {
  accountId: JmapId;
  filter?: JmapFilter;
  sort?: JmapComparator[];
  position?: number;
  anchor?: JmapId;
  anchorOffset?: number;
  limit?: number;
  calculateTotal?: boolean;
}

export interface QueryResponse {
  accountId: JmapId;
  queryState: string;
  canCalculateChanges: boolean;
  position: number;
  ids: JmapId[];
  total?: number;
}

export type JmapFilter = Record<string, unknown>;
export interface JmapComparator {
  property: string;
  isAscending?: boolean;
  collation?: string;
}

// --- Mailbox Types (RFC 8621) ---

export interface Mailbox {
  id: JmapId;
  name: string;
  parentId: JmapId | null;
  role: MailboxRole | null;
  sortOrder: number;
  totalEmails: number;
  unreadEmails: number;
  totalThreads: number;
  unreadThreads: number;
  myRights: MailboxRights;
  isSubscribed: boolean;
}

export type MailboxRole =
  | "all"
  | "archive"
  | "drafts"
  | "flagged"
  | "important"
  | "inbox"
  | "junk"
  | "sent"
  | "subscribed"
  | "trash";

export interface MailboxRights {
  mayReadItems: boolean;
  mayAddItems: boolean;
  mayRemoveItems: boolean;
  maySetSeen: boolean;
  maySetKeywords: boolean;
  mayCreateChild: boolean;
  mayRename: boolean;
  mayDelete: boolean;
  maySubmit: boolean;
}

// --- Email Types (RFC 8621) ---

export interface JmapEmail {
  id: JmapId;
  blobId: JmapId;
  threadId: JmapId;
  mailboxIds: Record<JmapId, boolean>;
  keywords: Record<string, boolean>;
  size: number;
  receivedAt: string;
  messageId: string[];
  inReplyTo: string[];
  references: string[];
  sender: JmapEmailAddress[] | null;
  from: JmapEmailAddress[] | null;
  to: JmapEmailAddress[] | null;
  cc: JmapEmailAddress[] | null;
  bcc: JmapEmailAddress[] | null;
  replyTo: JmapEmailAddress[] | null;
  subject: string;
  sentAt: string | null;
  hasAttachment: boolean;
  preview: string;
  bodyValues?: Record<string, JmapBodyValue>;
  textBody?: JmapBodyPart[];
  htmlBody?: JmapBodyPart[];
  attachments?: JmapBodyPart[];
}

export interface JmapEmailAddress {
  name: string | null;
  email: string;
}

export interface JmapBodyValue {
  value: string;
  isEncodingProblem: boolean;
  isTruncated: boolean;
}

export interface JmapBodyPart {
  partId: string;
  blobId: JmapId;
  size: number;
  name: string | null;
  type: string;
  charset: string | null;
  disposition: string | null;
  cid: string | null;
}

// --- Thread Types ---

export interface JmapThread {
  id: JmapId;
  emailIds: JmapId[];
}

// --- Push Subscription ---

export interface PushSubscription {
  id: JmapId;
  deviceClientId: string;
  url: string;
  keys: {
    p256dh: string;
    auth: string;
  } | null;
  verificationCode?: string;
  expires: string | null;
  types: string[] | null;
}

export interface StateChange {
  "@type": "StateChange";
  changed: Record<JmapId, Record<string, string>>;
}

/**
 * AlecRae Programmable Email — Sandbox Runtime
 *
 * Executes user-authored TypeScript snippets safely inside a QuickJS
 * (WebAssembly) sandbox via `quickjs-emscripten`. The sandbox provides:
 *
 *   • Hard memory + execution-time limits
 *   • No `fetch`, no `XMLHttpRequest`, no `import`, no `require`
 *   • No filesystem, no process, no environment access
 *   • A typed `email` object (read-only)
 *   • An `actions` API whose calls are *captured* (not applied) and returned
 *     to the host for review/audit/dry-run before being executed.
 *
 * The sandbox is the only trust boundary. Anything that crosses it is
 * serialised through QuickJS handles — host references never leak in.
 *
 * @example Calling the runtime from the host
 * ```ts
 * const code = `
 *   export default (email, actions) => {
 *     if (email.from.email.endsWith("@stripe.com")) {
 *       actions.label("Finance");
 *       actions.star();
 *     }
 *   };
 * `;
 * const result = await runProgram(code, sampleEmail, { timeoutMs: 5_000 });
 * console.log(result.actions); // [{ type: 'label', name: 'Finance' }, { type: 'star' }]
 * ```
 */

import {
  getQuickJS,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSWASMModule,
} from "quickjs-emscripten";

import type {
  ProgramAction,
  ProgramActions,
  ProgramEmail,
  ProgramResult,
} from "./types.js";

// Re-export types for convenience.
export type { ProgramAction, ProgramActions, ProgramEmail, ProgramResult };

/** Options accepted by {@link runProgram}. */
export interface RunProgramOptions {
  /** Hard cap on execution time in milliseconds. Default: 5000. */
  readonly timeoutMs?: number;
  /** Hard cap on sandbox memory in bytes. Default: 32 MiB. */
  readonly memoryLimitBytes?: number;
  /**
   * Optional async hook the runtime calls when user code invokes
   * `actions.runAI(prompt)`. If omitted, `runAI` returns an empty string
   * but the call is still recorded as an action.
   */
  readonly aiBridge?: (prompt: string) => Promise<string>;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MEMORY_LIMIT = 32 * 1024 * 1024;

let cachedQuickJs: QuickJSWASMModule | null = null;

async function loadQuickJs(): Promise<QuickJSWASMModule> {
  if (cachedQuickJs) return cachedQuickJs;
  cachedQuickJs = await getQuickJS();
  return cachedQuickJs;
}

/** Strip TS-only syntax we don't want users writing inside the sandbox. */
function preprocessUserCode(code: string): string {
  // QuickJS executes JS, not TS. We accept simple TS-flavoured code
  // (type annotations, `export default`) and strip enough to make it
  // valid JS. This is intentionally conservative — users who need real
  // TS should compile client-side first.
  let out = code;

  // Convert `export default function (...) { ... }` → assign to __program.
  out = out.replace(
    /export\s+default\s+(async\s+)?function\b/,
    "globalThis.__program = $1function",
  );
  // Convert `export default (args) => ...` or `export default async (args) => ...`
  out = out.replace(
    /export\s+default\s+/,
    "globalThis.__program = ",
  );

  // Reject module syntax we don't support.
  if (/(^|\n)\s*import\b/.test(out) || /\brequire\s*\(/.test(out)) {
    throw new SandboxCompileError(
      "Programs may not use 'import' or 'require'. The sandbox has no module system.",
    );
  }

  return out;
}

/** Error thrown for static rejections before the sandbox is ever created. */
export class SandboxCompileError extends Error {
  public override readonly name = "SandboxCompileError";
}

/**
 * Run a user-authored program in a fresh QuickJS sandbox.
 *
 * The sandbox is single-use — created, executed, and disposed for every
 * email. This is intentional: it makes leaks impossible and means one
 * misbehaving program can never poison the next one.
 */
export async function runProgram(
  code: string,
  email: ProgramEmail,
  options: RunProgramOptions = {},
): Promise<ProgramResult> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const memoryLimit = options.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT;

  const actions: ProgramAction[] = [];
  const logs: string[] = [];

  let processed: string;
  try {
    processed = preprocessUserCode(code);
  } catch (err) {
    return {
      actions,
      logs,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    };
  }

  const quickjs = await loadQuickJs();
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(memoryLimit);
  runtime.setMaxStackSize(1024 * 1024);
  // Hard execution-time limit enforced by QuickJS interrupt handler.
  const deadline = Date.now() + timeoutMs;
  runtime.setInterruptHandler(() => Date.now() > deadline);

  const ctx = runtime.newContext();
  // Pending host promises spawned by `runAI` we must drain before disposal.
  const pending: Promise<void>[] = [];

  try {
    installSandboxGlobals(ctx, { email, actions, logs, options, pending });

    const evalResult = ctx.evalCode(processed, "program.js", {
      type: "global",
      strict: true,
    });
    if (evalResult.error) {
      const message = dumpError(ctx, evalResult.error);
      evalResult.error.dispose();
      return {
        actions,
        logs,
        error: message,
        durationMs: Date.now() - startedAt,
      };
    }
    evalResult.value.dispose();

    // Pull __program out and invoke it with (email, actions).
    const programHandle = ctx.getProp(ctx.global, "__program");
    if (ctx.typeof(programHandle) !== "function") {
      programHandle.dispose();
      return {
        actions,
        logs,
        error: "Program must `export default` a function.",
        durationMs: Date.now() - startedAt,
      };
    }

    const emailHandle = jsonToHandle(ctx, email);
    const actionsHandle = ctx.getProp(ctx.global, "actions");

    const callResult = ctx.callFunction(
      programHandle,
      ctx.undefined,
      emailHandle,
      actionsHandle,
    );

    emailHandle.dispose();
    actionsHandle.dispose();
    programHandle.dispose();

    if (callResult.error) {
      const message = dumpError(ctx, callResult.error);
      callResult.error.dispose();
      return {
        actions,
        logs,
        error: message,
        durationMs: Date.now() - startedAt,
      };
    }

    // If the user returned a Promise, await it inside the VM.
    const returned = callResult.value;
    const promiseState = ctx.getPromiseState(returned);
    if (promiseState.type === "fulfilled" || promiseState.type === "rejected") {
      if (promiseState.type === "rejected") {
        const message = dumpError(ctx, promiseState.error);
        promiseState.error.dispose();
        returned.dispose();
        return { actions, logs, error: message, durationMs: Date.now() - startedAt };
      }
      promiseState.value.dispose();
    } else if (promiseState.type === "pending") {
      // Drain any host-side awaits, then run the VM job loop.
      while (pending.length > 0) {
        const batch = pending.splice(0, pending.length);
        await Promise.all(batch);
        ctx.runtime.executePendingJobs();
      }
      const finalState = ctx.getPromiseState(returned);
      if (finalState.type === "rejected") {
        const message = dumpError(ctx, finalState.error);
        finalState.error.dispose();
        returned.dispose();
        return { actions, logs, error: message, durationMs: Date.now() - startedAt };
      }
      if (finalState.type === "fulfilled") {
        finalState.value.dispose();
      }
    }
    returned.dispose();

    return { actions, logs, durationMs: Date.now() - startedAt };
  } catch (err) {
    return {
      actions,
      logs,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    ctx.dispose();
    runtime.dispose();
  }
}

// ─── Sandbox plumbing ───────────────────────────────────────────────────────

interface SandboxState {
  readonly email: ProgramEmail;
  readonly actions: ProgramAction[];
  readonly logs: string[];
  readonly options: RunProgramOptions;
  readonly pending: Promise<void>[];
}

function installSandboxGlobals(ctx: QuickJSContext, state: SandboxState): void {
  // ── console.log → host log buffer ───────────────────────────────────
  const consoleObj = ctx.newObject();
  const logFn = ctx.newFunction("log", (...args) => {
    const parts = args.map((a) => {
      try {
        return ctx.dump(a) as unknown;
      } finally {
        a.dispose();
      }
    });
    state.logs.push(parts.map(stringify).join(" "));
    return ctx.undefined;
  });
  ctx.setProp(consoleObj, "log", logFn);
  ctx.setProp(consoleObj, "info", logFn);
  ctx.setProp(consoleObj, "warn", logFn);
  ctx.setProp(consoleObj, "error", logFn);
  logFn.dispose();
  ctx.setProp(ctx.global, "console", consoleObj);
  consoleObj.dispose();

  // ── actions API ─────────────────────────────────────────────────────
  const actionsObj = ctx.newObject();

  const pushSimple = (type: ProgramAction["type"]): void => {
    const fn = ctx.newFunction(type, () => {
      // Only valid for nullary actions; the discriminated union narrows
      // away here.
      state.actions.push({ type } as ProgramAction);
      return ctx.undefined;
    });
    ctx.setProp(actionsObj, type, fn);
    fn.dispose();
  };

  pushSimple("archive");
  pushSimple("trash");
  pushSimple("star");
  pushSimple("unstar");
  pushSimple("markRead");
  pushSimple("markUnread");

  const labelFn = ctx.newFunction("label", (nameH) => {
    const name = ctx.getString(nameH);
    nameH.dispose();
    state.actions.push({ type: "label", name });
    return ctx.undefined;
  });
  ctx.setProp(actionsObj, "label", labelFn);
  labelFn.dispose();

  const removeLabelFn = ctx.newFunction("removeLabel", (nameH) => {
    const name = ctx.getString(nameH);
    nameH.dispose();
    state.actions.push({ type: "removeLabel", name });
    return ctx.undefined;
  });
  ctx.setProp(actionsObj, "removeLabel", removeLabelFn);
  removeLabelFn.dispose();

  const replyFn = ctx.newFunction("reply", (textH: QuickJSHandle) => {
    const text = ctx.getString(textH);
    textH.dispose();
    state.actions.push({ type: "reply", text });
    return ctx.undefined;
  });
  ctx.setProp(actionsObj, "reply", replyFn);
  replyFn.dispose();

  const forwardFn = ctx.newFunction("forward", (toH: QuickJSHandle, noteH: QuickJSHandle) => {
    const to = ctx.getString(toH);
    toH.dispose();
    let note: string | undefined;
    if (noteH && ctx.typeof(noteH) === "string") {
      note = ctx.getString(noteH);
    }
    if (noteH) noteH.dispose();
    state.actions.push(note !== undefined ? { type: "forward", to, note } : { type: "forward", to });
    return ctx.undefined;
  });
  ctx.setProp(actionsObj, "forward", forwardFn);
  forwardFn.dispose();

  const snoozeFn = ctx.newFunction("snooze", (untilH: QuickJSHandle) => {
    const until = ctx.getString(untilH);
    untilH.dispose();
    state.actions.push({ type: "snooze", until });
    return ctx.undefined;
  });
  ctx.setProp(actionsObj, "snooze", snoozeFn);
  snoozeFn.dispose();

  // runAI returns a Promise inside the VM, resolved from a host async hook.
  const runAIFn = ctx.newFunction("runAI", (promptH: QuickJSHandle) => {
    const prompt = ctx.getString(promptH);
    promptH.dispose();

    const deferred = ctx.newPromise();
    const work = (async (): Promise<void> => {
      try {
        const response = state.options.aiBridge
          ? await state.options.aiBridge(prompt)
          : "";
        state.actions.push({ type: "runAI", prompt, response });
        const handle = ctx.newString(response);
        deferred.resolve(handle);
        handle.dispose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const handle = ctx.newString(msg);
        deferred.reject(handle);
        handle.dispose();
      } finally {
        deferred.settled.then(() => ctx.runtime.executePendingJobs());
      }
    })();
    state.pending.push(work);
    return deferred.handle;
  });
  ctx.setProp(actionsObj, "runAI", runAIFn);
  runAIFn.dispose();

  ctx.setProp(ctx.global, "actions", actionsObj);
  actionsObj.dispose();
}

/** Convert a JSON-safe host value into a QuickJS handle (deep). */
function jsonToHandle(ctx: QuickJSContext, value: unknown): QuickJSHandle {
  if (value === null) return ctx.null;
  if (value === undefined) return ctx.undefined;
  switch (typeof value) {
    case "string":
      return ctx.newString(value);
    case "number":
      return ctx.newNumber(value);
    case "boolean":
      return value ? ctx.true : ctx.false;
    case "object": {
      if (Array.isArray(value)) {
        const arr = ctx.newArray();
        for (let i = 0; i < value.length; i++) {
          const child = jsonToHandle(ctx, value[i]);
          ctx.setProp(arr, i, child);
          child.dispose();
        }
        return arr;
      }
      const obj = ctx.newObject();
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const child = jsonToHandle(ctx, v);
        ctx.setProp(obj, k, child);
        child.dispose();
      }
      return obj;
    }
    default:
      return ctx.undefined;
  }
}

function dumpError(ctx: QuickJSContext, errHandle: QuickJSHandle): string {
  try {
    const dumped = ctx.dump(errHandle) as unknown;
    if (dumped && typeof dumped === "object" && "message" in dumped) {
      const m = (dumped as { message: unknown }).message;
      return typeof m === "string" ? m : JSON.stringify(dumped);
    }
    return stringify(dumped);
  } catch {
    return "Unknown sandbox error";
  }
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

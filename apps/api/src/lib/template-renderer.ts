/**
 * Template Rendering Engine
 *
 * Supports:
 *   {{variable}}         — HTML-escaped variable substitution
 *   {{{variable}}}       — Raw (unescaped) variable substitution
 *   {{#if var}}...{{/if}} — Conditional blocks
 *   {{#each items}}...{{/each}} — Loop blocks (item available as {{this}})
 */

// ─── HTML escaping ───────────────────────────────────────────────────────────

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch);
}

// ─── Variable extraction ─────────────────────────────────────────────────────

/**
 * Extract all variable names referenced in a template string.
 */
export function extractVariables(template: string): string[] {
  const vars = new Set<string>();

  // {{variable}} and {{{variable}}}
  const varRegex = /\{\{\{?([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)\}?\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = varRegex.exec(template)) !== null) {
    if (match[1]) vars.add(match[1]);
  }

  // {{#if variable}} and {{#each variable}}
  const blockRegex = /\{\{#(?:if|each)\s+([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)\}\}/g;
  while ((match = blockRegex.exec(template)) !== null) {
    if (match[1]) vars.add(match[1]);
  }

  return [...vars].sort();
}

// ─── Value resolution ────────────────────────────────────────────────────────

function resolve(path: string, data: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ─── Renderer ────────────────────────────────────────────────────────────────

export interface RenderOptions {
  /** If true, throw on missing variables instead of rendering empty string */
  strict?: boolean;
}

/**
 * Render a template string with the provided variables.
 *
 * @throws Error if strict mode is enabled and a required variable is missing
 */
export function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
  options?: RenderOptions,
): string {
  let result = template;

  // 1. Process {{#each items}}...{{/each}} blocks
  result = result.replace(
    /\{\{#each\s+([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, varName: string, body: string) => {
      const value = resolve(varName, variables);

      if (!Array.isArray(value)) {
        if (options?.strict) {
          throw new Error(`Template variable "${varName}" is not an array`);
        }
        return "";
      }

      return value
        .map((item) => {
          if (typeof item === "object" && item !== null) {
            return renderTemplate(body, { ...variables, this: item, ...item as Record<string, unknown> }, options);
          }
          return renderTemplate(body, { ...variables, this: item }, options);
        })
        .join("");
    },
  );

  // 2. Process {{#if variable}}...{{/if}} blocks
  result = result.replace(
    /\{\{#if\s+([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, varName: string, body: string) => {
      const value = resolve(varName, variables);
      if (value) {
        return renderTemplate(body, variables, options);
      }
      return "";
    },
  );

  // 3. Process {{{raw}}} (unescaped)
  result = result.replace(
    /\{\{\{([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)\}\}\}/g,
    (_match, varName: string) => {
      const value = resolve(varName, variables);
      if (value === undefined || value === null) {
        if (options?.strict) {
          throw new Error(`Missing required template variable: "${varName}"`);
        }
        return "";
      }
      return String(value);
    },
  );

  // 4. Process {{variable}} (HTML-escaped)
  result = result.replace(
    /\{\{([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)\}\}/g,
    (_match, varName: string) => {
      const value = resolve(varName, variables);
      if (value === undefined || value === null) {
        if (options?.strict) {
          throw new Error(`Missing required template variable: "${varName}"`);
        }
        return "";
      }
      return escapeHtml(String(value));
    },
  );

  return result;
}

/**
 * Validate that all required variables are provided.
 * Returns an array of missing variable names (empty = all good).
 */
export function validateVariables(
  template: string,
  provided: Record<string, unknown>,
): string[] {
  const required = extractVariables(template);
  return required.filter((name) => {
    const value = resolve(name, provided);
    return value === undefined || value === null;
  });
}

/**
 * Template Rendering Engine
 *
 * Supports:
 *   {{variable}}              — basic substitution
 *   {{variable|default}}      — substitution with fallback
 *   {{#if variable}}...{{/if}} — simple conditionals
 *   {{#each items}}...{{/each}} — basic iteration
 *
 * HTML body values are XSS-escaped; text body values are not.
 */

import type { TemplateVariable } from "@emailed/db";

export interface RenderResult {
  subject: string;
  html: string | null;
  text: string | null;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

// ---------------------------------------------------------------------------
// Variable extraction — scans template bodies for {{var}} patterns
// ---------------------------------------------------------------------------

/**
 * Extract variable definitions from template content.
 * Scans subject, htmlBody, and textBody for `{{varName}}` and `{{varName|default}}`.
 */
export function extractVariables(
  subject: string,
  htmlBody?: string | null,
  textBody?: string | null,
): TemplateVariable[] {
  const seen = new Set<string>();
  const vars: TemplateVariable[] = [];

  const sources = [subject, htmlBody ?? "", textBody ?? ""].join("\n");

  // Match {{varName}} and {{varName|default}} but NOT {{#if}}, {{/if}}, {{#each}}, {{/each}}
  const varPattern = /\{\{(?!#|\/)([\w.]+?)(?:\|([^}]*))?\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = varPattern.exec(sources)) !== null) {
    const name = match[1]!;
    const defaultValue = match[2];
    if (!seen.has(name)) {
      seen.add(name);
      vars.push({
        name,
        defaultValue: defaultValue ?? undefined,
        required: defaultValue === undefined,
      });
    }
  }

  return vars;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function resolveValue(
  name: string,
  variables: Record<string, unknown>,
): unknown {
  // Support dot notation: "user.name" -> variables.user.name
  const parts = name.split(".");
  let current: unknown = variables;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Core render function that processes a single string with variable substitution,
 * conditionals, and iteration.
 *
 * @param template - The template string
 * @param variables - Key-value pairs for substitution
 * @param escape - Whether to HTML-escape substituted values
 * @param warnings - Mutable array to collect warnings
 */
function renderString(
  template: string,
  variables: Record<string, unknown>,
  escape: boolean,
  warnings: string[],
): string {
  let result = template;

  // 1. Process {{#each items}}...{{/each}}
  result = result.replace(
    /\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, arrayName: string, body: string) => {
      const arr = resolveValue(arrayName, variables);
      if (!Array.isArray(arr)) {
        warnings.push(
          `Variable "${arrayName}" used in {{#each}} is not an array — skipped`,
        );
        return "";
      }
      return arr
        .map((item, index) => {
          // For each iteration, create a child scope with the item
          const iterVars: Record<string, unknown> = {
            ...variables,
            "@index": index,
          };
          if (typeof item === "object" && item !== null) {
            Object.assign(iterVars, item);
          } else {
            iterVars["this"] = item;
          }
          return renderString(body, iterVars, escape, warnings);
        })
        .join("");
    },
  );

  // 2. Process {{#if variable}}...{{/if}}
  result = result.replace(
    /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, condName: string, body: string) => {
      const val = resolveValue(condName, variables);
      // Truthy check: non-empty string, non-zero number, non-empty array, true boolean
      const truthy =
        val !== undefined &&
        val !== null &&
        val !== false &&
        val !== 0 &&
        val !== "" &&
        !(Array.isArray(val) && val.length === 0);
      return truthy ? renderString(body, variables, escape, warnings) : "";
    },
  );

  // 3. Process {{variable|default}} and {{variable}}
  result = result.replace(
    /\{\{([\w.]+?)(?:\|([^}]*))?\}\}/g,
    (_match, name: string, defaultVal?: string) => {
      const val = resolveValue(name, variables);
      let resolved: string;
      if (val !== undefined && val !== null) {
        resolved = String(val);
      } else if (defaultVal !== undefined) {
        resolved = defaultVal;
        warnings.push(
          `Variable "${name}" not provided — using default "${defaultVal}"`,
        );
      } else {
        warnings.push(
          `Variable "${name}" not provided and has no default — left empty`,
        );
        return "";
      }
      return escape ? escapeHtml(resolved) : resolved;
    },
  );

  return result;
}

/**
 * Validate that all required variables are provided.
 * Returns an array of missing variable names.
 */
export function validateRequiredVariables(
  variableDefs: TemplateVariable[],
  provided: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const v of variableDefs) {
    if (v.required && !(v.name in provided)) {
      missing.push(v.name);
    }
  }
  return missing;
}

/**
 * Render a template with the given variables.
 *
 * @param template - Object with subject, htmlBody, textBody, and variables definitions
 * @param variables - Key-value pairs for substitution
 * @returns Rendered subject, html, text, and any warnings
 */
export function renderTemplate(
  template: {
    subject: string;
    htmlBody: string | null;
    textBody: string | null;
    variables: TemplateVariable[];
  },
  variables: Record<string, unknown>,
): RenderResult {
  const warnings: string[] = [];

  // Check for missing required variables
  const missing = validateRequiredVariables(template.variables, variables);
  if (missing.length > 0) {
    warnings.push(
      `Missing required variables: ${missing.join(", ")}`,
    );
  }

  // Render subject (no HTML escaping in subject)
  const subject = renderString(template.subject, variables, false, warnings);

  // Render HTML body (with HTML escaping for XSS safety)
  const html = template.htmlBody
    ? renderString(template.htmlBody, variables, true, warnings)
    : null;

  // Render text body (no HTML escaping)
  const text = template.textBody
    ? renderString(template.textBody, variables, false, warnings)
    : null;

  return { subject, html, text, warnings };
}

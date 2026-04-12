import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { ZodSchema, ZodError } from "zod";

function formatZodError(error: ZodError): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

/**
 * Validate JSON request body against a Zod schema.
 * Parsed data is stored in c.req.validatedData.
 */
export function validateBody<T extends ZodSchema>(schema: T) {
  return createMiddleware(async (c, next) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Invalid JSON in request body",
            code: "invalid_json",
          },
        },
        400,
      );
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Request validation failed",
            code: "invalid_request",
            details: formatZodError(result.error),
          },
        },
        422,
      );
    }

    c.set("validatedBody" as never, result.data as never);
    await next();
    return;
  });
}

/**
 * Validate query parameters against a Zod schema.
 */
export function validateQuery<T extends ZodSchema>(schema: T) {
  return createMiddleware(async (c, next) => {
    const query = c.req.query();
    const result = schema.safeParse(query);

    if (!result.success) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Invalid query parameters",
            code: "invalid_query",
            details: formatZodError(result.error),
          },
        },
        422,
      );
    }

    c.set("validatedQuery" as never, result.data as never);
    await next();
    return;
  });
}

/**
 * Validate route parameters against a Zod schema.
 */
export function validateParams<T extends ZodSchema>(schema: T) {
  return createMiddleware(async (c, next) => {
    const params = c.req.param();
    const result = schema.safeParse(params);

    if (!result.success) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Invalid path parameters",
            code: "invalid_params",
            details: formatZodError(result.error),
          },
        },
        422,
      );
    }

    c.set("validatedParams" as never, result.data as never);
    await next();
    return;
  });
}

/**
 * Helper to retrieve validated data from context.
 */
export function getValidatedBody<T>(c: Context): T {
  return c.get("validatedBody" as never) as T;
}

export function getValidatedQuery<T>(c: Context): T {
  return c.get("validatedQuery" as never) as T;
}

export function getValidatedParams<T>(c: Context): T {
  return c.get("validatedParams" as never) as T;
}

/**
 * A discriminated union for type-safe error handling without exceptions.
 *
 * Usage:
 *   const result = ok(42);
 *   if (result.ok) {
 *     console.log(result.value); // 42
 *   }
 *
 *   const err = error(new Error("oops"));
 *   if (!err.ok) {
 *     console.log(err.error.message); // "oops"
 *   }
 */
/** Create a successful result. */
export function ok(value) {
    return { ok: true, value };
}
/** Create a failed result. */
export function err(error) {
    return { ok: false, error };
}
/**
 * Map the value inside an Ok result, passing Err through unchanged.
 *
 *   map(ok(2), n => n * 3)       // ok(6)
 *   map(err("no"), n => n * 3)   // err("no")
 */
export function map(result, fn) {
    return result.ok ? ok(fn(result.value)) : result;
}
/**
 * Map the error inside an Err result, passing Ok through unchanged.
 *
 *   mapErr(err("oops"), e => new Error(e))  // err(Error("oops"))
 *   mapErr(ok(1), e => new Error(e))        // ok(1)
 */
export function mapErr(result, fn) {
    return result.ok ? result : err(fn(result.error));
}
/**
 * Chain a Result-returning function onto an Ok value (flatMap).
 *
 *   andThen(ok(2), n => ok(n * 3))              // ok(6)
 *   andThen(ok(2), n => err("fail"))             // err("fail")
 *   andThen(err("no"), n => ok(n * 3))           // err("no")
 */
export function andThen(result, fn) {
    return result.ok ? fn(result.value) : result;
}
/**
 * Unwrap an Ok value or return a default.
 *
 *   unwrapOr(ok(5), 0)      // 5
 *   unwrapOr(err("no"), 0)  // 0
 */
export function unwrapOr(result, defaultValue) {
    return result.ok ? result.value : defaultValue;
}
/**
 * Unwrap an Ok value or compute a default from the error.
 *
 *   unwrapOrElse(err("no"), e => e.length)  // 2
 */
export function unwrapOrElse(result, fn) {
    return result.ok ? result.value : fn(result.error);
}
/**
 * Unwrap an Ok value or throw the error.
 * Use sparingly -- prefer pattern matching or map/andThen.
 */
export function unwrap(result) {
    if (result.ok)
        return result.value;
    throw result.error instanceof Error
        ? result.error
        : new Error(String(result.error));
}
/**
 * Collect an array of Results into a Result of an array.
 * Short-circuits on the first Err.
 *
 *   collect([ok(1), ok(2), ok(3)])     // ok([1, 2, 3])
 *   collect([ok(1), err("x"), ok(3)])  // err("x")
 */
export function collect(results) {
    const values = [];
    for (const result of results) {
        if (!result.ok)
            return result;
        values.push(result.value);
    }
    return ok(values);
}
/**
 * Wrap a promise into a Result, catching rejections as Err.
 *
 *   const r = await fromPromise(fetch("/api"));
 *   if (!r.ok) console.error(r.error);
 */
export async function fromPromise(promise) {
    try {
        return ok(await promise);
    }
    catch (e) {
        return err(e instanceof Error ? e : new Error(String(e)));
    }
}
/**
 * Wrap a synchronous function call into a Result.
 *
 *   const r = fromThrowable(() => JSON.parse(input));
 */
export function fromThrowable(fn) {
    try {
        return ok(fn());
    }
    catch (e) {
        return err(e instanceof Error ? e : new Error(String(e)));
    }
}
//# sourceMappingURL=result.js.map
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
/** Successful result containing a value. */
export interface Ok<T> {
    readonly ok: true;
    readonly value: T;
}
/** Failed result containing an error. */
export interface Err<E> {
    readonly ok: false;
    readonly error: E;
}
/** A Result is either Ok<T> or Err<E>. */
export type Result<T, E = Error> = Ok<T> | Err<E>;
/** Create a successful result. */
export declare function ok<T>(value: T): Ok<T>;
/** Create a failed result. */
export declare function err<E>(error: E): Err<E>;
/**
 * Map the value inside an Ok result, passing Err through unchanged.
 *
 *   map(ok(2), n => n * 3)       // ok(6)
 *   map(err("no"), n => n * 3)   // err("no")
 */
export declare function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E>;
/**
 * Map the error inside an Err result, passing Ok through unchanged.
 *
 *   mapErr(err("oops"), e => new Error(e))  // err(Error("oops"))
 *   mapErr(ok(1), e => new Error(e))        // ok(1)
 */
export declare function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F>;
/**
 * Chain a Result-returning function onto an Ok value (flatMap).
 *
 *   andThen(ok(2), n => ok(n * 3))              // ok(6)
 *   andThen(ok(2), n => err("fail"))             // err("fail")
 *   andThen(err("no"), n => ok(n * 3))           // err("no")
 */
export declare function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E>;
/**
 * Unwrap an Ok value or return a default.
 *
 *   unwrapOr(ok(5), 0)      // 5
 *   unwrapOr(err("no"), 0)  // 0
 */
export declare function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T;
/**
 * Unwrap an Ok value or compute a default from the error.
 *
 *   unwrapOrElse(err("no"), e => e.length)  // 2
 */
export declare function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T;
/**
 * Unwrap an Ok value or throw the error.
 * Use sparingly -- prefer pattern matching or map/andThen.
 */
export declare function unwrap<T, E>(result: Result<T, E>): T;
/**
 * Collect an array of Results into a Result of an array.
 * Short-circuits on the first Err.
 *
 *   collect([ok(1), ok(2), ok(3)])     // ok([1, 2, 3])
 *   collect([ok(1), err("x"), ok(3)])  // err("x")
 */
export declare function collect<T, E>(results: readonly Result<T, E>[]): Result<T[], E>;
/**
 * Wrap a promise into a Result, catching rejections as Err.
 *
 *   const r = await fromPromise(fetch("/api"));
 *   if (!r.ok) console.error(r.error);
 */
export declare function fromPromise<T>(promise: Promise<T>): Promise<Result<T, Error>>;
/**
 * Wrap a synchronous function call into a Result.
 *
 *   const r = fromThrowable(() => JSON.parse(input));
 */
export declare function fromThrowable<T>(fn: () => T): Result<T, Error>;
//# sourceMappingURL=result.d.ts.map
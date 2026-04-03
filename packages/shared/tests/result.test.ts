import { describe, it, expect } from "bun:test";
import {
  ok,
  err,
  map,
  mapErr,
  andThen,
  unwrapOr,
  unwrapOrElse,
  unwrap,
  collect,
  fromPromise,
  fromThrowable,
} from "../src/utils/result.js";
import type { Result } from "../src/utils/result.js";

describe("ok", () => {
  it("should create a successful result with the given value", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
  });

  it("should work with complex objects", () => {
    const data = { name: "test", items: [1, 2, 3] };
    const result = ok(data);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual(data);
  });

  it("should work with null and undefined values", () => {
    expect(ok(null).value).toBe(null);
    expect(ok(undefined).value).toBe(undefined);
  });
});

describe("err", () => {
  it("should create a failed result with the given error", () => {
    const result = err(new Error("oops"));
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe("oops");
  });

  it("should work with string errors", () => {
    const result = err("something went wrong");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("something went wrong");
  });
});

describe("map", () => {
  it("should transform the value inside an Ok result", () => {
    const result = map(ok(2), (n) => n * 3);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(6);
  });

  it("should pass Err through unchanged", () => {
    const original = err("no");
    const result = map(original, (n: number) => n * 3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no");
  });
});

describe("mapErr", () => {
  it("should transform the error inside an Err result", () => {
    const result = mapErr(err("oops"), (e) => new Error(e));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("oops");
  });

  it("should pass Ok through unchanged", () => {
    const result = mapErr(ok(1), (e: string) => new Error(e));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(1);
  });
});

describe("andThen", () => {
  it("should chain on Ok values", () => {
    const result = andThen(ok(2), (n) => ok(n * 3));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(6);
  });

  it("should short-circuit on the inner function returning Err", () => {
    const result = andThen(ok(2), (_n) => err("fail"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("fail");
  });

  it("should pass Err through without calling the function", () => {
    const result = andThen(err("no") as Result<number, string>, (n) => ok(n * 3));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no");
  });
});

describe("unwrapOr", () => {
  it("should return the value for Ok", () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
  });

  it("should return the default for Err", () => {
    expect(unwrapOr(err("no"), 0)).toBe(0);
  });
});

describe("unwrapOrElse", () => {
  it("should return the value for Ok", () => {
    expect(unwrapOrElse(ok(5), () => 0)).toBe(5);
  });

  it("should compute the default from the error for Err", () => {
    expect(unwrapOrElse(err("no"), (e) => e.length)).toBe(2);
  });
});

describe("unwrap", () => {
  it("should return the value for Ok", () => {
    expect(unwrap(ok(42))).toBe(42);
  });

  it("should throw for Err with an Error value", () => {
    expect(() => unwrap(err(new Error("bad")))).toThrow("bad");
  });

  it("should throw a wrapped Error for Err with a non-Error value", () => {
    expect(() => unwrap(err("string error"))).toThrow("string error");
  });
});

describe("collect", () => {
  it("should collect all Ok values into an array", () => {
    const result = collect([ok(1), ok(2), ok(3)]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([1, 2, 3]);
  });

  it("should short-circuit on the first Err", () => {
    const result = collect([ok(1), err("x"), ok(3)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("x");
  });

  it("should return Ok with empty array for empty input", () => {
    const result = collect([]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });
});

describe("fromPromise", () => {
  it("should wrap a resolved promise as Ok", async () => {
    const result = await fromPromise(Promise.resolve(42));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it("should wrap a rejected promise as Err", async () => {
    const result = await fromPromise(Promise.reject(new Error("fail")));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("fail");
  });

  it("should wrap non-Error rejections as Error", async () => {
    const result = await fromPromise(Promise.reject("string rejection"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Error);
  });
});

describe("fromThrowable", () => {
  it("should wrap a successful call as Ok", () => {
    const result = fromThrowable(() => JSON.parse('{"a":1}'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it("should wrap a throwing call as Err", () => {
    const result = fromThrowable(() => JSON.parse("not json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Error);
  });
});

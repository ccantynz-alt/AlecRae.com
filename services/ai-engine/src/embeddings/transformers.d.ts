/**
 * Ambient module declaration for @huggingface/transformers.
 *
 * This package is an OPTIONAL dependency — used only when the client
 * or server explicitly opts into local (on-device) embedding inference.
 * The declaration allows TypeScript to compile without the package installed.
 * The actual import is always dynamic (`await import(...)`).
 */
declare module "@huggingface/transformers" {
  export function pipeline(
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ): Promise<(input: string | string[], options?: Record<string, unknown>) => Promise<{
    tolist(): number[][][];
    data: Float32Array;
    dims: number[];
  }>>;
}

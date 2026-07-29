import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "no-throw-literal": "error",
    },
  },
  {
    // Redis connections come from apps/api/src/lib/redis.ts and nowhere else.
    //
    // Eight modules each grew their own client by copy-paste — four with no way
    // to close what they opened — because nothing stopped them. A convention
    // would have been just as skippable as the last one. Type imports stay
    // allowed: annotations need them and a type import cannot open a socket.
    //
    // BullMQ is unaffected. It takes a `{ url }` object and builds its own
    // clients, which it must: Workers issue blocking reads and it requires
    // `maxRetriesPerRequest: null`, contradicting the shared client's settings.
    files: ["apps/api/src/**/*.ts"],
    ignores: ["apps/api/src/lib/redis.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "ioredis",
              allowTypeImports: true,
              message:
                "Use getRedis() from lib/redis.js — it is shared, readiness-gated and closed at shutdown. " +
                "For a connection that genuinely cannot be shared (pub/sub, blocking read, interactive " +
                "transaction) use createDedicatedRedis() so it is still registered and closed.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/*.d.ts",
      "**/*.js",
      "!eslint.config.js",
    ],
  },
);

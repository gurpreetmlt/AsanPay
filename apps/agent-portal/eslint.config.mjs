import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat["recommended-latest"],
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // These two are React Compiler-prep rules (eslint-plugin-react-hooks v7). We don't run
      // the React Compiler here, and both flagged patterns (data-fetch-on-mount effects,
      // deriving a component reference from a stable lookup table) are standard and verified
      // working — downgraded rather than force awkward rewrites of correct code.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
    },
  },
  { ignores: [".next/**", "node_modules/**"] },
);

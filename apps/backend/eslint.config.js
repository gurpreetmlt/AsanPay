import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Ledger import boundary. Express has no DI container to enforce this, so the lint rule
    // is what stands between a feature module and a direct balance write. Only core/ledger
    // may touch the ledger tables; everything else goes through postJournal().
    files: ["src/modules/**/*.ts", "src/middleware/**/*.ts", "src/utils/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/schema/ledger", "**/schema/ledger.ts"],
              message:
                "Write money only through core/ledger.postJournal(). Importing the ledger tables directly bypasses the flow matrix, the balance projection and the sum-zero assert.",
            },
          ],
        },
      ],
    },
  },
  {
    // The reconciliation module reads the ledger to detect drift. It reports and never writes,
    // so it is allowed to query the tables — corrections still go through postJournal() as
    // RECON_ADJUSTMENT journals.
    files: ["src/modules/reconciliation/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    ignores: ["dist/**", "node_modules/**", "src/db/postgres/migrations/**"],
  },
);

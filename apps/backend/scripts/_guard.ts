/**
 * Test-data scripts mint wallet money and fake transactions. They must never run against the
 * production database. Staging that runs NODE_ENV=production can opt in per run with
 * ALLOW_TEST_SCRIPTS=true.
 */
export function refuseInProduction(scriptName: string): void {
  const prod = process.env.NODE_ENV === "production" || process.env.STRICT_PRODUCTION === "true";
  const optIn = process.env.ALLOW_TEST_SCRIPTS === "true" && process.env.STRICT_PRODUCTION !== "true";
  if (prod && !optIn) {
    console.error(
      `${scriptName} creates test data (fake money / transactions) and is blocked in production. ` +
        "On a staging server only, run it with ALLOW_TEST_SCRIPTS=true.",
    );
    process.exit(1);
  }
}

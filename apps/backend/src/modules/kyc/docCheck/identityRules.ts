/** Pure "is this someone else's card?" rule for KYC photo checks (no I/O — unit tested). */

type RuleItem = { id: string; status: "pass" | "flag" | "fail" | "skip"; detail?: string; score?: number };

/** Name score below this together with a DOB mismatch = a different person (red), not a misread. */
export const DIFFERENT_PERSON_NAME_MAX = 50;

/**
 * Turn amber into red when the card clearly belongs to someone else. One soft mismatch stays amber
 * (OCR can misread a digit or a name); two independent mismatches are treated as confirmed:
 *  - name < 50 % AND date of birth differs
 *  - card number differs AND (name < 80 % OR date of birth differs)
 */
export function escalateDifferentPerson(checks: RuleItem[], docName: string, numberMismatch: boolean): void {
  const name = checks.find((c) => c.id === "name" && c.status === "flag");
  const dob = checks.find((c) => c.id === "dob" && c.status === "flag");
  const nameFar = name != null && (name.score ?? 100) < DIFFERENT_PERSON_NAME_MAX;
  const confirmed = (nameFar && dob != null) || (numberMismatch && (name != null || dob != null));
  if (!confirmed) return;
  const fields = [numberMismatch ? "number" : null, name ? "name" : null, dob ? "date of birth" : null]
    .filter(Boolean)
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");
  const detail = `This ${docName} belongs to someone else — the ${fields} don't match your details. Upload a photo of your own ${docName}.`;
  for (const c of checks) {
    if (c.status !== "flag") continue;
    if (c.id === "name" || c.id === "dob" || c.id === "aadhaarNumber" || c.id === "panNumber") {
      c.status = "fail";
      c.detail = detail;
    }
  }
}

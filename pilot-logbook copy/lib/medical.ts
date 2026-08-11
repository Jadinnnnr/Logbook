import type { Medical } from "./db";

/**
 * Medical certificate durations under 14 CFR 61.23(d).
 *
 * A medical doesn't simply expire — it steps down through privilege levels. A
 * first-class certificate stops supporting ATP operations after 6 or 12 months
 * but remains valid for commercial operations to 12 months and for private
 * operations to 24 or 60 months. Each duration runs to the end of the last day
 * of the Nth month AFTER the month of the examination, and the 6/24/60-month
 * figures depend on whether the airman had reached their 40th birthday on or
 * before the date of the exam.
 */

export interface PrivilegeTier {
  label: string;
  scope: string;
  expires: string;
  daysLeft: number;
  valid: boolean;
  /** Per-row signal: a tier close to lapsing flags itself without changing the
   *  card's overall state, which tracks the last tier to go. */
  state: "good" | "warning" | "lapsed";
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** End of the last day of the Nth month after the month of `dateStr`. */
export function endOfNthMonthAfter(dateStr: string, months: number): Date {
  const d = new Date(dateStr + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + months + 1, 0, 23, 59, 59);
}

/** Whether the airman had reached their 40th birthday on or before the exam. */
export function reached40ByExam(dob: string, examDate: string): boolean {
  const b = new Date(dob + "T00:00:00");
  const fortieth = new Date(b.getFullYear() + 40, b.getMonth(), b.getDate());
  return new Date(examDate + "T00:00:00").getTime() >= fortieth.getTime();
}

const ATP_SCOPE = "Operations requiring an airline transport pilot certificate";
const COMMERCIAL_SCOPE = "Operations requiring a commercial pilot or ATC tower operator certificate";
const PRIVATE_LABEL = "Private / Recreational / Student / Sport / CFI";
const PRIVATE_SCOPE =
  "Operations requiring a private, recreational, student, or sport pilot certificate, or a flight instructor certificate";

/**
 * The privilege tiers a medical still supports, longest-lived last. Returns
 * null when the tiers can't be derived — no exam date, no date of birth, or a
 * class without statutory tiers (BasicMed, unspecified).
 */
export function medicalPrivileges(
  medical: Pick<Medical, "medical_class" | "exam_date">,
  dateOfBirth: string | null,
  now = new Date()
): PrivilegeTier[] | null {
  if (!medical.exam_date || !dateOfBirth) return null;
  const over40 = reached40ByExam(dateOfBirth, medical.exam_date);
  const lower = over40 ? 24 : 60;

  let specs: [string, string, number][];
  switch (medical.medical_class) {
    case "First class":
      specs = [
        ["ATP / First Class", ATP_SCOPE, over40 ? 6 : 12],
        ["Commercial", COMMERCIAL_SCOPE, 12],
        [PRIVATE_LABEL, PRIVATE_SCOPE, lower],
      ];
      break;
    case "Second class":
      specs = [
        ["Commercial", COMMERCIAL_SCOPE, 12],
        [PRIVATE_LABEL, PRIVATE_SCOPE, lower],
      ];
      break;
    case "Third class":
      specs = [[PRIVATE_LABEL, PRIVATE_SCOPE, lower]];
      break;
    default:
      return null; // BasicMed and "Unspecified" have no 61.23(d) tier ladder.
  }

  return specs.map(([label, scope, months]) => {
    const expires = endOfNthMonthAfter(medical.exam_date, months);
    const daysLeft = Math.floor((expires.getTime() - now.getTime()) / 86400000);
    const valid = daysLeft >= 0;
    return {
      label,
      scope,
      expires: fmtDate(expires),
      daysLeft,
      valid,
      state: !valid ? "lapsed" : daysLeft <= 60 ? "warning" : "good",
    };
  });
}

/** The date a medical stops being valid for anything. */
export function finalExpiry(
  medical: Pick<Medical, "medical_class" | "exam_date" | "expires_date">,
  dateOfBirth: string | null
): string | null {
  const tiers = medicalPrivileges(medical, dateOfBirth);
  if (tiers && tiers.length > 0) return tiers[tiers.length - 1].expires;
  return medical.expires_date || null;
}

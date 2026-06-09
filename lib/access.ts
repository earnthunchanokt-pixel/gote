const encoder = new TextEncoder();

export const SUMMARY_COOKIE_NAME = "gote_summary_access";

export function getSummaryPassword() {
  return process.env.APP_SUMMARY_PASSWORD?.trim() || process.env.APP_ACCESS_PASSWORD?.trim() || "";
}

export function isSummaryProtectionEnabled() {
  return getSummaryPassword().length > 0;
}

export async function createSummaryToken(password: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`gote-summary:${password}`));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function getExpectedSummaryToken() {
  const password = getSummaryPassword();
  if (!password) {
    return "";
  }

  return createSummaryToken(password);
}

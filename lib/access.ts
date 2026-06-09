const encoder = new TextEncoder();

export const ACCESS_COOKIE_NAME = "gote_access";

export function getAccessPassword() {
  return process.env.APP_ACCESS_PASSWORD?.trim() ?? "";
}

export function isAccessProtectionEnabled() {
  return getAccessPassword().length > 0;
}

export async function createAccessToken(password: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`gote-access:${password}`));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function getExpectedAccessToken() {
  const password = getAccessPassword();
  if (!password) {
    return "";
  }

  return createAccessToken(password);
}

import { createHash } from "node:crypto";
export function sessionToken(cookie = "") {
  return cookie
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("darecade_session="))
    ?.slice(17);
}
export function sessionKey(cookie) {
  return createHash("sha256")
    .update(sessionToken(cookie) || "")
    .digest("hex");
}

// Top-10k common passwords (§9), loaded once at startup for O(1) lookup.
// Source: SecLists Common-Credentials/10k-most-common.txt (public domain word list).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("./common-passwords.txt", import.meta.url));
const COMMON_PASSWORDS = new Set(
  readFileSync(path, "utf8").split("\n").map((line) => line.trim()).filter(Boolean)
);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password);
}

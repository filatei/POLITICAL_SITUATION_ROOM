import { randomInt } from "crypto";

// Human-friendly invite codes: no ambiguous chars (0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function inviteCode(prefix = "OND"): string {
  let body = "";
  for (let i = 0; i < 5; i++) body += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${body}`;
}

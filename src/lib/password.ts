import { randomBytes } from "node:crypto"

// Generates a strong, human-shareable temporary password for HR-provisioned
// accounts. Format like "Wp-7f3k9q2m-X4" — easy to copy/paste, well above
// Supabase's minimum policy. Server-side only.
export function generateTempPassword(): string {
  const lower = "abcdefghijkmnpqrstuvwxyz23456789" // no ambiguous chars (l,o,0,1)
  const bytes = randomBytes(10)
  let core = ""
  for (let i = 0; i < 8; i++) core += lower[bytes[i] % lower.length]
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const tail = upper[bytes[8] % upper.length] + String(bytes[9] % 10)
  return `Wp-${core}-${tail}`
}

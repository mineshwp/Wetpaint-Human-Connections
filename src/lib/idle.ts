/** Inactivity auto-logout: 15 minutes, with a 1-minute warning in the browser. */
export const IDLE_LIMIT_MS = 15 * 60 * 1000
export const IDLE_WARNING_MS = 60 * 1000
/** Server-side "last real activity" cookie (epoch ms), checked in middleware. */
export const ACTIVITY_COOKIE = "hc_last_active"

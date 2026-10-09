/**
 * Tell the server about a failure the browser saw, so it appears in HR's
 * Logs → Errors tab. Fire-and-forget; never throws. Send the error text only,
 * never what the person typed.
 */
export function reportError(e: {
  message: string
  route?: string
  method?: string
  status?: number | null
  section?: string
  target?: string
  detail?: string
}) {
  try {
    void fetch("/api/errors/report", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(e), keepalive: true,
    }).catch(() => {})
  } catch {}
}

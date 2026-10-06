import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = "Human Connections <no-reply@wetpaint.co.za>"

export async function sendAdminGrantedEmail(to: string, name: string) {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping admin notification email")
    return
  }
  await resend.emails.send({
    from: FROM,
    to,
    subject: "You now have Admin access — Human Connections",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <p style="font-size:15px;color:#111">Hi ${name},</p>
        <p style="font-size:15px;color:#333;line-height:1.6">
          You have been granted <strong>HR / Admin</strong> access on the
          Wetpaint Human Connections platform.
        </p>
        <p style="font-size:15px;color:#333;line-height:1.6">
          If you don't have a password yet, go to the login page and click
          <strong>Forgot password</strong> to set one up.
        </p>
        <p style="margin-top:32px;font-size:13px;color:#888">
          — Wetpaint Human Connections
        </p>
      </div>
    `,
  })
}

export async function sendKpiScoringInviteEmail(opts: {
  to: string
  inviteeName: string
  subjectName: string
  period: string
  url: string
}): Promise<boolean> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping KPI scoring invite email")
    return false
  }
  const { to, inviteeName, subjectName, period, url } = opts
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `Please score ${subjectName}'s ${period} KPI review`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <p style="font-size:15px;color:#111">Hi ${inviteeName},</p>
          <p style="font-size:15px;color:#333;line-height:1.6">
            You've been asked to score <strong>${subjectName}</strong>'s
            <strong>${period}</strong> KPI review on the Wetpaint Human Connections platform.
          </p>
          <p style="font-size:15px;color:#333;line-height:1.6">
            Log in and open the <strong>KPI</strong> page to submit your scores:
          </p>
          <p style="margin:24px 0">
            <a href="${url}" style="background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px">Open Human Connections</a>
          </p>
          <p style="margin-top:32px;font-size:13px;color:#888">
            — Wetpaint Human Connections
          </p>
        </div>
      `,
    })
    return true
  } catch (e) {
    console.error("[email] KPI scoring invite failed:", e)
    return false
  }
}

export async function sendAdminRevokedEmail(to: string, name: string) {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping admin revocation email")
    return
  }
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Your Admin access has been removed — Human Connections",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <p style="font-size:15px;color:#111">Hi ${name},</p>
        <p style="font-size:15px;color:#333;line-height:1.6">
          Your <strong>HR / Admin</strong> access on the Wetpaint Human Connections
          platform has been removed. You now have standard Staff access.
        </p>
        <p style="margin-top:32px;font-size:13px;color:#888">
          — Wetpaint Human Connections
        </p>
      </div>
    `,
  })
}

export async function sendTrainingReminderEmail(opts: {
  to: string
  name: string
  expired: { who: string; what: string; date: string }[]
  expiring: { who: string; what: string; date: string }[]
  url: string
}): Promise<boolean> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping training reminder email")
    return false
  }
  const { to, name, expired, expiring, url } = opts
  const list = (rows: { who: string; what: string; date: string }[]) =>
    rows.map((r) => `<li>${r.who} — ${r.what} (${r.date})</li>`).join("")
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `Training follow-ups: ${expired.length} expired, ${expiring.length} expiring soon`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <p style="font-size:15px;color:#111">Hi ${name},</p>
          ${expired.length ? `<p style="font-size:15px;color:#333"><strong>Expired</strong></p><ul style="font-size:14px;color:#333">${list(expired)}</ul>` : ""}
          ${expiring.length ? `<p style="font-size:15px;color:#333"><strong>Expiring in the next 30 days</strong></p><ul style="font-size:14px;color:#333">${list(expiring)}</ul>` : ""}
          <p style="margin:24px 0">
            <a href="${url}" style="background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px">Open the training tracker</a>
          </p>
          <p style="margin-top:32px;font-size:13px;color:#888">— Wetpaint Human Connections</p>
        </div>
      `,
    })
    return true
  } catch (e) {
    console.error("[email] training reminder failed:", e)
    return false
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Tells HR a staff member asked for a password reset, so they can set a new temp password. */
export async function sendPasswordResetRequestEmail(opts: {
  to: string[]
  staffName: string
  staffEmail: string
  url: string
}): Promise<boolean> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping password reset request email")
    return false
  }
  if (opts.to.length === 0) return false
  const staffName = esc(opts.staffName)
  const staffEmail = esc(opts.staffEmail)
  try {
    await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: `Password reset requested: ${opts.staffName}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <p style="font-size:15px;color:#333;line-height:1.6">
            <strong>${staffName}</strong> (${staffEmail}) has asked for a password reset on the
            Wetpaint Human Connections platform.
          </p>
          <p style="font-size:15px;color:#333;line-height:1.6">
            Open their profile, set a new temporary password in the <strong>Portal login</strong>
            card, and email it to them.
          </p>
          <p style="margin:24px 0">
            <a href="${opts.url}" style="background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px">Open ${staffName}'s profile</a>
          </p>
          <p style="font-size:13px;color:#888">If this wasn't expected, you can ignore this email.</p>
          <p style="margin-top:32px;font-size:13px;color:#888">— Wetpaint Human Connections</p>
        </div>
      `,
    })
    return true
  } catch (e) {
    console.error("[email] password reset request failed:", e)
    return false
  }
}

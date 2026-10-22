import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
// Set EMAIL_FROM once the sending domain is verified in Resend.
const FROM = process.env.EMAIL_FROM ?? "Human Connections <no-reply@wetpaint.co.za>"

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

/** Tells HR that someone reported a problem or shared an idea (details are on /feedback). */
export async function sendFeedbackEmail(opts: {
  to: string[]
  kind: "problem" | "idea"
  title: string
  description: string
  submitterName: string
  attachments: number
  url: string
}): Promise<boolean> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping feedback email")
    return false
  }
  if (opts.to.length === 0) return false
  const isProblem = opts.kind === "problem"
  const preview = opts.description.length > 400 ? `${opts.description.slice(0, 400)}…` : opts.description
  try {
    await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: `${isProblem ? "Problem reported" : "New idea"}: ${opts.title}`.slice(0, 150),
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <p style="font-size:15px;color:#333;line-height:1.6">
            <strong>${esc(opts.submitterName)}</strong> ${isProblem ? "reported a problem" : "shared an idea"} on Human Connections.
          </p>
          <p style="font-size:16px;color:#111;font-weight:600;margin:16px 0 4px">${esc(opts.title)}</p>
          <p style="font-size:14px;color:#444;line-height:1.6;white-space:pre-wrap;margin:0">${esc(preview)}</p>
          ${opts.attachments > 0 ? `<p style="font-size:13px;color:#888">${opts.attachments} image${opts.attachments === 1 ? "" : "s"} attached</p>` : ""}
          <p style="margin:24px 0">
            <a href="${opts.url}" style="background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px">Open in Feedback</a>
          </p>
          <p style="margin-top:32px;font-size:13px;color:#888">— Wetpaint Human Connections</p>
        </div>
      `,
    })
    return true
  } catch (e) {
    console.error("[email] feedback notification failed:", e)
    return false
  }
}

/** A reply in a problem-report / idea conversation, or HR changing its status, emailed to the other side. */
export async function sendFeedbackReplyEmail(opts: {
  to: string[]
  /** Who the email is for: the person who sent it ("person") or HR ("hr"). */
  audience: "person" | "hr"
  itemTitle: string
  kind: "problem" | "idea"
  /** The reply text, or null when only the status changed. */
  message: string | null
  statusLabel: string | null
  fromName: string
  url: string
}): Promise<boolean> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping feedback reply email")
    return false
  }
  if (opts.to.length === 0) return false
  const what = opts.kind === "problem" ? "problem report" : "idea"
  const intro = opts.audience === "person"
    ? opts.message
      ? `<strong>${esc(opts.fromName)}</strong> replied to your ${what}.`
      : `HR updated your ${what}.`
    : `<strong>${esc(opts.fromName)}</strong> replied on their ${what}.`
  try {
    await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: `${opts.audience === "person" ? "Update on your " + what : "Reply on a " + what}: ${opts.itemTitle}`.slice(0, 150),
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <p style="font-size:15px;color:#333;line-height:1.6">${intro}</p>
          <p style="font-size:16px;color:#111;font-weight:600;margin:12px 0 4px">${esc(opts.itemTitle)}</p>
          ${opts.statusLabel ? `<p style="font-size:14px;color:#333;margin:4px 0">Status: <strong>${esc(opts.statusLabel)}</strong></p>` : ""}
          ${opts.message ? `<blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #ddd;color:#444;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(opts.message)}</blockquote>` : ""}
          <p style="margin:24px 0">
            <a href="${opts.url}" style="background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px">${opts.audience === "person" ? "Open My Feedback" : "Open in Feedback"}</a>
          </p>
          <p style="margin-top:32px;font-size:13px;color:#888">— Wetpaint Human Connections</p>
        </div>
      `,
    })
    return true
  } catch (e) {
    console.error("[email] feedback reply failed:", e)
    return false
  }
}

/**
 * "What's New" announcement emailed to staff. Sent in batches of 100 (one
 * separate email per person, so nobody sees anyone else's address).
 * Returns how many were accepted by Resend.
 */
export async function sendAnnouncementEmail(opts: {
  recipients: { email: string; name: string }[]
  title: string
  body: string
  linkUrl: string | null
  url: string
}): Promise<number> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping announcement email")
    return 0
  }
  const paragraphs = opts.body.split(/\n{2,}/).map((p) => `<p style="font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap;margin:0 0 12px">${esc(p)}</p>`).join("")
  let sent = 0
  for (let i = 0; i < opts.recipients.length; i += 100) {
    const chunk = opts.recipients.slice(i, i + 100)
    try {
      const { error } = await resend.batch.send(
        chunk.map((r) => ({
          from: FROM,
          to: [r.email],
          subject: `What's new: ${opts.title}`.slice(0, 150),
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
              <p style="font-size:15px;color:#111">Hi ${esc(r.name)},</p>
              <p style="font-size:17px;color:#111;font-weight:600;margin:12px 0">${esc(opts.title)}</p>
              ${paragraphs}
              <p style="margin:24px 0">
                <a href="${opts.url}" style="background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px">See what's new</a>
                ${opts.linkUrl ? `<a href="${esc(opts.linkUrl)}" style="margin-left:12px;font-size:14px;color:#111">Learn more</a>` : ""}
              </p>
              <p style="margin-top:32px;font-size:13px;color:#888">— Wetpaint Human Connections</p>
            </div>
          `,
        }))
      )
      if (error) console.error("[email] announcement batch failed:", error)
      else sent += chunk.length
    } catch (e) {
      console.error("[email] announcement batch failed:", e)
    }
  }
  return sent
}

/** Digest of staff self-service changes for HR: profile edits (daily) or new training (weekly). */
export async function sendHrDigestEmail(opts: {
  to: string
  name: string
  kind: "profile" | "training"
  items: { who: string; what: string }[]
  url: string
}): Promise<boolean> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping HR digest email")
    return false
  }
  const { to, name, kind, items, url } = opts
  const n = items.length
  const isProfile = kind === "profile"
  const subject = isProfile
    ? `${n} staff profile update${n === 1 ? "" : "s"} — Human Connections`
    : `${n} new training record${n === 1 ? "" : "s"} added by staff — Human Connections`
  const intro = isProfile
    ? "Staff updated these details on their own profiles in the last day. Values aren't included here; open the profile to review."
    : "Staff added these courses to their training records this week."
  const list = items
    .map((r) => `<li>${esc(r.who)} — ${isProfile ? "changed " : ""}${esc(r.what)}</li>`)
    .join("")
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <p style="font-size:15px;color:#111">Hi ${esc(name)},</p>
          <p style="font-size:15px;color:#333;line-height:1.6">${intro}</p>
          <ul style="font-size:14px;color:#333;line-height:1.6">${list}</ul>
          <p style="margin:24px 0">
            <a href="${url}" style="background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px">${isProfile ? "Open Employees" : "Open the training tracker"}</a>
          </p>
          <p style="margin-top:32px;font-size:13px;color:#888">— Wetpaint Human Connections</p>
        </div>
      `,
    })
    return true
  } catch (e) {
    console.error("[email] HR digest failed:", e)
    return false
  }
}

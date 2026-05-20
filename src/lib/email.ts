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

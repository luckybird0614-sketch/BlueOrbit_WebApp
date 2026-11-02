import nodemailer from "nodemailer";

const MAILCHIMP_HOST = "smtp.mandrillapp.com";

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_FROM?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD?.trim());
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/i;

type RequestLike = { get(name: string): string | undefined };

function firstHeader(value: string | undefined): string {
  return (value ?? "").split(",")[0].trim();
}

function requestOrigin(req: RequestLike): string | null {
  const origin = firstHeader(req.get("origin"));
  if (!origin) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  const host = firstHeader(req.get("x-forwarded-host")) || firstHeader(req.get("host"));
  if (!host || parsed.host.toLowerCase() !== host.toLowerCase() || LOCAL_HOST.test(parsed.host)) {
    return null;
  }
  return parsed.origin;
}

export function appUrl(req?: RequestLike): string {
  const configured = (process.env.APP_URL || "").trim().replace(/\/$/, "");
  let configuredIsLocal = !configured;
  if (configured) {
    try {
      configuredIsLocal = LOCAL_HOST.test(new URL(configured).host);
    } catch {
      configuredIsLocal = true;
    }
  }
  if (configured && !configuredIsLocal) {
    return configured;
  }
  const fromRequest = req ? requestOrigin(req) : null;
  return fromRequest ?? (configured || "http://127.0.0.1:5173");
}

function fromAddress(): string {
  const from = process.env.SMTP_FROM!.trim();
  if (from.includes("<")) {
    return from;
  }
  const name = (process.env.SMTP_FROM_NAME || "MedsTemp").trim().replace(/"/g, "");
  return `"${name}" <${from}>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type MailContent = {
  heading: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  footer: string;
};

function renderText(content: MailContent): string {
  return `${content.heading}\n\n${content.intro}\n\n${content.actionLabel}:\n${content.actionUrl}\n\n${content.footer}\n\n— MedsTemp by BlueOrbit`;
}

function renderHtml(content: MailContent): string {
  const url = escapeHtml(content.actionUrl);
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;padding:32px 28px;">
        <tr><td>
          <p style="margin:0 0 4px;font-size:13px;color:#52606d;">MedsTemp by BlueOrbit</p>
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${escapeHtml(content.heading)}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">${escapeHtml(content.intro)}</p>
          <p style="margin:0 0 24px;">
            <a href="${url}" style="display:inline-block;background:#1565c0;color:#ffffff;text-decoration:none;font-size:15px;padding:12px 22px;border-radius:6px;">${escapeHtml(content.actionLabel)}</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#52606d;">If the button does not work, copy this link into your browser:</p>
          <p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${url}" style="color:#1565c0;">${url}</a></p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#52606d;">${escapeHtml(content.footer)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendMail(to: string, subject: string, content: MailContent): Promise<void> {
  if (!mailConfigured()) {
    throw new Error("Email is not configured");
  }
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = port === 465;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || MAILCHIMP_HOST,
    port,
    secure,
    requireTLS: !secure,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASSWORD ?? "",
    },
  });
  try {
    await transporter.sendMail({
      from: fromAddress(),
      replyTo: process.env.SMTP_REPLY_TO?.trim() || undefined,
      to,
      subject,
      text: renderText(content),
      html: renderHtml(content),
    });
  } catch (error) {
    console.error(error);
    throw error;
  }
}

import nodemailer from "nodemailer";

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://127.0.0.1:5173").trim().replace(/\/$/, "");
}

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!mailConfigured()) {
    throw new Error("Email is not configured");
  }
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER?.trim();
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: user ? { user, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
  });
}

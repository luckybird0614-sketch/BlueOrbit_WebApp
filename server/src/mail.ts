import nodemailer from "nodemailer";

const MAILCHIMP_HOST = "smtp.mandrillapp.com";

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_FROM?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD?.trim());
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://127.0.0.1:5173").trim().replace(/\/$/, "");
}

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
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
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
    });  
  } catch (error) {
    console.error(error);
    throw error;
  }
}

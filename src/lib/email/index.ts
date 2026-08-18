/**
 * Email transport — Nodemailer to Mailcow (mail.laratik.com).
 * Wired in Goal 2 (magic-link auth) and Goal 8 (notifications + digests).
 *
 * Goal 0: typed stub so imports resolve. No SMTP connection is made
 * until `sendEmail` is actually called.
 */
import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { serverEnv } from "@/lib/validation/env";

let cached: Transporter | null = null;

export function getMailer(): Transporter | null {
  if (cached) return cached;
  if (!serverEnv.SMTP_HOST || !serverEnv.SMTP_USER) return null;

  cached = nodemailer.createTransport({
    host: serverEnv.SMTP_HOST,
    port: serverEnv.SMTP_PORT,
    secure: serverEnv.SMTP_PORT === 465,
    auth: {
      user: serverEnv.SMTP_USER,
      pass: serverEnv.SMTP_PASSWORD,
    },
  });
  return cached;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string } | null> {
  const mailer = getMailer();
  if (!mailer) {
    console.warn("[email] SMTP not configured, dropping email to", input.to);
    return null;
  }
  const info = await mailer.sendMail({
    from: serverEnv.SMTP_FROM,
    to: Array.isArray(input.to) ? input.to.join(", ") : input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
  });
  return { id: info.messageId };
}

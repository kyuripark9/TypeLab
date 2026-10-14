/* Sending email, for one thing so far: the link that resets a forgotten password. Production sends through an SMTP
   server named by SMTP_URL (smtps://user:password@smtp.example.com:465, as any mail service gives one) from MAIL_FROM;
   without them it offers no reset. Development keeps a stand-in instead, which sends nothing: it logs each message
   and shows the latest at STAND_IN_MAIL_PATH, so a reset can be tried without a mail service. */
import nodemailer from 'nodemailer';

export interface Mail { to: string; subject: string; text: string; html: string }
export interface Mailer { send(mail: Mail): Promise<void> }

/** The mailer the environment sets up, or null when SMTP_URL or MAIL_FROM is missing. */
export function mailerFromEnv(env = process.env): Mailer | null {
  const url = env.SMTP_URL, from = env.MAIL_FROM;
  if (!url || !from) return null;
  const transport = nodemailer.createTransport(url);
  return { async send(m) { await transport.sendMail({ from, ...m }); } };
}

/** Where development shows the stand-in's messages. */
export const STAND_IN_MAIL_PATH = '/dev/mail';

/** Development's stand-in: each message is logged and kept (the last ten), and `page` lists them with their links. */
export function mailStandIn(): Mailer & { sent: Mail[]; page(): string } {
  const sent: Mail[] = [];
  const esc = (t: string) => t.replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`);
  return {
    sent,
    async send(m) {
      sent.unshift(m);
      sent.length = Math.min(sent.length, 10);
      console.log(`Mail (stand-in) to ${m.to}: ${m.subject}\n${m.text}\n(also at ${STAND_IN_MAIL_PATH})`);
    },
    page() {
      const items = sent.map(m => `<article><h2>${esc(m.subject)}</h2><p class="to">To ${esc(m.to)}</p>${m.html}</article>`).join('');
      return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mail sent (stand-in) — TypeLab</title>
<style>body{margin:0;padding:32px 16px;background:#fef5ec;color:#201f1d;font:500 15px/1.5 Manrope,system-ui,sans-serif}main{max-width:560px;margin:0 auto}h1{font-size:20px}article{background:#fdfaf6;box-shadow:0 0 0 1px #e9e1d8;padding:16px 20px;margin:16px 0}h2{font-size:16px;margin:0}.to{color:#504b45;margin:0 0 12px}a{color:inherit;font-weight:700}</style></head>
<body><main><h1>Mail TypeLab sent (development stand-in: nothing left this computer)</h1>${items || '<p>Nothing sent yet.</p>'}</main></body></html>`;
    }
  };
}

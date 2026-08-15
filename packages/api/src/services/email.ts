import { Resend } from 'resend';

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = process.env.RESEND_FROM ?? 'UDT <onboarding@resend.dev>';

const APP_DOWNLOAD_URL = 'https://apps.apple.com/app/udt';

function emailLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UDT</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4">
<tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden">
  <tr><td style="background-color:#1a1a1a;padding:28px 24px;text-align:center">
    <span style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:3px">UDT</span>
    <span style="font-size:14px;color:#e53e3e;display:block;margin-top:4px;letter-spacing:2px;text-transform:uppercase">Ultra DeTour</span>
  </td></tr>
  <tr><td style="padding:32px 24px">
    ${content}
  </td></tr>
  <tr><td style="background-color:#f9f9f9;padding:20px 24px;text-align:center;border-top:1px solid #eee">
    <span style="font-size:12px;color:#999">UDT — Course par equipe</span>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function codeBlock(code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:24px 0">
  <div style="background-color:#1a1a1a;border-radius:10px;padding:20px 32px;display:inline-block">
    <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#e53e3e;font-family:'Courier New',monospace">${code}</span>
  </div>
</td></tr>
</table>`;
}

function downloadButton(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:8px 0 24px">
  <a href="${APP_DOWNLOAD_URL}" style="display:inline-block;background-color:#e53e3e;color:#ffffff;font-weight:700;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.5px">Telecharger l'app UDT</a>
</td></tr>
</table>`;
}

/**
 * Send the access code to all team participants.
 */
export async function sendCodeToTeam(
  participants: { email: string; prenom: string }[],
  code: string,
  equipeNom: string,
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.log(`[Email] Resend not configured — code ${code} for team "${equipeNom}" not sent`);
    return;
  }

  const content = `
<h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a">Ton equipe est inscrite !</h1>
<p style="margin:0 0 20px;font-size:15px;color:#555">Rejoins l'equipe <strong>${equipeNom}</strong> dans l'app UDT.</p>
<p style="font-size:15px;color:#333;margin:0 0 16px;font-weight:600">Pour te connecter :</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:6px 0;font-size:14px;color:#333"><strong style="color:#e53e3e">1.</strong> Telecharge l'app UDT</td></tr>
  <tr><td style="padding:6px 0;font-size:14px;color:#333"><strong style="color:#e53e3e">2.</strong> Entre le code ci-dessous + ton email</td></tr>
</table>
${codeBlock(code)}
${downloadButton()}`;

  for (const p of participants) {
    await resend.emails.send({
      from: FROM,
      to: p.email,
      subject: `UDT — Code d'acces equipe ${equipeNom}`,
      html: emailLayout(content),
    }).catch((err) => console.error(`[Email] Failed to send to ${p.email}:`, err));
  }
}

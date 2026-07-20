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
<title>UDT — Ultra DéTour</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4">
<tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden">
  <!-- Header -->
  <tr><td style="background-color:#1a1a1a;padding:28px 24px;text-align:center">
    <span style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:3px">UDT</span>
    <span style="font-size:14px;color:#e53e3e;display:block;margin-top:4px;letter-spacing:2px;text-transform:uppercase">Ultra DéTour</span>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:32px 24px">
    ${content}
  </td></tr>
  <!-- Footer -->
  <tr><td style="background-color:#f9f9f9;padding:20px 24px;text-align:center;border-top:1px solid #eee">
    <span style="font-size:12px;color:#999">UDT — Ultra DéTour · Course par équipe</span>
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

function infoLine(label: string, value: string): string {
  return `<tr>
  <td style="padding:6px 0;color:#666;font-size:14px">${label}</td>
  <td style="padding:6px 0;font-weight:600;font-size:14px;text-align:right">${value}</td>
</tr>`;
}

function downloadButton(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:8px 0 24px">
  <a href="${APP_DOWNLOAD_URL}" style="display:inline-block;background-color:#e53e3e;color:#ffffff;font-weight:700;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.5px">Télécharger l'app UDT</a>
</td></tr>
</table>`;
}

export async function sendConfirmationEmail(opts: {
  email: string;
  nom_equipe: string;
  code_acces: string;
  emails_membres?: string[];
  nom_format?: string;
  date_course?: Date;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const dateStr = opts.date_course
    ? opts.date_course.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const infoRows = [
    infoLine('Équipe', opts.nom_equipe),
    opts.nom_format ? infoLine('Format', opts.nom_format) : '',
    dateStr ? infoLine('Date de la course', dateStr) : '',
  ].join('');

  const infoTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #eee;border-radius:8px;padding:12px 16px">${infoRows}</table>`;

  const steps = `
<p style="font-size:15px;color:#333;margin:0 0 16px;font-weight:600">Pour rejoindre la course :</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:6px 0;font-size:14px;color:#333"><strong style="color:#e53e3e">1.</strong> Télécharge l'app UDT</td></tr>
  <tr><td style="padding:6px 0;font-size:14px;color:#333"><strong style="color:#e53e3e">2.</strong> Ouvre l'app</td></tr>
  <tr><td style="padding:6px 0;font-size:14px;color:#333"><strong style="color:#e53e3e">3.</strong> Entre le code ci-dessous</td></tr>
</table>`;

  // --- Capitaine ---
  const captainContent = `
<h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a">Inscription confirmée 🎉</h1>
<p style="margin:0 0 20px;font-size:15px;color:#555">Ton équipe est prête pour l'Ultra DéTour !</p>
${infoTable}
${steps}
${codeBlock(opts.code_acces)}
${downloadButton()}
<div style="background-color:#fff5f5;border-left:4px solid #e53e3e;border-radius:4px;padding:12px 16px;margin:8px 0 0">
  <p style="margin:0;font-size:14px;color:#333"><strong>Partage ce code avec tes coéquipiers</strong> pour qu'ils rejoignent l'équipe dans l'app.</p>
</div>`;

  await resend.emails.send({
    from: FROM,
    to: opts.email,
    subject: `Inscription confirmée — ${opts.nom_equipe}`,
    html: emailLayout(captainContent),
  });

  // --- Coéquipiers ---
  if (opts.emails_membres?.length) {
    const memberContent = `
<h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a">Tu es invité(e) !</h1>
<p style="margin:0 0 20px;font-size:15px;color:#555">Rejoins l'équipe <strong>${opts.nom_equipe}</strong> pour l'Ultra DéTour.</p>
${infoTable}
${steps}
${codeBlock(opts.code_acces)}
${downloadButton()}`;

    for (const memberEmail of opts.emails_membres) {
      await resend.emails.send({
        from: FROM,
        to: memberEmail,
        subject: `Invitation — équipe ${opts.nom_equipe}`,
        html: emailLayout(memberContent),
      });
    }
  }
}

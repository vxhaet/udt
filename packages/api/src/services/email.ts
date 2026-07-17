import { Resend } from 'resend';

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = process.env.RESEND_FROM ?? 'UDT <onboarding@resend.dev>';

export async function sendConfirmationEmail(opts: {
  email: string;
  nom_equipe: string;
  code_acces: string;
  emails_membres?: string[];
  nom_format?: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const formatLine = opts.nom_format
    ? `<p>Format choisi : <strong>${opts.nom_format}</strong></p>`
    : '';

  const captaineHtml = `
    <p>Votre équipe <strong>${opts.nom_equipe}</strong> est confirmée pour l'Ultra DéTour !</p>
    ${formatLine}
    <p style="font-size:16px">Code d'accès équipe : <strong style="font-size:24px;letter-spacing:4px">${opts.code_acces}</strong></p>
    <p>Partagez ce code avec vos coéquipiers pour qu'ils rejoignent l'équipe dans l'application.</p>
  `;

  await resend.emails.send({
    from: FROM,
    to: opts.email,
    subject: `Inscription confirmée — ${opts.nom_equipe}`,
    html: captaineHtml,
  });

  if (opts.emails_membres?.length) {
    const memberHtml = `
      <p>Vous avez été invité(e) à rejoindre l'équipe <strong>${opts.nom_equipe}</strong> pour l'Ultra DéTour !</p>
      ${formatLine}
      <p style="font-size:16px">Code d'accès équipe : <strong style="font-size:24px;letter-spacing:4px">${opts.code_acces}</strong></p>
      <p>Utilisez ce code dans l'application UDT pour rejoindre l'équipe.</p>
    `;
    for (const memberEmail of opts.emails_membres) {
      await resend.emails.send({
        from: FROM,
        to: memberEmail,
        subject: `Invitation — équipe ${opts.nom_equipe}`,
        html: memberHtml,
      });
    }
  }
}

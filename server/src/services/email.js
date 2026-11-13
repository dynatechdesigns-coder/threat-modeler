// Sends email through Brevo's web API (plain fetch, no extra packages).
// Setup: create a free Brevo account, verify one sender address (Senders & IP), make an API key, then set
// BREVO_API_KEY and EMAIL_FROM on the server. Without them every email feature quietly turns itself off.

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export const isConfigured = (config) => Boolean(config?.brevoApiKey && config?.emailFrom);

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class EmailError extends Error {}

export async function sendEmail({ to, subject, text, html }, { fetchImpl = globalThis.fetch, config } = {}) {
  if (!isConfigured(config)) throw new EmailError('Email is not set up on this server');
  if (!/^\S+@\S+\.\S+$/.test(String(to))) throw new EmailError('Invalid recipient');

  let res;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'api-key': config.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: config.emailFromName, email: config.emailFrom },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new EmailError('Could not reach the email service');
  }
  if (!res.ok) {
    // The response body is not echoed anywhere, so nothing sensitive can leak into logs or replies.
    throw new EmailError(`The email service refused the message (${res.status})`);
  }
}

// ---- Message templates. Every value placed in HTML is escaped. ------------------------------------------------------

const wrap = (title, bodyHtml, button) => `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:0 auto;padding:24px">
<div style="background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 4px;font-size:13px;color:#0891b2;font-weight:bold">Threat Modeler</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
${bodyHtml}
${button ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#06b6d4;color:#00131a;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px;display:inline-block">${escapeHtml(button.label)}</a></p>
<p style="font-size:12px;color:#64748b;word-break:break-all">If the button does not work, copy this address into your browser:<br>${escapeHtml(button.url)}</p>` : ''}
</div></div></body></html>`;

export function verificationEmail({ name, url }) {
  return {
    subject: 'Confirm your email for Threat Modeler',
    text: `Hi ${name},\n\nConfirm your email address by opening this link (valid for 3 days):\n${url}\n\nIf you did not create an account, you can ignore this email.`,
    html: wrap('Confirm your email', `<p>Hi ${escapeHtml(name)},</p><p>Confirm your email address to finish setting up your account. The link works for 3 days.</p><p style="font-size:13px;color:#64748b">If you did not create an account, you can ignore this email.</p>`, { url, label: 'Confirm email' }),
  };
}

export function resetEmail({ name, url }) {
  return {
    subject: 'Reset your Threat Modeler password',
    text: `Hi ${name},\n\nSomeone asked to reset your password. To choose a new one, open this link (valid for 1 hour):\n${url}\n\nIf this was not you, ignore this email. Your password stays the same.`,
    html: wrap('Reset your password', `<p>Hi ${escapeHtml(name)},</p><p>Someone asked to reset your password. The link works for 1 hour.</p><p style="font-size:13px;color:#64748b">If this was not you, ignore this email. Your password stays the same.</p>`, { url, label: 'Choose a new password' }),
  };
}

export function pushAlertEmail({ name, repo, sha, message, newCount, newSevere, titles, url }) {
  const plural = newCount === 1 ? '' : 's';
  const head = `${newCount} new problem${plural} in ${repo}`;
  const list = (titles || []).map((t) => `- ${t}`).join('\n');
  return {
    subject: `Threat Modeler: ${head}`,
    text: `Hi ${name},\n\nThe push ${String(sha).slice(0, 7)} to ${repo}${message ? ` ("${message}")` : ''} added ${newCount} new problem${plural}${newSevere ? `, ${newSevere} of them serious` : ''}.\n\n${list}\n\nSee the report:\n${url}\n\nTo stop these emails, turn off scan alerts on the Watched repos page.`,
    html: wrap(head, `<p>Hi ${escapeHtml(name)},</p><p>The push <code>${escapeHtml(String(sha).slice(0, 7))}</code>${message ? ` (&ldquo;${escapeHtml(message)}&rdquo;)` : ''} added <b>${newCount}</b> new problem${plural}${newSevere ? `, <b>${newSevere}</b> of them serious` : ''}.</p>${titles?.length ? `<ul style="padding-left:18px">${titles.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : ''}<p style="font-size:13px;color:#64748b">To stop these emails, turn off scan alerts on the Watched repos page.</p>`, { url, label: 'Open the report' }),
  };
}

import nodemailer from 'nodemailer';
import supabase from '../api/db-client.js';

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;
  const fromName = process.env.SMTP_FROM_NAME || 'WtecHR';

  if (!host || !user || !pass || !from) {
    throw new Error(
      'Missing SMTP configuration. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM.'
    );
  }

  return {
    host,
    port,
    user,
    pass,
    from,
    fromName,
  };
}

function createTransporter() {
  const config = getSmtpConfig();

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

export function getAppUrl(path = '/') {
  const baseUrl = (
    process.env.APP_BASE_URL || 'https://hr-system2.vercel.app'
  ).replace(/\/+$/, '');

  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${baseUrl}${cleanPath}`;
}

export function buildEmailTemplate({ title, message, actionLabel, actionUrl }) {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,sans-serif;color:#111827;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:#111827;padding:24px 32px;color:#ffffff;">
                <h1 style="margin:0;font-size:22px;">WtecHR</h1>
                <p style="margin:6px 0 0;color:#d1d5db;font-size:13px;">Human Resource Management Portal</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h2 style="margin:0 0 12px;font-size:20px;color:#111827;">${title}</h2>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;">${message}</p>

                ${
                  actionUrl
                    ? `<a href="${actionUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold;font-size:14px;">${actionLabel || 'Open WtecHR'}</a>`
                    : ''
                }

                <p style="margin:28px 0 0;font-size:12px;color:#6b7280;">
                  If the button does not work, copy and paste this link into your browser:<br />
                  <span style="color:#4f46e5;">${actionUrl || ''}</span>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#f9fafb;color:#6b7280;font-size:12px;">
                This is an automated notification from WtecHR.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

export async function sendEmail({
  employeeId = null,
  to,
  subject,
  html,
  text,
}) {
  if (!to) {
    return {
      ok: false,
      error: 'Missing email recipient.',
    };
  }

  let deliveryId = null;

  try {
    const { data: delivery, error: insertError } = await supabase
      .from('notification_deliveries')
      .insert({
        employee_id: employeeId,
        channel: 'email',
        recipient: to,
        subject,
        status: 'pending',
        provider: 'smtp',
      })
      .select()
      .single();

    if (!insertError && delivery) {
      deliveryId = delivery.id;
    }

    const config = getSmtpConfig();
    const transporter = createTransporter();

    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.from}>`,
      to,
      subject,
      text,
      html,
    });

    if (deliveryId) {
      await supabase
        .from('notification_deliveries')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider: 'smtp',
        })
        .eq('id', deliveryId);
    }

    return {
      ok: true,
      messageId: info.messageId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email.';

    if (deliveryId) {
      await supabase
        .from('notification_deliveries')
        .update({
          status: 'failed',
          error: message,
        })
        .eq('id', deliveryId);
    }

    console.error('Email send error:', message);

    return {
      ok: false,
      error: message,
    };
  }
}

export async function sendNotificationEmail({
  employeeId = null,
  to,
  subject,
  title,
  message,
  link,
  actionLabel = 'Open WtecHR',
}) {
  const actionUrl = link ? getAppUrl(link) : getAppUrl('/');

  const html = buildEmailTemplate({
    title,
    message,
    actionLabel,
    actionUrl,
  });

  const text = `${title}\n\n${message}\n\n${actionUrl}`;

  return sendEmail({
    employeeId,
    to,
    subject,
    html,
    text,
  });
}
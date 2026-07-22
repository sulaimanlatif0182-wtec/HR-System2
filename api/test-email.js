import { sendNotificationEmail } from './lib/email.js';

export default async function handler(req, res) {
  try {
    const to = req.query.to;

    if (!to) {
      return res.status(400).json({
        error: 'Missing ?to=email@example.com',
      });
    }

    const result = await sendNotificationEmail({
      to,
      subject: 'WtecHR test email',
      title: 'WtecHR test email',
      message: 'This is a test email from WtecHR notification system.',
      link: '/',
      actionLabel: 'Open WtecHR',
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to send test email.',
    });
  }
}
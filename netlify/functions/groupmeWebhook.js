// netlify/functions/groupmeWebhook.js
// Commands:
//  /test   -> Bot is live
//  /open   -> Create ticket link
//  /list   -> Dashboard link
//  /report -> Send the 5pm report now (manual)
// NOTE: This calls the report handler directly so links never become "YOUR_NETLIFY_SITE_URL".
const { sendToGroupMe, siteBaseUrl } = require('./_lib');
const { handler: reportHandler } = require('./send5pmReport');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'Bad JSON' }; }

  const text = (payload.text || '').trim();
  const senderType = payload.sender_type;

  // prevent bot loops
  if (senderType === 'bot') return { statusCode: 200, body: 'ignored' };

  const lower = text.toLowerCase();

  if (lower === '/test') {
    await sendToGroupMe('🤖 Bot is live');
    return { statusCode: 200, body: 'ok' };
  }

  if (lower === '/open') {
    await sendToGroupMe(`🎫 Create a new ticket: ${siteBaseUrl}/new`);
    return { statusCode: 200, body: 'ok' };
  }

  if (lower === '/list') {
    await sendToGroupMe(`🗺️ View all tickets + map: ${siteBaseUrl}/dashboard`);
    return { statusCode: 200, body: 'ok' };
  }

  if (lower === '/report') {
    try {
      const res = await reportHandler({ httpMethod: 'GET', headers: event.headers || {} });
      if (res.statusCode >= 400) {
        const j = JSON.parse(res.body || '{}');
        throw new Error(j.error || 'Report failed');
      }
      await sendToGroupMe('✅ Report sent.');
    } catch (e) {
      await sendToGroupMe(`⚠️ Failed to send report. ${e.message || e}`);
    }
    return { statusCode: 200, body: 'ok' };
  }

  return { statusCode: 200, body: 'no command' };
};

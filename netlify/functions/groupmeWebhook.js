// netlify/functions/groupmeWebhook.js

const groupmeBotId = process.env.GROUPME_BOT_ID;
const groupmePostUrl =
  process.env.GROUPME_BOT_POST_URL || 'https://api.groupme.com/v3/bots/post';

// Base URL where your ticket UI is hosted.
// Set this to "https://swoems.com" in Netlify env vars for production.
const siteBaseUrl = process.env.SITE_BASE_URL || 'https://swoems.com';

async function sendToGroupMe(text) {
  if (!groupmeBotId) {
    console.warn('GROUPME_BOT_ID not set; skipping GroupMe post.');
    return;
  }

  try {
    const res = await fetch(groupmePostUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_id: groupmeBotId,
        text,
      }),
    });
    if (!res.ok) {
      console.error('GroupMe post failed with status', res.status);
    }
  } catch (err) {
    console.error('Error posting to GroupMe:', err);
  }
}

exports.handler = async (event) => {
  // GroupMe always POSTs messages to your callback URL
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 200,
      body: 'ok',
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    console.error('Invalid JSON from GroupMe:', err);
    return { statusCode: 200, body: 'ok' };
  }

  const senderType = body.sender_type;
  const rawText = (body.text || '').trim();

  // Ignore messages from bots (including this bot)
  if (senderType === 'bot') {
    return { statusCode: 200, body: 'ok' };
  }

  const text = rawText.toLowerCase();

  // /open → send "create a new ticket" link
  if (text === '/open') {
    const link = `${siteBaseUrl}/new.html`;
    await sendToGroupMe(`📝 New lights ticket form:\n${link}`);
  }

  // /list tickets → send dashboard link
  if (text === '/list tickets') {
    const link = `${siteBaseUrl}/dashboard.html`;
    await sendToGroupMe(`📋 Lights ticket dashboard:\n${link}`);
  }

  // Always return 200 so GroupMe is happy
  return {
    statusCode: 200,
    body: 'ok',
  };
};

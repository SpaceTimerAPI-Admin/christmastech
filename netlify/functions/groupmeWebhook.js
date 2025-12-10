// netlify/functions/groupmeWebhook.js

const { createClient } = require('@supabase/supabase-js');

const groupmeBotId = process.env.GROUPME_BOT_ID;
const groupmePostUrl =
  process.env.GROUPME_BOT_POST_URL || 'https://api.groupme.com/v3/bots/post';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Where your UI lives
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
      console.error('GroupMe post failed:', res.status);
    }
  } catch (err) {
    console.error('Error posting to GroupMe:', err);
  }
}

async function buildReportMessage() {
  if (!supabaseUrl || !supabaseServiceKey) {
    return '⚠️ Supabase environment variables not configured.';
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: tickets, error } = await supabase
    .from('tickets')
    .select('id, location_friendly')
    .eq('status', 'open')
    .order('id', { ascending: true });

  if (error) {
    console.error('Error fetching tickets for manual report:', error);
    return '⚠️ Error fetching open tickets.';
  }

  let text = '';

  if (!tickets || tickets.length === 0) {
    text += `🎄 5pm report: No open light issues. Nice work!\n\n`;
  } else {
    text += `🎄 Open Light Issues (Manual Report)\n\n`;

    tickets.forEach((t) => {
      const link = `${siteBaseUrl}/ticket.html?id=${t.id}`;
      text += `#${t.id} – ${t.location_friendly}\n${link}\n\n`;
    });
  }

  text += `📋 Dashboard:\n${siteBaseUrl}/dashboard.html\n\n`;
  text += `📝 Create a New Ticket:\n${siteBaseUrl}/new.html`;

  return text;
}

exports.handler = async (event) => {
  // GroupMe always POSTs here, but allow GET to just say "ok"
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: 'ok' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    console.error('Invalid JSON from GroupMe:', err);
    return { statusCode: 200, body: 'ok' };
  }

  const senderType = body.sender_type;
  const rawText = (body.text || '').trim().toLowerCase();

  // Ignore messages from bots (including this bot)
  if (senderType === 'bot') {
    return { statusCode: 200, body: 'ok' };
  }

  //
  // COMMANDS
  //

  // /open → link to new ticket
  if (rawText === '/open') {
    await sendToGroupMe(`📝 New lights ticket form:\n${siteBaseUrl}/new.html`);
    return { statusCode: 200, body: 'ok' };
  }

  // /list tickets → dashboard link
  if (rawText === '/list tickets') {
    await sendToGroupMe(
      `📋 Lights ticket dashboard:\n${siteBaseUrl}/dashboard.html`
    );
    return { statusCode: 200, body: 'ok' };
  }

  // /report → manual full report message
  if (rawText === '/report') {
    const msg = await buildReportMessage();
    await sendToGroupMe(msg);
    return { statusCode: 200, body: 'ok' };
  }

  // /test → simple health check
  if (rawText === '/test') {
    await sendToGroupMe('Bot is live');
    return { statusCode: 200, body: 'ok' };
  }

  return { statusCode: 200, body: 'ok' };
};

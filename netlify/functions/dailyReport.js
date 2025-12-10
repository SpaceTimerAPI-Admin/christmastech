// netlify/functions/dailyReport.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const groupmeBotId = process.env.GROUPME_BOT_ID;
const groupmePostUrl =
  process.env.GROUPME_BOT_POST_URL || 'https://api.groupme.com/v3/bots/post';
const siteBaseUrl = process.env.SITE_BASE_URL || 'https://YOUR_NETLIFY_SITE_URL';

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

exports.handler = async () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Supabase env vars are not set',
      }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: tickets, error } = await supabase
    .from('tickets')
    .select('id, location_friendly')
    .eq('status', 'open')
    .order('id', { ascending: true });

  if (error) {
    console.error('Error fetching open tickets:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch tickets' }),
    };
  }

  if (!tickets || tickets.length === 0) {
    await sendToGroupMe('🎄 5pm report: No open light issues. Nice work!');
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, message: 'No open tickets' }),
    };
  }

  let text = '🎄 Open Light Issues (5pm report)\n\n';
  tickets.forEach((t) => {
    const link = `${siteBaseUrl}/ticket.html?id=${t.id}`;
    text += `#${t.id} – ${t.location_friendly}\n${link}\n\n`;
  });

  await sendToGroupMe(text);

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};

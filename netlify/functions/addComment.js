// netlify/functions/addComment.js
// Adds a comment to a ticket AND posts a GroupMe notification.
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const groupmeBotId = process.env.GROUPME_BOT_ID;
const groupmePostUrl = process.env.GROUPME_BOT_POST_URL || 'https://api.groupme.com/v3/bots/post';
const siteBaseUrl = process.env.SITE_BASE_URL || 'https://swoems.com';

async function sendToGroupMe(text) {
  if (!groupmeBotId) return;
  try {
    await fetch(groupmePostUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: groupmeBotId, text }),
    });
  } catch (err) {
    console.error('GroupMe post failed:', err);
  }
}

function clip(s, max = 220) {
  const t = (s || '').toString().trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Supabase env vars are not set' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const ticketId = Number(payload.ticket_id || payload.ticketId || payload.id);
  const author = (payload.author || '').toString().trim();
  const body = (payload.body || payload.comment || '').toString().trim();

  if (!ticketId || Number.isNaN(ticketId)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'ticket_id is required' }) };
  }
  if (!author) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'author is required' }) };
  }
  if (!body) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'comment body is required' }) };
  }

  // Ensure ticket exists (also used for message context)
  const { data: ticket, error: tErr } = await supabase
    .from('tickets')
    .select('id, location_friendly, status')
    .eq('id', ticketId)
    .single();

  if (tErr || !ticket) {
    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Ticket not found' }) };
  }

  const { data: inserted, error: cErr } = await supabase
    .from('ticket_comments')
    .insert([{ ticket_id: ticketId, author, body }])
    .select()
    .single();

  if (cErr || !inserted) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to add comment', details: cErr?.message || cErr }) };
  }

  const link = `${siteBaseUrl}/ticket.html?id=${ticketId}`;
  await sendToGroupMe(
    `📝 Ticket #${ticketId} updated by ${author}\n` +
    `${ticket.location_friendly || ''}\n` +
    `\"${clip(body)}\"\n` +
    `${link}`
  );

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, comment: inserted }) };
};

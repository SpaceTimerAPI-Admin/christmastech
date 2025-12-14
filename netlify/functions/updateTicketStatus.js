// netlify/functions/updateTicketStatus.js
// Updates ticket status (open <-> fixed) and posts GroupMe notifications.
// NOTE: in_progress removed by design.
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

  const id = Number(payload.id || payload.ticket_id);
  const status = (payload.status || '').toString().trim().toLowerCase();
  const actor = (payload.actor || payload.author || payload.tech_name || '').toString().trim(); // optional

  if (!id || Number.isNaN(id)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'id is required' }) };
  }
  if (!['open', 'fixed'].includes(status)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'status must be open or fixed' }) };
  }

  const { data: ticket, error: tErr } = await supabase
    .from('tickets')
    .select('id, location_friendly, status')
    .eq('id', id)
    .single();

  if (tErr || !ticket) {
    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Ticket not found' }) };
  }

  const oldStatus = (ticket.status || 'open').toString().toLowerCase();
  if (oldStatus === status) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, unchanged: true }) };
  }

  const { error: uErr } = await supabase
    .from('tickets')
    .update({ status })
    .eq('id', id);

  if (uErr) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to update status', details: uErr.message || uErr }) };
  }

  const link = `${siteBaseUrl}/ticket.html?id=${id}`;

  if (status === 'fixed') {
    await sendToGroupMe(
      `✅ Ticket #${id} FIXED${actor ? ` by ${actor}` : ''}\n` +
      `${ticket.location_friendly || ''}\n` +
      `${link}`
    );
  } else if (status === 'open' && oldStatus === 'fixed') {
    await sendToGroupMe(
      `⚠️ Ticket #${id} marked UNRESOLVED (re-opened)${actor ? ` by ${actor}` : ''}\n` +
      `${ticket.location_friendly || ''}\n` +
      `${link}`
    );
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
};

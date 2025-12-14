// netlify/functions/updateTicketStatus.js
//
// Updates ticket status. Supports "unfix" by setting status back to "open".
// Announces to GroupMe when a ticket transitions into "fixed".
//
// POST body: { id: number, status: 'open'|'in_progress'|'fixed' }

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// GroupMe + site URL
const groupmeBotId = process.env.GROUPME_BOT_ID;
const groupmePostUrl =
  process.env.GROUPME_BOT_POST_URL || 'https://api.groupme.com/v3/bots/post';
const siteBaseUrl = process.env.SITE_BASE_URL || 'https://swoems.com';

async function sendToGroupMe(text) {
  if (!groupmeBotId) return;

  try {
    const res = await fetch(groupmePostUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: groupmeBotId, text }),
    });

    if (!res.ok) console.error('GroupMe post failed:', res.status);
  } catch (err) {
    console.error('Error posting to GroupMe:', err);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase env vars are not set' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const id = parseInt(payload.id, 10);
  const status = payload.status;

  if (!id || Number.isNaN(id) || !status) {
    return { statusCode: 400, body: JSON.stringify({ error: 'id and status are required' }) };
  }

  const allowed = ['open', 'in_progress', 'fixed'];
  if (!allowed.includes(status)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid status' }) };
  }

  // Load current ticket
  const { data: ticket, error: fetchErr } = await supabase
    .from('tickets')
    .select('id, status, location_friendly')
    .eq('id', id)
    .single();

  if (fetchErr || !ticket) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Ticket not found' }) };
  }

  const oldStatus = ticket.status;

  // Update
  const { error: updateErr } = await supabase
    .from('tickets')
    .update({ status })
    .eq('id', id);

  if (updateErr) {
    console.error('Error updating ticket status:', updateErr);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update status' }) };
  }

  // Announce fixed transition
  if (status === 'fixed' && oldStatus !== 'fixed') {
    const link = `${siteBaseUrl}/ticket.html?id=${id}`;
    await sendToGroupMe(`🎄 Ticket #${id} fixed – ${ticket.location_friendly || '(no location)'}\n${link}`);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

// netlify/functions/updateTicketStatus.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// GroupMe + site URL
const groupmeBotId = process.env.GROUPME_BOT_ID;
const groupmePostUrl =
  process.env.GROUPME_BOT_POST_URL || 'https://api.groupme.com/v3/bots/post';
const siteBaseUrl = process.env.SITE_BASE_URL || 'https://swoems.com';

async function sendToGroupMe(text) {
  if (!groupmeBotId) {
    console.warn('GROUPME_BOT_ID not set; skipping GroupMe status announcement.');
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
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Supabase env vars are not set' }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const id = parseInt(payload.id, 10);
  const status = payload.status;

  if (!id || Number.isNaN(id) || !status) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'id and status are required' }),
    };
  }

  const allowed = ['open', 'in_progress', 'fixed'];
  if (!allowed.includes(status)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid status' }),
    };
  }

  // 1) Load current ticket so we know old status + details
  const { data: ticket, error: fetchErr } = await supabase
    .from('tickets')
    .select('id, status, location_friendly, tech_name')
    .eq('id', id)
    .single();

  if (fetchErr || !ticket) {
    console.error('Error fetching ticket before update:', fetchErr);
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Ticket not found' }),
    };
  }

  const oldStatus = ticket.status;

  // 2) Update status
  const { error: updateErr } = await supabase
    .from('tickets')
    .update({ status })
    .eq('id', id);

  if (updateErr) {
    console.error('Error updating status:', updateErr);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update status' }),
    };
  }

  // 3) If it just became fixed, announce it
  if (status === 'fixed' && oldStatus !== 'fixed') {
    const location = ticket.location_friendly || '(no location)';
    const link = `${siteBaseUrl}/ticket.html?id=${id}`;
    const msg =
      `🎄 Ticket #${id} fixed – ${location}\n` +
      `Marked fixed in the system.\n` +
      link;

    await sendToGroupMe(msg);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};

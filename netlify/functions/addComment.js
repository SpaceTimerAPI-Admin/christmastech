// netlify/functions/addComment.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Supabase env vars missing' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const ticket_id = Number(payload.ticket_id);
  const author = (payload.author || '').toString().trim();
  const body = (payload.body || '').toString().trim();

  if (!ticket_id || Number.isNaN(ticket_id) || !author || !body) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'ticket_id, author, body are required' }) };
  }

  try {
    // Ensure ticket exists
    const { data: t, error: tErr } = await supabase
      .from('tickets')
      .select('id')
      .eq('id', ticket_id)
      .single();

    if (tErr || !t) {
      return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Ticket not found' }) };
    }

    const { data, error } = await supabase
      .from('ticket_comments')
      .insert([{ ticket_id, author, body }])
      .select()
      .single();

    if (error) {
      console.error('Insert ticket_comments error:', error);
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to add comment', details: error.message || error }) };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, comment: data }) };
  } catch (err) {
    console.error('Unhandled addComment error:', err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unhandled error', details: err.message || String(err) }) };
  }
};

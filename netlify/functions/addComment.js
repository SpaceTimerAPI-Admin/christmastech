// netlify/functions/addComment.js
//
// Adds a comment to a ticket. Used as the primary "update via comments" mechanism.
// POST body: { ticketId: number, author: string, body: string }

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  const ticketId = parseInt(payload.ticketId, 10);
  const author = (payload.author || '').toString().trim();
  const body = (payload.body || '').toString().trim();

  if (!ticketId || Number.isNaN(ticketId)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Valid ticketId is required' }) };
  }
  if (!body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Comment body is required' }) };
  }

  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .select('id')
    .eq('id', ticketId)
    .single();

  if (ticketErr || !ticket) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Ticket not found' }) };
  }

  const { data: comment, error } = await supabase
    .from('ticket_comments')
    .insert([
      {
        ticket_id: ticketId,
        author: author || null,
        body,
      },
    ])
    .select('id, ticket_id, author, body, created_at')
    .single();

  if (error) {
    console.error('Error inserting comment:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to add comment' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, comment }) };
};

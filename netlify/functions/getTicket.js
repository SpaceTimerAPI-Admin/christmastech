// netlify/functions/getTicket.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Supabase env vars missing' }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const idRaw = event.queryStringParameters?.id;
  const id = parseInt(idRaw, 10);

  if (!id || Number.isNaN(id)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Valid id query parameter is required' }),
    };
  }

  try {
    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', id)
      .single();

    if (ticketErr || !ticket) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Ticket not found' }),
      };
    }

    const { data: photos, error: photosErr } = await supabase
      .from('ticket_photos')
      .select('id, ticket_id, photo_url, created_at')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });

    if (photosErr) {
      console.error('ticket_photos error:', photosErr);
    }

    const { data: comments, error: commentsErr } = await supabase
      .from('ticket_comments')
      .select('id, ticket_id, author, body, created_at')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });

    if (commentsErr) {
      // If table doesn't exist yet, show a useful error in logs but still return ticket+photos
      console.error('ticket_comments error:', commentsErr);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket,
        photos: photos || [],
        comments: comments || [],
      }),
    };
  } catch (err) {
    console.error('Unhandled getTicket error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unhandled error', details: err.message || String(err) }),
    };
  }
};

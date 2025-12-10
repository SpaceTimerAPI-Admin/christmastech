// netlify/functions/getTicket.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Supabase env vars are not set',
      }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const params = event.queryStringParameters || {};
  const id = parseInt(params.id, 10);

  if (!id || Number.isNaN(id)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Valid ticket id is required' }),
    };
  }

  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', id)
    .single();

  if (ticketErr || !ticket) {
    console.error('Error fetching ticket:', ticketErr);
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Ticket not found' }),
    };
  }

  const { data: photos, error: photoErr } = await supabase
    .from('ticket_photos')
    .select('id, photo_url, uploaded_at')
    .eq('ticket_id', id)
    .order('uploaded_at', { ascending: true });

  if (photoErr) {
    console.error('Error fetching photos:', photoErr);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ticket,
      photos: photos || [],
    }),
  };
};

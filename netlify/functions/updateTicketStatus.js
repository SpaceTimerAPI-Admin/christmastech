// netlify/functions/updateTicketStatus.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
      body: JSON.stringify({
        error: 'Supabase env vars are not set',
      }),
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

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};

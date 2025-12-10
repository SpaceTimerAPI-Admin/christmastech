// netlify/functions/listTickets.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async () => {
  // Basic sanity check so the dashboard can show a clean error message
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase env vars missing in listTickets');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Supabase env vars missing' }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error in listTickets:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to fetch tickets',
          details: error.message || error,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ tickets: data || [] }),
    };
  } catch (err) {
    console.error('Unhandled exception in listTickets:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Unhandled error in listTickets',
        details: err.message || String(err),
      }),
    };
  }
};

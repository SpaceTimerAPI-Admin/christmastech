const { supabase, json } = require('./_lib');

exports.handler = async (event) => {
  try {
    const id = event.queryStringParameters.id;

    const { data: ticket } = await supabase.from('tickets').select('*').eq('id', id).single();
    const { data: photos } = await supabase.from('ticket_photos').select('*').eq('ticket_id', id);
    const { data: comments } = await supabase.from('ticket_comments').select('*').eq('ticket_id', id).order('created_at');

    return json(200, { ticket, photos, comments });
  } catch (e) {
    return json(500, { error: e.message });
  }
};

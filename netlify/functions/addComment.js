const { supabase, json } = require('./_lib');

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');

    const { data, error } = await supabase
      .from('ticket_comments')
      .insert({
        ticket_id: body.ticket_id,
        author: body.author,
        body: body.comment
      })
      .select()
      .single();

    if (error) throw error;

    if (body.photo_path) {
      await supabase.from('comment_photos').insert({
        comment_id: data.id,
        photo_url: body.photo_path
      });
    }

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: e.message });
  }
};

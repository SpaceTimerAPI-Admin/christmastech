const { supabase, json } = require('./_lib');

exports.handler = async (event) => {
  try {
    const { base64, contentType } = JSON.parse(event.body || '{}');
    if (!base64) return json(400, { error: 'Missing image' });

    const buffer = Buffer.from(base64, 'base64');
    const name = `ticket-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    const { error } = await supabase.storage
      .from('ticket-photos')
      .upload(name, buffer, { contentType: contentType || 'image/jpeg' });

    if (error) throw error;

    const { data } = supabase.storage.from('ticket-photos').getPublicUrl(name);
    return json(200, { path: data.publicUrl });
  } catch (e) {
    return json(500, { error: e.message });
  }
};

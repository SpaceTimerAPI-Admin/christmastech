const { supabase, json } = require('./_lib');

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');

    const { data: dupes } = await supabase
      .from('tickets')
      .select('*')
      .eq('status', 'open')
      .ilike('location_friendly', body.location_friendly);

    if (dupes && dupes.length) {
      return json(409, { duplicate: true, tickets: dupes });
    }

    const { data, error } = await supabase
      .from('tickets')
      .insert({
        tech_name: body.tech_name,
        location_friendly: body.location_friendly,
        description: body.description,
        lat: body.lat,
        lon: body.lon,
        status: 'open'
      })
      .select()
      .single();

    if (error) throw error;

    if (body.photo_path) {
      await supabase.from('ticket_photos').insert({
        ticket_id: data.id,
        photo_url: body.photo_path
      });
    }

    return json(200, { ticket: data });
  } catch (e) {
    return json(500, { error: e.message });
  }
};

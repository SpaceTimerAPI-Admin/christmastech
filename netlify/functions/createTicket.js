const { getSb } = require('./sb');
const { json, bad, server } = require('./_lib');

// Create a new ticket and (optionally) attach an uploaded photo.
// Body (JSON):
// {
//   tech_name: string,
//   location_friendly: string,
//   description: string,
//   lat?: number|null,
//   lon?: number|null,
//   photo_path?: string|null   // storage object path from uploadPhoto
// }
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return bad('Method not allowed', 405);

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      // This is the "Unexpected token ... not valid JSON" case.
      return bad('Request body must be JSON', 400, { details: String(e.message || e) });
    }

    const tech_name = (body.tech_name || '').toString().trim();
    const location_friendly = (body.location_friendly || '').toString().trim();
    const description = (body.description || '').toString().trim();
    const lat = body.lat === '' ? null : body.lat;
    const lon = body.lon === '' ? null : body.lon;
    const photo_path = body.photo_path ? body.photo_path.toString() : null;

    if (!tech_name || !location_friendly || !description) {
      return bad('Missing required fields', 400);
    }

    const sb = getSb();

    const { data: ticket, error } = await sb
      .from('tickets')
      .insert([
        {
          tech_name,
          location_friendly,
          description,
          status: 'open',
          lat: lat ?? null,
          lon: lon ?? null,
        },
      ])
      .select('*')
      .single();

    if (error || !ticket) {
      return server('Create ticket failed', 500, { details: error?.message || String(error) });
    }

    // Attach photo (if provided)
    if (photo_path) {
      const publicUrl = sb.storage.from('ticket-photos').getPublicUrl(photo_path)?.data?.publicUrl;
      if (publicUrl) {
        // best-effort insert; don't fail ticket creation if photo row fails
        await sb.from('ticket_photos').insert([{ ticket_id: ticket.id, photo_url: publicUrl }]);
      }
    }

    return json({ ok: true, id: ticket.id, ticket });
  } catch (e) {
    return server('Server error', 500, { details: String(e.message || e) });
  }
};

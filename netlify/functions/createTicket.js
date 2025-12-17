// netlify/functions/createTicket.js
// Creates a ticket (status=open) and attaches the initial photo to ticket_photos (public URL).
const { createClient } = require('@supabase/supabase-js');

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    },
    body: JSON.stringify(bodyObj),
  };
}

function parseJsonBody(event) {
  if (!event.body) return null;
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  return JSON.parse(raw);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SITE_BASE_URL = (process.env.SITE_BASE_URL || '').replace(/\/+$/, '');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: 'Missing Supabase env vars.' });
    }

    let payload;
    try {
      payload = parseJsonBody(event);
    } catch (e) {
      const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
      return json(400, { error: 'Request body must be JSON.', rawPreview: raw.slice(0, 80) });
    }

    const tech_name = String(payload?.tech_name || '').trim();
    const location_friendly = String(payload?.location_friendly || '').trim();
    const description = String(payload?.description || '').trim();
    const lat = payload?.lat ?? null;
    const lon = payload?.lon ?? null;
    const photo_path = payload?.photo_path || null;

    if (!tech_name || !location_friendly || !description) {
      return json(400, { error: 'Missing required fields (tech_name, location_friendly, description).' });
    }
    if (!photo_path) {
      return json(400, { error: 'Missing photo_path. Upload photo first.' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Create ticket
    const { data: ticket, error: tErr } = await supabase
      .from('tickets')
      .insert([{
        tech_name,
        location_friendly,
        description,
        status: 'open',
        lat,
        lon,
      }])
      .select('*')
      .single();

    if (tErr) return json(500, { error: 'Create ticket failed', details: tErr.message || tErr });

    // Attach photo to ticket_photos
    const bucket = 'ticket-photos';
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(photo_path);
    const photo_url = pub?.publicUrl || null;

    const { error: pErr } = await supabase
      .from('ticket_photos')
      .insert([{ ticket_id: ticket.id, photo_url }]);

    if (pErr) {
      // Ticket created but photo row failed
      return json(200, { ok: true, ticket, warn: 'Ticket created but photo record insert failed', photoInsertError: pErr.message || pErr });
    }

    // Optional: link for chat / UI convenience
    const ticketUrl = SITE_BASE_URL ? `${SITE_BASE_URL}/ticket.html?id=${ticket.id}` : null;

    return json(200, { ok: true, ticket, id: ticket.id, ticketUrl, photo_url });
  } catch (err) {
    return json(500, { error: 'Server error', details: err?.message || String(err) });
  }
};

// netlify/functions/getTicket.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizePhotos(ticket, photos) {
  const out = Array.isArray(photos) ? [...photos] : [];

  // Backward-compat: if older schema stored a single photo URL on the ticket row itself
  const legacyUrl =
    ticket?.photo_url ||
    ticket?.photoUrl ||
    ticket?.photo ||
    ticket?.image_url ||
    ticket?.imageUrl ||
    null;

  if (legacyUrl) {
    const already = out.some(p => (p.photo_url || p.url) === legacyUrl);
    if (!already) {
      out.unshift({ id: 'legacy', ticket_id: ticket.id, photo_url: legacyUrl, created_at: ticket.created_at });
    }
  }

  // Backward-compat: some installs used `url` instead of `photo_url`
  return out.map(p => ({
    ...p,
    photo_url: p.photo_url || p.url || p.image_url || p.imageUrl || null
  })).filter(p => !!p.photo_url);
}

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

    // Photos: try standard ticket_photos table first
    let photos = [];
    const { data: photosData, error: photosErr } = await supabase
      .from('ticket_photos')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });

    if (photosErr) {
      console.error('ticket_photos error:', photosErr);
    } else {
      photos = photosData || [];
    }

    // Comments (optional; table may not exist yet)
    let comments = [];
    const { data: commentsData, error: commentsErr } = await supabase
      .from('ticket_comments')
      .select('id, ticket_id, author, body, created_at')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });

    if (commentsErr) {
      console.error('ticket_comments error:', commentsErr);
    } else {
      comments = commentsData || [];
    }

    const normalized = normalizePhotos(ticket, photos);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket,
        photos: normalized,
        comments,
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

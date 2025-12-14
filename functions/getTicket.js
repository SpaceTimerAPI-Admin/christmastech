// netlify/functions/getTicket.js
// ✅ Production: get ticket + photos + comments
// Photos come from ticket_photos OR tickets.photo_url fallback (so old behavior always works).
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizePhotos(ticket, rows) {
  const out = Array.isArray(rows) ? [...rows] : [];

  const legacyUrl = ticket?.photo_url || ticket?.photoUrl || ticket?.image_url || ticket?.imageUrl || null;

  if (legacyUrl && !out.some(p => (p.photo_url || p.url || p.image_url) === legacyUrl)) {
    out.unshift({ id: 'primary', ticket_id: ticket.id, photo_url: legacyUrl, created_at: ticket.created_at });
  }

  return out
    .map(p => ({ ...p, photo_url: p.photo_url || p.url || p.image_url || p.imageUrl || null }))
    .filter(p => !!p.photo_url);
}

exports.handler = async (event) => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Supabase env vars missing' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const idRaw = event.queryStringParameters?.id;
  const id = parseInt(idRaw, 10);

  if (!id || Number.isNaN(id)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Valid id query parameter is required' }) };
  }

  const { data: ticket, error: ticketErr } = await supabase.from('tickets').select('*').eq('id', id).single();
  if (ticketErr || !ticket) {
    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Ticket not found' }) };
  }

  let photos = [];
  const { data: pData, error: pErr } = await supabase
    .from('ticket_photos')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });

  if (!pErr) photos = pData || [];
  else console.error('ticket_photos error:', pErr);

  let comments = [];
  const { data: cData, error: cErr } = await supabase
    .from('ticket_comments')
    .select('id, ticket_id, author, body, created_at')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });

  if (!cErr) comments = cData || [];
  else console.error('ticket_comments error:', cErr);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket, photos: normalizePhotos(ticket, photos), comments }),
  };
};

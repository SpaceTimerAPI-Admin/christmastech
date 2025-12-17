// netlify/functions/getTicket.js
// Returns ticket + photos + comments for ticket.html

const { getSb } = require('./sb');
const { ok, bad, server } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({});
  if (event.httpMethod !== 'GET') return bad('Use GET');

  const id = (event.queryStringParameters && (event.queryStringParameters.id || event.queryStringParameters.ticket_id)) || '';
  const ticketId = parseInt(id, 10);
  if (!ticketId) return bad('Missing ticket id');

  try {
    const supabase = getSb();

    // Ticket
    const { data: ticket, error: tErr } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (tErr) return server('Ticket fetch failed', { details: tErr.message });
    if (!ticket) return bad('Ticket not found');

    // Photos (prefer ticket_photos table; fall back to ticket.photo_url if present)
    let photos = [];
    const { data: photoRows, error: pErr } = await supabase
      .from('ticket_photos')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (pErr) {
      // If table doesn't exist or schema differs, don't hard-fail ticket page
      photos = [];
    } else {
      photos = (photoRows || []).map((r) => ({
        id: r.id ?? null,
        ticket_id: r.ticket_id ?? ticketId,
        photo_url: r.photo_url || r.url || null,
        created_at: r.created_at ?? null,
      })).filter(p => !!p.photo_url);
    }

    if (photos.length === 0 && ticket.photo_url) {
      photos = [{ id: null, ticket_id: ticketId, photo_url: ticket.photo_url, created_at: ticket.created_at }];
    }

    // Comments
    let comments = [];
    const { data: commentRows, error: cErr } = await supabase
      .from('ticket_comments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (cErr) {
      comments = [];
    } else {
      comments = (commentRows || []).map((r) => ({
        id: r.id ?? null,
        ticket_id: r.ticket_id ?? ticketId,
        author: r.author ?? r.tech_name ?? null,
        body: r.body ?? r.comment ?? r.text ?? null,
        created_at: r.created_at ?? null,
        photo_url: r.photo_url || null,
      }));
    }

    return ok({ ticket, photos, comments });
  } catch (e) {
    return server('Server error', { details: String(e?.message || e) });
  }
};

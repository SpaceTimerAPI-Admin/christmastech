// netlify/functions/getTicket.js
// Robust ticket fetch: does NOT depend on _lib.json (some repos don't export it).
const { supabaseAdmin } = require('./_lib');

function resp(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
    },
    body: JSON.stringify(bodyObj),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resp(200, { ok: true });

  try {
    const id = event.queryStringParameters && event.queryStringParameters.id;
    if (!id) return resp(400, { error: 'Missing id' });

    const supabase = supabaseAdmin();

    // 1) Ticket row (required)
    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', id)
      .single();

    if (ticketErr || !ticket) return resp(404, { error: 'Ticket not found' });

    // 2) Photos (optional)
    let photos = [];
    try {
      const { data: tPhotos, error: pErr } = await supabase
        .from('ticket_photos')
        .select('id, ticket_id, photo_url, created_at, path')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true });

      if (!pErr && Array.isArray(tPhotos)) {
        photos = tPhotos
          .map((p) => ({
            id: p.id,
            ticket_id: p.ticket_id,
            photo_url: p.photo_url || p.path || null,
            created_at: p.created_at,
          }))
          .filter((p) => p.photo_url);
      }
    } catch (_) {
      // ignore
    }

    // Legacy fallback: tickets.photo_url
    if ((!photos || photos.length === 0) && ticket.photo_url) {
      photos = [
        {
          id: null,
          ticket_id: ticket.id,
          photo_url: ticket.photo_url,
          created_at: ticket.created_at,
        },
      ];
    }

    // 3) Comments (optional) – try multiple table names
    let comments = [];
    const tables = ['ticket_comments', 'comments'];
    for (const table of tables) {
      try {
        const { data: c, error: cErr } = await supabase
          .from(table)
          .select('id, ticket_id, author, body, created_at, updated_at')
          .eq('ticket_id', id)
          .order('created_at', { ascending: true });

        if (!cErr && Array.isArray(c)) {
          comments = c.map((row) => ({
            id: row.id,
            ticket_id: row.ticket_id,
            author: row.author,
            body: row.body,
            created_at: row.created_at,
            updated_at: row.updated_at,
          }));
          break;
        }
      } catch (_) {
        // try next table
      }
    }

    // 4) Comment photos (optional)
    if (comments.length) {
      try {
        const commentIds = comments.map((c) => c.id).filter(Boolean);
        if (commentIds.length) {
          const { data: cp, error: cpErr } = await supabase
            .from('comment_photos')
            .select('id, ticket_id, comment_id, photo_url, created_at')
            .eq('ticket_id', id)
            .in('comment_id', commentIds)
            .order('created_at', { ascending: true });

          const byComment = new Map();
          if (!cpErr && Array.isArray(cp)) {
            for (const row of cp) {
              if (!byComment.has(row.comment_id)) byComment.set(row.comment_id, []);
              byComment.get(row.comment_id).push({
                id: row.id,
                photo_url: row.photo_url,
                created_at: row.created_at,
              });
            }
          }

          comments = comments.map((c) => ({ ...c, photos: byComment.get(c.id) || [] }));
        } else {
          comments = comments.map((c) => ({ ...c, photos: [] }));
        }
      } catch (_) {
        comments = comments.map((c) => ({ ...c, photos: [] }));
      }
    }

    return resp(200, { ticket, photos, comments });
  } catch (err) {
    console.error('getTicket fatal', err);
    return resp(500, { error: 'Server error' });
  }
};

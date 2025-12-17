// netlify/functions/getTicket.js
// Robust ticket fetch: never 500s due to optional tables (ticket_photos, ticket_comments, comment_photos).
const { json, supabaseAdmin, SITE_BASE_URL, safeTicketUrl } = require('./_lib');

exports.handler = async (event) => {
  try {
    const id = event.queryStringParameters && event.queryStringParameters.id;
    if (!id) return json(400, { error: 'Missing id' });

    const supabase = supabaseAdmin();

    // 1) Ticket row (required)
    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', id)
      .single();

    if (ticketErr || !ticket) {
      return json(404, { error: 'Ticket not found' });
    }

    // 2) Photos (optional)
    let photos = [];
    // Prefer ticket_photos table if it exists
    try {
      const { data: tPhotos, error: pErr } = await supabase
        .from('ticket_photos')
        .select('id, ticket_id, photo_url, created_at, path')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true });

      if (!pErr && Array.isArray(tPhotos)) {
        photos = tPhotos.map(p => ({
          id: p.id,
          ticket_id: p.ticket_id,
          photo_url: p.photo_url || p.path || null,
          created_at: p.created_at
        })).filter(p => p.photo_url);
      }
      // If table missing or fails, we just fall back below
    } catch (_) {}

    // Legacy fallback: tickets.photo_url
    if ((!photos || photos.length === 0) && ticket.photo_url) {
      photos = [{
        id: null,
        ticket_id: ticket.id,
        photo_url: ticket.photo_url,
        created_at: ticket.created_at
      }];
    }

    // 3) Comments (optional)
    let comments = [];
    // Some earlier versions used ticket_comments; others used comments.
    const commentTablesToTry = ['ticket_comments', 'comments'];
    for (const table of commentTablesToTry) {
      try {
        const { data: c, error: cErr } = await supabase
          .from(table)
          .select('id, ticket_id, author, body, created_at, updated_at')
          .eq('ticket_id', id)
          .order('created_at', { ascending: true });

        if (!cErr && Array.isArray(c)) {
          comments = c.map(row => ({
            id: row.id,
            ticket_id: row.ticket_id,
            author: row.author,
            body: row.body,
            created_at: row.created_at,
            updated_at: row.updated_at
          }));
          break;
        }
      } catch (_) {}
    }

    // 4) Comment photos (optional) -> attach to comments[] as photos:[{photo_url,...}]
    if (comments.length) {
      try {
        const commentIds = comments.map(c => c.id).filter(Boolean);
        if (commentIds.length) {
          const { data: cp, error: cpErr } = await supabase
            .from('comment_photos')
            .select('id, ticket_id, comment_id, photo_url, created_at')
            .eq('ticket_id', id)
            .in('comment_id', commentIds)
            .order('created_at', { ascending: true });

          if (!cpErr && Array.isArray(cp)) {
            const byComment = new Map();
            for (const row of cp) {
              if (!byComment.has(row.comment_id)) byComment.set(row.comment_id, []);
              byComment.get(row.comment_id).push({
                id: row.id,
                photo_url: row.photo_url,
                created_at: row.created_at
              });
            }
            comments = comments.map(c => ({
              ...c,
              photos: byComment.get(c.id) || []
            }));
          } else {
            comments = comments.map(c => ({ ...c, photos: [] }));
          }
        } else {
          comments = comments.map(c => ({ ...c, photos: [] }));
        }
      } catch (_) {
        comments = comments.map(c => ({ ...c, photos: [] }));
      }
    }

    return json(200, { ticket, photos, comments });
  } catch (err) {
    console.error('getTicket fatal', err);
    return json(500, { error: 'Server error' });
  }
};

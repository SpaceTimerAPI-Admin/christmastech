// netlify/functions/getTicket.js
// Robust ticket loader that supports multiple historical schemas for photo/comment storage.
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizePhotos(ticket, rows) {
  const out = Array.isArray(rows) ? [...rows] : [];

  // Some older versions stored the primary photo on the ticket row itself
  const legacyUrl =
    ticket?.photo_url ||
    ticket?.photoUrl ||
    ticket?.photo ||
    ticket?.image_url ||
    ticket?.imageUrl ||
    ticket?.photoURL ||
    null;

  if (legacyUrl && !out.some(p => (p.photo_url || p.url || p.image_url) === legacyUrl)) {
    out.unshift({ id: 'legacy', ticket_id: ticket.id, photo_url: legacyUrl, created_at: ticket.created_at });
  }

  // Normalize column names
  return out
    .map(p => ({
      ...p,
      photo_url: p.photo_url || p.url || p.image_url || p.imageUrl || p.photoUrl || null,
    }))
    .filter(p => !!p.photo_url);
}

async function fetchFromFirstWorkingTable(supabase, tableNames, selectCols, filterOr, orderCol = 'created_at') {
  for (const tableName of tableNames) {
    try {
      let q = supabase.from(tableName).select(selectCols);
      if (filterOr) q = q.or(filterOr);
      if (orderCol) q = q.order(orderCol, { ascending: true });
      const { data, error } = await q;
      if (!error) return { table: tableName, data: data || [] };
    } catch (e) {
      // continue to next table
    }
  }
  return { table: null, data: [] };
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

    // Try multiple table/column naming conventions for photos
    const photoTables = ['ticket_photos', 'ticketphotos', 'ticket_images', 'ticketimages'];
    const photoFilterOr = `ticket_id.eq.${id},ticketId.eq.${id},ticketid.eq.${id}`;
    const { data: photoRows } = await fetchFromFirstWorkingTable(
      supabase,
      photoTables,
      '*',
      photoFilterOr,
      'created_at'
    );

    // Try multiple table/column naming conventions for comments
    const commentTables = ['ticket_comments', 'ticketcomments', 'comments'];
    const commentFilterOr = `ticket_id.eq.${id},ticketId.eq.${id},ticketid.eq.${id}`;
    const { data: commentRows } = await fetchFromFirstWorkingTable(
      supabase,
      commentTables,
      '*',
      commentFilterOr,
      'created_at'
    );

    const photos = normalizePhotos(ticket, photoRows);

    // Normalize comments (author/body/created_at)
    const comments = (commentRows || []).map(c => ({
      id: c.id,
      ticket_id: c.ticket_id || c.ticketId || c.ticketid || id,
      author: c.author || c.tech_name || c.name || 'Unknown',
      body: c.body || c.comment || c.text || '',
      created_at: c.created_at || c.createdAt || null,
    })).filter(c => c.body);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket,
        photos,
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

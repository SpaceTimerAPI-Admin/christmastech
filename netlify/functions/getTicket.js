// netlify/functions/getTicket.js
// Get ticket + photos + comments (+ comment photos)
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function j(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(obj),
  };
}

function normalizePhotos(ticket, rows) {
  const out = Array.isArray(rows) ? [...rows] : [];

  const legacyUrl = ticket && (ticket.photo_url || ticket.photoUrl || ticket.image_url || ticket.imageUrl) ? (ticket.photo_url || ticket.photoUrl || ticket.image_url || ticket.imageUrl) : null;

  if (legacyUrl && !out.some((p) => (p.photo_url || p.url || p.image_url) === legacyUrl)) {
    out.unshift({ id: "primary", ticket_id: ticket.id, photo_url: legacyUrl, created_at: ticket.created_at });
  }

  return out
    .map((p) => ({ ...p, photo_url: p.photo_url || p.url || p.image_url || p.imageUrl || null }))
    .filter((p) => !!p.photo_url);
}

exports.handler = async (event) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return j(500, { error: "Supabase env vars missing" });
  }

  const ticketId = event.queryStringParameters && (event.queryStringParameters.id || event.queryStringParameters.ticket_id);
  if (!ticketId) return j(400, { error: "Missing id" });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: ticket, error: tErr } = await supabase
      .from("tickets")
      .select("*")
      .eq("id", ticketId)
      .single();

    if (tErr || !ticket) return j(404, { error: "Ticket not found" });

    const { data: photosRows } = await supabase
      .from("ticket_photos")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    const photos = normalizePhotos(ticket, photosRows);

    const { data: comments } = await supabase
      .from("ticket_comments")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    // Attach comment photos
    let commentPhotos = [];
    try {
      const { data: cp } = await supabase
        .from("comment_photos")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      commentPhotos = cp || [];
    } catch (_) {}

    const photosByComment = {};
    for (const p of commentPhotos) {
      const cid = p.comment_id;
      if (!photosByComment[cid]) photosByComment[cid] = [];
      photosByComment[cid].push({ id: p.id, photo_url: p.photo_url, created_at: p.created_at });
    }

    const commentsOut = (comments || []).map((c) => ({
      ...c,
      photos: photosByComment[c.id] || [],
    }));

    return j(200, { ticket, photos, comments: commentsOut });
  } catch (e) {
    return j(500, { error: "Server error", details: e.message || String(e) });
  }
};

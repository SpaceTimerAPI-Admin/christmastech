// netlify/functions/getTicket.js
// Returns ticket + photos + comments (with optional comment photos)
const { getSb } = require("./sb");
const { ok, bad, server } = require("./_lib");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return ok({});
  if (event.httpMethod !== "GET") return bad("Use GET");

  try {
    const id = event.queryStringParameters?.id;
    if (!id) return bad("Missing id");

    const sb = getSb();

    const { data: ticket, error: tErr } = await sb
      .from("tickets")
      .select("*")
      .eq("id", id)
      .single();

    if (tErr) return server("Ticket fetch failed", { details: tErr.message });

    const { data: photos, error: pErr } = await sb
      .from("ticket_photos")
      .select("id,ticket_id,file_path,public_url,created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (pErr) return server("Photos fetch failed", { details: pErr.message });

    const { data: comments, error: cErr } = await sb
      .from("ticket_comments")
      .select("id,ticket_id,author,body,photo_url,created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (cErr) return server("Comments fetch failed", { details: cErr.message });

    return ok({ ticket, photos: photos || [], comments: comments || [] });
  } catch (e) {
    return server("Get ticket error", { details: String(e?.message || e) });
  }
};

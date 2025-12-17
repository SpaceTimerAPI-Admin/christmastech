// netlify/functions/addComment.js
// Adds a comment to a ticket (optionally with a photo) AND posts a GroupMe notification.

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const GROUPME_BOT_ID = process.env.GROUPME_BOT_ID;
const GROUPME_POST_URL = process.env.GROUPME_BOT_POST_URL || "https://api.groupme.com/v3/bots/post";
const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://swoems.com").replace(/\/+$/, "");

function j(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

function clip(s, max) {
  const t = (s || "").toString().trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "...";
}

async function sendToGroupMe(text) {
  if (!GROUPME_BOT_ID) return;
  try {
    await fetch(GROUPME_POST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_id: GROUPME_BOT_ID, text }),
    });
  } catch (_) {}
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return j(200, { ok: true });
  if (event.httpMethod !== "POST") return j(405, { error: "Method not allowed" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return j(500, { error: "Supabase env vars missing" });
  }

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return j(400, { error: "Bad JSON body" }); }

  const ticketId = Number(payload.ticket_id || payload.ticketId);
  const author = (payload.author || payload.tech_name || "Unknown").toString().trim();
  const body = (payload.body || payload.comment || "").toString().trim();
  const photo_url = payload.photo_url || payload.photoUrl || null;

  if (!ticketId || Number.isNaN(ticketId)) return j(400, { error: "ticket_id is required" });
  if (!body) return j(400, { error: "body is required" });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch ticket for nicer GroupMe message
  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, location_friendly")
    .eq("id", ticketId)
    .single();

  // Insert comment
  const { data: inserted, error: cErr } = await supabase
    .from("ticket_comments")
    .insert([{ ticket_id: ticketId, author, body }])
    .select("*")
    .single();

  if (cErr || !inserted) {
    return j(500, { error: "Failed to add comment", details: cErr?.message || String(cErr) });
  }

  // Optional: attach photo to comment
  if (photo_url) {
    const { error: pErr } = await supabase
      .from("comment_photos")
      .insert([{ ticket_id: ticketId, comment_id: inserted.id, photo_url }]);
    if (pErr) {
      // Comment still created; return warning so UI can show it if needed
      return j(200, { ok: true, comment: inserted, warning: "Comment saved but photo link failed", details: pErr.message });
    }
  }

  const link = `${SITE_BASE_URL}/ticket.html?id=${ticketId}`;
  const tLoc = (ticket && ticket.location_friendly) ? ticket.location_friendly : "";
  const photoLine = photo_url ? "\n(1 photo attached)" : "";
  await sendToGroupMe(
    `📝 Ticket #${ticketId} updated by ${author}\n${tLoc}\n"${clip(body, 220)}"${photoLine}\n${link}`
  );

  return j(200, { ok: true, comment: inserted });
};

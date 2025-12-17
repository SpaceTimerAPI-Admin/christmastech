/**
 * netlify/functions/createTicket.js
 * Creates a ticket row in Supabase and posts a GroupMe notification.
 *
 * Accepts JSON:
 *  - tech_name, location_friendly, description (required)
 *  - lat, lon (optional)
 *  - photo_url (preferred) OR photo_path/path (legacy)
 */
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.TICKET_PHOTOS_BUCKET || "ticket-photos";

const groupmeBotId = process.env.GROUPME_BOT_ID;
const groupmePostUrl = process.env.GROUPME_BOT_POST_URL || "https://api.groupme.com/v3/bots/post";
const siteBaseUrl = (process.env.SITE_BASE_URL || "https://swoems.com").replace(/\/+$/,"");

function resp(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body: JSON.stringify(obj)
  };
}

async function sendToGroupMe(text) {
  if (!groupmeBotId) return;
  try {
    await fetch(groupmePostUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_id: groupmeBotId, text })
    });
  } catch (_) {
    // Don't fail ticket creation if GroupMe is down/misconfigured
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return resp(200, { ok: true });
  if (event.httpMethod !== "POST") return resp(405, { error: "Method Not Allowed" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return resp(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return resp(400, { error: "Bad JSON body" }); }

  const tech_name = (payload.tech_name || "").trim();
  const location_friendly = (payload.location_friendly || "").trim();
  const description = (payload.description || "").trim();
  const lat = payload.lat ?? null;
  const lon = payload.lon ?? null;

  let photo_url = payload.photo_url || null;
  const photo_path = payload.photo_path || payload.path || null;

  if (!photo_url && photo_path) {
    const base = SUPABASE_URL.replace(/\/+$/,"");
    photo_url = `${base}/storage/v1/object/public/${BUCKET}/${photo_path}`;
  }

  if (!tech_name) return resp(400, { error: "tech_name is required" });
  if (!location_friendly) return resp(400, { error: "location_friendly is required" });
  if (!description) return resp(400, { error: "description is required" });
  if (!photo_url) return resp(400, { error: "photo_url is required" });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data, error } = await supabase
      .from("tickets")
      .insert([{ tech_name, location_friendly, description, lat, lon, status: "open", photo_url }])
      .select("id")
      .single();

    if (error) return resp(500, { error: "Failed to create ticket", details: error.message });

    const id = data.id;
    const link = `${siteBaseUrl}/ticket.html?id=${id}`;

    // 🔔 GroupMe announce new ticket
    await sendToGroupMe(
      `🚨 NEW Ticket #${id} created by ${tech_name}\n` +
      `${location_friendly}\n` +
      `${link}`
    );

    return resp(200, { ok: true, id, ticket: { id } });
  } catch (e) {
    return resp(500, { error: "Unhandled exception", details: e.message || String(e) });
  }
};

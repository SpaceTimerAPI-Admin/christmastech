/**
 * netlify/functions/createTicket.js
 * Creates a ticket row in Supabase and returns the new ticket id.
 *
 * Expects JSON:
 * {
 *   tech_name: string,
 *   location_friendly: string,
 *   description: string,
 *   lat?: number|null,
 *   lon?: number|null,
 *   photo_url?: string|null
 * }
 */
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(statusCode, obj) {
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  if (!supabaseUrl || !supabaseServiceKey) {
    return json(500, { error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Bad JSON body" });
  }

  const tech_name = (payload.tech_name || "").trim();
  const location_friendly = (payload.location_friendly || "").trim();
  const description = (payload.description || "").trim();
  const lat = payload.lat ?? null;
  const lon = payload.lon ?? null;
  const photo_url = payload.photo_url ?? null;

  if (!tech_name) return json(400, { error: "tech_name is required" });
  if (!location_friendly) return json(400, { error: "location_friendly is required" });
  if (!description) return json(400, { error: "description is required" });
  // photo required by your workflow:
  if (!photo_url) return json(400, { error: "photo_url is required (photo must upload first)" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabase
      .from("tickets")
      .insert([{ tech_name, location_friendly, description, lat, lon, status: "open", photo_url }])
      .select("id")
      .single();

    if (error) return json(500, { error: "Failed to create ticket", details: error.message });

    return json(200, { ok: true, id: data.id, ticket: { id: data.id } });
  } catch (e) {
    return json(500, { error: "Unhandled exception", details: e.message || String(e) });
  }
};

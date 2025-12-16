/**
 * netlify/functions/createTicket.js
 * Creates a ticket in Supabase.
 */
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function response(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body: JSON.stringify(bodyObj)
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return response(200, { ok: true });
  if (event.httpMethod !== "POST") return response(405, { error: "Method Not Allowed" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return response(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return response(400, { error: "Bad JSON body" });
  }

  const tech_name = (payload.tech_name || "").trim();
  const location_friendly = (payload.location_friendly || "").trim();
  const description = (payload.description || "").trim();
  const lat = payload.lat !== undefined ? payload.lat : null;
  const lon = payload.lon !== undefined ? payload.lon : null;
  const photo_url = payload.photo_url || null;

  if (!tech_name) return response(400, { error: "tech_name is required" });
  if (!location_friendly) return response(400, { error: "location_friendly is required" });
  if (!description) return response(400, { error: "description is required" });
  if (!photo_url) return response(400, { error: "photo_url is required" });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data, error } = await supabase
      .from("tickets")
      .insert([{ tech_name, location_friendly, description, lat, lon, status: "open", photo_url }])
      .select("id")
      .single();

    if (error) return response(500, { error: "Failed to create ticket", details: error.message });

    return response(200, { ok: true, id: data.id, ticket: { id: data.id } });
  } catch (e) {
    return response(500, { error: "Unhandled exception", details: e && e.message ? e.message : String(e) });
  }
};

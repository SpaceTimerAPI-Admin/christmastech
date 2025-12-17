/**
 * netlify/functions/createTicket.js
 * Create a new ticket with optional duplicate detection.
 *
 * Request JSON:
 *  - tech_name, location_friendly, description (required unless dry_run=true)
 *  - lat, lon (optional but required for duplicate detection)
 *  - photo_url (required for actual creation; optional for dry_run)
 *  - dry_run: true|false (if true, ONLY checks duplicates and returns matches; does not create)
 *  - force_create: true|false (if true, skips duplicate blocking and creates)
 *
 * Duplicate logic:
 *  - Only checks tickets with status='open'
 *  - Only compares tickets with lat/lon present
 *  - Uses radius meters (env DUP_RADIUS_METERS, default 25)
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.TICKET_PHOTOS_BUCKET || "ticket-photos";

const GROUPME_BOT_ID = process.env.GROUPME_BOT_ID;
const GROUPME_POST_URL = process.env.GROUPME_BOT_POST_URL || "https://api.groupme.com/v3/bots/post";
const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://swoems.com").replace(/\/+$/, "");

const DUP_RADIUS_METERS = Number(process.env.DUP_RADIUS_METERS || "25");

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

function isNum(n) {
  return typeof n === "number" && !Number.isNaN(n) && Number.isFinite(n);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function clip(s, max) {
  const t = (s || "").toString().trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

async function sendToGroupMe(text) {
  if (!GROUPME_BOT_ID) return;
  try {
    await fetch(GROUPME_POST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_id: GROUPME_BOT_ID, text })
    });
  } catch (_) {}
}

async function findDuplicateMatches(supabase, lat, lon) {
  if (!isNum(lat) || !isNum(lon)) return [];

  // Bounding box prefilter (fast)
  // 1 deg latitude ≈ 111,320 m
  const latDelta = DUP_RADIUS_METERS / 111320;
  // longitude delta depends on latitude
  const lonDelta = DUP_RADIUS_METERS / (111320 * Math.cos((lat * Math.PI) / 180) || 1);

  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLon = lon - lonDelta;
  const maxLon = lon + lonDelta;

  const { data, error } = await supabase
    .from("tickets")
    .select("id, created_at, status, location_friendly, description, lat, lon, tech_name, photo_url")
    .eq("status", "open")
    .not("lat", "is", null)
    .not("lon", "is", null)
    .gte("lat", minLat)
    .lte("lat", maxLat)
    .gte("lon", minLon)
    .lte("lon", maxLon)
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) return [];

  const matches = (data || [])
    .map((t) => ({
      ...t,
      distance_m: haversineMeters(lat, lon, Number(t.lat), Number(t.lon))
    }))
    .filter((t) => t.distance_m <= DUP_RADIUS_METERS)
    .sort((a, b) => a.distance_m - b.distance_m);

  return matches;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return resp(200, { ok: true });
  if (event.httpMethod !== "POST") return resp(405, { error: "Method Not Allowed" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return resp(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return resp(400, { error: "Bad JSON body" });
  }

  const dry_run = !!payload.dry_run;
  const force_create = !!payload.force_create;

  const tech_name = (payload.tech_name || "").trim();
  const location_friendly = (payload.location_friendly || "").trim();
  const description = (payload.description || "").trim();

  const lat = payload.lat === null || payload.lat === undefined ? null : Number(payload.lat);
  const lon = payload.lon === null || payload.lon === undefined ? null : Number(payload.lon);

  // Support legacy photo_path
  let photo_url = payload.photo_url || null;
  const photo_path = payload.photo_path || payload.path || null;
  if (!photo_url && photo_path) {
    const base = SUPABASE_URL.replace(/\/+$/, "");
    photo_url = `${base}/storage/v1/object/public/${BUCKET}/${photo_path}`;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Duplicate check (only open tickets)
  const canCheckDup = isNum(lat) && isNum(lon);
  if (canCheckDup) {
    const matches = await findDuplicateMatches(supabase, lat, lon);
    if (matches.length > 0 && (dry_run || !force_create)) {
      return resp(200, {
        ok: true,
        duplicate: true,
        radius_m: DUP_RADIUS_METERS,
        matches
      });
    }
  }

  if (dry_run) {
    return resp(200, { ok: true, duplicate: false, matches: [] });
  }

  // Validate for creation
  if (!tech_name) return resp(400, { error: "tech_name is required" });
  if (!location_friendly) return resp(400, { error: "location_friendly is required" });
  if (!description) return resp(400, { error: "description is required" });
  if (!photo_url) return resp(400, { error: "photo_url is required" });

  try {
    const { data, error } = await supabase
      .from("tickets")
      .insert([{
        tech_name,
        location_friendly,
        description,
        lat: isNum(lat) ? lat : null,
        lon: isNum(lon) ? lon : null,
        status: "open",
        photo_url
      }])
      .select("id")
      .single();

    if (error || !data) {
      return resp(500, { error: "Failed to create ticket", details: error?.message || String(error) });
    }

    const id = data.id;
    const link = `${SITE_BASE_URL}/ticket.html?id=${id}`;

    // GroupMe announce new ticket (include short description + photo link)
    await sendToGroupMe(
      `🚨 NEW Ticket #${id} created by ${tech_name}\n` +
      `${location_friendly}\n` +
      `"${clip(description, 200)}"\n` +
      (photo_url ? `Photo: ${photo_url}\n` : "") +
      `${link}`
    );

    return resp(200, { ok: true, id, ticket: { id } });
  } catch (e) {
    return resp(500, { error: "Unhandled exception", details: e.message || String(e) });
  }
};

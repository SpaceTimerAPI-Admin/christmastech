// netlify/functions/createTicket.js
//
// Creates a new ticket (photo REQUIRED) and performs a nearby-duplicate check.
// If duplicates are found, returns { created:false, reason:'duplicates_found', duplicates:[...], draftTicket:{...} }
//
// Env vars needed:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - SUPABASE_BUCKET_NAME (default: ticket-photos)
// - GROUPME_BOT_ID (optional, for announcements)
// - GROUPME_BOT_POST_URL (optional, default: GroupMe bots/post)
// - SITE_BASE_URL (optional, default: https://swoems.com)

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.SUPABASE_BUCKET_NAME || 'ticket-photos';

// GroupMe + site URL
const groupmeBotId = process.env.GROUPME_BOT_ID;
const groupmePostUrl =
  process.env.GROUPME_BOT_POST_URL || 'https://api.groupme.com/v3/bots/post';
const siteBaseUrl = process.env.SITE_BASE_URL || 'https://swoems.com';

// Duplicate check settings
const DUPLICATE_RADIUS_METERS = 40; // nearby in the field
const DUPLICATE_LOOKBACK_DAYS = 3;

// Haversine distance in meters
function distanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;

  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function sendToGroupMe(text) {
  if (!groupmeBotId) return;

  try {
    const res = await fetch(groupmePostUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: groupmeBotId, text }),
    });

    if (!res.ok) console.error('GroupMe post failed:', res.status);
  } catch (err) {
    console.error('Error posting to GroupMe:', err);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase env vars are not set' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const {
    tech_name,
    location_friendly,
    description,
    lat,
    lon,
    photoBase64,
    photoFilename,
    forceNew,
  } = payload;

  if (!tech_name || !location_friendly) {
    return { statusCode: 400, body: JSON.stringify({ error: 'tech_name and location_friendly are required' }) };
  }

  // Photo REQUIRED for new tickets
  if (!photoBase64 || !photoFilename) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Photo is required to create a ticket' }) };
  }

  // 1) Duplicate check (only if we have coords and user is not forcing a new ticket)
  let duplicates = [];
  if (lat != null && lon != null && !forceNew) {
    const since = new Date();
    since.setDate(since.getDate() - DUPLICATE_LOOKBACK_DAYS);

    const { data: openTickets, error: openErr } = await supabase
      .from('tickets')
      .select('id, tech_name, location_friendly, description, created_at, lat, lon, status')
      .eq('status', 'open')
      .gte('created_at', since.toISOString());

    if (openErr) {
      console.error('Error fetching open tickets:', openErr);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch open tickets for duplicate check' }) };
    }

    duplicates = (openTickets || []).filter((t) => distanceMeters(lat, lon, t.lat, t.lon) <= DUPLICATE_RADIUS_METERS);

    if (duplicates.length > 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          created: false,
          reason: 'duplicates_found',
          duplicates,
          draftTicket: {
            tech_name,
            location_friendly,
            description,
            lat,
            lon,
          },
        }),
      };
    }
  }

  // 2) Upload the photo to Supabase Storage
  let photoUrl = null;
  try {
    const base64Parts = String(photoBase64).split(',');
    const base64Data = base64Parts.length === 2 ? base64Parts[1] : photoBase64;

    const buffer = Buffer.from(base64Data, 'base64');
    const ext = (String(photoFilename).split('.').pop() || 'jpg').toLowerCase();
    const path = `ticket-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const contentType =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'png'
        ? 'image/png'
        : 'image/octet-stream';

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(path, buffer, { contentType });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to upload photo: ' + (uploadError.message || uploadError.error_description || 'unknown error'),
        }),
      };
    }

    const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(path);
    photoUrl = publicUrlData.publicUrl;
  } catch (err) {
    console.error('Photo upload exception:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Exception while uploading photo' }) };
  }

  // 3) Create ticket
  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .insert([
      {
        tech_name,
        location_friendly,
        description: description || null,
        lat: lat ?? null,
        lon: lon ?? null,
        status: 'open',
      },
    ])
    .select()
    .single();

  if (ticketErr || !ticket) {
    console.error('Error inserting ticket:', ticketErr);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create ticket' }) };
  }

  // 4) Store photo record
  const { error: photoErr } = await supabase.from('ticket_photos').insert([
    {
      ticket_id: ticket.id,
      photo_url: photoUrl,
    },
  ]);

  if (photoErr) console.error('Error inserting ticket photo:', photoErr);

  // 5) Announce new ticket
  const link = `${siteBaseUrl}/ticket.html?id=${ticket.id}`;
  await sendToGroupMe(
    `🎄 New lights ticket #${ticket.id} – ${location_friendly}\nReported by ${tech_name}\n${link}`
  );

  return { statusCode: 200, body: JSON.stringify({ created: true, ticketId: ticket.id }) };
};

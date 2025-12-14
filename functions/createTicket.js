// netlify/functions/createTicket.js
// ✅ Production: create ticket + REQUIRED photo
// Writes photo URL to tickets.photo_url (primary) AND ticket_photos (secondary, multi-photo).
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const bucketName = process.env.SUPABASE_BUCKET_NAME || 'ticket-photos';

// GroupMe announce
const groupmeBotId = process.env.GROUPME_BOT_ID;
const groupmePostUrl = process.env.GROUPME_BOT_POST_URL || 'https://api.groupme.com/v3/bots/post';
const siteBaseUrl = process.env.SITE_BASE_URL || 'https://swoems.com';

// Duplicate detection
const DUPLICATE_RADIUS_METERS = Number(process.env.DUPLICATE_RADIUS_METERS || 40);
const DUPLICATE_LOOKBACK_DAYS = Number(process.env.DUPLICATE_LOOKBACK_DAYS || 3);

function distanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function sendToGroupMe(text) {
  if (!groupmeBotId) return;
  try {
    await fetch(groupmePostUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: groupmeBotId, text }),
    });
  } catch (err) {
    console.error('GroupMe post failed:', err);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Supabase env vars are not set' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const {
    tech_name,
    location_friendly,
    description,
    lat,
    lon,
    photoBase64,
    photoFilename,
    forceNew
  } = payload;

  if (!tech_name || !location_friendly) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'tech_name and location_friendly are required' }) };
  }

  // Require photo
  if (!photoBase64 || !photoFilename) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Photo is required' }) };
  }

  // Duplicate check
  let duplicates = [];
  if (lat != null && lon != null && !forceNew) {
    const since = new Date();
    since.setDate(since.getDate() - DUPLICATE_LOOKBACK_DAYS);

    const { data: openTickets, error: openErr } = await supabase
      .from('tickets')
      .select('id, location_friendly, created_at, lat, lon, status')
      .eq('status', 'open')
      .gte('created_at', since.toISOString());

    if (openErr) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to fetch open tickets for duplicate check' }) };
    }

    duplicates = (openTickets || []).filter(t => distanceMeters(lat, lon, t.lat, t.lon) <= DUPLICATE_RADIUS_METERS);

    if (duplicates.length) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          created: false,
          reason: 'duplicates_found',
          duplicates,
          draftTicket: { tech_name, location_friendly, description, lat, lon },
        }),
      };
    }
  }

  // Upload photo
  let photoUrl = null;
  let storagePath = null;
  try {
    const base64Parts = photoBase64.split(',');
    const base64Data = base64Parts.length === 2 ? base64Parts[1] : photoBase64;
    const buffer = Buffer.from(base64Data, 'base64');

    const ext = (photoFilename.split('.').pop() || 'jpg').toLowerCase();
    storagePath = `ticket-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const contentType =
      (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' :
      (ext === 'png') ? 'image/png' :
      (ext === 'webp') ? 'image/webp' :
      'application/octet-stream';

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, buffer, { contentType, upsert: false });

    if (uploadError) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to upload photo', details: uploadError.message || uploadError }) };
    }

    const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
    photoUrl = publicUrlData.publicUrl;
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Exception while uploading photo', details: err.message || String(err) }) };
  }

  // Create ticket (photo_url is primary)
  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .insert([{
      tech_name,
      location_friendly,
      description: description || null,
      lat: lat ?? null,
      lon: lon ?? null,
      status: 'open',
      photo_url: photoUrl,
    }])
    .select()
    .single();

  if (ticketErr || !ticket) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to create ticket', details: ticketErr?.message || ticketErr }) };
  }

  // Insert into ticket_photos (secondary, non-fatal)
  try {
    await supabase.from('ticket_photos').insert([{ ticket_id: ticket.id, photo_url: photoUrl }]);
  } catch (e) {
    console.warn('ticket_photos insert failed (not fatal):', e?.message || e);
  }

  // Announce to GroupMe
  await sendToGroupMe(`🎄 New lights ticket #${ticket.id} – ${location_friendly}\nReported by ${tech_name}\n${siteBaseUrl}/ticket.html?id=${ticket.id}`);

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ created: true, ticketId: ticket.id, photoUrl, storagePath }) };
};

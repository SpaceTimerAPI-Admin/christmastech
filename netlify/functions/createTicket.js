// netlify/functions/createTicket.js
// Creates a ticket, REQUIRES a photo, and stores photo references in BOTH:
// 1) ticket_photos (multi-photo table)
// 2) tickets.photo_url (legacy/primary-photo fallback)
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.SUPABASE_BUCKET_NAME || 'ticket-photos';

// GroupMe + site URL
const groupmeBotId = process.env.GROUPME_BOT_ID;
const groupmePostUrl =
  process.env.GROUPME_BOT_POST_URL || 'https://api.groupme.com/v3/bots/post';
const siteBaseUrl = process.env.SITE_BASE_URL || 'https://swoems.com';

// Duplicate config
const DUPLICATE_RADIUS_METERS = 40;
const DUPLICATE_LOOKBACK_DAYS = 3;

function distanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
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
    console.error('Error posting to GroupMe:', err);
  }
}

async function insertPhotoRow(supabase, ticketId, photoUrl) {
  const tables = ['ticket_photos', 'ticketphotos', 'ticket_images', 'ticketimages'];
  for (const tableName of tables) {
    try {
      // try typical column ticket_id
      let { error } = await supabase.from(tableName).insert([{ ticket_id: ticketId, photo_url: photoUrl }]);
      if (!error) return true;

      // try alt column names
      ({ error } = await supabase.from(tableName).insert([{ ticketId: ticketId, photo_url: photoUrl }]));
      if (!error) return true;

      ({ error } = await supabase.from(tableName).insert([{ ticketid: ticketId, photo_url: photoUrl }]));
      if (!error) return true;

      // try url column
      ({ error } = await supabase.from(tableName).insert([{ ticket_id: ticketId, url: photoUrl }]));
      if (!error) return true;
    } catch (e) {
      // continue
    }
  }
  return false;
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
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { tech_name, location_friendly, description, lat, lon, photoBase64, photoFilename, forceNew } = payload;

  if (!tech_name || !location_friendly) {
    return { statusCode: 400, body: JSON.stringify({ error: 'tech_name and location_friendly are required' }) };
  }

  // Require photo
  if (!photoBase64 || !photoFilename) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Photo is required' }) };
  }

  // Duplicate check (only if we have lat/lon and not forcing new)
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

    if (openTickets?.length) {
      duplicates = openTickets.filter((t) => distanceMeters(lat, lon, t.lat, t.lon) <= DUPLICATE_RADIUS_METERS);
    }

    if (duplicates.length > 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          created: false,
          reason: 'duplicates_found',
          duplicates,
          draftTicket: { tech_name, location_friendly, description, lat, lon },
        }),
      };
    }
  }

  // Upload photo to Storage
  let photoUrl = null;
  try {
    const base64Parts = photoBase64.split(',');
    const base64Data = base64Parts.length === 2 ? base64Parts[1] : photoBase64;
    const buffer = Buffer.from(base64Data, 'base64');

    const ext = (photoFilename.split('.').pop() || 'jpg').toLowerCase();
    const path = `ticket-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const contentType =
      (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' :
      (ext === 'png') ? 'image/png' : 'application/octet-stream';

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(path, buffer, { contentType });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to upload photo', details: uploadError.message || uploadError }) };
    }

    const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(path);
    photoUrl = publicUrlData.publicUrl;
  } catch (err) {
    console.error('Photo upload exception:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Exception while uploading photo', details: err.message || String(err) }) };
  }

  // Create ticket (ensure photo_url fallback is set)
  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .insert([{
      tech_name,
      location_friendly,
      description: description || null,
      lat: lat ?? null,
      lon: lon ?? null,
      status: 'open',
      photo_url: photoUrl, // fallback/primary
    }])
    .select()
    .single();

  if (ticketErr || !ticket) {
    console.error('Error inserting ticket:', ticketErr);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create ticket' }) };
  }

  // Insert into photo table as well
  const ok = await insertPhotoRow(supabase, ticket.id, photoUrl);
  if (!ok) {
    console.warn('Could not insert into a photo table; relying on tickets.photo_url fallback only.');
  }

  // Announce
  const ticketLink = `${siteBaseUrl}/ticket.html?id=${ticket.id}`;
  const msg = `🎄 New lights ticket #${ticket.id} – ${location_friendly}
Reported by ${tech_name}
${ticketLink}`;
  await sendToGroupMe(msg);

  return { statusCode: 200, body: JSON.stringify({ created: true, ticketId: ticket.id }) };
};

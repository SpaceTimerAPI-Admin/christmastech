// netlify/functions/attachToTicket.js
// Adds additional info + REQUIRED photo to an existing ticket.
// Stores photo reference in photo table if possible, and also updates tickets.photo_url if it was empty.
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.SUPABASE_BUCKET_NAME || 'ticket-photos';

async function insertPhotoRow(supabase, ticketId, photoUrl) {
  const tables = ['ticket_photos', 'ticketphotos', 'ticket_images', 'ticketimages'];
  for (const tableName of tables) {
    try {
      let { error } = await supabase.from(tableName).insert([{ ticket_id: ticketId, photo_url: photoUrl }]);
      if (!error) return true;

      ({ error } = await supabase.from(tableName).insert([{ ticketId: ticketId, photo_url: photoUrl }]));
      if (!error) return true;

      ({ error } = await supabase.from(tableName).insert([{ ticketid: ticketId, photo_url: photoUrl }]));
      if (!error) return true;

      ({ error } = await supabase.from(tableName).insert([{ ticket_id: ticketId, url: photoUrl }]));
      if (!error) return true;
    } catch (e) {}
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

  const ticketId = Number(payload.ticket_id || payload.id);
  const note = (payload.note || payload.description || '').toString().trim();

  const photoBase64 = payload.photoBase64;
  const photoFilename = payload.photoFilename;

  if (!ticketId || Number.isNaN(ticketId)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'ticket_id is required' }) };
  }

  // Require photo for attachments too
  if (!photoBase64 || !photoFilename) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Photo is required for updates' }) };
  }

  // Ensure ticket exists
  const { data: t, error: tErr } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
  if (tErr || !t) return { statusCode: 404, body: JSON.stringify({ error: 'Ticket not found' }) };

  // Upload photo
  let photoUrl = null;
  try {
    const base64Parts = photoBase64.split(',');
    const base64Data = base64Parts.length === 2 ? base64Parts[1] : photoBase64;
    const buffer = Buffer.from(base64Data, 'base64');

    const ext = (photoFilename.split('.').pop() || 'jpg').toLowerCase();
    const path = `ticket-${ticketId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const contentType =
      (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' :
      (ext === 'png') ? 'image/png' : 'application/octet-stream';

    const { error: uploadError } = await supabase.storage.from(bucketName).upload(path, buffer, { contentType });
    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to upload photo', details: uploadError.message || uploadError }) };
    }

    const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(path);
    photoUrl = publicUrlData.publicUrl;
  } catch (err) {
    console.error('Upload exception:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Exception while uploading photo', details: err.message || String(err) }) };
  }

  // Insert into photo table if possible
  const ok = await insertPhotoRow(supabase, ticketId, photoUrl);
  if (!ok) console.warn('Could not insert into a photo table; relying on tickets.photo_url fallback only.');

  // If ticket has no primary photo_url, set it
  if (!t.photo_url) {
    try {
      await supabase.from('tickets').update({ photo_url: photoUrl }).eq('id', ticketId);
    } catch (e) {}
  }

  // Optional note as a comment if comments table exists
  if (note) {
    const commentTables = ['ticket_comments', 'ticketcomments', 'comments'];
    for (const tableName of commentTables) {
      try {
        const { error } = await supabase.from(tableName).insert([{ ticket_id: ticketId, author: payload.author || 'Update', body: note }]);
        if (!error) break;
      } catch (e) {}
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, photoUrl }) };
};

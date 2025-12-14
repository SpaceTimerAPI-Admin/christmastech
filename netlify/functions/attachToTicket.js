// netlify/functions/attachToTicket.js
//
// Attach an additional photo (REQUIRED) + optional note to an existing ticket.
// Used when a user selects an existing nearby duplicate ticket.
//
// Env vars:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - SUPABASE_BUCKET_NAME (default ticket-photos)

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.SUPABASE_BUCKET_NAME || 'ticket-photos';

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

  const { ticketId, tech_name, description, lat, lon, photoBase64, photoFilename } = payload;

  if (!ticketId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'ticketId is required' }) };
  }

  // Require a photo for attaches too (keeps evidence consistent)
  if (!photoBase64 || !photoFilename) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Photo is required to attach to a ticket' }) };
  }

  // Verify ticket exists
  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .select('id, status')
    .eq('id', ticketId)
    .single();

  if (ticketErr || !ticket) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Ticket not found' }) };
  }

  // Upload photo
  let photoUrl = null;
  try {
    const base64Parts = String(photoBase64).split(',');
    const base64Data = base64Parts.length === 2 ? base64Parts[1] : photoBase64;

    const buffer = Buffer.from(base64Data, 'base64');
    const ext = (String(photoFilename).split('.').pop() || 'jpg').toLowerCase();
    const path = `attach-${ticketId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

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
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to upload photo' }) };
    }

    const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(path);
    photoUrl = publicUrlData.publicUrl;
  } catch (err) {
    console.error('Upload exception:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Exception while uploading photo' }) };
  }

  // Insert photo record
  const { error: photoErr } = await supabase.from('ticket_photos').insert([
    { ticket_id: ticketId, photo_url: photoUrl },
  ]);

  if (photoErr) {
    console.error('Error inserting ticket photo:', photoErr);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to attach photo' }) };
  }

  // Optional: add a comment-style note (if description provided)
  if (description && String(description).trim().length > 0) {
    // If comments table exists, write there; otherwise ignore.
    try {
      await supabase.from('ticket_comments').insert([
        {
          ticket_id: ticketId,
          author: tech_name || null,
          body: String(description).trim(),
        },
      ]);
    } catch (e) {
      // do nothing; table may not exist yet until SQL is run
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, ticketId, photoUrl }) };
};

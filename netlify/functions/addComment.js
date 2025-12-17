// netlify/functions/addComment.js
// Adds a comment/update to a ticket. Optionally attaches a photo (stores in comment_photos).
const { createClient } = require('@supabase/supabase-js');

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    },
    body: JSON.stringify(bodyObj),
  };
}

function parseJsonBody(event) {
  if (!event.body) return null;
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  return JSON.parse(raw);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: 'Missing Supabase env vars.' });
    }

    let payload;
    try {
      payload = parseJsonBody(event);
    } catch (e) {
      const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
      return json(400, { error: 'Request body must be JSON.', rawPreview: raw.slice(0, 80) });
    }

    const ticket_id = payload?.ticket_id ?? payload?.id;
    const author = String(payload?.author || '').trim();
    const body = String(payload?.comment || payload?.body || '').trim();
    const photo_path = payload?.photo_path || null;

    if (!ticket_id || !author || !body) {
      return json(400, { error: 'Missing required fields (ticket_id, author, comment).' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: commentRow, error: cErr } = await supabase
      .from('ticket_comments')
      .insert([{ ticket_id: Number(ticket_id), author, body }])
      .select('*')
      .single();

    if (cErr) return json(500, { error: 'Add comment failed', details: cErr.message || cErr });

    if (photo_path) {
      const bucket = 'ticket-photos';
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(photo_path);
      const photo_url = pub?.publicUrl || null;

      const { error: cpErr } = await supabase
        .from('comment_photos')
        .insert([{ comment_id: commentRow.id, ticket_id: Number(ticket_id), photo_url }]);

      if (cpErr) {
        return json(200, { ok: true, comment: commentRow, warn: 'Comment added but photo record insert failed', photoInsertError: cpErr.message || cpErr });
      }
    }

    return json(200, { ok: true, comment: commentRow });
  } catch (err) {
    return json(500, { error: 'Server error', details: err?.message || String(err) });
  }
};

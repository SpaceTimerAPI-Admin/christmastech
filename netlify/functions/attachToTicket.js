// netlify/functions/attachToTicket.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.SUPABASE_BUCKET_NAME || 'ticket-photos';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Supabase env vars are not set',
      }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const {
    ticketId,
    tech_name,
    description,
    lat,
    lon,
    photoBase64,
    photoFilename,
  } = payload;

  if (!ticketId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'ticketId is required' }),
    };
  }

  let photoUrl = null;
  if (photoBase64 && photoFilename) {
    try {
      const base64Parts = photoBase64.split(',');
      const base64Data =
        base64Parts.length === 2 ? base64Parts[1] : photoBase64;

      const buffer = Buffer.from(base64Data, 'base64');
      const ext = (photoFilename.split('.').pop() || 'jpg').toLowerCase();
      const path = `ticket-${ticketId}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const contentType =
        ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'png'
          ? 'image/png'
          : 'image/octet-stream';

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(path, buffer, {
          contentType,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error:
              'Failed to upload photo: ' +
              (uploadError.message ||
                uploadError.error_description ||
                'unknown error'),
          }),
        };
      }

      const { data: publicUrlData } = await supabase.storage
        .from(bucketName)
        .getPublicUrl(path);

      photoUrl = publicUrlData.publicUrl;
    } catch (err) {
      console.error('Photo upload exception:', err);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error:
            'Exception while uploading photo: ' +
            (err.message || 'unknown error'),
        }),
      };
    }
  }

  if (photoUrl) {
    const { error: photoErr } = await supabase
      .from('ticket_photos')
      .insert([
        {
          ticket_id: ticketId,
          photo_url: photoUrl,
        },
      ]);

    if (photoErr) {
      console.error('Error inserting ticket photo:', photoErr);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to attach photo to ticket',
        }),
      };
    }
  }

  if (lat != null && lon != null) {
    await supabase
      .from('tickets')
      .update({
        lat,
        lon,
      })
      .eq('id', ticketId);
  }

  if (description || tech_name) {
    const note = `${tech_name || 'Tech'} update: ${description || ''}`.trim();
    const { data: current, error: curErr } = await supabase
      .from('tickets')
      .select('description')
      .eq('id', ticketId)
      .single();

    if (!curErr && current) {
      const merged =
        (current.description ? current.description + '\n\n' : '') + note;
      await supabase
        .from('tickets')
        .update({ description: merged })
        .eq('id', ticketId);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      attached: true,
      ticketId,
    }),
  };
};

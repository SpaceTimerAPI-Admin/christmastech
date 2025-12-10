// netlify/functions/createTicket.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Radius in meters to consider a "duplicate" ticket
const DUPLICATE_RADIUS_METERS = 25;

// Haversine distance in meters between two coords
function distanceMeters(lat1, lon1, lat2, lon2) {
  if (
    lat1 == null ||
    lon1 == null ||
    lat2 == null ||
    lon2 == null
  ) {
    return Infinity;
  }

  const R = 6371000; // Earth radius in meters
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
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'tech_name and location_friendly are required',
      }),
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
      const path = `ticket-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('ticket-photos')
        .upload(path, buffer, {
          contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: 'Failed to upload photo',
          }),
        };
      }

      const { data: publicUrlData } = supabase.storage
        .from('ticket-photos')
        .getPublicUrl(path);

      photoUrl = publicUrlData.publicUrl;
    } catch (err) {
      console.error('Photo upload exception:', err);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Exception while uploading photo',
        }),
      };
    }
  }

  let duplicates = [];
  if (lat != null && lon != null && !forceNew) {
    const { data: openTickets, error: openErr } = await supabase
      .from('tickets')
      .select(
        'id, tech_name, location_friendly, description, created_at, lat, lon, status'
      )
      .eq('status', 'open');

    if (openErr) {
      console.error('Error fetching open tickets:', openErr);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to fetch open tickets for duplicate check',
        }),
      };
    }

    if (openTickets && openTickets.length > 0) {
      duplicates = openTickets.filter((t) => {
        const d = distanceMeters(
          lat,
          lon,
          t.lat,
          t.lon
        );
        return d <= DUPLICATE_RADIUS_METERS;
      });
    }

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
            photoUrl,
          },
        }),
      };
    }
  }

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
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to create ticket',
      }),
    };
  }

  if (photoUrl) {
    const { error: photoErr } = await supabase
      .from('ticket_photos')
      .insert([
        {
          ticket_id: ticket.id,
          photo_url: photoUrl,
        },
      ]);

    if (photoErr) {
      console.error('Error inserting ticket photo:', photoErr);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      created: true,
      ticketId: ticket.id,
    }),
  };
};

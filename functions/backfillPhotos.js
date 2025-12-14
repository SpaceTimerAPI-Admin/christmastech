// netlify/functions/backfillPhotos.js
// ✅ One-time restore: rebuild tickets.photo_url (and ticket_photos) from existing Storage objects.
//
// Why: your photos are still in Supabase Storage, but photo_url got wiped to NULL in tickets.
// Your storage filenames look like: ticket-<EPOCH_MS>-<rand>.<ext>
// We match each ticket.created_at to the closest file timestamp within a time window.
//
// SECURITY: requires BACKFILL_SECRET env var and a matching ?secret=... query param.
// Dry run: ?secret=...&dryRun=1
//
// Env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_BUCKET_NAME (default ticket-photos)
//   BACKFILL_SECRET (required)

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.SUPABASE_BUCKET_NAME || 'ticket-photos';
const backfillSecret = process.env.BACKFILL_SECRET;

function parseEpochMsFromName(name) {
  const m = /^ticket-(\d{10,})-/.exec(name || '');
  if (!m) return null;
  const ms = Number(m[1]);
  return Number.isFinite(ms) ? ms : null;
}

function toMs(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

async function listAllObjects(supabase) {
  const all = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage.from(bucketName).list('', {
      limit,
      offset,
      sortBy: { column: 'created_at', order: 'asc' },
    });

    if (error) throw error;

    const batch = data || [];
    all.push(...batch);

    if (batch.length < limit) break;
    offset += limit;
  }

  return all;
}

exports.handler = async (event) => {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing SUPABASE env vars' }) };
    }
    if (!backfillSecret) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing BACKFILL_SECRET env var' }) };
    }

    const qs = event.queryStringParameters || {};
    const secret = qs.secret;
    const dryRun = qs.dryRun === '1' || qs.dryRun === 'true';

    // Optional tuning
    const windowBeforeMin = Number(qs.beforeMin || 3);   // minutes before ticket time
    const windowAfterMin  = Number(qs.afterMin  || 12);  // minutes after ticket time

    if (secret !== backfillSecret) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load tickets (ONLY ones missing photo_url)
    const { data: tickets, error: tErr } = await supabase
      .from('tickets')
      .select('id, created_at, photo_url')
      .is('photo_url', null)
      .order('created_at', { ascending: true });

    if (tErr) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to load tickets', details: tErr.message || tErr }) };
    }

    // List storage objects
    const objects = await listAllObjects(supabase);

    const candidates = objects
      .map(o => ({ name: o.name, epoch_ms: parseEpochMsFromName(o.name) }))
      .filter(o => !!o.epoch_ms);

    const used = new Set();

    function pickObject(ticketMs) {
      const minMs = ticketMs - (windowBeforeMin * 60 * 1000);
      const maxMs = ticketMs + (windowAfterMin * 60 * 1000);

      let best = null;
      let bestDelta = Infinity;

      for (const o of candidates) {
        if (used.has(o.name)) continue;
        if (o.epoch_ms < minMs || o.epoch_ms > maxMs) continue;

        const delta = Math.abs(o.epoch_ms - ticketMs);
        if (delta < bestDelta) {
          best = o;
          bestDelta = delta;
        }
      }
      return best;
    }

    const matches = [];

    for (const t of (tickets || [])) {
      const ticketMs = toMs(t.created_at);
      if (!ticketMs) continue;

      const obj = pickObject(ticketMs);
      if (!obj) continue;

      // Public URL format
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${encodeURIComponent(obj.name)}`;

      used.add(obj.name);
      matches.push({
        ticket_id: t.id,
        created_at: t.created_at,
        file: obj.name,
        publicUrl,
        delta_ms: Math.abs(obj.epoch_ms - ticketMs),
      });
    }

    if (dryRun) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true, windowBeforeMin, windowAfterMin, matchCount: matches.length, matches }, null, 2),
      };
    }

    // Execute
    let updated = 0;
    let inserted = 0;
    const failures = [];

    for (const m of matches) {
      try {
        const { error: uErr } = await supabase.from('tickets').update({ photo_url: m.publicUrl }).eq('id', m.ticket_id);
        if (uErr) throw uErr;
        updated++;

        // Add to ticket_photos (non-fatal if exists)
        const { error: iErr } = await supabase.from('ticket_photos').insert([{ ticket_id: m.ticket_id, photo_url: m.publicUrl }]);
        if (!iErr) inserted++;
      } catch (e) {
        failures.push({ ticket_id: m.ticket_id, error: e.message || String(e) });
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: false, matchCount: matches.length, ticketsUpdated: updated, photoRowsInserted: inserted, failures }, null, 2),
    };
  } catch (err) {
    console.error('backfillPhotos fatal:', err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Fatal error', details: err.message || String(err) }) };
  }
};

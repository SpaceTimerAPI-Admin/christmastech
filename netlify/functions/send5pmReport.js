// netlify/functions/send5pmReport.js
// Formatted 5pm report + correct links using SITE_BASE_URL.
// Also safe to call manually from /report in GroupMe.
const { createClient } = require('@supabase/supabase-js');
const { sendToGroupMe, chunkText, siteBaseUrl } = require('./_lib');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

exports.handler = async () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Supabase env vars missing' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: tickets, error: tErr } = await supabase
    .from('tickets')
    .select('id, created_at, location_friendly, status')
    .eq('status', 'open')
    .order('created_at', { ascending: true });

  if (tErr) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to fetch tickets', details: tErr.message || tErr }) };
  }

  const openTickets = tickets || [];
  const ids = openTickets.map(t => t.id);

  // Any ticket with at least one comment is considered "has updates"
  let commented = new Set();
  if (ids.length) {
    const { data: comments, error: cErr } = await supabase
      .from('ticket_comments')
      .select('ticket_id')
      .in('ticket_id', ids);

    if (!cErr && comments) {
      for (const c of comments) commented.add(c.ticket_id);
    }
  }

  const priority = openTickets.filter(t => !commented.has(t.id)); // open, no comments
  const updated = openTickets.filter(t => commented.has(t.id));  // open, has comments

  const newLink = `${siteBaseUrl}/new`;
  const dashLink = `${siteBaseUrl}/dashboard`;

  const lines = [];
  lines.push('🎄 5pm Report- Please priortize the below list of tickets within the next Walk Around');
  lines.push('');
  lines.push(`Submit a new ticket: ${newLink}`);
  lines.push('');
  lines.push('Ticket system guidance:');
  lines.push('- The ticket system is used for issues found in the park that troubleshooting did not fix.');
  lines.push('- Always try to fix the issue before making a ticket.');
  lines.push('');

  lines.push('=== Priority Tickets (Open • No comments/updates yet) ===');
  if (!priority.length) {
    lines.push('None ✅');
  } else {
    for (const t of priority) {
      lines.push(`- #${t.id} • ${t.location_friendly || '(no location)'} • ${fmtDate(t.created_at)} • ${siteBaseUrl}/ticket.html?id=${t.id}`);
    }
  }

  lines.push('');
  lines.push('=== Open Tickets (With comments/updates) ===');
  if (!updated.length) {
    lines.push('None ✅');
  } else {
    for (const t of updated) {
      lines.push(`- #${t.id} • ${t.location_friendly || '(no location)'} • ${fmtDate(t.created_at)} • ${siteBaseUrl}/ticket.html?id=${t.id}`);
    }
  }

  lines.push('');
  lines.push(`To view all open tickets and view the map, visit ${dashLink}.`);

  const msg = lines.join('\n');
  for (const chunk of chunkText(msg, 900)) await sendToGroupMe(chunk);

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, openCount: openTickets.length, priorityCount: priority.length, updatedCount: updated.length, siteBaseUrl }) };
};

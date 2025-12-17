// netlify/functions/send5pmReport.js
// 5pm report WITHOUT timestamps
const { createClient } = require('@supabase/supabase-js');
const { sendToGroupMe, chunkText, siteBaseUrl } = require('./_lib');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Supabase env vars missing' })
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: tickets, error } = await supabase
    .from('tickets')
    .select('id, location_friendly, status')
    .eq('status', 'open')
    .order('created_at', { ascending: true });

  if (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch tickets' })
    };
  }

  const openTickets = tickets || [];
  const ids = openTickets.map(t => t.id);

  let commented = new Set();
  if (ids.length) {
    const { data: comments } = await supabase
      .from('ticket_comments')
      .select('ticket_id')
      .in('ticket_id', ids);

    if (comments) {
      for (const c of comments) commented.add(c.ticket_id);
    }
  }

  const priority = openTickets.filter(t => !commented.has(t.id));
  const updated = openTickets.filter(t => commented.has(t.id));

  const lines = [];
  lines.push('🎄 5pm Report- Please priortize the below list of tickets within the next Walk Around');
  lines.push('');
  lines.push(`Submit a new ticket: ${siteBaseUrl}/new`);
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
      lines.push(`- #${t.id} • ${t.location_friendly || '(no location)'} • ${siteBaseUrl}/ticket.html?id=${t.id}`);
    }
  }

  lines.push('');
  lines.push('=== Open Tickets (With comments/updates) ===');
  if (!updated.length) {
    lines.push('None ✅');
  } else {
    for (const t of updated) {
      lines.push(`- #${t.id} • ${t.location_friendly || '(no location)'} • ${siteBaseUrl}/ticket.html?id=${t.id}`);
    }
  }

  lines.push('');
  lines.push(`To view all open tickets and view the map, visit ${siteBaseUrl}/dashboard.`);

  const msg = lines.join('\n');
  for (const chunk of chunkText(msg, 900)) {
    await sendToGroupMe(chunk);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  };
};

// netlify/functions/send5pmReport.js
// Sends the 5pm report to GroupMe with the requested formatting and prioritization.
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const groupmeBotId = process.env.GROUPME_BOT_ID;
const groupmePostUrl = process.env.GROUPME_BOT_POST_URL || 'https://api.groupme.com/v3/bots/post';
const siteBaseUrl = process.env.SITE_BASE_URL || 'https://swoems.com';

async function sendToGroupMe(text) {
  if (!groupmeBotId) return;
  await fetch(groupmePostUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bot_id: groupmeBotId, text }),
  });
}

function fmtTicketLine(t) {
  const created = t.created_at ? new Date(t.created_at).toLocaleString() : '';
  return `• #${t.id} — ${t.location_friendly || '(no location)'}${created ? ` (${created})` : ''}\n  ${siteBaseUrl}/ticket.html?id=${t.id}`;
}

exports.handler = async () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Supabase env vars are not set' }) };
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

  const commentCounts = new Map();
  if (ids.length) {
    const { data: comments } = await supabase
      .from('ticket_comments')
      .select('ticket_id')
      .in('ticket_id', ids);

    (comments || []).forEach(c => {
      commentCounts.set(c.ticket_id, (commentCounts.get(c.ticket_id) || 0) + 1);
    });
  }

  const priority = openTickets
    .filter(t => (commentCounts.get(t.id) || 0) === 0)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const updated = openTickets
    .filter(t => (commentCounts.get(t.id) || 0) > 0)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const header =
`🕔 5pm Report — Please prioritize the below list of tickets within the next Walk Around

Submit a new ticket: ${siteBaseUrl}/new

Ticket system is used for issues found in the park that troubleshooting did not fix.
Always try to fix the issue before making a ticket.`;

  const section1 =
`\n\n🚨 PRIORITY — Open tickets with NO comments/updates (oldest → newest)
${priority.length ? priority.map(fmtTicketLine).join('\n\n') : '• None 🎉'}`;

  const section2 =
`\n\n🧾 Open tickets WITH comments/updates (oldest → newest)
${updated.length ? updated.map(fmtTicketLine).join('\n\n') : '• None'}`;

  const footer =
`\n\nTo view all open tickets and view the map, visit ${siteBaseUrl}/dashboard.`;

  await sendToGroupMe(header + section1 + section2 + footer);

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, open: openTickets.length, priority: priority.length, updated: updated.length }) };
};

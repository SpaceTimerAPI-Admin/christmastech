// netlify/functions/send5pmReport.js
const { getSb } = require("./sb");
const { ok, server, sendToGroupMe, ticketUrl, SITE_BASE_URL } = require("./_lib");

function hasAnyUpdates(commentsByTicket, ticketId) {
  return (commentsByTicket.get(ticketId) || []).length > 0;
}

exports.handler = async (event) => {
  try {
    const sb = getSb();

    const { data: openTickets, error: tErr } = await sb
      .from("tickets")
      .select("id,location_friendly,created_at,status")
      .eq("status", "open")
      .order("created_at", { ascending: true });

    if (tErr) return server("Report tickets query failed", { details: tErr.message });

    if (!openTickets || openTickets.length === 0) {
      await sendToGroupMe(
        `🕔 5pm Report - Please prioritize the below list of tickets within the next Walk Around\n\nNo open tickets right now.\n\nNew ticket: ${SITE_BASE_URL}/new.html\nDashboard + map: ${SITE_BASE_URL}/dashboard.html`
      );
      return ok({ ok: true, count: 0 });
    }

    const ids = openTickets.map(t => t.id);

    const { data: comments, error: cErr } = await sb
      .from("ticket_comments")
      .select("ticket_id,id")
      .in("ticket_id", ids);

    if (cErr) return server("Report comments query failed", { details: cErr.message });

    const map = new Map();
    (comments || []).forEach(r => {
      if (!map.has(r.ticket_id)) map.set(r.ticket_id, []);
      map.get(r.ticket_id).push(r);
    });

    const priority = openTickets.filter(t => !hasAnyUpdates(map, t.id));
    const updated = openTickets.filter(t => hasAnyUpdates(map, t.id));

    const lines = [];
    lines.push("🕔 5pm Report - Please prioritize the below list of tickets within the next Walk Around");
    lines.push("");
    lines.push(`New ticket: ${SITE_BASE_URL}/new.html`);
    lines.push("The ticket system is used for issues found in the park that troubleshooting did not fix. Always try to fix the issue before making a ticket.");
    lines.push("");

    lines.push("🚨 Priority (no updates yet):");
    if (priority.length === 0) lines.push("• None");
    else priority.forEach(t => lines.push(`• #${t.id} – ${t.location_friendly}\n  ${ticketUrl(t.id)}`));
    lines.push("");

    if (updated.length) {
      lines.push("✅ Open tickets with updates:");
      updated.forEach(t => lines.push(`• #${t.id} – ${t.location_friendly}\n  ${ticketUrl(t.id)}`));
      lines.push("");
    }

    lines.push(`To view all open tickets and view the map, visit ${SITE_BASE_URL}/dashboard.html`);

    // GroupMe has a message size limit; send as one chunk but safely trim if huge
    const msg = lines.join("\n");
    await sendToGroupMe(msg.length > 9500 ? msg.slice(0, 9500) + "\n…(truncated)" : msg);

    return ok({ ok: true, count: openTickets.length });
  } catch (e) {
    return server("Report error", { details: String(e?.message || e) });
  }
};

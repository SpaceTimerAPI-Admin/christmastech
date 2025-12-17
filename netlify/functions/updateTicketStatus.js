// netlify/functions/updateTicketStatus.js
// Sets ticket status to open or fixed. Notifies GroupMe.
const { getSb } = require("./sb");
const { ok, bad, server, sendToGroupMe, ticketUrl } = require("./_lib");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return ok({});
  if (event.httpMethod !== "POST") return bad("Use POST");

  try {
    const body = JSON.parse(event.body || "{}");
    const id = body.id;
    const status = body.status;

    if (!id) return bad("Missing id");
    if (!["open", "fixed"].includes(status)) return bad("Invalid status");

    const sb = getSb();
    const { data: ticket, error } = await sb
      .from("tickets")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return server("Update status failed", { details: error.message });

    const emoji = status === "fixed" ? "✅" : "⚠️";
    const label = status === "fixed" ? "Ticket Fixed" : "Ticket Reopened (Unresolved)";
    await sendToGroupMe([`${emoji} ${label}`, `#${ticket.id} – ${ticket.location_friendly}`, "", ticketUrl(ticket.id)].join("\n"));

    return ok({ ticket });
  } catch (e) {
    return server("Update status error", { details: String(e?.message || e) });
  }
};

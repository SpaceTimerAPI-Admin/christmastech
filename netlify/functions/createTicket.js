// netlify/functions/createTicket.js
// Creates a ticket and (optionally) attaches the uploaded photo path to ticket_photos.
// Sends a GroupMe alert with ticket link + description (+ photo link).
const { getSb } = require("./sb");
const { ok, bad, server, sendToGroupMe, ticketUrl } = require("./_lib");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return ok({});
  if (event.httpMethod !== "POST") return bad("Use POST");

  try {
    const body = JSON.parse(event.body || "{}");
    const tech_name = (body.tech_name || "").trim();
    const location_friendly = (body.location_friendly || "").trim();
    const description = (body.description || "").trim();
    const lat = body.lat ?? null;
    const lon = body.lon ?? null;
    const photo_path = body.photo_path || body.photoPath || null;
    const photo_url = body.photo_url || body.photoUrl || null;

    if (!tech_name || !location_friendly || !description) {
      return bad("Missing required fields");
    }

    const sb = getSb();

    const { data: ticket, error: tErr } = await sb
      .from("tickets")
      .insert([{ tech_name, location_friendly, description, lat, lon, status: "open" }])
      .select("*")
      .single();

    if (tErr) return server("Ticket insert failed", { details: tErr.message });

    let attachedPublicUrl = null;

    // If frontend uploaded photo to storage, attach it to ticket_photos table
    const storagePath = photo_path || null;
    if (storagePath) {
      const { data: pub } = sb.storage.from("ticket-photos").getPublicUrl(storagePath);
      attachedPublicUrl = pub?.publicUrl || null;

      // ticket_photos schema: ticket_id, file_path, public_url
      await sb.from("ticket_photos").insert([{
        ticket_id: ticket.id,
        file_path: storagePath,
        public_url: attachedPublicUrl
      }]);
    } else if (photo_url) {
      attachedPublicUrl = photo_url;
      await sb.from("ticket_photos").insert([{
        ticket_id: ticket.id,
        file_path: null,
        public_url: attachedPublicUrl
      }]);
    }

    // GroupMe alert
    const lines = [
      "🟢 New Ticket Created",
      `#${ticket.id} – ${ticket.location_friendly}`,
      "",
      description.length > 220 ? (description.slice(0, 220) + "…") : description,
      "",
      ticketUrl(ticket.id),
    ];
    if (attachedPublicUrl) {
      lines.push("", "Photo:", attachedPublicUrl);
    }
    await sendToGroupMe(lines.join("\n"));

    return ok({ ticket, id: ticket.id });
  } catch (e) {
    return server("Create ticket error", { details: String(e?.message || e) });
  }
};

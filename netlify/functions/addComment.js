// netlify/functions/addComment.js
// Adds a comment/update to a ticket. Optional photo attachment.
// Sends GroupMe alert (comment/update).
const { getSb } = require("./sb");
const { ok, bad, server, sendToGroupMe, ticketUrl } = require("./_lib");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return ok({});
  if (event.httpMethod !== "POST") return bad("Use POST");

  try {
    const body = JSON.parse(event.body || "{}");
    const ticket_id = body.ticket_id || body.ticketId;
    const author = (body.author || "").trim();
    const comment = (body.comment || body.body || "").trim();
    const photo_path = body.photo_path || body.photoPath || null;
    const photo_url = body.photo_url || body.photoUrl || null;

    if (!ticket_id) return bad("Missing ticket_id");
    if (!author || !comment) return bad("Missing author or comment");

    const sb = getSb();

    let attachedPublicUrl = null;
    if (photo_path) {
      const { data: pub } = sb.storage.from("ticket-photos").getPublicUrl(photo_path);
      attachedPublicUrl = pub?.publicUrl || null;
    } else if (photo_url) {
      attachedPublicUrl = photo_url;
    }

    const { data: row, error } = await sb
      .from("ticket_comments")
      .insert([{ ticket_id, author, body: comment, photo_url: attachedPublicUrl }])
      .select("*")
      .single();

    if (error) return server("Add comment failed", { details: error.message });

    const lines = [
      "📝 Ticket Update",
      `#${ticket_id} – ${author}`,
      "",
      comment.length > 240 ? (comment.slice(0, 240) + "…") : comment,
      "",
      ticketUrl(ticket_id),
    ];
    if (attachedPublicUrl) {
      lines.push("", "Photo:", attachedPublicUrl);
    }
    await sendToGroupMe(lines.join("\n"));

    return ok({ comment: row });
  } catch (e) {
    return server("Add comment error", { details: String(e?.message || e) });
  }
};

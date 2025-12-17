// netlify/functions/uploadphoto.js
// Uploads a base64 image into Supabase Storage bucket `ticket-photos`
// Returns { path, publicUrl }
const { getSb } = require("./sb");
const { ok, bad, server } = require("./_lib");

const BUCKET = "ticket-photos";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return ok({});
  if (event.httpMethod !== "POST") return bad("Use POST");

  try {
    const body = JSON.parse(event.body || "{}");
    const base64 = body.base64;
    const contentType = body.contentType || "image/jpeg";

    if (!base64) return bad("Missing base64");

    const sb = getSb();
    const buf = Buffer.from(base64, "base64");

    const ext = (contentType.includes("png") ? "png" : "jpg");
    const file = `ticket-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: upErr } = await sb.storage.from(BUCKET).upload(file, buf, {
      contentType,
      upsert: false,
    });
    if (upErr) return server("Upload failed", { details: upErr.message });

    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(file);
    return ok({ path: file, publicUrl: pub?.publicUrl });
  } catch (e) {
    return server("Upload error", { details: String(e?.message || e) });
  }
};

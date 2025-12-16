\
/**
 * netlify/functions/uploadphoto.js
 * Uploads an image to Supabase Storage and returns publicUrl.
 *
 * Supports:
 * 1) multipart/form-data (FormData) with field name "file"
 * 2) JSON { base64, contentType? }
 *
 * Env:
 * SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 * TICKET_PHOTOS_BUCKET (optional, default "ticket-photos")
 */
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.TICKET_PHOTOS_BUCKET || "ticket-photos";

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

function rand(n = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function parseBoundary(contentType) {
  const m = /boundary=([^;]+)/i.exec(contentType || "");
  return m ? m[1].trim() : null;
}

/**
 * Very small multipart parser (single file).
 * Returns { filename, contentType, buffer } or null.
 */
function parseMultipart(bodyBuf, boundary) {
  const boundaryBuf = Buffer.from("--" + boundary);
  const endBoundaryBuf = Buffer.from("--" + boundary + "--");
  const parts = [];

  // Split by boundary markers
  let start = bodyBuf.indexOf(boundaryBuf);
  if (start === -1) return null;

  while (start !== -1) {
    start += boundaryBuf.length;
    // Skip optional \r\n
    if (bodyBuf[start] === 13 && bodyBuf[start + 1] === 10) start += 2;

    const next = bodyBuf.indexOf(boundaryBuf, start);
    const end = next !== -1 ? next : bodyBuf.indexOf(endBoundaryBuf, start);
    if (end === -1) break;

    const chunk = bodyBuf.slice(start, end);
    parts.push(chunk);
    start = next;
  }

  // Find the part with name="file"
  for (const part of parts) {
    const sep = Buffer.from("\r\n\r\n");
    const i = part.indexOf(sep);
    if (i === -1) continue;

    const headerBuf = part.slice(0, i).toString("utf8");
    const dataBuf = part.slice(i + sep.length);

    if (!/name="file"/i.test(headerBuf)) continue;

    const fnMatch = /filename="([^"]*)"/i.exec(headerBuf);
    const ctMatch = /content-type:\s*([^\r\n]+)/i.exec(headerBuf);

    // Trim trailing CRLF from data
    let fileBuf = dataBuf;
    if (fileBuf.length >= 2 && fileBuf[fileBuf.length - 2] === 13 && fileBuf[fileBuf.length - 1] === 10) {
      fileBuf = fileBuf.slice(0, -2);
    }

    return {
      filename: fnMatch ? fnMatch[1] : `upload-${Date.now()}.jpg`,
      contentType: ctMatch ? ctMatch[1].trim() : "image/jpeg",
      buffer: fileBuf,
    };
  }

  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  if (!supabaseUrl || !supabaseServiceKey) {
    return json(500, { error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const ct = event.headers["content-type"] || event.headers["Content-Type"] || "";

    let fileBuf = null;
    let contentType = null;

    if (ct.toLowerCase().includes("multipart/form-data")) {
      const boundary = parseBoundary(ct);
      if (!boundary) return json(400, { error: "Missing multipart boundary" });

      const bodyBuf = event.isBase64Encoded
        ? Buffer.from(event.body || "", "base64")
        : Buffer.from(event.body || "", "utf8"); // fallback

      const parsed = parseMultipart(bodyBuf, boundary);
      if (!parsed) return json(400, { error: "No file field named 'file' found" });

      fileBuf = parsed.buffer;
      contentType = parsed.contentType || "image/jpeg";
    } else {
      // JSON base64 mode
      let payload;
      try {
        payload = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "Bad JSON body" });
      }
      if (!payload.base64) return json(400, { error: "Missing base64" });
      contentType = payload.contentType || "image/jpeg";
      fileBuf = Buffer.from(payload.base64, "base64");
    }

    if (!fileBuf || !fileBuf.length) return json(400, { error: "Empty upload" });

    const ext = (contentType || "").includes("png") ? "png" : "jpg";
    const path = `ticket-${Date.now()}-${rand()}.${ext}`;

    const { error: upErr } = await supabase.storage.from(bucket).upload(path, fileBuf, {
      contentType: contentType || "image/jpeg",
      upsert: false,
      cacheControl: "3600",
    });

    if (upErr) return json(500, { error: "Failed to upload photo", details: upErr.message || upErr });

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return json(200, { ok: true, path, publicUrl: data?.publicUrl || null });
  } catch (e) {
    return json(500, { error: "Upload exception", details: e.message || String(e) });
  }
};

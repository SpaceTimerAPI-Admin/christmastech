/**
 * netlify/functions/uploadphoto.js
 * Uploads a single image to Supabase Storage and returns a public URL.
 *
 * Accepts:
 *  - multipart/form-data with field name "file" (recommended)
 *  - JSON: { base64: "...", contentType?: "image/jpeg" }
 *
 * Env vars required:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 * Optional:
 *  - TICKET_PHOTOS_BUCKET (default: "ticket-photos")
 */
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.TICKET_PHOTOS_BUCKET || "ticket-photos";

function resp(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body: JSON.stringify(obj)
  };
}

function getHeader(event, name) {
  const h = event.headers || {};
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()] || "";
}

function rand(n) {
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
 * Minimal multipart parser for one file field "file".
 * Returns { buffer, contentType } or null.
 */
function parseMultipartFile(bodyBuf, boundary) {
  const boundaryBuf = Buffer.from("--" + boundary);
  const headerSep = Buffer.from("\r\n\r\n");

  let pos = bodyBuf.indexOf(boundaryBuf);
  if (pos === -1) return null;

  while (pos !== -1) {
    pos += boundaryBuf.length;

    // Skip leading CRLF
    if (bodyBuf[pos] === 13 && bodyBuf[pos + 1] === 10) pos += 2;

    const nextBoundary = bodyBuf.indexOf(boundaryBuf, pos);
    if (nextBoundary === -1) break;

    const part = bodyBuf.slice(pos, nextBoundary);

    const headerEnd = part.indexOf(headerSep);
    if (headerEnd === -1) {
      pos = nextBoundary;
      continue;
    }

    const headerText = part.slice(0, headerEnd).toString("utf8");
    if (headerText.indexOf('name="file"') === -1) {
      pos = nextBoundary;
      continue;
    }

    const ctMatch = /content-type:\s*([^\r\n]+)/i.exec(headerText);
    const contentType = ctMatch ? ctMatch[1].trim() : "image/jpeg";

    let data = part.slice(headerEnd + headerSep.length);

    // Trim trailing CRLF
    if (data.length >= 2 && data[data.length - 2] === 13 && data[data.length - 1] === 10) {
      data = data.slice(0, -2);
    }

    return { buffer: data, contentType };
  }

  return null;
}

exports.handler = async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") return resp(200, { ok: true });
    if (event.httpMethod !== "POST") return resp(405, { error: "Method Not Allowed" });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return resp(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const ct = getHeader(event, "content-type");
    let fileBuf = null;
    let fileContentType = "image/jpeg";

    if ((ct || "").toLowerCase().includes("multipart/form-data")) {
      const boundary = parseBoundary(ct);
      if (!boundary) return resp(400, { error: "Missing multipart boundary" });

      const bodyBuf = event.isBase64Encoded
        ? Buffer.from(event.body || "", "base64")
        : Buffer.from(event.body || "", "utf8");

      const parsed = parseMultipartFile(bodyBuf, boundary);
      if (!parsed) return resp(400, { error: "No file field named 'file' found" });

      fileBuf = parsed.buffer;
      fileContentType = parsed.contentType || "image/jpeg";
    } else {
      // JSON base64 mode
      let payload;
      try {
        payload = JSON.parse(event.body || "{}");
      } catch (e) {
        return resp(400, { error: "Bad JSON body" });
      }
      if (!payload.base64) return resp(400, { error: "Missing base64" });
      fileContentType = payload.contentType || "image/jpeg";
      fileBuf = Buffer.from(payload.base64, "base64");
    }

    if (!fileBuf || fileBuf.length === 0) return resp(400, { error: "Empty upload" });

    const ext = (fileContentType || "").toLowerCase().includes("png") ? "png" : "jpg";
    const path = "ticket-" + Date.now() + "-" + rand(12) + "." + ext;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, fileBuf, { contentType: fileContentType, upsert: false, cacheControl: "3600" });

    if (upErr) return resp(500, { error: "Failed to upload photo", details: upErr.message || String(upErr) });

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return resp(200, { ok: true, path: path, publicUrl: data && data.publicUrl ? data.publicUrl : null });
  } catch (e) {
    return resp(500, { errorType: "Exception", errorMessage: e && e.message ? e.message : String(e) });
  }
};

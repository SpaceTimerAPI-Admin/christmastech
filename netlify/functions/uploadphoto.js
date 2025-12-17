/**
 * netlify/functions/uploadphoto.js
 * Uploads an image to Supabase Storage and returns { publicUrl, path }.
 *
 * Supports:
 * 1) multipart/form-data with field name "file"
 * 2) JSON { base64, contentType, prefix? }
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TICKET_PHOTOS_BUCKET (default ticket-photos)
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
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

function rand(n) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function getHeader(event, name) {
  const h = event.headers || {};
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()] || "";
}

function parseBoundary(contentType) {
  const m = /boundary=([^;]+)/i.exec(contentType || "");
  return m ? m[1].trim() : null;
}

// Minimal multipart parser for a single file field named "file"
function parseMultipartSingleFile(bodyBuf, boundary) {
  const boundaryStr = "--" + boundary;
  const parts = bodyBuf.toString("latin1").split(boundaryStr);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.indexOf('name="file"') === -1) continue;

    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headerText = part.slice(0, headerEnd);
    const dataText = part.slice(headerEnd + 4);

    let data = dataText;
    if (data.endsWith("\r\n")) data = data.slice(0, -2);

    const ctMatch = /content-type:\s*([^\r\n]+)/i.exec(headerText);
    const fileContentType = ctMatch ? ctMatch[1].trim() : "image/jpeg";
    const buf = Buffer.from(data, "latin1");
    return { buffer: buf, contentType: fileContentType };
  }
  return null;
}

exports.handler = async (event) => {
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
    let prefix = "ticket";

    if ((ct || "").toLowerCase().indexOf("multipart/form-data") !== -1) {
      const boundary = parseBoundary(ct);
      if (!boundary) return resp(400, { error: "Missing multipart boundary" });

      const bodyBuf = event.isBase64Encoded
        ? Buffer.from(event.body || "", "base64")
        : Buffer.from(event.body || "", "utf8");

      const parsed = parseMultipartSingleFile(bodyBuf, boundary);
      if (!parsed) return resp(400, { error: "No file field named 'file' found" });

      fileBuf = parsed.buffer;
      fileContentType = parsed.contentType || "image/jpeg";
    } else {
      let payload;
      try { payload = JSON.parse(event.body || "{}"); }
      catch { return resp(400, { error: "Bad JSON body" }); }

      if (!payload.base64) return resp(400, { error: "Missing base64" });
      prefix = (payload.prefix || "ticket").toString().trim() || "ticket";
      fileContentType = payload.contentType || "image/jpeg";
      fileBuf = Buffer.from(payload.base64, "base64");
    }

    if (!fileBuf || fileBuf.length === 0) return resp(400, { error: "Empty upload" });

    const ext = (fileContentType || "").toLowerCase().indexOf("png") !== -1 ? "png" : "jpg";
    const path = `${prefix}-${Date.now()}-${rand(12)}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, fileBuf, { contentType: fileContentType, upsert: false, cacheControl: "3600" });

    if (upErr) return resp(500, { error: "Failed to upload photo", details: upErr.message || String(upErr) });

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return resp(200, { ok: true, path, publicUrl: data && data.publicUrl ? data.publicUrl : null });
  } catch (e) {
    return resp(500, { errorType: "Exception", errorMessage: e && e.message ? e.message : String(e) });
  }
};

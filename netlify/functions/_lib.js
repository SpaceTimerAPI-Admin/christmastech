// netlify/functions/_lib.js
const https = require("https");

const GROUPME_BOT_ID = process.env.GROUPME_BOT_ID;
const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://swoems.com").replace(/\/+$/, "");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

function ok(obj = {}) { return json(200, obj); }
function bad(msg, extra = {}) { return json(400, { error: msg, ...extra }); }
function server(msg, extra = {}) { return json(500, { error: msg, ...extra }); }

function sendToGroupMe(text) {
  return new Promise((resolve) => {
    if (!GROUPME_BOT_ID) return resolve(false);

    const postData = JSON.stringify({ bot_id: GROUPME_BOT_ID, text });

    const req = https.request(
      { hostname: "api.groupme.com", path: "/v3/bots/post", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(postData) } },
      (res) => { res.on("data", () => {}); res.on("end", () => resolve(res.statusCode >= 200 && res.statusCode < 300)); }
    );

    req.on("error", () => resolve(false));
    req.write(postData);
    req.end();
  });
}

function ticketUrl(id) {
  return `${SITE_BASE_URL}/ticket.html?id=${encodeURIComponent(id)}`;
}

module.exports = { ok, bad, server, sendToGroupMe, ticketUrl, SITE_BASE_URL };

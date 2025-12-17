// netlify/functions/_lib.js
// Shared helpers for Netlify Functions (CORS + JSON responses + GroupMe posting)

const https = require('https');

const SITE_BASE_URL = (process.env.SITE_BASE_URL || 'https://swoems.com').replace(/\/$/, '');
const GROUPME_BOT_ID = process.env.GROUPME_BOT_ID || '';
const GROUPME_BOT_POST_URL = process.env.GROUPME_BOT_POST_URL || 'https://api.groupme.com/v3/bots/post';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
    body: JSON.stringify(bodyObj ?? {}),
  };
}

function ok(bodyObj = {}) { return json(200, bodyObj); }
function bad(message, extra = {}) { return json(400, { error: message, ...extra }); }
function server(message, extra = {}) { return json(500, { error: message, ...extra }); }

function ticketUrl(id) {
  return `${SITE_BASE_URL}/ticket.html?id=${encodeURIComponent(id)}`;
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const data = Buffer.from(JSON.stringify(payload), 'utf8');
      const req = https.request(
        {
          method: 'POST',
          hostname: u.hostname,
          path: u.pathname + (u.search || ''),
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ status: res.statusCode || 0, body }));
        }
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function sendToGroupMe(text) {
  if (!GROUPME_BOT_ID) return { skipped: true };
  const payload = { bot_id: GROUPME_BOT_ID, text: String(text || '') };
  const res = await postJson(GROUPME_BOT_POST_URL, payload);
  return res;
}

module.exports = {
  SITE_BASE_URL,
  ok,
  bad,
  server,
  json,
  ticketUrl,
  sendToGroupMe,
};

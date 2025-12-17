// netlify/functions/health.js
const { ok } = require("./_lib");
exports.handler = async () => ok({ ok: true, ts: new Date().toISOString() });

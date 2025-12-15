// netlify/functions/openTicketsReport.js
// Backwards-compatible alias for older schedulers calling openTicketsReport.
const { handler } = require('./send5pmReport');
exports.handler = handler;

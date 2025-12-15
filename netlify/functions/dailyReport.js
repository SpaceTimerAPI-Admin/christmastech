// netlify/functions/dailyReport.js
// ✅ Scheduled 5pm report entrypoint
// Your scheduler currently calls dailyReport.js. This file now delegates to send5pmReport
// so the automatic 5pm report matches exactly what /report sends.
const { handler } = require('./send5pmReport');
exports.handler = handler;

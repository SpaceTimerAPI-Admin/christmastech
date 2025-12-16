// netlify/functions/upload_photo.js
// ✅ Snake_case alias for legacy callers /.netlify/functions/upload_photo
// IMPORTANT: require('./uploadPhoto') MUST resolve on Linux (case-sensitive).
const { handler } = require('./uploadPhoto');
exports.handler = handler;

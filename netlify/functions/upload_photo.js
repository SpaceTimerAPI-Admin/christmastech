// netlify/functions/upload_photo.js
// Alias for clients hitting /.netlify/functions/upload_photo (legacy naming)
const { handler } = require('./uploadPhoto');
exports.handler = handler;

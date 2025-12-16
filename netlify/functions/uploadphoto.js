// netlify/functions/uploadphoto.js
// ✅ Lowercase alias for clients or pages that call /.netlify/functions/uploadphoto
const { handler } = require('./uploadPhoto');
exports.handler = handler;

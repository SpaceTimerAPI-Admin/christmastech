// netlify/functions/uploadphoto.js
// Back-compat wrapper: older code may call uploadphoto/upload_photo.
// Delegate to uploadPhoto.js (canonical).
const { handler } = require('./uploadPhoto');
exports.handler = handler;

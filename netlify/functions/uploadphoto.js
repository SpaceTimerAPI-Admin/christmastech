// netlify/functions/uploadphoto.js
// Alias for clients hitting /.netlify/functions/uploadphoto (case mismatch)
const { handler } = require('./uploadPhoto');
exports.handler = handler;

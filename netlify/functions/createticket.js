// netlify/functions/createticket.js
// Alias for clients hitting /.netlify/functions/createticket (case mismatch)
const { handler } = require('./createTicket');
exports.handler = handler;

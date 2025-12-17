// netlify/functions/create_ticket.js
// Alias for clients hitting /.netlify/functions/create_ticket (legacy naming)
const { handler } = require('./createTicket');
exports.handler = handler;

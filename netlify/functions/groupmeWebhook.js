// netlify/functions/groupmeWebhook.js

// Basic stub so you can register a callback URL in GroupMe.
// For now, it just 200s and ignores messages. You can expand this
// later to respond to commands like `!open`, etc.

exports.handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};

// netlify/functions/groupmeWebhook.js

exports.handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};

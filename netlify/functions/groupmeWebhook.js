// netlify/functions/groupmeWebhook.js
const { ok } = require("./_lib");
const { handler: reportHandler } = require("./send5pmReport");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return ok({});
  if (event.httpMethod !== "POST") return ok({ ok: true });

  const body = JSON.parse(event.body || "{}");
  const text = (body.text || "").trim();
  const name = body.name || "";

  // ignore bot messages (GroupMe sends "sender_type": "bot" sometimes)
  if ((body.sender_type || "").toLowerCase() === "bot") return ok({ ok: true });

  if (text === "/test") {
    const { sendToGroupMe } = require("./_lib");
    await sendToGroupMe("✅ Bot is live");
    return ok({ ok: true });
  }

  if (text === "/open") {
    const { sendToGroupMe, SITE_BASE_URL } = require("./_lib");
    await sendToGroupMe(`📝 Create a new ticket: ${SITE_BASE_URL}/new.html`);
    return ok({ ok: true });
  }

  if (text === "/list") {
    const { sendToGroupMe, SITE_BASE_URL } = require("./_lib");
    await sendToGroupMe(`🗺️ View dashboard + map: ${SITE_BASE_URL}/dashboard.html`);
    return ok({ ok: true });
  }

  if (text === "/report") {
    return reportHandler(event);
  }

  return ok({ ok: true });
};

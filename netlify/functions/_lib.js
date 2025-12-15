// netlify/functions/_lib.js
// Shared helpers. IMPORTANT: set SITE_BASE_URL in Netlify env to "https://swoems.com"
const groupmeBotId = process.env.GROUPME_BOT_ID;
const groupmePostUrl = process.env.GROUPME_BOT_POST_URL || 'https://api.groupme.com/v3/bots/post';
const siteBaseUrl = (process.env.SITE_BASE_URL || 'https://swoems.com').replace(/\/$/, '');

async function sendToGroupMe(text) {
  if (!groupmeBotId) return;
  try {
    await fetch(groupmePostUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: groupmeBotId, text }),
    });
  } catch (err) {
    console.error('GroupMe post failed:', err);
  }
}

function chunkText(text, maxLen = 900) {
  const lines = (text || '').split('\n');
  const chunks = [];
  let cur = '';
  for (const line of lines) {
    if ((cur + (cur ? '\n' : '') + line).length <= maxLen) {
      cur += (cur ? '\n' : '') + line;
    } else {
      if (cur) chunks.push(cur);
      if (line.length > maxLen) {
        for (let i = 0; i < line.length; i += maxLen) chunks.push(line.slice(i, i + maxLen));
        cur = '';
      } else {
        cur = line;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

module.exports = { sendToGroupMe, chunkText, siteBaseUrl };

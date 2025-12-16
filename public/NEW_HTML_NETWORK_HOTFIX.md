<!-- public/NEW_HTML_NETWORK_HOTFIX.md
This is a *patch guide* + drop-in JS helpers to stop "Page not found" HTML responses from breaking ticket submission.
If your new.html already exists, copy only the JS helpers + the two calls where noted.
-->

1) In public/new.html, inside your main <script> block, paste this helper section near the top:

<script>
async function fetchJsonOrThrow(url, opts) {
  const res = await fetch(url, opts);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();

  // If we accidentally hit a Netlify 404 HTML page, surface it clearly.
  if (!res.ok) {
    let msg = text;
    try { if (ct.includes('application/json')) msg = JSON.parse(text).error || JSON.parse(text).message || msg; } catch {}
    const err = new Error(`[${res.status}] ${url} -> ${msg.substring(0, 250)}`);
    err.status = res.status;
    err.url = url;
    throw err;
  }

  if (!ct.includes('application/json')) {
    throw new Error(`[${res.status}] ${url} expected JSON but got ${ct}: ${text.substring(0, 250)}`);
  }
  return JSON.parse(text);
}

async function postWithFallback(urls, bodyObj) {
  const payload = JSON.stringify(bodyObj);
  const opts = { method:'POST', headers:{'Content-Type':'application/json'}, body: payload };

  let lastErr;
  for (const url of urls) {
    try { return await fetchJsonOrThrow(url, opts); }
    catch (e) {
      lastErr = e;
      // Only fallback on 404/405-ish; otherwise rethrow
      if (String(e.status) !== '404') {
        // Some setups return 404 HTML for missing functions; that's the main case.
        // If you get 401/500 here, you want to see that error.
      }
    }
  }
  throw lastErr || new Error('Request failed');
}

async function uploadPhotoSmart(base64, contentType) {
  return await postWithFallback([
    '/.netlify/functions/uploadPhoto',
    '/.netlify/functions/uploadphoto',
    '/.netlify/functions/upload_photo'
  ], { base64, contentType });
}

async function createTicketSmart(payload) {
  return await postWithFallback([
    '/.netlify/functions/createTicket',
    '/.netlify/functions/createticket',
    '/.netlify/functions/create_ticket'
  ], payload);
}
</script>

2) Then replace your existing upload + create calls with:

const up = await uploadPhotoSmart(base64, file.type || 'image/jpeg');
const photo_path = up.path || up.photo_path;

const created = await createTicketSmart({
  tech_name,
  location_friendly,
  description,
  lat,
  lon,
  photo_path,
  photo_url: up.publicUrl
});

3) Optional quick test:
Open https://www.swoems.com/.netlify/functions/health
You should see JSON { ok: true, ... }

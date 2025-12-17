FILES INCLUDED
- netlify.toml
- netlify/functions/createTicket.js
- netlify/functions/uploadphoto.js  (canonical endpoint: /.netlify/functions/uploadphoto)
- netlify/functions/uploadPhoto.js  (alias so require('./uploadPhoto') works)

IMPORTANT
1) These functions require @supabase/supabase-js in your repo root package.json dependencies.
2) Ensure Netlify site env vars are set:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - (optional) TICKET_PHOTOS_BUCKET (default: ticket-photos)
3) Your frontend should call:
   - POST /.netlify/functions/uploadphoto (multipart form-data with field "file")
   - POST /.netlify/functions/createTicket (JSON payload with photo_url from upload response)

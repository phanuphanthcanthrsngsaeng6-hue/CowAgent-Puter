# Vercel deployment

The application files are in `web/`.

Recommended Vercel settings:

- Root Directory: `web`
- Framework Preset: `Other`
- Build Command: empty
- Install Command: empty
- Output Directory: empty
- Production Branch: `our-core`

If Root Directory cannot be changed, the root `index.html` redirects to `/web/` as a fallback.

# Prep Period

Lesson scaffolds, differentiated question variants, and feedback drafts (text or photo)
for teachers. Everything is a draft — nothing grades a student.

This is a small React app (built with Vite) plus one serverless function that holds
your Gemini API key on the server, so it's safe to share the public URL with anyone.
It runs on Google's Gemini API, which has a genuine free tier — no Anthropic key needed.

## 1. Get a free Gemini API key

1. Go to https://aistudio.google.com/app/apikey
2. Sign in with a Google account and click "Create API key" — no credit card needed.
3. Copy the key somewhere safe.

Gemini's free tier is rate-limited (requests per minute and per day) rather than
metered by spend, so for a handful of teachers using this occasionally you likely
won't pay anything. Check current limits at https://ai.google.dev/gemini-api/docs/rate-limits
since they do change.

One thing to know: Google's free tier uses your prompts to help improve its models
unless you're in the EU/UK/EEA. If that matters for the student photos going through
this tool, check your school's data policy before rolling it out, or switch to Gemini's
paid tier later (same key, just add billing — paid tier does not train on your data).

## 2. Put the code on GitHub

1. Create a new empty repository on GitHub.
2. From inside this folder:
   ```
   git init
   git add .
   git commit -m "Prep Period"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

## 3. Deploy on Vercel (free tier is enough)

1. Go to https://vercel.com and sign up/log in (GitHub login is easiest).
2. Click "Add New… → Project" and import the repo you just pushed.
3. Vercel will auto-detect it as a Vite project — leave the build settings as-is.
4. Before deploying, open "Environment Variables" and add:
   - Name: `GEMINI_API_KEY`
   - Value: the key from step 1
5. Click Deploy. You'll get a live URL like `https://prep-period.vercel.app`
   in about a minute — that's what you share with other teachers.

Any time you push a change to GitHub, Vercel redeploys automatically.

## Testing it locally first (optional)

```
npm install
npm install -g vercel      # only needed once
vercel dev
```
`vercel dev` runs both the frontend and the `/api/generate` function together
on your machine, using the key from a local `.env` file (copy `.env.example` to `.env`
and fill it in). Plain `npm run dev` only runs the frontend — the buttons won't
work without the API function running too.

## If you'd rather not use Vercel

The same idea works on Netlify (functions go in `netlify/functions/` instead of `api/`)
or Render/Railway (a small Express server instead of a serverless function). The one
rule that doesn't change: the API key must live on a server you control, never inside
code that runs in someone's browser.

## Switching back to Anthropic's Claude, or to another provider

`api/generate.js` is the only file that knows which AI provider is behind this app —
it takes in `{ system, content }` and always returns `{ content: [{ type: "text", text }] }`,
so `src/PrepPeriod.jsx` never needs to change no matter which provider you use.
To switch, just rewrite the inside of that one function to call a different API.

## Worth adding before wider sharing

- **A shared password or login**, if you don't want the URL to be usable by anyone
  who finds it — right now anyone with the link can use it.
- Double-check your school's policy on uploading photos of student work to a
  third-party service before rolling this out to colleagues.

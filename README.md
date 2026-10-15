# What Can I Make? 🍳

Tell the app what's in your kitchen — ingredients, spices & condiments, equipment, and constraints — and an AI model generates 3 recipes live that you can cook right now. No recipe database.

## Stack

- **Backend:** `app.py` — a small Flask server. One endpoint, `POST /api/recipes`, calls an LLM with structured JSON output — **Google Gemini** (free tier) when `GEMINI_API_KEY` is set, otherwise **Claude** (`claude-opus-5-5`, paid) via `ANTHROPIC_API_KEY`, then re-checks the result on the server before sending it to the browser.
- **Frontend:** `static/` — plain HTML/CSS/JS, no build step.
- **Secrets:** the API key is read from an environment variable on the server and never reaches the browser.

### How the AI rules are enforced

1. The prompt spells out the rules: don't invent ingredients, respect equipment, time, diet and difficulty, and prioritize Use Soon items.
2. The model has to return JSON matching a Pydantic schema (structured outputs), so the response always parses.
3. The server double-checks every recipe and doesn't take the model's word for it:
   - An ingredient only counts as "from your kitchen" if it matches an item you actually selected. Anything else is labelled **Missing**, and this decides whether a card shows 🟢 Ready to Cook or 🟡 Almost There.
   - A recipe is dropped if it uses equipment you didn't select, goes over the time limit, is harder than you asked for, or includes an ingredient your diet forbids. When that happens, the server asks the model once more for replacements.

## Run locally

Requires Python 3.10+.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then put your key in .env
python app.py               # http://localhost:5000
```

### Getting a free key (no credit card)

1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key** and copy it.
3. In `.env`, set `GEMINI_API_KEY=<your key>`.

Check that it's configured at `http://localhost:5000/api/health`. The server reads `.env` only at startup, so restart it after editing.

The free tier is rate-limited (requests per minute and per day). If you hit the limit, the app says so — wait a minute and retry. Note that Google may use free-tier prompts to improve its products; nothing personal is sent, only ingredient lists.

Optional: `GEMINI_MODEL` pins one Gemini model (by default the app tries `gemini-3.5-flash`, then `gemini-2.5-flash`, then `gemini-2.5-flash-lite`, and keeps the first one your key can use). To use Claude instead, leave `GEMINI_API_KEY` empty and set `ANTHROPIC_API_KEY` (paid, from https://platform.claude.com); `ANTHROPIC_MODEL` and `ANTHROPIC_EFFORT` tune it.

## Deploy (Render — free, about 5 minutes)

1. Push this repo to GitHub.
2. On https://render.com → **New → Blueprint** → pick the repo. Render reads `render.yaml`.
3. When prompted, enter `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY` if you use Claude).
4. Render builds the app and gives you a public `https://what-can-i-make-xxxx.onrender.com` URL.

Without the blueprint, use **New → Web Service** with build command `pip install -r requirements.txt` and start command `gunicorn app:app --bind 0.0.0.0:$PORT --timeout 180`.

### Frontend on GitHub Pages (optional)

GitHub Pages only hosts static files, so the backend still runs on Render (it keeps the API key secret). The workflow in `.github/workflows/pages.yml` publishes `static/` to Pages on every push to `main`.

1. In the repo: **Settings → Pages → Source: GitHub Actions**. Free Pages requires a public repo.
2. Put your Render URL in `static/config.js` (`window.API_BASE = "https://…onrender.com"`) and push.
3. If your Pages site is not `https://chenbaslo.github.io`, set `ALLOWED_ORIGINS` on Render to its origin.

The site is then at `https://<user>.github.io/<repo>/`.

Note: free Render instances go to sleep after inactivity. Open the URL a minute before a live demo so it has time to wake up.

# SignTalk

**Sign language that speaks your signs.**

SignTalk interprets sign language live from a camera, lets you train *any* sign
language (a standard one, a regional dialect, or one you invent), types what you
sign into whatever text field you are using, and puts signs over a spoken video
in time with the words.

Nothing leaves your device but numbers. Hand tracking runs in the browser and
only 21 landmarks per hand are sent to the server. No frame is ever uploaded or
stored.

- [Quick start](#quick-start)
- [Requirements](#requirements)
- [Setup](#setup)
- [Configuration](#configuration)
- [What the app does](#what-the-app-does)
- [Repository layout](#repository-layout)
- [How recognition works](#how-recognition-works)
- [Deploying](#deploying)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

---

## Quick start

On Windows, two scripts do everything:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1     # install
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1       # run
```

Then open **http://localhost:3001** and sign in with the seeded demo account:

```
example@gmail.com  /  123456
```

Everywhere else, or to do it by hand, run these in two terminals:

```bash
# terminal 1: the API
pip install -r requirements.txt
python -m uvicorn backend.api.main:app --reload --port 8000

# terminal 2: the web app
cd Frontend/UX
pnpm install
pnpm dev
```

No database setup is needed. Without a PostgreSQL server the backend creates a
SQLite file and its schema by itself.

---

## Requirements

| | Version | Notes |
| --- | --- | --- |
| Python | 3.10 or newer | 3.12 is what this is developed on |
| Node.js | 20 or newer | for the web app |
| pnpm | 9 or newer | `corepack enable pnpm` installs it |
| PostgreSQL | 13 or newer | **optional**; SQLite is used automatically when absent |
| A webcam | | for everything except browsing the community |

Chrome or Edge give the best experience: they support on-device text
translation (Chrome 138+), video export, and audio decoding for the Video
Translator. Firefox and Safari run everything else.

### Optional extras

These are separate installs because they are large. Everything works without
them; the Settings screen shows which are present on your server and names the
command for any that are missing.

```bash
pip install faster-whisper              # speech to text for the Video Translator
pip install mediapipe opencv-python     # server-side dataset import (built-in ISL/ASL)
```

---

## Setup

### 1. The API

```bash
pip install -r requirements.txt
python -m uvicorn backend.api.main:app --reload --port 8000
```

Serves on **http://localhost:8000**, with interactive documentation at
[`/docs`](http://localhost:8000/docs) and a status summary at `/health`.

Copy `.env.example` to `.env` for anything you want to configure. Every value in
it is optional and the file explains each one.

```bash
cp .env.example .env
```

### 2. The web app

```bash
cd Frontend/UX
pnpm install
pnpm dev
```

Serves on **http://localhost:3001**. `pnpm dev` first copies the MediaPipe
runtime into `public/`, so hand tracking works offline and on a locked-down
network.

It talks to `http://localhost:8000` by default. To point it elsewhere, create
`Frontend/UX/.env.local`:

```
NEXT_PUBLIC_SIGNTALK_API=https://api.example.com
```

### 3. The camera CLI (optional)

A standalone desktop trainer and interpreter, with its own OpenCV window. It
stores into `detector/data/library.json` rather than the API database.

```bash
pip install -r detector/requirements.txt
python -m detector
```

See [`detector/README.md`](detector/README.md) for its menu and options.

---

## Configuration

### Choosing a database

The backend picks one at startup:

| Situation | What happens |
| --- | --- |
| Nothing configured | Probes `localhost:5432` for under a second. Uses PostgreSQL if something answers, otherwise creates **SQLite** at `backend/data/signtalk.db`. |
| `DATABASE_URL=postgresql://user:pass@host:5432/signtalk` | Uses PostgreSQL. |
| `DATABASE_URL=sqlite:///backend/data/signtalk.db` or `SIGNTALK_DB=sqlite` | Uses SQLite, skipping the probe. |
| `SIGNTALK_DB=postgres` | Refuses to fall back. Fails loudly if PostgreSQL is down, which is what a deployment wants. |

For PostgreSQL, create the database and apply the schema once:

```powershell
powershell -ExecutionPolicy Bypass -File db\apply.ps1
```

```bash
createdb signtalk && psql -U postgres -d signtalk -f db/schema.sql
```

Helpers:

```bash
python -m backend.setup_db            # walk through the choice, write .env
python -m backend.setup_db --sqlite   # no questions asked
python -m backend.setup_db --check    # report what the API would use right now
```

### Accounts and sessions

A demo account (`example@gmail.com` / `123456`) is seeded on first run.

Sessions last 30 minutes and **slide**: using the app pushes the expiry forward,
so you are signed out after half an hour of quiet, not half an hour after
signing in. The session is an HttpOnly cookie, so page script cannot read it.

Password-recovery codes are printed in the terminal unless real credentials are
configured. Set `SMTP_*` for email, or `TWILIO_*` or `TEXTBELT_KEY` for SMS, then
test them:

```bash
python backend/check_delivery.py
python backend/check_delivery.py --email you@example.com
```

### Built-in sign languages

The bundled ASL dataset (`detector/asl_dataset`, alphabet and digits) and, if
present on the machine, an ISL dataset (`D:\dataset_ISL` by default) are
imported once in the background at startup. They become languages owned by a
`signtalk` system account and published to the community, and **every account
gets a copy**: at sign-up, at sign-in, and the first time its library is listed.
So the Translator recognises both alphabets from the first minute.

This needs `mediapipe` and `opencv-python`. Point it elsewhere, or add your own:

```bash
# in .env
SIGNTALK_DATASETS=ISL=D:/dataset_ISL;ASL=detector/asl_dataset
SIGNTALK_AUTO_IMPORT=0        # never import at startup
```

To import by hand, for the built-in account or for a person:

```bash
python -m backend.import_dataset D:\dataset_ISL --name ISL --system
python -m backend.import_dataset ./my_signs --name "Home signs" --owner you@example.com
```

The dataset layout is one folder per symbol, images inside:

```
my_signs/
├── a/     A1.jpg  A2.jpg  ...
├── b/     ...
└── hello/ ...
```

You can import the same shape from the browser instead, in the Trainer, with no
Python extras: hand tracking runs on your machine and only landmarks are sent.

---

## What the app does

### Translator

Live interpretation into text, then on into a spoken language or into another
sign language.

- Interprets across **every sign language in your library** by default, and
  labels each recognised sign with the vocabulary it came from. Scope it to one
  language or one vocabulary at any time.
- **Speed mode** trusts a sign after two agreeing frames at 45% confidence, for
  signing at conversational pace. Careful mode waits for a steady hold.
- Every sign language declares the **spoken language** its symbols spell, so
  sign-to-sign translation runs signs → text → translated text → the target's
  signs. The pipeline is shown on screen, and the translation step is skipped
  when both spell the same language.
- A language whose owner has not enabled gesture translation is refused as a
  target, and says so.

### Trainer

- Create a sign language: name, tag, description, spoken language, which hands,
  and how many frames a capture collects.
- Add symbols and hold each one in front of the camera. Frames only count while
  your hand is steady, so a sample set never fills with half-formed transitions.
- Each symbol says what it types: text, a space, a key, or a shortcut.
- **Import dataset** takes a zip or folder of images and tracks them locally.
- With gesture translation on, the last frame of each capture becomes that
  symbol's reference picture, and a camera button retakes it any time. Symbols
  with no photo are drawn as a **hand skeleton** from their own samples, so
  every trained symbol has a picture either way.

### Direct Paste

Camera on, click into any text field, sign, and the words are typed at your
cursor. On the website that means any input on the page, with a scratchpad when
nothing is focused. The desktop build types into whichever application is in
front.

### Video Translator

Upload a spoken video and watch its words signed over the top, in time with the
speech.

- The video never leaves the browser. Its soundtrack is decoded locally to a
  small 16 kHz WAV and sent for transcription; the audio is deleted as soon as
  the words come back.
- Each word's signs are spread across the exact moment it is spoken, using a
  whole-word sign when the vocabulary has one and finger-spelling otherwise.
- The overlay drags anywhere, with size, opacity and caption controls, and the
  player's own fullscreen button takes it along.
- A speed control slows the video so no sign flashes past, and the app suggests
  a rate.
- **Download with signs** re-records the video with the overlay burned in.
- Without `faster-whisper`, a subtitle file (`.srt` / `.vtt`) or a typed
  transcript supplies the timing instead.

### Community Database

Browse published sign languages, search by name, author or tag, filter, and
install copies. An installed language arrives with its samples, so it recognises
signs immediately. Click any author to see their profile.

**Publishing** is on by default for a new language and takes effect the moment
it is created. Every publish first passes a security review, because an
installed language can type into other people's applications:

- symbols may only press editing and navigation keys, or clipboard and undo
  shortcuts,
- text is rejected if it contains control characters or markup,
- sample data is checked to be real hand landmarks.

Anything blocking is named, and the language stays private until it is fixed.

### Account and Settings

**Account** holds your details, a password change that signs every other device
out, and every language you own with publish, unpublish and delete.

**Settings** are saved to the account, so they follow you between machines. Each
one is read by something:

| Setting | What reads it |
| --- | --- |
| Theme, reduce motion | The whole app |
| Camera, mirror preview, draw skeleton | Every camera screen |
| Default pace, minimum confidence | The recogniser |
| Capture countdown | The Trainer's lead-in |
| Overlay position, size, opacity, caption | The Video Translator |

Mirroring flips only what you see. The tracked image stays mirrored whatever you
choose, because that is what the models were trained on.

---

## Repository layout

```
SignTalk/
├── backend/      FastAPI service: accounts, sign library, training, recognition
├── detector/     camera CLI, and the feature encoder + classifier the API shares
├── db/           schema.sql (PostgreSQL), schema.sqlite.sql, apply.ps1
├── docs/         architecture, data model, API reference
├── scripts/      setup.ps1 and dev.ps1
├── Frontend/
│   ├── UX/                      the app  (Next.js, port 3001)
│   └── SignTalk-comm-database/  standalone community browser (port 3000)
├── desktop/      Electron shell (placeholder)
├── archive/      superseded work, built by nothing
├── .env.example  every setting, all optional
└── requirements.txt
```

| Path | What it is |
| --- | --- |
| `backend/` | The API. Accounts, the sign library, training, recognition, publishing, transcription, preferences. |
| `detector/` | Standalone camera CLI, and the home of `features.py` and `classifier.py`, which the API imports so browser and desktop samples are interchangeable. Ships the ASL dataset. |
| `db/` | The two schema files and the script that applies the PostgreSQL one. |
| `docs/` | [architecture.md](docs/architecture.md), [schema.md](docs/schema.md), [api.md](docs/api.md). |
| `scripts/` | `setup.ps1` installs everything, `dev.ps1` starts the API and app together. |
| `Frontend/UX/` | **The app.** |
| `Frontend/SignTalk-comm-database/` | Standalone copy of the community browser, kept as its own app. |
| `desktop/` | Electron shell. Builds `Frontend/UX` with `DESKTOP_BUILD=1` and exposes `window.signtalk` for Direct Paste. Not implemented yet. |
| `archive/` | Finished work kept out of the way. Nothing builds or imports it. |

---

## How recognition works

1. **Track.** MediaPipe finds 21 landmarks per hand, in the browser. The frame
   is discarded there and then.
2. **Encode.** `detector/features.py` turns a frame into 190 floats: landmarks
   wrist-centred, palm-scaled and rotation-normalised; the removed rotation kept
   separately so signs that differ only by orientation stay apart; 28 pairwise
   distances between key points; a presence flag; and the offset between hands.
3. **Store.** Raw landmarks are the source of truth, feature vectors a cache
   tagged with a version. Changing the encoder re-encodes from landmarks instead
   of asking anyone to retrain.
4. **Classify.** Distance-weighted k-nearest neighbour, with confidence based on
   the margin between the winner and the best competing label. The client
   decides when a run of frames counts as a sign held.

The constants come from a 70/30 split of the bundled ASL dataset, not from
guesswork: `k=5` and a distance cut-off of 8.0 give 96.4% accuracy, and a
confidence floor of 0.55 keeps 91% of frames at 100% precision.

Extra camera angles are the biggest lever on accuracy. Measured on the same
dataset, recognising a hand held at a side or top angle goes from **79.9%** with
front-only training to **96.9%** with all views.

Full detail in [docs/architecture.md](docs/architecture.md).

---

## Deploying

Everything above describes a laptop. A public host needs five more things.

**1. Tell the app it is in production.** One variable turns on the Secure flag
on the session cookie, HSTS, and the strict error messages, and takes the
interactive API docs off the public internet:

```bash
SIGNTALK_ENV=prod
SIGNTALK_ORIGINS=https://signtalk.example.com   # required in prod; the API refuses to start without it
```

`SIGNTALK_ORIGINS` is the list of origins the browser app is served from. There
is deliberately no default in production: falling back to `localhost` would
refuse your real frontend and look like a browser bug rather than a missing
variable.

**2. Terminate TLS in front of it.** Run nginx or Caddy on 443 and proxy to
uvicorn on localhost. Never expose uvicorn directly, and never run it with
`--reload` in production - the reloader watches the filesystem and runs a
second process for no benefit:

```bash
python -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000 --workers 4
```

**3. Give the database its own user.** The examples connect as `postgres`,
which can drop any database on the server. The app only ever needs its own
schema:

```sql
CREATE USER signtalk WITH PASSWORD 'something-long';
GRANT CONNECT ON DATABASE signtalk TO signtalk;
GRANT USAGE, CREATE ON SCHEMA public TO signtalk;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO signtalk;
```

Then point `DATABASE_URL` at that user rather than at `postgres`.

**4. Back it up.** The languages people train are the whole value of an
account and they exist nowhere else - a browser holds no copy. A nightly dump,
kept somewhere other than the database host:

```bash
pg_dump --format=custom signtalk > signtalk-$(date +%F).dump
```

A backup nobody has restored is a hope, not a backup. Restore one into a
scratch database occasionally and sign in against it.

**5. Watch the dependencies.** `.github/workflows/audit.yml` runs `pip-audit`
and `pnpm audit` on every push and once a week, because an advisory can land
against a version that was clean the day it was pinned.

### What the deployed app sends

The API sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy` and a `default-src 'none'` CSP on every response, plus
HSTS in production. It answers with JSON, images and one model file, so it
never needs to permit script at all.

The web app sets the same family of headers from `next.config.mjs`, and its
Content-Security-Policy is built per request in `proxy.ts` (Next 16's renamed
`middleware.ts`) so that it can carry a nonce. That is what makes the policy
worth having: script runs only if it carries the nonce minted for that exact
response, so injected markup cannot execute even if it reaches the page.

Two consequences worth knowing:

- **Every page is server-rendered.** A nonce cannot be baked into a static
  file, so pages that could have been prerendered are not. This is the
  documented cost of nonce-based CSP.
- **The desktop build has no CSP.** It is a static export served from disk,
  where `proxy.ts` does not run.

---

## Development

### Tests

```bash
python backend/smoke_test.py     # every auth flow against the in-memory store
```

The API's interactive docs at `/docs` are the quickest way to exercise an
endpoint by hand.

### Conventions

- **Two database engines, one dialect.** SQL is written once for PostgreSQL.
  The handful of constructs that genuinely differ go through `db.dialect`.
- **Schema changes go in three places**: a numbered migration block in
  `db/schema.sql`, the same change in `db/schema.sqlite.sql`, and, if it adds a
  column to an existing table, an entry in `COLUMN_MIGRATIONS` in
  `backend/db.py`. SQLite has no `ADD COLUMN IF NOT EXISTS`, so that last one is
  what upgrades a database made before the change.
- **Optional dependencies degrade, never crash.** A missing extra turns a
  feature off and says so; it does not fail a request.
- **Ownership is checked on every read.** A valid session proves who you are,
  not what you may open.

### API

Every endpoint is listed in [docs/api.md](docs/api.md). FastAPI also serves
interactive documentation at `/docs` while the API is running.

---

## Troubleshooting

**"Cannot reach the SignTalk server."** The API is not running, or the web app
is pointed at the wrong place. Check `http://localhost:8000/health`, and
`NEXT_PUBLIC_SIGNTALK_API` if you changed it.

**The camera does not start.** The browser asks once and remembers a refusal.
Allow camera access for the site, then reload. Only one application can hold a
camera at a time.

**Speech to text is unavailable.** `pip install faster-whisper` and restart the
API. The first transcription downloads a model of about 150 MB; later ones are
immediate.

**Signs are recognised as the wrong letter.** Record more samples, and record
extra angles: the numbers above show what that is worth. Raising the minimum
confidence in Settings trades a few missed readings for fewer wrong ones.

**Moving a folder broke the web app.** pnpm links packages on Windows with
absolute junctions, so `node_modules` does not survive a move. Run
`pnpm install` again in the folder.

**Ports are already in use.** `dev.ps1` says so rather than starting a second
copy. Pass `-ApiPort` or `-WebPort` to use different ones.

---

## Privacy

- Camera frames are processed on your device and never uploaded.
- The server receives hand landmarks only, and cannot reconstruct an image from
  them.
- Reference pictures for sign-to-sign translation are opt-in per language, and
  are the only images SignTalk ever stores.
- A video you translate stays in your browser; only its soundtrack is sent, and
  it is deleted as soon as transcription finishes.
- Passwords use Argon2id. Session tokens and one-time codes are stored only as
  digests, so a copy of the database cannot be replayed.

The full policy is in the app at `/privacy`.

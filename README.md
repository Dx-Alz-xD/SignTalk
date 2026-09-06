# SignTalk

Sign language that speaks your signs. SignTalk interprets sign language live
from a camera, lets you train **any** sign language - a standard one or one
you invented - and can type what you sign straight into a text field.

Nothing leaves the device but numbers: the browser (or the desktop detector)
runs MediaPipe hand tracking locally and sends 21 landmarks per hand to the
API. No frame is ever uploaded or stored.

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

| path | what it is |
| --- | --- |
| `backend/` | The API. Accounts, the sign library, training, recognition, publishing, transcription. Runs on **PostgreSQL or SQLite**, see below. |
| `detector/` | Standalone camera CLI, and the home of `features.py` and `classifier.py`, which the API imports so browser and desktop samples are interchangeable. Ships the ASL alphabet and digit dataset. |
| `db/` | The two schema files and the PowerShell script that applies the Postgres one. |
| `docs/` | [architecture.md](docs/architecture.md) for how the pieces fit, [schema.md](docs/schema.md) for every table and why, [api.md](docs/api.md) for every endpoint. |
| `scripts/` | `setup.ps1` installs everything; `dev.ps1` starts the API and the app together. |
| `Frontend/UX/` | **The app.** Sign in, Translator, Trainer, Direct Paste, Video Translator, Community, Account, Settings. |
| `Frontend/SignTalk-comm-database/` | Standalone copy of the community browser, kept as its own app. |
| `desktop/` | Electron shell. Builds `Frontend/UX` with `DESKTOP_BUILD=1` and exposes `window.signtalk` so Direct Paste can type into any application. Not implemented yet. |
| `archive/` | Finished work kept out of the way. Nothing builds or imports it. |

## Run it

Three processes: the API, the web app, and (optionally) a database.

On Windows, `scripts\setup.ps1` does the install and `scripts\dev.ps1` starts
both servers in their own windows. The rest of this section is what those do.

### 1. Backend API

```bash
pip install -r requirements.txt
python -m uvicorn backend.api.main:app --reload --port 8000
```

Copy `.env.example` to `.env` for anything you want to configure. Every value
in it is optional.

That is all. On startup the backend picks a database:

- **`DATABASE_URL=postgresql://...`** in `.env` (or the shell) - uses PostgreSQL.
  Create the database and apply the schema first:
  `powershell -ExecutionPolicy Bypass -File db\apply.ps1` (or
  `psql -U postgres -d signtalk -f db/schema.sql`).
- **Nothing configured** - it probes `localhost:5432` for under a second. If a
  PostgreSQL server answers it uses that; otherwise it falls back to **SQLite**
  at `backend/data/signtalk.db`, creating the file and the schema itself. This
  is what happens on a laptop that never installed Postgres, and it is fine for
  one machine.
- **`DATABASE_URL=sqlite:///backend/data/signtalk.db`** or `SIGNTALK_DB=sqlite`
  - SQLite without the probe.
- **`SIGNTALK_DB=postgres`** - refuse to fall back; fail loudly if Postgres is
  down. Use this in a deployment.

`python -m backend.setup_db` walks through the choice interactively and writes
`.env`; `--sqlite` does it with no questions; `--check` reports what the API
would use right now. `GET /health` on the running API says which engine is live
and which optional capabilities are installed; the Settings page shows the same
list.

Sessions last 30 minutes and **slide**: using the app pushes the expiry
forward, so you are signed out after half an hour of quiet rather than half an
hour after signing in.

A demo account is seeded on first run: **example@gmail.com / 123456**.

**Built-in ISL and ASL.** The bundled ASL dataset (`detector/asl_dataset`) and,
if present, an ISL dataset (`D:\dataset_ISL` by default - one folder per letter,
images inside; override both with `SIGNTALK_DATASETS="ISL=path;ASL=path"`) are
imported once, in the background at start-up, as languages owned by the
`signtalk` system account and published to the community. **Every account gets
a copy** - at sign-up, at sign-in, and the first time its library is listed -
so the Translator recognises both alphabets from the first minute, for accounts
that existed before the import as well. Needs the
importer's extra dependencies: `pip install mediapipe opencv-python`. To run it
by hand, or import any other dataset for any account:

```bash
python -m backend.import_dataset D:\dataset_ISL --name ISL --system        # built-in
python -m backend.import_dataset ./my_signs --name "Home signs" --owner you@x.com
```

Set `SIGNTALK_AUTO_IMPORT=0` to never import at start-up.

Email and SMS codes for password recovery are printed to the terminal unless
real credentials are set - see `backend/auth/delivery.py` for the variables
(`SMTP_*`, `TWILIO_*`, `TEXTBELT_KEY`). `python backend/check_delivery.py`
tests them.

### 2. Web app

```bash
cd Frontend/UX
pnpm install
pnpm dev          # http://localhost:3001
```

`pnpm dev` first copies the MediaPipe WASM runtime into `public/` (gitignored).
The app talks to `http://localhost:8000` by default; set
`NEXT_PUBLIC_SIGNTALK_API` to point elsewhere. Optional:
`NEXT_PUBLIC_TRANSLATE_URL` for a LibreTranslate-compatible endpoint when the
browser has no built-in translator (Chrome 138+ has one).

### 3. Camera CLI (optional)

```bash
pip install -r detector/requirements.txt
python -m detector
```

Trains and interprets from a desktop camera window, and can import the bundled
ASL dataset. It stores into `detector/data/library.json`, not the API database.

## The app

**Translator.** Live interpretation into text, then translation into a spoken
language - or into another sign language. By default it interprets across
**every sign language in your library** (your own and any installed from the
community) and labels each sign with the vocabulary it came from; pick one
vocabulary or one language to scope it. **Speed mode** trusts a sign after two
agreeing frames at 45% confidence, for fluent signing. Choosing a sign
language as the target spells the transcript out as that language's signs,
using the reference pictures its owner recorded, one every N seconds (the
owner sets N). Every sign language declares the **spoken language** its
symbols spell (English, Hindi, Spanish...), so sign-to-sign translation goes
signs → text in the source's spoken language → translated into the target's
→ the target's symbols; the pipeline is shown on screen, and when both spell
the same language the translation step is skipped. Text typed into the
transcript box goes through the same pipeline. A language whose owner has not
turned on "Allow gesture translation" is refused as a target, and says so.

**Trainer.** Create a sign language (name, which hands, default frames per
capture), add symbols, hold each one in front of the camera. Frames only count
while the hand is steady; a slider sets the frame count for each capture.
Each symbol says what it types: text, a space, a key, or a shortcut. **Import
dataset** takes a zip or a folder of images (one folder per symbol) and
tracks the hands in the browser, so nothing but landmarks is uploaded. With
"Allow gesture translation" on, the last frame of every capture (or the first
image of an import) is kept as the symbol's reference picture - the one place
SignTalk stores a picture, and off by default - and a camera button on each
symbol takes a fresh one any time. A symbol with no photo is shown as its
**hand skeleton**, drawn from a stored sample, so every trained symbol has a
picture whether or not photos were ever kept.

**Publishing and the security review.** "Add to the community database" is on
by default for a new language and takes effect the moment it is created; an
untrained language simply lists with 0 samples until trained. Every publish
runs a review first and is refused if anything blocking turns up: a symbol
that presses a key outside the editing/navigation set or sends a shortcut
outside clipboard/undo (an installed language types into other people's
apps), text with control characters or markup, or sample blobs that are not
hand landmarks. The owner sees the same review on the edit screen.

**Account** (click your avatar). Your details, change password (signs every
other device out), and every language you own, published or private, with
publish, unpublish and delete on each. **Profiles** (`/app/users/<name>`,
reached from any author in the Community Database) show a member's published
languages, installable in one click.

**Settings.** Saved to the account, so they follow you to another browser or
machine, and every one of them is read by something:

| Setting | What reads it |
| --- | --- |
| Theme, reduce motion | The whole app; the theme also syncs the top-bar toggle |
| Camera, mirror preview, draw skeleton | Every camera screen. The tracked image stays mirrored whatever you pick, because that is what the models were trained on; only the picture you see flips |
| Default pace, minimum confidence | The recogniser, in the Translator and Direct Paste |
| Capture countdown | The Trainer's lead-in before it starts collecting frames |
| Overlay position, size, opacity, caption | Where the Video Translator's sign starts, before you drag it |

The page also reports what this particular server can do (speech to text,
dataset import, hand skeletons), naming the one command that installs anything
missing.

**Video Translator.** Upload a spoken video and its words are signed over the
top, timed to the speech. The video never leaves the browser: its soundtrack
is decoded there to a small 16 kHz WAV and sent for transcription
(faster-whisper on the server, word timestamps, deleted afterwards). Each
word's signs - a whole-word sign when the vocabulary has one, otherwise its
letters - are spread across the exact moment the word is spoken, in whichever
of your sign languages you pick. The overlay drags anywhere on the video, with
size and opacity sliders and the current word captioned under it; a speed
control slows the video so no sign flashes past too fast, and the app suggests
the rate. The player's own fullscreen button takes the overlay along (the
browser's native one would fullscreen the bare video), and the overlay is
positioned against the picture itself, so it sits in the same spot at any
size. When the speech is in a different language from the one the chosen sign
language spells, one click translates the transcript sentence by sentence,
each sentence kept to the moment the original was said. Click any word in the
transcript to jump to it. Without faster-whisper installed, a subtitle file
(.srt/.vtt) or a typed transcript does the timing instead.

**Direct Paste.** Camera on, click into any text field, sign - the words are
typed at your cursor. On the website "any text field" means any input on the
page (there is a scratchpad when nothing is focused). In the desktop app it
types into whichever application is in front, through `window.signtalk`.

**Community Database.** Browse published sign languages, filter, and install
copies - samples included, so an installed language recognises signs at once.

## How recognition works

A frame becomes a 190-float vector (`detector/features.py`): per hand, 21
landmarks wrist-centred, palm-scaled and rotation-normalised, the removed
rotation as cos/sin, 28 pairwise fingertip distances, and a presence flag,
plus the offset between hands. Recognition is distance-weighted k-nearest
neighbour with margin-based confidence (`detector/classifier.py`). The browser
and the desktop detector produce bit-identical vectors, so models trained
either way are interchangeable. Raw landmarks are what the database stores;
feature vectors are a cache that is rebuilt if the layout changes.

## API surface added in this round

| endpoint | purpose |
| --- | --- |
| `GET /library/languages/{id}/review` | the security review publishing runs |
| `PATCH /library/languages/{id}` | now also `gestureTranslation`, `gestureIntervalMs` |
| `PUT / GET / DELETE /library/symbols/{id}/image` | a symbol's reference picture (JPEG/PNG/WebP, 400 KB cap) |
| `GET /training/model?signId=` and `signId` in `POST /training/predict` | scope recognition to one vocabulary |
| `POST /auth/password` | change password while signed in |
| `GET /users/{username}` | public profile |
| `GET / PATCH / DELETE /preferences` | per-account settings |
| `DELETE /library/signs/{id}` | delete a vocabulary, and its language when it was the last one |

The full list is in [docs/api.md](docs/api.md), and FastAPI serves interactive
docs at `/docs`.
| `GET /video/transcriber`, `POST /video/transcribe`, `GET /video/jobs/{id}` | speech-to-text jobs with word timings for the Video Translator (`pip install faster-whisper`; `SIGNTALK_WHISPER_MODEL` picks tiny/base/small/medium) |

Schema migration 3 (`languages.gesture_translation`, `languages.gesture_interval_ms`,
`symbol_images`) is in both schema files; SQLite databases created earlier gain
the columns automatically on next open.

## Tests

```bash
python backend/smoke_test.py      # every auth flow, in-memory store
```

The `backend/db.py` engines share one SQL dialect; anything Postgres-only is
routed through `db.dialect` so both keep working. Schema changes go in both
`db/schema.sql` and `db/schema.sqlite.sql`, and any column added to an existing
table also goes in `db.COLUMN_MIGRATIONS` so a database made before it gains the
column on next open.

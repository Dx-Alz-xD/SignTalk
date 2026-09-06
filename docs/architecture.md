# Architecture

How the pieces of SignTalk fit together, and why they are split the way they
are. For the data model see [schema.md](schema.md); for endpoints see
[api.md](api.md).

## The shape of it

```
                    browser (Frontend/UX)
   camera ──▶ MediaPipe hand tracking ──▶ 21 landmarks per hand
                                               │
                                               │  landmarks only, never pixels
                                               ▼
                    backend/  ── FastAPI ──▶ feature encoder ──▶ kNN classifier
                       │                     (detector/features.py)
                       │                     (detector/classifier.py)
                       ▼
                  PostgreSQL or SQLite
```

The same encoder and classifier are imported by the API and by the standalone
camera CLI in `detector/`, so a sample recorded in the browser and one recorded
at a desktop terminal produce identical vectors and are interchangeable.

## Why landmarks and not video

A frame becomes 21 (x, y, z) points per hand and the frame is discarded, in the
browser, before anything is sent. That single decision is most of the privacy
story: the server cannot reconstruct a face, a room or a person, because it
never had them. It also keeps payloads small enough to post a whole capture in
one request.

The one exception is opt-in: a language with gesture translation enabled keeps
one thumbnail per symbol so the translator can show a sign. Everything else is
numbers.

## Recognition, in four steps

1. **Track.** MediaPipe finds 21 landmarks per hand, in the browser
   (`Frontend/UX/lib/hand-tracker.ts`) or on the desktop
   (`detector/tracker.py`). Both track a *mirrored* image, so the two agree.
2. **Encode.** `detector/features.py` turns a frame into 190 floats: per hand,
   landmarks wrist-centred, palm-scaled and rotation-normalised; the removed
   rotation kept as its own cos/sin pair so signs that differ only by
   orientation stay separable; 28 pairwise distances between key points; and a
   presence flag. Plus the offset between the two hands.
3. **Store.** `backend/library.py` writes the raw landmarks as the source of
   truth and the feature vectors as a cache tagged with `feature_version`. A
   change to the encoder re-encodes from landmarks rather than asking anyone to
   retrain.
4. **Classify.** `detector/classifier.py` runs a distance-weighted k-nearest
   neighbour vote. Confidence is margin-based (how much closer the winner is
   than the best competing label) because everything is somewhat close to
   something. The client decides when a run of frames counts as a sign held.

Constants (k, the distance cut-off, the confidence floor, the stillness
threshold) come from a 70/30 split of the bundled ASL dataset, not from
guesswork. See `detector/README.md`.

## The library tree

```
language          "ISL"          which spoken language it spells, which hands,
  └ sign          "Alphabet"     a vocabulary someone is building
      └ symbol    "A"            one label the classifier can return,
          └ view  "front"        and what it types
              └ samples          one camera angle, holding the landmark blob
```

Everything is scoped by owner. A valid session proves who you are, not what you
may open, so no query takes an id without also checking it belongs to the
caller.

## Backend layout

| Module | Responsibility |
| --- | --- |
| `backend/db.py` | Two engines behind one API. PostgreSQL through psycopg when it is reachable, SQLite otherwise. SQL is written once in the Postgres dialect; the handful of constructs that genuinely differ go through `db.dialect`. |
| `backend/auth/` | `service.py` holds every auth rule; `sql_store.py` and `store.py` are interchangeable stores; `security.py` does Argon2id and one-time codes; `delivery.py` routes a code to email or SMS. |
| `backend/library.py` | The sign tree, publishing, the security review, symbol pictures, profiles. |
| `backend/preferences.py` | Per-account settings, each read by something in the app. |
| `backend/landmarks.py` | The bridge between the browser's wire format and the encoder. |
| `backend/transcribe.py` | Speech to text with word timings (faster-whisper), for the Video Translator. |
| `backend/import_dataset.py`, `backend/builtin.py` | Import image datasets as languages; own and publish the built-in ISL and ASL. |
| `backend/api/` | FastAPI routers. Thin: they validate, call a module, and map typed errors onto status codes. |

Optional dependencies degrade rather than crash: no `faster-whisper` means the
Video Translator offers a subtitle file or a typed transcript; no `mediapipe`
means server-side dataset import is unavailable while browser import still
works; no `pillow` means symbols without a photo simply have no picture.
`GET /health` reports which are present, and the Settings screen shows it.

## Frontend layout

`Frontend/UX` is the app. Next.js App Router, one route per screen.

- **`components/app-frame.tsx`** is mounted once by `app/app/layout.tsx` and
  survives every navigation inside `/app`. It owns the start-up sequence, the
  navigation, and the session context (who is signed in, what they have set).
  Nothing under `/app` renders until the session is confirmed.
- **`components/session.tsx`** is that context. Screens read the account and
  preferences from it instead of fetching their own.
- **`components/screen.tsx`** and **`components/ui/surface.tsx`** are the
  shapes every screen is built from, so the app looks like one app.
- **`components/recognizer/use-recognizer.ts`** is the shared recognition loop:
  camera, classification, and turning a label into what it types. The
  Translator and Direct Paste are both thin wrappers around it.
- **`lib/`** holds one typed module per API area, plus the browser-side hand
  tracker, dataset importer, audio extraction and video export.

## Where work happens

| Task | Runs |
| --- | --- |
| Hand tracking | Browser (and the desktop CLI) |
| Feature encoding, classification | Server |
| Dataset import | Browser for your own; server for the built-ins |
| Speech to text | Server |
| Text translation | Browser, on-device, where supported |
| Video export with signs | Browser |

## Adding a schema change

1. Add it to `db/schema.sql` as a new numbered migration block.
2. Mirror it in `db/schema.sqlite.sql`.
3. If it adds a column to an existing table, add it to `COLUMN_MIGRATIONS` in
   `backend/db.py` so a database created before it gains the column on next
   open. SQLite has no `ADD COLUMN IF NOT EXISTS`.
4. Document it in [schema.md](schema.md).

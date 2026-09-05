# detector

Camera-driven sign capture, training and interpretation for SignTalk.

Standalone for now — nothing else in the repo imports it yet. The seams meant
for the rest of the project are `storage.Library` (the JSON library) and
`classifier.KNNClassifier` (predict from a pose vector).

## Run

```
pip install -r detector/requirements.txt
python detector/run.py
```

`python -m detector` does the same thing. `--camera 1` picks a different device.

On first run it downloads MediaPipe's `hand_landmarker.task` (~7 MB) into
`detector/models/`. That's the only network call the package makes.

## How it's split

Everything is CLI **except** the camera, which gets its own OpenCV window
showing the live hand skeleton, a status banner, a training progress bar, and
a clickable **TEST INTERPRETER** button. The button works while the terminal
is sitting at a menu prompt — on Windows the menu polls for keypresses instead
of blocking on `input()`.

## Menu

```
[1] Explore existing languages
[2] Make a new language
[3] Browse online          -> placeholder, wired up when the backend lands
[4] Test the interpreter
[5] Import the bundled ASL dataset
[q] Quit
```

**2 — Make a new language.** Asks for the sign name, which language it belongs
to (pick an existing one or name a new one), and whether it has phrases (if so,
you type them in). Confirm to save. It then drops into *add symbols*: name a
symbol, and train it by holding the gesture while the camera window counts
down and records. Repeat for as many symbols as the sign needs; a blank name
finishes.

**1 — Explore.** Drill from language → sign → symbol. Add or retrain symbols,
delete things, edit phrases, or run the interpreter scoped to one language.

**4 / the camera button — Test the interpreter.** Pick a scope (all languages
or one), then hold gestures. The camera shows the current best guess; the
terminal logs each stable reading with its confidence, which view it matched,
and what the runner-up was.

**5 — Import the bundled ASL dataset.** See below.

## Views

A symbol's samples are filed under a **view** — `front`, `left`, `right`,
`top`, `bottom`, or any name you type. Extra views are entirely optional: the
training menu offers a one-key front-only capture, a guided front/left/right
pass, or a single named view. Every view feeds the same label, so adding one
only ever widens what will match; it never splits the symbol.

They are the single biggest lever on confidence. Measured on the ASL dataset,
recognising a hand held at a side or top angle:

| training data | accuracy on side/top views | mean confidence |
| --- | --- | --- |
| front-ish only | 79.9% | 0.62 |
| all views | 96.9% | 0.78 |

## ASL base recognition

`detector/asl_dataset/` holds one folder per class (`0`–`9`, `a`–`z`) of
photos taken from several angles. Menu option 5 encodes them into the library
as language **ASL**, sign **Alphabet** (A–Z) and sign **Digits** (0–9), with
each image filed under the view its filename records — so the imported
alphabet arrives with side/top/bottom coverage already in place.

It offers a quick mode (20 images per class) or the full set. The full import
is ~2515 images and takes a few minutes; 99.3% of them yield a usable hand.

Two things the importer handles that are easy to get wrong: the crops are
tight enough that MediaPipe only finds ~75% of hands as-is, so each image goes
through a padding cascade (25% padding alone takes it to ~100%); and the
dataset contains a complete duplicate copy of itself one level down, which is
skipped so samples aren't counted twice and double-weighted in the vote.

## How training and recognition work

A frame becomes a 190-float vector — see `features.py` for the layout. Per
hand: 21 landmarks wrist-centred, scaled by palm length and rotated to a
canonical angle; the removed rotation as its own cos/sin pair; 28 pairwise
distances between key points; and a presence flag. Plus the offset between the
two hands.

The reasoning behind that shape:

- **Rotation is removed from the coordinates but kept as a separate feature.**
  Removing it makes the shape robust to wrist tilt, the biggest source of
  jitter between two holds of the same gesture. Keeping it separately means
  signs that differ *only* by orientation — ASL `p` is `k` rotated — stay
  separable. Verified: rotating a hand 30° moves the shape and pairwise blocks
  by exactly 0.0 and only the orientation pair by 0.52.
- **Scale is by palm length**, not the largest landmark distance, because the
  palm is rigid — extending a finger would otherwise rescale everything else.
  Translation and scale invariance are both exact.
- **The pairwise distances are redundant on purpose.** They're invariant to
  rotation and scale, and fingertip separation is what distinguishes most
  handshapes, so stating it directly beats making the classifier infer it.
- **The `z` channel is damped to half weight.** MediaPipe's depth is a rough
  estimate and dividing it by palm length amplifies its noise; at full weight
  it accounted for most of the apparent movement of a hand being held still.

Training captures ~40 vectors per view while you hold the pose. Frames only
count while the pose is *steady*, so a sample set doesn't fill up with
transitions, and the capture reports the spread afterwards as a quality read.

Recognition is distance-weighted k-nearest-neighbour, which suits a "train it
in three seconds and use it immediately" workflow: no fitting step, and adding
a symbol never disturbs the others. Confidence is deliberately **margin-based**
— how much closer the winner is than the best *competing* label, rather than
raw closeness, since everything is somewhat close to something.

Per-frame output goes through `Smoother`, which only reports a label once it
has held steady across a window of frames.

### Calibration

The constants come from a 70/30 split of the imported ASL dataset (1745 train
/ 752 test, 36 classes), not from guesswork:

- `k=5`, `max_distance=8.0` → **96.4%** accuracy. k=3 scored 97.3% but the
  held-out photos share sessions with their neighbours, which flatters small k.
- `Smoother.min_confidence=0.55` → keeps 91% of frames at **100% precision** on
  the held-out set. Correct matches average 0.78 confidence, wrong ones 0.42.
- `STILL_THRESHOLD=0.7` sits above the p90 distance between two photos of the
  same letter at the same angle (0.73), and far above consecutive frames of one
  person holding still.

## Storage

`detector/data/library.json`, written atomically:

```
languages -> signs -> symbols -> views -> samples
```

Gitignored, since sample arrays get large. Delete it to start over.

Each view records the `feature_version` it was captured under. If the vector
layout changes, old samples are excluded from the model rather than silently
degrading it, flagged as `! old format, retrain` in the browse screens, and
reported when the interpreter starts. Pre-views libraries are migrated on load
into a `front` view.

## Files

| file | what it does |
| --- | --- |
| `run.py` / `__main__.py` | entry point, arg parsing |
| `cli.py` | menus and every flow |
| `camera.py` | camera thread, window, overlays, button |
| `tracker.py` | MediaPipe wrapper (Tasks API, legacy fallback) |
| `models.py` | one-time model download |
| `features.py` | frame → 190-float vector |
| `trainer.py` | hold-to-train capture with stillness gating |
| `classifier.py` | kNN + margin confidence + prediction smoothing |
| `interpreter.py` | live interpretation loop |
| `dataset.py` | ASL image dataset importer |
| `storage.py` | the JSON library |
| `ui_input.py` | prompts that stay responsive to the camera button |

## Notes

- The camera thread is the only thread that touches OpenCV's GUI or MediaPipe;
  both are single-threaded. The CLI talks to it through a small locked API.
- The preview is mirrored, so on-screen "Left"/"Right" hand labels are the
  mirror of the real hand. Harmless — training and inference see the same view.
- If the camera or MediaPipe is unavailable the CLI still runs; it says why and
  blocks only the flows that need them.

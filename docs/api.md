# API reference

Base URL `http://localhost:8000` in development. Interactive docs are served at
`/docs` by FastAPI.

The session is an **HttpOnly cookie** (`signtalk_session`) that the browser
sends automatically. Every request from the web app opts into credentials;
there is no token for page script to read, and therefore none for an XSS bug to
steal. Sessions last 30 minutes and slide forward while the app is in use.

Errors come back as `{"error": "...", "code": "..."}` where `code` is the
backend's own exception name, so a client can branch on the cause while showing
the server's wording.

## Health

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Database engine, version, and which optional capabilities (speech to text, dataset import, hand skeletons) are installed. |
| `GET` | `/models/hand_landmarker.task` | The MediaPipe model, served locally so the app works offline and the browser provably runs the same file as the desktop detector. |

## Accounts

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/signup` | Create an account, sign in, and install the built-in languages. |
| `POST` | `/auth/login` | Sign in with an email or a username. |
| `POST` | `/auth/logout` | Revoke this session. |
| `GET` | `/auth/me` | The current session and account. |
| `POST` | `/auth/password` | Change password while signed in. Revokes every other session. |
| `POST` | `/auth/forgot` | Send a one-time code by email or SMS. Answers identically whether or not the account exists. |
| `POST` | `/auth/forgot/verify` | Exchange a code for a single-use ticket. |
| `POST` | `/auth/forgot/reset` | Spend the ticket to set a new password. |
| `POST` | `/auth/forgot/signin` | Spend the ticket to sign in once, password untouched. |

## Library

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/library/languages` | Your sign languages, with derived counts. |
| `POST` | `/library/languages` | Create one. |
| `PATCH` | `/library/languages/{id}` | Edit name, description, tag, hands, sample size, spoken language, gesture translation. |
| `DELETE` | `/library/languages/{id}` | Delete it and everything in it. |
| `GET` | `/library/languages/{id}/review` | The security review that publishing runs. |
| `POST` | `/library/languages/{id}/publish` | Put it on the community shelf, or take it off. |
| `GET` | `/library/languages/{id}/signs` | Vocabularies in a language. |
| `POST` | `/library/languages/{id}/signs` | Create one. |
| `DELETE` | `/library/signs/{id}` | Delete a vocabulary, and its language when it was the last one. |
| `GET` | `/library/signs/{id}/symbols` | Symbols, with their views and whether a picture is stored. |
| `POST` | `/library/signs/{id}/symbols` | Create one. Idempotent by name. |
| `PATCH` | `/library/symbols/{id}` | Rename, or change what it types. |
| `DELETE` | `/library/symbols/{id}` | Delete it. |
| `PUT` `GET` `DELETE` | `/library/symbols/{id}/image` | The reference picture. `GET` falls back to a drawn hand skeleton when no photo is stored. |
| `POST` | `/library/vocabulary` | Language plus its first vocabulary in one call, safe to retry. |
| `GET` | `/library/community` | Everything published, with `mine` and `installed` resolved for you. |
| `POST` | `/library/community/{id}/install` | Copy a published language into your library, samples and all. |

## Training and recognition

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/training/symbols/{id}/samples` | File a capture under one view. Appends unless `replace`. |
| `DELETE` | `/training/symbols/{id}/views/{view}` | Drop one camera angle. |
| `GET` | `/training/model` | What the interpreter would work with. Scope with `languageId` or `signId`. |
| `POST` | `/training/predict` | Classify one frame. The server never smooths: a frame is one opinion, and the client decides when a run of them counts. |
| `POST` | `/training/encode` | The feature vector for one frame, so the trainer measures stillness with the same function the recogniser uses. |
| `POST` | `/training/refresh` | Re-encode samples stored under an older feature layout. |

## Video

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/video/transcriber` | Whether speech to text is installed here, and which model. |
| `POST` | `/video/transcribe` | Upload audio (multipart) and start a job. The file is deleted when the job ends. |
| `GET` | `/video/jobs/{id}` | Status, progress, and the words with timings. Private to the account that started it. |

## People and settings

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/users/{username}` | Public profile: username, join date, published languages. Never an email or phone. |
| `GET` | `/preferences` | This account's settings. |
| `PATCH` | `/preferences` | Change some of them; the rest are left alone. |
| `DELETE` | `/preferences` | Back to defaults. |

## Status codes

| Code | Means |
| --- | --- |
| `400` | Validation failed, or a rule refused the request. |
| `401` | No session, an expired one, or wrong credentials. |
| `404` | No such row, or it is not yours. The same answer either way, so the API cannot be used to probe for other people's ids. |
| `409` | A name that has to be unique already exists. |
| `413` | Upload too large. |
| `423` | Account locked after repeated failures. |
| `502` | A verification code could not be delivered. |
| `503` | The database or an optional capability is unavailable. |

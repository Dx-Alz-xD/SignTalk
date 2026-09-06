# SignTalk — Community Database

Standalone Next.js app for browsing sign languages published to the community
database. It is a sibling of `Frontend/UX`, not part of it — the same screen
also lives inside the main app at `/app/community`.

## Running

```bash
pnpm install
pnpm dev
```

Serves on **http://localhost:3000**, pinned in `package.json`. `Frontend/UX`
is pinned to 3001, so both apps can run at the same time.

### It needs the backend, and a session

The table is loaded from the SignTalk API — `GET /library/community` — not
from mock data. Two things have to be true before rows appear:

1. **The backend is running** on `http://localhost:8000`. Override with
   `NEXT_PUBLIC_SIGNTALK_API`.
2. **You are signed in.** That endpoint requires an account.

This app has no login screen of its own. It does not need one: the session is
an HttpOnly cookie set by the backend on *its* origin, and the backend's CORS
allowlist already includes port 3000 with credentials enabled. So **sign in
once through `Frontend/UX` on 3001 and this app is authenticated too.**

Without either, the screen shows the server's own message rather than an empty
table — "Cannot reach the SignTalk server" when the backend is down, or the
auth error when there is no session.

## What it does

- **Columns** — Name, Author, Uploaded on, Language, then the row checkbox
- **Language** — the language's hand control (`left`, `right`, `both`), spelled
  out on hover and in the filter chips
- **Sorting** — click any column header
- **Filter** — name and author substring search, an uploaded-between date
  range, and hand-control toggles. Selections survive filtering, and select-all
  only acts on visible rows.
- **Install** — copies the ticked languages into your own library, one at a
  time, so a failure part-way through still keeps what already landed. Your own
  languages and ones you already hold are skipped.

## Relationship to `Frontend/UX`

`components/community-database.tsx`, `components/form-alert.tsx`, everything in
`components/ui`, `app/globals.css` and
`lib/{api,library,community-data,utils,theme,theme-storage}.ts` are **copies**
of the files in `Frontend/UX`. They are duplicated, not shared — a change in
one app does not reach the other.

To re-sync, copy those files across again. `community-database.tsx` carries
**one deliberate divergence**, marked with a comment at the top: `onBack` has
no default and the back button is conditional, because this app is a single
page with nothing behind it. Everything else is byte-identical, so a `diff`
against UX should show only that.

If these keep drifting, the real fix is to promote the shared pieces into a
workspace package rather than to keep hand-syncing them.

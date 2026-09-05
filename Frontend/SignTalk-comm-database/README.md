# SignTalk — Community Database

Standalone Next.js app for browsing sign sets contributed by the community.
It is a sibling of `Frontend/UX`, not part of it — the same screen also exists
inside the main app, reached from the Community Database card on the home
screen.

## Running

```bash
pnpm install
pnpm dev
```

Serves on **http://localhost:3001**. The port is pinned in `package.json` so
this can run alongside `Frontend/UX`, which owns 3000.

## What it does

A table of community uploads with:

- **Columns** — Name, Author, Uploaded on, Language, then the row checkbox
- **Language** — two-letter codes (`EN`, `JP`, `ES`…), full name on hover
- **Sorting** — click any column header
- **Filter** — name and author substring search, an uploaded-between date
  range, and language toggles. Selections survive filtering, and select-all
  only acts on visible rows.
- **Download** — exports the selected rows as CSV

Data is mock, defined in `lib/community-data.ts`. There is no backend yet;
swapping that module for a fetch is the intended seam.

## Relationship to `Frontend/UX`

The theme (`app/globals.css`), the UI primitives under `components/ui`, and
`lib/utils.ts` / `lib/theme*.ts` are **copies** of the ones in `Frontend/UX`,
so the two apps look identical. They are duplicated, not shared — a change to
the design system in one will not reach the other. If these keep diverging,
the fix is to promote the shared pieces into a workspace package rather than
to keep hand-syncing them.

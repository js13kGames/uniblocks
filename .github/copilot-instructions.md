# Agent working style for this repo

- Do not create markdown summary/report files (e.g. `SUMMARY.md`, `CHANGES.md`, `NOTES.md`) after completing a task unless explicitly asked for one. Report results directly in chat instead.
- Do not create TODO list files or maintain a todo/checklist file in the repo unless explicitly asked. Use the chat response itself for any task breakdown.
- Skip creating a written plan for small/simple tasks (single-file edits, obvious bug fixes, straightforward additions). Only write out a plan first for genuinely multi-step or ambiguous work.
- Prefer directly editing the existing file over generating new documentation files to explain a change.
- Keep chat replies concise: state what changed and why, without restating the whole task or over-explaining.

## Project context
- This is a js13kgames entry (13KB zip size limit). The real game is `game.js` + `unicorn.js` + `littlejs.esm.js`, loaded directly by `index.html` — not through `src/main.js` (that file is leftover Vite/LittleJS template boilerplate and is unused).
- `npm run build` runs Vite, which bundles/minifies `game.js` (since `index.html` references it) into `dist/`. Zip `dist/` for the js13k submission.

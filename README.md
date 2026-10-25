# Collocation Bank

Mobile-first static trainer for Anson’s IELTS collocation lessons (Mon / Thu).

Live pattern (same as [jre-vocab-bank](https://anclh.github.io/jre-vocab-bank/)): **GitHub Pages from `/docs`**, vanilla HTML/CSS/JS, no backend.

Intended URL after Pages is enabled: `https://anclh.github.io/collocation-bank/`

## Source of truth

Author lessons in the Obsidian vault:

`Anson_combined` → `Personal/Learning/English (Collocations)/Lessons/*.md`

Copy or sync those markdown files into `content/lessons/`, then rebuild JSON. Drive folder mirrors are backup only — the app does **not** read Drive at runtime.

## Layout

```
collocation-bank/
  content/lessons/     # vault markdown copies
  data/lessons.json    # build output
  docs/                # GitHub Pages root
    index.html         # hub (Flashcards + lesson list)
    study.html         # Quizlet-style flashcards (?id=… or ?scope=all)
    lesson.html        # full lesson (?id=…)
    app.js
    styles.css
    data/lessons.json
  scripts/build_lessons.py
```

## Rebuild

```bash
python3 scripts/build_lessons.py
```

Reads `content/lessons/*.md` → writes `data/lessons.json` and copies to `docs/data/lessons.json`.

## Local preview

Serve the Pages root (needed so `fetch('data/lessons.json')` works):

```bash
cd docs
python3 -m http.server 8765
```

Open <http://127.0.0.1:8765/> — hub has **Flashcards · Study all**, plus per-lesson **Cards** (`study.html?id=…`) and **Lesson** (`lesson.html?id=…`).

## GitHub Pages

1. Push this repo to `anclh/collocation-bank` (or your fork).
2. Settings → Pages → Build and deployment:
   - Source: **Deploy from a branch**
   - Branch: `main` → folder **`/docs`**
3. Wait for the Pages deploy, then open `https://anclh.github.io/collocation-bank/`.

All asset links are **relative** (`styles.css`, `app.js`, `data/lessons.json`, `study.html?id=…`, `lesson.html?id=…`), so the site works both at the repo Pages subdirectory and on localhost.

## Progress

Done / last-opened / still-learning stars are stored in the browser under `localStorage` key `collocation-bank-progress`. Clearing site data resets it.

## v1 scope

- Hub with Quizlet-style **Flashcards** (study all or per lesson) + full **Lesson** mode
- Study mode: big flip cards, Know / Still learning queue, shuffle, swipe, end screen
- Full lesson: flip review, accordion collocations, mini drill (Check / Show / Reset), cohesive passage + light tasks, Mark done
- Warm cream Interactive look + `prefers-color-scheme` dark mode
- iPhone-friendly: `viewport-fit=cover`, safe-area padding, 16px inputs, large taps

Not in v1: full spaced-repetition algorithm, streaks, Drive sync, service worker / offline PWA (optional later on the same static files).

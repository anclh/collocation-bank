# Collocation Bank

Mobile-first **Quizlet-style flashcard** trainer for Anson’s IELTS collocation lessons (Mon / Thu).

Live: **https://anclh.github.io/collocation-bank/**  
Same pattern as [jre-vocab-bank](https://anclh.github.io/jre-vocab-bank/): **GitHub Pages from `/docs`**, vanilla HTML/CSS/JS, no backend.

Cards only — no full-lesson page. Vault markdown remains the authoring source of truth.

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
    index.html         # hub (Study all + deck list → Cards)
    study.html         # Quizlet flashcards (?id=… or ?scope=all)
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

```bash
cd docs
python3 -m http.server 8765
```

Open <http://127.0.0.1:8765/> — hub has **Flashcards · Study all**, and each deck opens **Cards** (`study.html?id=…`).

## GitHub Pages

1. Push to `anclh/collocation-bank`.
2. Settings → Pages → Deploy from branch `main` → folder **`/docs`**.
3. Open `https://anclh.github.io/collocation-bank/`.

All asset links are **relative**.

## Progress

Done / last-opened / still-learning are stored under `localStorage` key `collocation-bank-progress`. Finishing a per-lesson study session marks that deck **Done**.

## Scope

- Hub: Study all + deck list → Cards only
- Study: big flip cards, Know / Still learning, shuffle, swipe, end screen (Restart · again · Back to hub)
- Quizlet-like UI: blue `#4255FF`, amber Still learning, soft gray/blue bg + `prefers-color-scheme` dark mode
- iPhone-friendly: `viewport-fit=cover`, safe-area, large taps

Not included: full lesson UI (drill / passage / accordion), native app, backend, full SRS / PWA (optional later on the same static files).

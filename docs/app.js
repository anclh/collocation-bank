/* Anson's Collocation Bank — static Pages app */
(() => {
  const STORAGE_KEY = "collocation-bank-progress";
  const DATA_URL = "data/lessons.json";

  const state = {
    data: null,
    progress: loadProgress(),
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        done: parsed.done && typeof parsed.done === "object" ? parsed.done : {},
        lastId: parsed.lastId || null,
        lastOpened: parsed.lastOpened || null,
        stillLearning:
          parsed.stillLearning && typeof parsed.stillLearning === "object"
            ? parsed.stillLearning
            : {},
      };
    } catch {
      return { done: {}, lastId: null, lastOpened: null, stillLearning: {} };
    }
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }



  async function loadData() {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${DATA_URL} (${res.status})`);
    state.data = await res.json();
    return state.data;
  }

  function doneCount() {
    if (!state.data) return 0;
    return state.data.lessons.filter((l) => state.progress.done[l.id]).length;
  }

  function markOpened(id) {
    state.progress.lastId = id;
    state.progress.lastOpened = new Date().toISOString();
    saveProgress();
  }

  function markDone(id, done = true) {
    if (done) state.progress.done[id] = true;
    else delete state.progress.done[id];
    saveProgress();
  }

  /* ---------- Hub ---------- */
  function renderHub() {
    const root = $("#app");
    if (!root || !state.data) return;
    const lessons = state.data.lessons;
    const done = doneCount();
    const pct = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
    const totalCards = lessons.reduce((n, L) => n + (L.collocations || []).length, 0);

    root.innerHTML = `
      <header class="hero">
        <span class="eyebrow">Anson's Collocations · IELTS Writing</span>
        <h1>Collocation Trainer</h1>
        <p class="meta">Quizlet-style flashcards · Mon / Thu lessons</p>
        <div class="stats-row">
          <span class="stat-pill">完成 <strong>${done}</strong> / ${lessons.length}</span>
          <span class="stat-pill">進度 <strong>${pct}%</strong></span>
          <span class="stat-pill">卡牌 <strong>${totalCards}</strong></span>
        </div>
        <div class="progress-wrap" aria-hidden="true"><div class="progress-bar" style="width:${pct}%"></div></div>
        <div class="hub-ctas">
          <a class="btn btn-primary hub-cta" href="study.html?scope=all">🃏 Flashcards · Study all</a>
          <a class="btn btn-ghost hub-cta" href="#lessons">📚 Browse decks</a>
        </div>
      </header>
      <section id="lessons">
        <h2><span class="num">🃏</span> Decks</h2>
        <p class="hint">撳一堂即開 <strong>Cards</strong> 練習。進度存喺呢部電話（localStorage）。</p>
        <ul class="lesson-list" id="lesson-list"></ul>
      </section>
    `;

    const list = $("#lesson-list");
    const frag = document.createDocumentFragment();
    for (const L of lessons) {
      const li = document.createElement("li");
      const isDone = Boolean(state.progress.done[L.id]);
      const isLast = state.progress.lastId === L.id;
      li.className = "lesson-row" + (isDone ? " is-done" : "") + (isLast ? " is-last" : "");
      const href = `study.html?id=${encodeURIComponent(L.id)}`;
      li.innerHTML = `
        <a class="lesson-row-main lesson-row-link" href="${href}">
          <span class="lesson-num">${L.lesson}</span>
          <span class="lesson-body">
            <p class="lesson-title">${escapeHtml(L.title || L.theme)}</p>
            <p class="lesson-meta">${escapeHtml(L.date)} · ${escapeHtml(L.theme)} · ${L.collocations.length} cards</p>
          </span>
          <span class="lesson-flags">
            ${isDone ? '<span class="flag done">Done</span>' : ""}
            ${isLast ? '<span class="flag last">Last</span>' : ""}
          </span>
        </a>
        <div class="lesson-row-actions">
          <a class="btn btn-primary btn-sm" href="${href}">Cards</a>
        </div>
      `;
      frag.appendChild(li);
    }
    list.appendChild(frag);
  }

  function getLessonIdFromUrl() {
    const params = new URLSearchParams(location.search);
    if (params.get("id")) return params.get("id");
    if (location.hash) {
      const h = location.hash.replace(/^#/, "");
      if (h.startsWith("id=")) return decodeURIComponent(h.slice(3));
      return decodeURIComponent(h);
    }
    return null;
  }

  function findLesson(id) {
    if (!state.data) return null;
    return (
      state.data.lessons.find((l) => l.id === id) ||
      state.data.lessons.find((l) => String(l.lesson) === String(id)) ||
      null
    );
  }

  /* ---------- Study / Flashcards (Quizlet-like) ---------- */
  const study = {
    cards: [],
    queue: [],
    index: 0,
    known: 0,
    learning: 0,
    flipped: false,
    scope: "lesson",
    lessonId: null,
    lesson: null,
    title: "",
  };

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function cardKey(card) {
    return `${card.lessonId}::${card.phrase}`;
  }

  function buildCardsFromLesson(L) {
    const cards = [];
    for (const c of L.collocations || []) {
      cards.push({
        phrase: c.phrase,
        yue: c.yue || "",
        weak: c.weak || "",
        model: c.model || "",
        frame: c.frame || "",
        lessonId: L.id,
        lessonNum: L.lesson,
        theme: L.theme,
        kind: "collocation",
      });
    }
    for (const r of L.review || []) {
      if (!r || !r.phrase) continue;
      // skip if already in today's 5
      if (cards.some((x) => norm(x.phrase) === norm(r.phrase))) continue;
      cards.push({
        phrase: r.phrase,
        yue: r.yue || "",
        weak: "",
        model: "",
        frame: "",
        lessonId: L.id,
        lessonNum: L.lesson,
        theme: L.theme,
        kind: "review",
      });
    }
    return cards;
  }

  function initStudySession(opts = {}) {
    const { shuffle = true } = opts;
    study.queue = study.cards.map((_, i) => i);
    if (shuffle) shuffleInPlace(study.queue);
    study.index = 0;
    study.known = 0;
    study.learning = 0;
    study.flipped = false;
  }

  function currentCard() {
    if (!study.queue.length || study.index >= study.queue.length) return null;
    return study.cards[study.queue[study.index]];
  }

  function markStillLearningPhrase(card) {
    if (!card) return;
    state.progress.stillLearning = state.progress.stillLearning || {};
    state.progress.stillLearning[cardKey(card)] = true;
    saveProgress();
  }

  function clearStillLearningPhrase(card) {
    if (!card || !state.progress.stillLearning) return;
    delete state.progress.stillLearning[cardKey(card)];
    saveProgress();
  }

  function renderStudy() {
    const root = $("#app");
    if (!root) return;
    const total = study.queue.length;
    const pos = Math.min(study.index + 1, total || 1);
    const pct = total ? Math.round((study.index / total) * 100) : 0;
    const card = currentCard();

    if (!study.cards.length) {
      root.innerHTML = `
        <div class="study-shell">
          <header class="study-top">
            <a class="study-back" href="index.html">← Hub</a>
            <div class="study-title">Flashcards</div>
            <div class="study-count">0 / 0</div>
          </header>
          <div class="error">呢個範圍冇卡牌。</div>
          <div class="footer-actions">
            <a class="btn btn-ghost" href="index.html">Back to hub</a>
          </div>
        </div>`;
      return;
    }

    if (!card) {
      renderStudyEnd();
      return;
    }

    const starred = Boolean(state.progress.stillLearning?.[cardKey(card)]);
    const weakLine = card.weak
      ? `<div class="qz-weak"><span class="weak">${escapeHtml(card.weak)}</span> → <strong>${escapeHtml(card.phrase)}</strong></div>`
      : "";
    const modelLine = card.model
      ? `<div class="qz-model">${escapeHtml(card.model)}</div>`
      : "";
    const metaBits = [];
    if (study.scope === "all") metaBits.push(`L${card.lessonNum}`);
    if (card.kind === "review") metaBits.push("review");
    if (starred) metaBits.push("★ still learning");
    const meta = metaBits.length
      ? `<div class="qz-meta">${metaBits.map(escapeHtml).join(" · ")}</div>`
      : "";

    root.innerHTML = `
      <div class="study-shell">
        <header class="study-top">
          <a class="study-back" href="index.html">← Hub</a>
          <div class="study-title">${escapeHtml(study.title)}</div>
          <div class="study-count" id="study-count">${pos} / ${total}</div>
        </header>
        <div class="study-progress" aria-hidden="true">
          <div class="progress-bar" id="study-bar" style="width:${pct}%"></div>
        </div>
        <div class="qz-stage" id="qz-stage">
          <div class="qz-card${study.flipped ? " is-flipped" : ""}" id="qz-card" tabindex="0" role="button" aria-label="Flip flashcard">
            <div class="qz-inner">
              <div class="qz-face qz-front">
                ${meta}
                <div class="qz-phrase">${escapeHtml(card.phrase)}</div>
                <div class="qz-tap">Tap to flip</div>
              </div>
              <div class="qz-face qz-back">
                ${meta}
                <div class="qz-phrase-sm">${escapeHtml(card.phrase)}</div>
                <div class="qz-yue">${escapeHtml(card.yue || "（未有粵語 gloss）")}</div>
                ${weakLine}
                ${modelLine}
                <div class="qz-tap">Tap to flip back</div>
              </div>
            </div>
          </div>
        </div>
        <div class="qz-actions">
          <button type="button" class="btn btn-warn qz-btn" id="btn-learning" aria-label="Still learning">
            <span class="qz-btn-icon">↺</span>
            Still learning
          </button>
          <button type="button" class="btn btn-primary qz-btn" id="btn-know" aria-label="Know">
            <span class="qz-btn-icon">✓</span>
            Know
          </button>
        </div>
        <div class="qz-toolbar">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-shuffle">Shuffle</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-restart">Restart</button>
        </div>
        <p class="qz-swipe-hint">Swipe ← Still learning · Swipe → Know · Space = flip</p>
      </div>
    `;

    wireStudy();
  }

  function renderStudyEnd() {
    const root = $("#app");
    if (!root) return;
    const total = study.known + study.learning;
    if (study.lessonId) {
      markDone(study.lessonId, true);
    }
    const againHref =
      study.scope === "all"
        ? "study.html?scope=all"
        : study.lessonId
          ? `study.html?id=${encodeURIComponent(study.lessonId)}`
          : "index.html";
    const againLabel = study.scope === "all" ? "Study all again" : "Study this deck again";
    root.innerHTML = `
      <div class="study-shell study-end">
        <header class="study-top">
          <a class="study-back" href="index.html">← Hub</a>
          <div class="study-title">${escapeHtml(study.title)}</div>
          <div class="study-count">Done</div>
        </header>
        <div class="qz-end-card">
          <div class="qz-end-emoji">🎉</div>
          <h2>Session complete</h2>
          <p class="meta">你完成咗呢輪 flashcards。${study.lessonId ? " 呢堂已標 Done。" : ""}</p>
          <div class="qz-end-stats">
            <div class="qz-end-stat ok"><strong>${study.known}</strong><span>Know</span></div>
            <div class="qz-end-stat warn"><strong>${study.learning}</strong><span>Still learning</span></div>
            <div class="qz-end-stat"><strong>${total}</strong><span>Seen</span></div>
          </div>
          <div class="qz-end-actions">
            <button type="button" class="btn btn-primary" id="btn-restart-end">Restart</button>
            <a class="btn btn-ghost" href="${againHref}">${againLabel}</a>
            <a class="btn btn-ghost" href="index.html">Back to hub</a>
          </div>
        </div>
      </div>
    `;
    rootStudyKeyHandler(null);
    $("#btn-restart-end")?.addEventListener("click", () => {
      initStudySession({ shuffle: true });
      renderStudy();
    });
  }

  function advanceAfter(kind) {
    const card = currentCard();
    if (!card) return;
    if (kind === "know") {
      study.known += 1;
      clearStillLearningPhrase(card);
      study.index += 1;
    } else {
      study.learning += 1;
      markStillLearningPhrase(card);
      const [cur] = study.queue.splice(study.index, 1);
      const remaining = study.queue.length - study.index;
      if (remaining > 0) {
        // re-queue later so it comes back this session
        const offset = 1 + Math.floor(Math.random() * remaining);
        study.queue.splice(study.index + offset, 0, cur);
      } else {
        // last card marked "still learning" — end (avoid infinite loop)
        study.index = study.queue.length;
      }
    }
    study.flipped = false;
    renderStudy();
  }

  function flipStudyCard() {
    study.flipped = !study.flipped;
    const el = $("#qz-card");
    if (el) el.classList.toggle("is-flipped", study.flipped);
  }

  function wireStudy() {
    const cardEl = $("#qz-card");
    const stage = $("#qz-stage");

    const flip = (e) => {
      e?.preventDefault?.();
      flipStudyCard();
    };

    cardEl?.addEventListener("click", flip);
    cardEl?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        flipStudyCard();
      }
    });

    $("#btn-know")?.addEventListener("click", () => advanceAfter("know"));
    $("#btn-learning")?.addEventListener("click", () => advanceAfter("learning"));
    $("#btn-shuffle")?.addEventListener("click", () => {
      initStudySession({ shuffle: true });
      renderStudy();
    });
    $("#btn-restart")?.addEventListener("click", () => {
      initStudySession({ shuffle: false });
      renderStudy();
    });

    // Keyboard: Space flip (when not focused on button), arrows optional
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === " " || e.key === "Enter") {
        if (e.target === cardEl) return; // already handled
        if (e.target && e.target.closest && e.target.closest("button,a")) return;
        e.preventDefault();
        flipStudyCard();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        advanceAfter("learning");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        advanceAfter("know");
      }
    };
    rootStudyKeyHandler(onKey);

    // Swipe on stage
    if (stage) {
      let startX = 0;
      let startY = 0;
      let tracking = false;
      stage.addEventListener(
        "touchstart",
        (e) => {
          const t = e.changedTouches[0];
          startX = t.clientX;
          startY = t.clientY;
          tracking = true;
        },
        { passive: true }
      );
      stage.addEventListener(
        "touchend",
        (e) => {
          if (!tracking) return;
          tracking = false;
          const t = e.changedTouches[0];
          const dx = t.clientX - startX;
          const dy = t.clientY - startY;
          if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
          if (dx < 0) advanceAfter("learning");
          else advanceAfter("know");
        },
        { passive: true }
      );
    }
  }

  let _studyKeyHandler = null;
  function rootStudyKeyHandler(fn) {
    if (_studyKeyHandler) document.removeEventListener("keydown", _studyKeyHandler);
    _studyKeyHandler = fn || null;
    if (_studyKeyHandler) document.addEventListener("keydown", _studyKeyHandler);
  }

  function startStudyFromUrl() {
    const params = new URLSearchParams(location.search);
    const scope = params.get("scope");
    const id = params.get("id") || getLessonIdFromUrl();

    if (scope === "all") {
      study.scope = "all";
      study.lessonId = null;
      study.lesson = null;
      study.title = "Study all";
      study.cards = [];
      for (const L of state.data.lessons) {
        study.cards.push(...buildCardsFromLesson(L));
      }
      document.title = "Study all · Flashcards · Collocation Trainer";
    } else {
      const L = id ? findLesson(id) : null;
      if (!L) {
        $("#app").innerHTML = `
          <div class="error">搵唔到呢堂（id=${escapeHtml(id || "")}）。
          <p><a href="index.html">返回 hub</a></p></div>`;
        return;
      }
      study.scope = "lesson";
      study.lessonId = L.id;
      study.lesson = L;
      study.title = `L${L.lesson} · ${L.title || L.theme}`;
      study.cards = buildCardsFromLesson(L);
      markOpened(L.id);
      document.title = `Flashcards · Lesson ${L.lesson} · Collocation Trainer`;
    }

    initStudySession({ shuffle: true });
    renderStudy();
  }

  async function boot() {
    const page = document.body.dataset.page || "hub";
    const root = $("#app");
    try {
      await loadData();
    } catch (err) {
      if (root) {
        root.innerHTML = `<div class="error"><strong>載入失敗</strong><br>${escapeHtml(err.message)}<br><br>請用 local server 開 docs/（唔好直接 double-click 開 file://）。</div>`;
      }
      return;
    }

    if (page === "study") {
      startStudyFromUrl();
    } else {
      document.title = "Collocation Trainer · Anson's Collocations";
      renderHub();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

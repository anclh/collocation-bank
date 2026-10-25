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

  function markdownInline(text) {
    // escape then restore **bold** and simple emphasis
    let s = escapeHtml(text);
    s = s.replace(/\*\*(.+?)\*\*/g, "<mark>$1</mark>");
    s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
    return s;
  }

  function passageHtml(text) {
    if (!text) return "";
    // paragraphs if double newlines
    const parts = String(text).trim().split(/\n{2,}/);
    return parts
      .map((p) => `<p>${markdownInline(p.replace(/\n/g, " "))}</p>`)
      .join("");
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
        <p class="meta">21 堂搭配 · Mon / Thu · Quizlet-style flashcards</p>
        <div class="stats-row">
          <span class="stat-pill">完成 <strong>${done}</strong> / ${lessons.length}</span>
          <span class="stat-pill">進度 <strong>${pct}%</strong></span>
          <span class="stat-pill">卡牌 <strong>${totalCards}</strong></span>
        </div>
        <div class="progress-wrap" aria-hidden="true"><div class="progress-bar" style="width:${pct}%"></div></div>
        <div class="hub-ctas">
          <a class="btn btn-primary hub-cta" href="study.html?scope=all">🃏 Flashcards · Study all</a>
          <a class="btn btn-ghost hub-cta" href="#lessons">📚 Browse lessons</a>
        </div>
      </header>
      <section id="lessons">
        <h2><span class="num">📚</span> Lessons</h2>
        <p class="hint"><strong>Cards</strong> = Quizlet 翻卡練習 · <strong>Lesson</strong> = 完整課堂（drill + passage）。進度存喺呢部電話（localStorage）。</p>
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
      li.innerHTML = `
        <div class="lesson-row-main">
          <span class="lesson-num">${L.lesson}</span>
          <span class="lesson-body">
            <p class="lesson-title">${escapeHtml(L.title || L.theme)}</p>
            <p class="lesson-meta">${escapeHtml(L.date)} · ${escapeHtml(L.theme)} · ${L.collocations.length} cards</p>
          </span>
          <span class="lesson-flags">
            ${isDone ? '<span class="flag done">Done</span>' : ""}
            ${isLast ? '<span class="flag last">Last</span>' : ""}
          </span>
        </div>
        <div class="lesson-row-actions">
          <a class="btn btn-primary btn-sm" href="study.html?id=${encodeURIComponent(L.id)}">Cards</a>
          <a class="btn btn-ghost btn-sm" href="lesson.html?id=${encodeURIComponent(L.id)}">Lesson</a>
        </div>
      `;
      frag.appendChild(li);
    }
    list.appendChild(frag);
  }

  /* ---------- Lesson ---------- */
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

  function renderReview(L) {
    const items = L.review || [];
    if (!items.length) {
      return `
        <section id="review">
          <h2><span class="num">1</span> Quick review</h2>
          <p class="hint">呢堂冇指定 review 項——可以直接睇今日 5 個搭配。</p>
        </section>`;
    }
    const cards = items
      .map((it, i) => {
        const phrase = escapeHtml(it.phrase);
        const yue = escapeHtml(it.yue || "（未有粵語 gloss）");
        return `
          <div class="flip" tabindex="0" role="button" aria-label="Flip card: ${phrase}">
            <div class="flip-inner">
              <div class="flip-face flip-front">
                <strong>${phrase}</strong>
                <div class="tap-hint">撳一下睇意思 →</div>
              </div>
              <div class="flip-face flip-back">
                <strong>${phrase}</strong>
                <div class="canto">${yue}</div>
                <div class="tap-hint">再撳翻轉 ←</div>
              </div>
            </div>
          </div>`;
      })
      .join("");
    return `
      <section id="review" data-step="1">
        <h2><span class="num">1</span> Quick review</h2>
        <p class="hint">撳卡翻轉複習。</p>
        <div class="review-grid">${cards}</div>
      </section>`;
  }

  function renderCollocations(L) {
    const cols = L.collocations || [];
    const blocks = cols
      .map((c, i) => {
        const phrase = escapeHtml(c.phrase);
        const weak = c.weak
          ? `<div class="row"><span class="label">Weak →</span> <span class="weak">${escapeHtml(c.weak)}</span> → <strong>${phrase}</strong></div>`
          : "";
        const yue = c.yue
          ? `<div class="row"><span class="label">意思</span> ${escapeHtml(c.yue)}</div>`
          : "";
        const frame = c.frame
          ? `<div class="row"><span class="label">Frame</span> <code>${escapeHtml(c.frame)}</code></div>`
          : "";
        let model = "";
        if (c.model) {
          const highlighted = escapeHtml(c.model).replace(
            new RegExp(`(${escapeRegExp(c.phrase)})`, "i"),
            '<span class="mark">$1</span>'
          );
          model = `<div class="row"><span class="label">Model</span> ${highlighted}</div>`;
        }
        const mistake = c.mistake
          ? `<div class="mistake"><strong>Common mistake:</strong> ${escapeHtml(c.mistake)}</div>`
          : "";
        return `
          <details class="col">
            <summary><span class="badge">${i + 1}</span> ${phrase}</summary>
            <div class="col-body">${weak}${yue}${frame}${model}${mistake}</div>
          </details>`;
      })
      .join("");
    return `
      <section id="collocations" data-step="2">
        <h2><span class="num">2</span> Today's 5 collocations</h2>
        <p class="hint">撳開每張睇 frame、model 同常見錯誤。</p>
        ${blocks || "<p class='hint'>未有搭配資料。</p>"}
      </section>`;
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function renderDrill(L) {
    const items = (L.drill && L.drill.items) || [];
    const qs = items
      .map((it) => {
        const id = escapeHtml(it.id);
        const prompt = escapeHtml(it.prompt || "").replace(/\n/g, "<br>");
        if (it.type === "choose" || it.type === "tf") {
          const choices = (it.choices || []).map(
              (ch) =>
                `<button type="button" class="choice" data-q="${id}" data-val="${escapeHtml(ch)}">${escapeHtml(ch)}</button>`
            )
            .join("");
          return `
            <div class="q" data-drill-id="${id}" data-type="${escapeHtml(it.type)}">
              <div class="q-title">${id}. ${it.type === "tf" ? "True / False" : "選正確"}</div>
              <p class="q-prompt">${prompt}</p>
              <div class="choices" data-choices-for="${id}">${choices}</div>
              <input type="hidden" class="drill-answer-input" data-q="${id}" value="">
            </div>`;
        }
        if (it.type === "fill") {
          return `
            <div class="q" data-drill-id="${id}" data-type="fill">
              <div class="q-title">${id}. 填空</div>
              <p class="q-prompt">${prompt}</p>
              <input type="text" class="drill-text" data-q="${id}" placeholder="你的答案…" autocomplete="off" autocapitalize="off">
            </div>`;
        }
        // rewrite default
        return `
          <div class="q" data-drill-id="${id}" data-type="rewrite">
            <div class="q-title">${id}. 改寫</div>
            <p class="q-prompt">${prompt}</p>
            <input type="text" class="drill-text" data-q="${id}" placeholder="你的改寫…" autocomplete="off">
          </div>`;
      })
      .join("");

    const keyLines = items
      .map((it) => `${escapeHtml(it.id)}: <strong>${escapeHtml(it.answer || it.accept || "")}</strong>`)
      .join("<br>");

    return `
      <section id="drill" data-step="3">
        <h2><span class="num">3</span> Mini drill（先唔好睇答案）</h2>
        ${qs || "<p class='hint'>未有 drill。</p>"}
        <div class="actions">
          <button type="button" class="btn btn-primary" id="check-drill">Check answers</button>
          <button type="button" class="btn btn-ghost" id="show-drill-key">Show answer key</button>
          <button type="button" class="btn btn-ghost" id="reset-drill">Reset</button>
        </div>
        <div class="feedback" id="drill-feedback"></div>
        <div class="score-pill" id="drill-score"></div>
        <div class="answer-key" id="drill-key"><strong>ANSWER KEY</strong><br>${keyLines}</div>
      </section>`;
  }

  function renderPassage(L) {
    const tasks = L.tasks || [];
    const taskHtml = tasks
      .map((t, i) => {
        const n = i + 1;
        const q = markdownInline(t.q || "");
        const type = t.type || "rewrite";
        if (type === "choose" || type === "tf") {
          const choices = (t.choices || (type === "tf" ? ["True", "False"] : []))
            .map(
              (ch) =>
                `<button type="button" class="choice" data-task="${n}" data-val="${escapeHtml(ch)}">${escapeHtml(ch)}</button>`
            )
            .join("");
          return `
            <div class="q" data-task-id="${n}" data-type="${escapeHtml(type)}">
              <div class="q-title">${n}. ${type === "tf" ? "True / False" : "選擇"}</div>
              <p class="q-prompt">${q}</p>
              <div class="choices">${choices}</div>
              <input type="hidden" class="task-answer-input" data-task="${n}" value="">
            </div>`;
        }
        return `
          <div class="q" data-task-id="${n}" data-type="rewrite">
            <div class="q-title">${n}. 簡答</div>
            <p class="q-prompt">${q}</p>
            <textarea class="task-text" data-task="${n}" rows="3" placeholder="用英文或粵語都可以…"></textarea>
          </div>`;
      })
      .join("");

    const keyLines = tasks
      .map((t, i) => `${i + 1}. <strong>${escapeHtml(t.answer || "")}</strong>`)
      .join("<br>");

    return `
      <section id="passage" data-step="4">
        <h2><span class="num">4</span> Reading passage</h2>
        <div class="passage" id="passage-text">${passageHtml(L.passage)}</div>
        ${taskHtml}
        <div class="actions">
          <button type="button" class="btn btn-primary" id="check-passage">Check answers</button>
          <button type="button" class="btn btn-ghost" id="show-passage-key">Reveal answers</button>
          <button type="button" class="btn btn-ghost" id="reset-passage">Reset</button>
        </div>
        <div class="feedback" id="passage-feedback"></div>
        <div class="score-pill" id="passage-score"></div>
        <div class="answer-key" id="passage-key"><strong>ANSWER KEY</strong><br>${keyLines}</div>
      </section>`;
  }

  function renderLesson(L) {
    const root = $("#app");
    if (!root) return;
    const isDone = Boolean(state.progress.done[L.id]);
    markOpened(L.id);

    root.innerHTML = `
      <header class="hero">
        <span class="eyebrow">Anson's Collocations · IELTS Writing</span>
        <h1>Lesson ${L.lesson} — ${escapeHtml(L.title || L.theme)}</h1>
        <p class="meta">${escapeHtml(L.date)} · ${escapeHtml(L.theme)} · 約 5 分鐘</p>
        <p class="nav-hub"><a href="index.html">← 全部課程 Index</a> · <a href="study.html?id=${encodeURIComponent(L.id)}">🃏 Flashcards</a></p>
        <div class="progress-wrap" aria-hidden="true"><div class="progress-bar" id="progress"></div></div>
      </header>
      ${renderReview(L)}
      ${renderCollocations(L)}
      ${renderDrill(L)}
      ${renderPassage(L)}
      <section id="preview" data-step="5">
        <h2><span class="num">5</span> Next preview</h2>
        <p class="preview">${L.nextTheme ? escapeHtml(L.nextTheme) : "（未標示下一主題）"}</p>
      </section>
      <div class="footer-actions">
        <button type="button" class="btn btn-primary" id="mark-done">${isDone ? "✓ Done — tap to undo" : "Mark done"}</button>
        <a class="btn btn-ghost" href="index.html" style="display:inline-flex;align-items:center;text-decoration:none;">Back to hub</a>
      </div>
    `;

    wireLesson(L);
    updateProgressBar();
  }

  function updateProgressBar() {
    const bar = $("#progress");
    if (!bar) return;
    let score = 0;
    if ($(".flip.is-flipped")) score += 20;
    if ($("details.col[open]")) score += 20;
    if ($("#drill-feedback")?.classList.contains("show")) score += 30;
    if ($("#passage-feedback")?.classList.contains("show")) score += 30;
    bar.style.width = Math.min(score, 100) + "%";
  }

  function wireChoices(selector, hiddenSelectorAttr) {
    $$(selector).forEach((btn) => {
      btn.addEventListener("click", () => {
        const group = btn.parentElement;
        group.querySelectorAll(".choice").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        const key = btn.dataset.q || btn.dataset.task;
        const hidden = $(`${hiddenSelectorAttr}[data-q="${key}"], ${hiddenSelectorAttr}[data-task="${key}"]`);
        if (hidden) hidden.value = btn.dataset.val || "";
      });
    });
  }

  function wireLesson(L) {
    $$(".flip").forEach((card) => {
      const toggle = () => {
        card.classList.toggle("is-flipped");
        updateProgressBar();
      };
      card.addEventListener("click", toggle);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });

    $$("details.col").forEach((d) => d.addEventListener("toggle", updateProgressBar));

    wireChoices("#drill .choice", ".drill-answer-input");
    wireChoices("#passage .choice", ".task-answer-input");

    const items = (L.drill && L.drill.items) || [];

    $("#check-drill")?.addEventListener("click", () => {
      let ok = 0;
      const notes = [];
      for (const it of items) {
        const accept = norm(it.accept || it.answer || "");
        const answer = norm(it.answer || "");
        if (it.type === "choose" || it.type === "tf") {
          const val = $(".drill-answer-input[data-q='" + it.id + "']")?.value || "";
          if (!val) {
            notes.push(`${it.id} ✗ — 未揀`);
          } else if (norm(val) === answer || norm(val) === accept) {
            ok++;
            notes.push(`${it.id} ✓`);
          } else {
            notes.push(`${it.id} ✗ — 正確係 <strong>${escapeHtml(it.answer)}</strong>`);
          }
        } else {
          const val = $(`.drill-text[data-q="${it.id}"]`)?.value || "";
          const n = norm(val);
          if (!n) {
            notes.push(`${it.id} ✗ — 未作答`);
          } else if (
            (accept && n.includes(accept)) ||
            (answer && n.includes(answer)) ||
            n === answer ||
            n === accept
          ) {
            ok++;
            notes.push(`${it.id} ✓`);
          } else {
            notes.push(`${it.id} ✗ — 目標：<strong>${escapeHtml(it.accept || it.answer)}</strong>`);
          }
        }
      }
      const total = items.length || 1;
      const fb = $("#drill-feedback");
      fb.className =
        "feedback show " + (ok >= total ? "ok" : ok >= total / 2 ? "mix" : "bad");
      fb.innerHTML = notes.join("<br>");
      const sp = $("#drill-score");
      sp.className = "score-pill show";
      sp.textContent = `Mini drill：${ok} / ${total}`;
      updateProgressBar();
    });

    $("#show-drill-key")?.addEventListener("click", () => {
      $("#drill-key")?.classList.toggle("show");
    });

    $("#reset-drill")?.addEventListener("click", () => {
      $$("#drill .drill-text").forEach((el) => (el.value = ""));
      $$("#drill .drill-answer-input").forEach((el) => (el.value = ""));
      $$("#drill .choice").forEach((b) => b.classList.remove("selected"));
      const fb = $("#drill-feedback");
      if (fb) {
        fb.className = "feedback";
        fb.innerHTML = "";
      }
      $("#drill-score")?.classList.remove("show");
      $("#drill-key")?.classList.remove("show");
      updateProgressBar();
    });

    const tasks = L.tasks || [];
    $("#check-passage")?.addEventListener("click", () => {
      let ok = 0;
      const notes = [];
      tasks.forEach((t, i) => {
        const n = i + 1;
        const type = t.type || "rewrite";
        const answer = norm(t.answer || "");
        const accept = norm(t.accept || "");
        if (type === "choose" || type === "tf") {
          const val = $(`.task-answer-input[data-task="${n}"]`)?.value || "";
          if (!val) notes.push(`${n} ✗ — 未揀`);
          else if (norm(val) === answer || (type === "tf" && norm(val) === answer)) {
            ok++;
            notes.push(`${n} ✓`);
          } else if (answer && norm(val) === norm(t.answer)) {
            ok++;
            notes.push(`${n} ✓`);
          } else {
            // loose: if correct choice text contained in answer key
            if (answer && (answer.includes(norm(val)) || norm(val).includes(answer.split(" ")[0]))) {
              ok++;
              notes.push(`${n} ✓`);
            } else {
              notes.push(`${n} ✗ — 正確：<strong>${escapeHtml(t.answer)}</strong>`);
            }
          }
        } else {
          const val = $(`.task-text[data-task="${n}"]`)?.value || "";
          const nv = norm(val);
          if (!nv) notes.push(`${n} ✗ — 未作答`);
          else if ((accept && nv.includes(accept)) || nv.length >= 8) {
            ok += accept && nv.includes(accept) ? 1 : 0.5;
            notes.push(accept && nv.includes(accept) ? `${n} ✓` : `${n} △ — 已作答（可對住 answer key）`);
          } else {
            notes.push(`${n} ✗ — 試寫長啲／包含目標搭配`);
          }
        }
      });
      const total = tasks.length || 1;
      const fb = $("#passage-feedback");
      fb.className =
        "feedback show " + (ok >= total ? "ok" : ok >= total / 2 ? "mix" : "bad");
      fb.innerHTML = notes.join("<br>");
      const sp = $("#passage-score");
      sp.className = "score-pill show";
      sp.textContent = `Passage tasks：約 ${Math.round(ok * 10) / 10} / ${total}`;
      updateProgressBar();
    });

    $("#show-passage-key")?.addEventListener("click", () => {
      $("#passage-key")?.classList.toggle("show");
    });

    $("#reset-passage")?.addEventListener("click", () => {
      $$("#passage .task-text").forEach((el) => (el.value = ""));
      $$("#passage .task-answer-input").forEach((el) => (el.value = ""));
      $$("#passage .choice").forEach((b) => b.classList.remove("selected"));
      const fb = $("#passage-feedback");
      if (fb) {
        fb.className = "feedback";
        fb.innerHTML = "";
      }
      $("#passage-score")?.classList.remove("show");
      $("#passage-key")?.classList.remove("show");
      updateProgressBar();
    });

    $("#mark-done")?.addEventListener("click", () => {
      const nowDone = !state.progress.done[L.id];
      markDone(L.id, nowDone);
      const btn = $("#mark-done");
      if (btn) btn.textContent = nowDone ? "✓ Done — tap to undo" : "Mark done";
    });
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
          ${
            study.lessonId
              ? `<a class="btn btn-ghost btn-sm" href="lesson.html?id=${encodeURIComponent(study.lessonId)}">Full lesson</a>`
              : ""
          }
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
          <p class="meta">你完成咗呢輪 flashcards。</p>
          <div class="qz-end-stats">
            <div class="qz-end-stat ok"><strong>${study.known}</strong><span>Know</span></div>
            <div class="qz-end-stat warn"><strong>${study.learning}</strong><span>Still learning</span></div>
            <div class="qz-end-stat"><strong>${total}</strong><span>Seen</span></div>
          </div>
          <div class="qz-end-actions">
            <button type="button" class="btn btn-primary" id="btn-restart-end">Restart</button>
            ${
              study.lessonId
                ? `<a class="btn btn-ghost" href="lesson.html?id=${encodeURIComponent(study.lessonId)}">Open full lesson</a>`
                : `<a class="btn btn-ghost" href="study.html?scope=all">Study all again</a>`
            }
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

    if (page === "lesson") {
      const id = getLessonIdFromUrl();
      const L = id ? findLesson(id) : null;
      if (!L) {
        root.innerHTML = `
          <div class="error">搵唔到呢堂（id=${escapeHtml(id || "")}）。
          <p><a href="index.html">返回 hub</a></p></div>`;
        return;
      }
      document.title = `Lesson ${L.lesson} — ${L.title} · Collocation Trainer`;
      renderLesson(L);
    } else if (page === "study") {
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

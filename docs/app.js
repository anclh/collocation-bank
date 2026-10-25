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
      };
    } catch {
      return { done: {}, lastId: null, lastOpened: null };
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

    root.innerHTML = `
      <header class="hero">
        <span class="eyebrow">Anson's Collocations · IELTS Writing</span>
        <h1>Collocation Trainer</h1>
        <p class="meta">21 堂搭配 · Mon / Thu · mobile-first</p>
        <div class="stats-row">
          <span class="stat-pill">完成 <strong>${done}</strong> / ${lessons.length}</span>
          <span class="stat-pill">進度 <strong>${pct}%</strong></span>
        </div>
        <div class="progress-wrap" aria-hidden="true"><div class="progress-bar" style="width:${pct}%"></div></div>
      </header>
      <section>
        <h2><span class="num">📚</span> Lessons</h2>
        <p class="hint">撳入去練習；完成後可 Mark done。進度存喺呢部電話（localStorage）。</p>
        <ul class="lesson-list" id="lesson-list"></ul>
      </section>
    `;

    const list = $("#lesson-list");
    const frag = document.createDocumentFragment();
    for (const L of lessons) {
      const li = document.createElement("li");
      const isDone = Boolean(state.progress.done[L.id]);
      const isLast = state.progress.lastId === L.id;
      const a = document.createElement("a");
      a.className = "lesson-link" + (isDone ? " is-done" : "") + (isLast ? " is-last" : "");
      a.href = `lesson.html?id=${encodeURIComponent(L.id)}`;
      a.innerHTML = `
        <span class="lesson-num">${L.lesson}</span>
        <span class="lesson-body">
          <p class="lesson-title">${escapeHtml(L.title || L.theme)}</p>
          <p class="lesson-meta">${escapeHtml(L.date)} · ${escapeHtml(L.theme)} · ${L.collocations.length} collocations</p>
        </span>
        <span class="lesson-flags">
          ${isDone ? '<span class="flag done">Done</span>' : ""}
          ${isLast ? '<span class="flag last">Last</span>' : ""}
        </span>
      `;
      li.appendChild(a);
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
        <p class="nav-hub"><a href="index.html">← 全部課程 Index</a></p>
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

#!/usr/bin/env python3
"""Build docs/data/lessons.json from content/lessons/*.md"""

from __future__ import annotations

import json
import re
import shutil
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "content" / "lessons"
OUT_DATA = ROOT / "data" / "lessons.json"
OUT_DOCS = ROOT / "docs" / "data" / "lessons.json"

WARNINGS: list[str] = []


def warn(msg: str) -> None:
    WARNINGS.append(msg)
    print(f"  ! {msg}")


def strip_md(s: str) -> str:
    s = s.strip()
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"\*(.+?)\*", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    s = re.sub(r"~~(.+?)~~", r"\1", s)
    return s.strip()


def strip_strike(s: str) -> str:
    """Keep strike content but remove ~~ markers for mistake text."""
    return re.sub(r"~~(.+?)~~", r"\1", s).strip()


def slugify(date_s: str, theme: str) -> str:
    t = re.sub(r"[^a-z0-9]+", "-", theme.lower()).strip("-")
    return f"{date_s}-{t}"


def parse_frontmatter(text: str) -> tuple[dict, str]:
    meta: dict = {}
    body = text
    if text.startswith("---"):
        m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.S)
        if m:
            fm, body = m.group(1), m.group(2)
            for line in fm.splitlines():
                if ":" not in line:
                    continue
                k, v = line.split(":", 1)
                k, v = k.strip(), v.strip()
                if k == "tags":
                    # [a, b] or a, b
                    v = v.strip("[]")
                    meta[k] = [x.strip() for x in v.split(",") if x.strip()]
                elif k == "lesson":
                    try:
                        meta[k] = int(v)
                    except ValueError:
                        meta[k] = v
                else:
                    meta[k] = v
    return meta, body


def section_after(body: str, headings: list[str]) -> str | None:
    """Return text after a ## heading until next ## (or end)."""
    for h in headings:
        pat = rf"^##\s+{re.escape(h)}[^\n]*\n(.*?)(?=^##\s|\Z)"
        m = re.search(pat, body, re.M | re.S | re.I)
        if m:
            return m.group(1).strip()
    return None


def parse_review(body: str) -> list[dict]:
    sec = section_after(body, ["Quick review"])
    if not sec:
        # try partial match
        m = re.search(r"^##\s+Quick review[^\n]*\n(.*?)(?=^##\s|\Z)", body, re.M | re.S | re.I)
        sec = m.group(1).strip() if m else None
    if not sec:
        return []
    items = []
    for line in sec.splitlines():
        line = line.strip()
        m = re.match(r"^\d+\.\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+)$", line)
        if m:
            items.append({"phrase": m.group(1).strip(), "yue": m.group(2).strip()})
            continue
        m = re.match(r"^\d+\.\s+\*\*(.+?)\*\*\s*$", line)
        if m:
            items.append({"phrase": m.group(1).strip(), "yue": ""})
    return items


def parse_collocation_block(block: str, phrase_hint: str) -> dict:
    col = {
        "phrase": phrase_hint,
        "weak": "",
        "yue": "",
        "frame": "",
        "model": "",
        "mistake": "",
    }
    for raw in block.splitlines():
        line = raw.strip().lstrip("-").strip()
        if not line:
            continue
        low = line.lower()

        # Weak → better: *weak* → **phrase**
        if low.startswith("weak"):
            # capture italic weak forms
            ital = re.findall(r"\*([^*]+)\*", line)
            if "→" in line or "->" in line:
                # take text between Weak… and first → ** or last italic before arrow to bold
                m = re.search(
                    r"Weak[^:]*:\s*(?:\*|)?(.+?)(?:\*?\s*)?(?:→|->)\s*\*\*",
                    line,
                    re.I,
                )
                if m:
                    weak = m.group(1).strip().strip("*").strip()
                    # if multiple italics, prefer joined
                    if ital:
                        # drop the phrase itself if last italic equals phrase
                        weaks = [x for x in ital if x.lower() != phrase_hint.lower()]
                        if weaks:
                            weak = " / ".join(weaks) if len(weaks) > 1 and "→" in line else weaks[0]
                            # For "Weak → better: *a* → **b**" there's one italic before bold
                            if len(ital) >= 1:
                                weak = ital[0]
                    col["weak"] = weak
                else:
                    after = re.sub(r"(?i)^Weak(?:\s*→\s*better)?\s*:\s*", "", line)
                    after = re.split(r"→|->", after)[0]
                    col["weak"] = strip_md(after)
            else:
                after = re.sub(r"(?i)^Weak(?:\s*→\s*better)?\s*:\s*", "", line)
                col["weak"] = strip_md(after)
            continue

        if line.startswith("意思") or low.startswith("意思"):
            yue = re.sub(r"^意思\s*[:：]\s*", "", line)
            col["yue"] = yue.strip()
            continue

        if low.startswith("frame"):
            m = re.search(r"`([^`]+)`", line)
            col["frame"] = m.group(1).strip() if m else strip_md(re.sub(r"(?i)^Frame\s*:\s*", "", line))
            continue

        if low.startswith("model"):
            rest = re.sub(r"(?i)^Model\s*:\s*", "", line)
            col["model"] = strip_md(rest)
            continue

        if low.startswith("common mistake") or low.startswith("mistake"):
            rest = re.sub(r"(?i)^(Common\s+)?mistake\s*:\s*", "", line)
            col["mistake"] = strip_strike(rest)
            # also strip leftover bold/italic markers for cleaner display
            col["mistake"] = re.sub(r"\*\*|__", "", col["mistake"])
            col["mistake"] = re.sub(r"(?<!\w)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"\1", col["mistake"])
            continue

    return col


def parse_collocations_numbered_list(sec: str) -> list[dict]:
    """Format used by some later vault notes:
    1. **phrase** (weak: ...)
       - 粵語
       - Frame: ...
    """
    cols = []
    parts = re.split(r"(?m)^(\d+)\.\s+", sec)
    # [pre, num, body, num, body, ...]
    i = 1
    while i + 1 < len(parts):
        block = parts[i + 1]
        first_line, _, rest = block.partition("\n")
        m = re.match(r"\*\*(.+?)\*\*(?:\s*\((?:weak:\s*)?(.+?)\))?", first_line.strip(), re.I)
        if not m:
            i += 2
            continue
        phrase = m.group(1).strip()
        weak_paren = (m.group(2) or "").strip()
        # Build a pseudo block compatible with parse_collocation_block
        lines = []
        if weak_paren:
            weak_paren = re.sub(r"(?i)^weak:\s*", "", weak_paren).strip()
            lines.append(f"- Weak: {weak_paren}")
        for raw in rest.splitlines():
            line = raw.strip()
            if not line:
                continue
            line = line.lstrip("-").strip()
            low = line.lower()
            if low.startswith("frame"):
                lines.append(f"- Frame: {re.sub(r'(?i)^Frame\s*:\s*', '', line)}")
            elif low.startswith("model"):
                lines.append(f"- Model: {re.sub(r'(?i)^Model\s*:\s*', '', line)}")
            elif low.startswith("mistake") or low.startswith("common mistake"):
                lines.append(f"- Mistake: {re.sub(r'(?i)^(Common\s+)?mistake\s*:\s*', '', line)}")
            elif line.startswith("意思"):
                lines.append(f"- {line}")
            else:
                # bare Cantonese gloss line
                if not any(low.startswith(k) for k in ("frame", "model", "mistake", "weak")):
                    lines.append(f"- 意思：{line}")
                else:
                    lines.append(f"- {line}")
        col = parse_collocation_block("\n".join(lines), phrase)
        if weak_paren and not col["weak"]:
            col["weak"] = weak_paren
        cols.append(col)
        i += 2
    return cols


def parse_collocations(body: str) -> list[dict]:
    sec = None
    m = re.search(
        r"^##\s+Today'?s?\s+5\s+collocations[^\n]*\n(.*?)(?=^##\s|\Z)",
        body,
        re.M | re.S | re.I,
    )
    if m:
        sec = m.group(1)
    if not sec:
        return []

    cols = []
    # split on ### N. phrase
    parts = re.split(r"^###\s+(\d+)\.\s+(.+)$", sec, flags=re.M)
    # parts: [pre, num, phrase, body, num, phrase, body, ...]
    i = 1
    while i + 2 < len(parts):
        phrase = parts[i + 1].strip()
        block = parts[i + 2]
        cols.append(parse_collocation_block(block, phrase))
        i += 3
    if cols:
        return cols
    # fallback: numbered list with bold phrases
    return parse_collocations_numbered_list(sec)


def parse_passage(body: str) -> str:
    """Return passage prose only (no Passage tasks block)."""
    passage, _ = parse_passage_and_tasks(body)
    return passage


def parse_passage_and_tasks(body: str) -> tuple[str, list[dict]]:
    """Split Reading passage section into prose + task prompts."""
    sec = section_after(body, ["Reading passage"])
    if not sec:
        m = re.search(r"^##\s+Reading passage[^\n]*\n(.*?)(?=^##\s|\Z)", body, re.M | re.S | re.I)
        sec = m.group(1).strip() if m else ""
    if not sec:
        return "", []

    # drop Prompt: lines
    cleaned_lines = []
    for line in sec.splitlines():
        if re.match(r"^\*\*Prompt:\*\*", line.strip(), re.I):
            continue
        if re.match(r"^Prompt\s*:", line.strip(), re.I):
            continue
        cleaned_lines.append(line)
    sec = "\n".join(cleaned_lines).strip()

    tasks: list[dict] = []
    passage = sec
    # Split on **Passage tasks** / Passage tasks heading
    split_m = re.split(
        r"(?im)^(?:\*\*)?Passage tasks?(?:\*\*)?\s*$",
        sec,
        maxsplit=1,
    )
    if len(split_m) == 2:
        passage = split_m[0].strip()
        task_sec = split_m[1].strip()
        for line in task_sec.splitlines():
            line = line.strip()
            mm = re.match(r"^(\d+)\.\s*(.+)$", line)
            if mm:
                tasks.append({"q": mm.group(2).strip(), "answer": "", "type": "open"})
    else:
        # numbered tasks after blank line following paragraph — keep prose until first task line
        # only if we see a clear tasks cluster
        lines = sec.splitlines()
        task_start = None
        for i, line in enumerate(lines):
            if re.match(r"^1\.\s+", line.strip()) and i > 0:
                # look ahead for 2. and 3.
                rest = "\n".join(lines[i:])
                if re.search(r"(?m)^2\.\s+", rest) and re.search(r"(?m)^3\.\s+", rest):
                    task_start = i
                    break
        if task_start is not None:
            passage = "\n".join(lines[:task_start]).strip()
            for line in lines[task_start:]:
                line = line.strip()
                mm = re.match(r"^(\d+)\.\s*(.+)$", line)
                if mm:
                    tasks.append({"q": mm.group(2).strip(), "answer": "", "type": "open"})

    # classify light types
    for t in tasks:
        q = t["q"]
        if re.search(r"True\s*/\s*False", q, re.I):
            t["type"] = "tf"
        elif "選" in q or re.search(r"\([^/]+/[^)]+\)", q):
            t["type"] = "choose"
        else:
            t["type"] = "open"

    return passage.strip(), tasks


def parse_next_theme(body: str) -> str:
    for heading in ("Next theme", "Next preview"):
        sec = section_after(body, [heading])
        if sec:
            # first non-empty line
            for line in sec.splitlines():
                line = strip_md(line)
                if line:
                    return line
    m = re.search(r"(?i)Next(?:\s+theme|\s+preview)?\s*[:：]\s*(.+)", body)
    if m:
        return strip_md(m.group(1))
    return ""


def parse_answer_key(body: str) -> dict:
    """Pull A/B/C and passage answers if present."""
    out: dict = {"drill": {}, "tasks": {}}
    m = re.search(r"^##\s+ANSWER KEY[^\n]*\n(.*?)(?=^##\s|\Z)", body, re.M | re.S | re.I)
    if not m:
        return out
    sec = m.group(1)
    # Mini drill bullets
    for letter in ("A", "B", "C"):
        mm = re.search(rf"(?m)^-\s*{letter}\s*:\s*(.+)$", sec)
        if mm:
            out["drill"][letter] = strip_md(mm.group(1))
    # Prefer ### Passage tasks subsection
    task_sec = sec
    tm = re.search(r"(?im)^###\s+Passage tasks?\s*\n(.*?)(?=^###\s|\Z)", sec, re.M | re.S)
    if tm:
        task_sec = tm.group(1)
    for n in (1, 2, 3):
        mm = re.search(rf"(?m)^\s*{n}\.\s*(.+)$", task_sec)
        if mm:
            out["tasks"][str(n)] = strip_md(mm.group(1))
    return out


def parse_mini_drill_section(body: str) -> list[dict] | None:
    m = re.search(r"^##\s+Mini drill[^\n]*\n(.*?)(?=^##\s|\Z)", body, re.M | re.S | re.I)
    if not m:
        return None
    sec = m.group(1).strip()
    if not sec:
        return None
    items = []
    # **A.** prompt  or A. prompt
    chunks = re.split(r"(?m)^\*\*?([ABC])\.?\*\*?\s+", sec)
    # [pre, A, text, B, text, ...]
    i = 1
    while i + 1 < len(chunks):
        lid = chunks[i]
        text = chunks[i + 1].strip()
        # first line is prompt, rest may be hints
        first = text.splitlines()[0].strip() if text else ""
        prompt = strip_md(first)
        # detect type
        dtype = "rewrite"
        choices: list[str] = []
        answer = ""
        if re.search(r"\([^/]+/[^)]+\)", prompt) or "選" in prompt:
            dtype = "choose"
            cm = re.search(r"\(([^)]+/[^)]+)\)", prompt)
            if cm:
                choices = [c.strip().strip("*") for c in cm.group(1).split("/")]
        elif "填空" in prompt or "______" in text or "____" in text:
            dtype = "fill"
        items.append(
            {
                "id": lid,
                "prompt": prompt,
                "type": dtype,
                "answer": answer,
                "choices": choices,
            }
        )
        i += 2
    return items or None


def misspell(word: str) -> str:
    """Create a plausible wrong spelling for choose drills."""
    w = word
    if "obsolete" in w.lower():
        return "obsolute"
    if len(w) > 4:
        # swap two middle chars
        i = len(w) // 2
        chars = list(w)
        chars[i], chars[i - 1] = chars[i - 1], chars[i]
        cand = "".join(chars)
        if cand != w:
            return cand
    return w + "e" if not w.endswith("e") else w[:-1] + "a"


def synthesize_drill(cols: list[dict], answer_key: dict) -> dict:
    items = []
    ak = answer_key.get("drill", {})

    # A rewrite from first collocation
    c0 = cols[0] if cols else None
    if c0:
        weak = c0["weak"] or "a weaker phrase"
        prompt = f"改寫得更學術：用今日搭配取代弱寫法。\n弱：{weak}"
        ans = ak.get("A") or c0["phrase"]
        items.append(
            {
                "id": "A",
                "prompt": prompt,
                "type": "rewrite",
                "answer": ans,
                "choices": [],
                "accept": c0["phrase"],
            }
        )

    # B choose — pick a content word, often from mistake or last word of phrase
    c1 = cols[1] if len(cols) > 1 else c0
    if c1:
        words = re.findall(r"[A-Za-z][A-Za-z\-']{3,}", c1["phrase"])
        target = words[-1] if words else c1["phrase"].split()[-1]
        # Prefer a word mentioned in mistake strikethrough-ish content
        wrong = misspell(target)
        # try extract wrong form from mistake text
        if c1.get("mistake"):
            # look for similar but different token
            toks = re.findall(r"[A-Za-z][A-Za-z\-']+", c1["mistake"])
            for t in toks:
                if t.lower() != target.lower() and abs(len(t) - len(target)) <= 2:
                    # likely misspelling candidate
                    if t.lower().startswith(target[:3].lower()) or target.lower().startswith(t[:3].lower()):
                        wrong = t
                        break
        prompt = f"選正確：Which form is correct for this lesson's collocation?\n（{target} / {wrong}）"
        ans = ak.get("B") or target
        items.append(
            {
                "id": "B",
                "prompt": prompt,
                "type": "choose",
                "answer": strip_md(ans).split()[0] if ans else target,
                "choices": [target, wrong],
            }
        )
        # normalize answer to the correct choice
        items[-1]["answer"] = target

    # C fill — use a mid/later collocation
    c2 = cols[3] if len(cols) > 3 else (cols[2] if len(cols) > 2 else c0)
    if c2:
        phrase = c2["phrase"]
        parts = phrase.split()
        if len(parts) >= 2:
            half = max(1, len(parts) // 2)
            blanked = " ".join(["______"] * half + parts[half:])
            # simpler: blank whole phrase
            prompt = f"填空：Complete the collocation.\n（提示：{c2['yue'] or c2['frame'] or 'today’s phrase'}）\n______ ______ … → 「{phrase}」嘅意思"
            # Better fill prompt using model with blanks
            model = c2.get("model") or ""
            if model and phrase.lower() in model.lower():
                # case-insensitive replace
                def blank_repl(mobj):
                    return "______"

                prompt_model = re.sub(re.escape(phrase), "______", model, count=1, flags=re.I)
                prompt = f"填空：{prompt_model}"
            else:
                prompt = f"填空：Write the collocation that means「{c2['yue'] or phrase}」。"
            ans = ak.get("C") or phrase
            items.append(
                {
                    "id": "C",
                    "prompt": prompt,
                    "type": "fill",
                    "answer": phrase,
                    "choices": [],
                    "accept": phrase,
                }
            )

    return {"items": items}


def synthesize_passage(cols: list[dict]) -> str:
    """Stitch model sentences into a short cohesive paragraph."""
    bits = []
    for c in cols:
        m = (c.get("model") or "").strip()
        if not m:
            continue
        if not m.endswith("."):
            m += "."
        # ensure phrase marked
        ph = c["phrase"]
        if f"**{ph}**" not in m and ph.lower() in m.lower():
            m = re.sub(re.escape(ph), f"**{ph}**", m, count=1, flags=re.I)
        elif f"**{ph}**" not in m:
            m = m  # leave as-is
        bits.append(m)
    if not bits:
        return ""
    # Join with light connective feel
    if len(bits) == 1:
        return bits[0]
    return " ".join(bits)


def synthesize_tasks(cols: list[dict], passage: str, answer_key: dict) -> list[dict]:
    """Fallback only when markdown has no Passage tasks prompts."""
    ak = answer_key.get("tasks", {})
    tasks = []
    if not cols:
        return tasks

    c0 = cols[0]
    q1 = f"今日第一個搭配 **{c0['phrase']}** 喺 passage 入面點用？"
    tasks.append(
        {
            "q": q1,
            "type": "open",
            "answer": ak.get("1") or (c0.get("model") or c0["phrase"]),
            "choices": [],
        }
    )

    c_mid = cols[min(2, len(cols) - 1)]
    tasks.append(
        {
            "q": f"用自己一句解釋文中 **{c_mid['phrase']}** 嘅用法。",
            "type": "open",
            "answer": ak.get("2") or c_mid.get("model") or c_mid["phrase"],
            "choices": [],
            "accept": c_mid["phrase"],
        }
    )

    q = "True / False：呢段 passage 只出現咗一個今日搭配。"
    ans = "False"
    if ak.get("3"):
        a3 = ak["3"]
        if re.search(r"false", a3, re.I):
            ans = "False"
        elif re.search(r"true", a3, re.I):
            ans = "True"
    tasks.append(
        {
            "q": q,
            "type": "tf",
            "answer": ans,
            "choices": ["True", "False"],
        }
    )
    return tasks


def merge_passage_tasks(parsed: list[dict], answer_key: dict, cols: list[dict], passage: str) -> list[dict]:
    """Prefer markdown Passage tasks; attach answers from ANSWER KEY."""
    ak = answer_key.get("tasks", {})
    if parsed:
        out = []
        for i, t in enumerate(parsed, start=1):
            item = dict(t)
            if not item.get("answer") and str(i) in ak:
                item["answer"] = ak[str(i)]
            if item.get("type") == "tf":
                a = item.get("answer") or ""
                if re.match(r"(?i)^\s*\*?\*?false\b", a):
                    item["answer"] = "False"
                elif re.match(r"(?i)^\s*\*?\*?true\b", a):
                    item["answer"] = "True"
                item["choices"] = ["True", "False"]
            out.append(item)
        return out
    return synthesize_tasks(cols, passage, answer_key)


def title_from_theme(theme: str) -> str:
    # impact/effect → Impact / Effect
    t = theme.replace("/", " / ").replace("-", " ")
    parts = []
    for w in t.split():
        if w.lower() in ("and", "or", "of", "the", "a"):
            parts.append(w.lower())
        else:
            parts.append(w[:1].upper() + w[1:] if w else w)
    # fix first word capital
    if parts:
        parts[0] = parts[0][:1].upper() + parts[0][1:]
    return " ".join(parts)


def parse_filename(path: Path) -> tuple[str, str]:
    # 2026-10-22 - Technology.md
    stem = path.stem
    m = re.match(r"^(\d{4}-\d{2}-\d{2})\s*-\s*(.+)$", stem)
    if m:
        return m.group(1), m.group(2).strip()
    return "", stem


def build_lesson(path: Path, lesson_num: int) -> dict:
    text = path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(text)
    file_date, file_theme = parse_filename(path)
    date_s = str(meta.get("date") or file_date)
    theme_raw = str(meta.get("theme") or file_theme)
    theme = title_from_theme(theme_raw)

    cols = parse_collocations(body)
    if len(cols) < 5:
        warn(f"{path.name}: found {len(cols)} collocations (expected 5)")
    if not cols:
        warn(f"{path.name}: no collocations parsed")

    review = parse_review(body)
    if not review and meta.get("review_from"):
        # e.g. "L15 (be plagued by, run the risk of, be vulnerable to)"
        rf = str(meta["review_from"])
        mm = re.search(r"\((.+)\)", rf)
        if mm:
            for bit in mm.group(1).split(","):
                phrase = bit.strip()
                if phrase:
                    review.append({"phrase": phrase, "yue": ""})
    passage, passage_task_prompts = parse_passage_and_tasks(body)
    next_theme = parse_next_theme(body) or strip_md(str(meta.get("next_theme") or ""))
    answer_key = parse_answer_key(body)

    drill_items = parse_mini_drill_section(body)
    if drill_items:
        # fill answers from answer key when empty
        for it in drill_items:
            if not it.get("answer") and it["id"] in answer_key.get("drill", {}):
                it["answer"] = answer_key["drill"][it["id"]]
        drill = {"items": drill_items}
    else:
        drill = synthesize_drill(cols, answer_key)

    if not passage and cols:
        passage = synthesize_passage(cols)
        warn(f"{path.name}: no Reading passage — synthesized from model sentences")

    tasks = merge_passage_tasks(passage_task_prompts, answer_key, cols, passage)

    # Enrich review with model from matching previous — we only have yue in review list
    # Optionally attach model from nothing; leave as-is. Flip cards can show yue on front, phrase on back if no model.

    lid = slugify(date_s, theme_raw if theme_raw else theme)

    return {
        "id": lid,
        "lesson": lesson_num,
        "date": date_s,
        "theme": theme,
        "title": theme,
        "review": review,
        "collocations": cols,
        "drill": drill,
        "passage": passage,
        "tasks": tasks,
        "nextTheme": next_theme,
        "sourceFile": path.name,
    }


def main() -> None:
    print(f"Building from {SRC}")
    files = sorted(SRC.glob("*.md"), key=lambda p: parse_filename(p)[0] or p.name)
    # filter AppleDouble
    files = [p for p in files if not p.name.startswith("._")]
    if not files:
        raise SystemExit("No lesson markdown found")

    lessons = []
    for i, path in enumerate(files, start=1):
        print(f"  parsing L{i}: {path.name}")
        lessons.append(build_lesson(path, i))

    payload = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(lessons),
        "lessons": lessons,
    }

    OUT_DATA.parent.mkdir(parents=True, exist_ok=True)
    OUT_DOCS.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    OUT_DATA.write_text(text, encoding="utf-8")
    shutil.copyfile(OUT_DATA, OUT_DOCS)
    print(f"Wrote {OUT_DATA} ({len(lessons)} lessons)")
    print(f"Copied → {OUT_DOCS}")
    if WARNINGS:
        print(f"{len(WARNINGS)} warning(s)")
    else:
        print("No warnings")


if __name__ == "__main__":
    main()

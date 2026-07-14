"use strict";

/**
 * 草野球スコア記録 — 最小構成
 * 1試合分の打数・安打数を選手ごとに登録し、打率（安打数 ÷ 打数）を一覧表示する。
 * データは localStorage にのみ保存する。
 */

const STORAGE_KEY = "kusayakyu_score_v1";

// ---- DOM 参照 ----
const inputBody = document.getElementById("input-body");
const resultBody = document.getElementById("result-body");
const resultFoot = document.getElementById("result-foot");
const messageEl = document.getElementById("message");
const emptyNote = document.getElementById("empty-note");

// ---------------------------------------------------------------------------
// 打率の計算・表示
//   打率 = 安打数 ÷ 打数（小数点第3位まで）。打数が0のときは打率なし("----")。
// ---------------------------------------------------------------------------
function formatAverage(hits, atBats) {
  if (atBats === 0) return null; // 打数0は打率を定義しない
  return (hits / atBats).toFixed(3); // 例: 0.333
}

// ---------------------------------------------------------------------------
// 入力行の生成
// ---------------------------------------------------------------------------
function createRow(name = "", atBats = "", hits = "") {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="col-name"><input type="text" class="in-name" value="" placeholder="例: 田中"></td>
    <td class="col-num"><input type="number" class="in-atbats" min="0" step="1" inputmode="numeric" placeholder="0"></td>
    <td class="col-num"><input type="number" class="in-hits" min="0" step="1" inputmode="numeric" placeholder="0"></td>
    <td class="col-del"><button type="button" class="btn-del" aria-label="この行を削除">×</button></td>
  `;
  // value はプロパティ経由で設定（HTMLエスケープ不要にするため）
  tr.querySelector(".in-name").value = name;
  tr.querySelector(".in-atbats").value = atBats;
  tr.querySelector(".in-hits").value = hits;
  tr.querySelector(".btn-del").addEventListener("click", () => {
    tr.remove();
    ensureAtLeastOneRow();
  });
  return tr;
}

function addRow(name = "", atBats = "", hits = "") {
  inputBody.appendChild(createRow(name, atBats, hits));
}

function ensureAtLeastOneRow() {
  if (inputBody.children.length === 0) addRow();
}

// ---------------------------------------------------------------------------
// 入力欄の読み取りとバリデーション
// ---------------------------------------------------------------------------
function collectAndValidate() {
  const rows = Array.from(inputBody.querySelectorAll("tr"));
  const records = [];
  const errors = [];

  rows.forEach((tr, i) => {
    const name = tr.querySelector(".in-name").value.trim();
    const atBatsRaw = tr.querySelector(".in-atbats").value.trim();
    const hitsRaw = tr.querySelector(".in-hits").value.trim();

    // 全項目が空の行はスキップ（誤入力用の余り行を許容）
    if (name === "" && atBatsRaw === "" && hitsRaw === "") return;

    const line = `${i + 1}行目`;
    if (name === "") errors.push(`${line}: 選手名を入力してください。`);

    const atBats = Number(atBatsRaw);
    const hits = Number(hitsRaw);

    if (atBatsRaw === "" || !Number.isInteger(atBats) || atBats < 0) {
      errors.push(`${line}: 打数は0以上の整数で入力してください。`);
    }
    if (hitsRaw === "" || !Number.isInteger(hits) || hits < 0) {
      errors.push(`${line}: 安打数は0以上の整数で入力してください。`);
    }
    if (Number.isInteger(atBats) && Number.isInteger(hits) && hits > atBats) {
      errors.push(`${line}: 安打数（${hits}）が打数（${atBats}）を超えています。`);
    }

    records.push({ name, atBats, hits });
  });

  if (records.length === 0 && errors.length === 0) {
    errors.push("登録する選手がありません。選手名・打数・安打数を入力してください。");
  }

  return { records, errors };
}

// ---------------------------------------------------------------------------
// localStorage 入出力
// ---------------------------------------------------------------------------
function save(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("保存データの読み込みに失敗しました:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 打率一覧（出力）の描画
// ---------------------------------------------------------------------------
function renderResults(records) {
  resultBody.innerHTML = "";
  resultFoot.innerHTML = "";

  if (!records || records.length === 0) {
    emptyNote.style.display = "block";
    return;
  }
  emptyNote.style.display = "none";

  // 打率の高い順に並べる（打数0＝打率なしは末尾へ）
  const sorted = [...records].sort((a, b) => {
    const avgA = a.atBats === 0 ? -1 : a.hits / a.atBats;
    const avgB = b.atBats === 0 ? -1 : b.hits / b.atBats;
    return avgB - avgA;
  });

  let totalAtBats = 0;
  let totalHits = 0;

  sorted.forEach((r, i) => {
    totalAtBats += r.atBats;
    totalHits += r.hits;

    const avg = formatAverage(r.hits, r.atBats);
    const avgCell = avg === null
      ? `<span class="avg-na">----</span>`
      : `<span class="avg">${avg}</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-rank">${i + 1}</td>
      <td class="col-name"></td>
      <td class="col-num">${r.atBats}</td>
      <td class="col-num">${r.hits}</td>
      <td class="col-num">${avgCell}</td>
    `;
    tr.querySelector(".col-name").textContent = r.name; // XSS対策でtextContent
    resultBody.appendChild(tr);
  });

  // チーム合計行
  const teamAvg = formatAverage(totalHits, totalAtBats);
  const teamAvgCell = teamAvg === null ? "----" : teamAvg;
  resultFoot.innerHTML = `
    <tr>
      <td class="col-rank"></td>
      <td class="col-name">チーム合計</td>
      <td class="col-num">${totalAtBats}</td>
      <td class="col-num">${totalHits}</td>
      <td class="col-num">${teamAvgCell}</td>
    </tr>
  `;
}

// ---------------------------------------------------------------------------
// メッセージ表示
// ---------------------------------------------------------------------------
function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = "message" + (type ? " " + type : "");
}

// ---------------------------------------------------------------------------
// イベント: 登録
// ---------------------------------------------------------------------------
function onRegister() {
  const { records, errors } = collectAndValidate();
  if (errors.length > 0) {
    showMessage("登録できませんでした。 " + errors.join(" / "), "error");
    return;
  }
  save(records);
  renderResults(records);
  showMessage(`登録しました（${records.length}名）。打率を一覧に表示しています。`, "ok");
}

// ---------------------------------------------------------------------------
// イベント: 全消去
// ---------------------------------------------------------------------------
function onClearAll() {
  if (!confirm("保存済みのデータと入力内容をすべて消去します。よろしいですか？")) return;
  localStorage.removeItem(STORAGE_KEY);
  inputBody.innerHTML = "";
  addRow();
  addRow();
  addRow();
  renderResults([]);
  showMessage("すべてのデータを消去しました。", "ok");
}

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------
function init() {
  document.getElementById("add-row").addEventListener("click", () => addRow());
  document.getElementById("register").addEventListener("click", onRegister);
  document.getElementById("clear-all").addEventListener("click", onClearAll);

  const saved = load();
  if (saved.length > 0) {
    // 保存済みデータを入力欄に復元（続けて編集・再登録できる）
    saved.forEach((r) => addRow(r.name, r.atBats, r.hits));
    renderResults(saved);
  } else {
    // 初期状態は空の入力行を3つ用意
    addRow();
    addRow();
    addRow();
    renderResults([]);
  }
}

document.addEventListener("DOMContentLoaded", init);

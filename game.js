"use strict";

/**
 * 草野球スコア記録 — 試合中入力（打席ごと）モード
 *
 * 打順を登録し、打席ごとに「打球方向（守備位置）・打球種類・結果」を記録する。
 * 記録から打数・安打・打率を正式ルールで自動集計する。
 *   - 打数(AB) に数えない: 四球・死球・犠打・犠飛
 *   - 安打(H) ではない打数: エラー出塁・野選・三振・各種アウト
 *   - 打率(AVG) = 安打 ÷ 打数（打数0のときは「----」）
 * データは localStorage（合計入力モードとは別キー）に保存する。
 */

const GAME_KEY = "kusayakyu_game_v1";
const SVGNS = "http://www.w3.org/2000/svg";

// 守備位置（背番号順）と、フィールド上の座標（viewBox 0 0 300 300）
const POSITIONS = [
  { key: "投", name: "投手", x: 150, y: 197 },
  { key: "捕", name: "捕手", x: 150, y: 272 },
  { key: "一", name: "一塁", x: 206, y: 189 },
  { key: "二", name: "二塁", x: 182, y: 161 },
  { key: "三", name: "三塁", x: 94,  y: 189 },
  { key: "遊", name: "遊撃", x: 118, y: 161 },
  { key: "左", name: "左翼", x: 68,  y: 96 },
  { key: "中", name: "中堅", x: 150, y: 66 },
  { key: "右", name: "右翼", x: 232, y: 96 },
];

// 結果ごとの分類: ab=打数に数えるか, hit=安打か, ball=打球あり(方向・種類が必要)か
const RESULTS = {
  "安打":   { ab: true,  hit: true,  ball: true,  cat: "hit" },
  "二塁打": { ab: true,  hit: true,  ball: true,  cat: "hit" },
  "三塁打": { ab: true,  hit: true,  ball: true,  cat: "hit" },
  "本塁打": { ab: true,  hit: true,  ball: true,  cat: "hit" },
  "エラー": { ab: true,  hit: false, ball: true,  cat: "err" },
  "野選":   { ab: true,  hit: false, ball: true,  cat: "out" },
  "アウト": { ab: true,  hit: false, ball: true,  cat: "out" },
  "併殺":   { ab: true,  hit: false, ball: true,  cat: "out" },
  "三振":   { ab: true,  hit: false, ball: false, cat: "out" },
  "四球":   { ab: false, hit: false, ball: false, cat: "bb" },
  "死球":   { ab: false, hit: false, ball: false, cat: "bb" },
  "犠打":   { ab: false, hit: false, ball: false, cat: "sac" },
  "犠飛":   { ab: false, hit: false, ball: true,  cat: "sac" },
};

// 表示用ラベル（内部キー・保存値は変更せず、画面表示だけ差し替える）
const RESULT_LABELS = { "野選": "野選（FC）" };
function labelOf(result) { return RESULT_LABELS[result] || result; }

// ---- 状態 ----
let data = load();            // { lineup, plays, currentIndex, seq }
let sel = { position: null, ballType: null, result: null };

// ---- DOM ----
const lineupBody = document.getElementById("lineup-body");
const lineupMsg = document.getElementById("lineup-msg");
const curBatterEl = document.getElementById("current-batter");
const fieldEl = document.getElementById("field");
const sprayFieldEl = document.getElementById("spray-field");
const summaryEl = document.getElementById("selection-summary");
const recordMsg = document.getElementById("record-msg");
const statsBody = document.getElementById("stats-body");
const statsFoot = document.getElementById("stats-foot");
const statsEmpty = document.getElementById("stats-empty");

// ---------------------------------------------------------------------------
// 保存・読み込み
// ---------------------------------------------------------------------------
function load() {
  try {
    const raw = localStorage.getItem(GAME_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return {
        lineup: Array.isArray(d.lineup) ? d.lineup : [],
        plays: Array.isArray(d.plays) ? d.plays : [],
        currentIndex: Number.isInteger(d.currentIndex) ? d.currentIndex : 0,
        seq: Number.isInteger(d.seq) ? d.seq : 1,
      };
    }
  } catch (e) {
    console.error("試合データの読み込みに失敗しました:", e);
  }
  return { lineup: [], plays: [], currentIndex: 0, seq: 1 };
}

function save() {
  localStorage.setItem(GAME_KEY, JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// SVGフィールドの描画
// ---------------------------------------------------------------------------
function svg(tag, attrs, children) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  (children || []).forEach((c) => e.appendChild(c));
  return e;
}

function baseSquare(x, y) {
  return svg("rect", {
    x: x - 5, y: y - 5, width: 10, height: 10,
    fill: "#ffffff", stroke: "#cbd5e1", "stroke-width": 1,
    transform: `rotate(45 ${x} ${y})`,
  });
}

function buildField(container, opts) {
  opts = opts || {};
  container.innerHTML = "";
  const root = svg("svg", { viewBox: "0 0 300 300", class: "field-svg" });

  // 芝（外野）
  root.appendChild(svg("path", { d: "M150,250 L288,118 Q150,20 12,118 Z", fill: "#5bbf6a" }));
  // 内野の土
  root.appendChild(svg("path", { d: "M150,250 L208,192 L150,134 L92,192 Z", fill: "#d8a15a" }));
  // ファウルライン
  root.appendChild(svg("line", { x1: 150, y1: 250, x2: 288, y2: 118, stroke: "#ffffff", "stroke-width": 2 }));
  root.appendChild(svg("line", { x1: 150, y1: 250, x2: 12, y2: 118, stroke: "#ffffff", "stroke-width": 2 }));
  // 塁
  [[150, 250], [208, 192], [150, 134], [92, 192]].forEach(([x, y]) => root.appendChild(baseSquare(x, y)));

  // 守備位置マーカー
  POSITIONS.forEach((pos) => {
    const g = svg("g", { class: "pos-marker", id: (opts.interactive ? "pos-" : "spos-") + pos.key });
    g.appendChild(svg("circle", { cx: pos.x, cy: pos.y, r: 14 }));
    const t = svg("text", { x: pos.x, y: pos.y });
    t.textContent = pos.key;
    g.appendChild(t);
    if (opts.interactive) {
      g.addEventListener("click", () => onSelectPosition(pos.key));
    }
    root.appendChild(g);
  });

  // 打球方向の点（スプレーチャート用）— マーカーの上に、位置の周りへ放射状に配置
  if (opts.plays) {
    const seen = {};
    opts.plays.forEach((p) => {
      if (!p.position) return;
      const pos = POSITIONS.find((q) => q.key === p.position);
      if (!pos) return;
      const n = seen[p.position] || 0;
      seen[p.position] = n + 1;
      const ring = Math.floor(n / 8);
      const ang = (n % 8) / 8 * Math.PI * 2 - Math.PI / 2;
      const radius = 21 + ring * 11;
      root.appendChild(svg("circle", {
        cx: pos.x + radius * Math.cos(ang),
        cy: pos.y + radius * Math.sin(ang),
        r: 5, fill: colorOf(p.result), class: "spray-dot",
      }));
    });
  }

  container.appendChild(root);
}

function colorOf(result) {
  const def = RESULTS[result];
  if (!def) return "#dc2626";
  if (def.cat === "hit") return "#16a34a";
  if (def.cat === "err") return "#f59e0b";
  return "#dc2626";
}

// ---------------------------------------------------------------------------
// 選択操作
// ---------------------------------------------------------------------------
function onSelectPosition(key) {
  sel.position = sel.position === key ? null : key;
  // 方向を選んだら「打球なし」の結果とは矛盾するので解除
  if (sel.result && !RESULTS[sel.result].ball) sel.result = null;
  syncSelectionUI();
}

function onSelectBallType(bt) {
  sel.ballType = sel.ballType === bt ? null : bt;
  if (sel.result && !RESULTS[sel.result].ball) sel.result = null;
  syncSelectionUI();
}

function onSelectResult(r) {
  sel.result = sel.result === r ? null : r;
  // 打球なしの結果を選んだら、方向・打球種類はクリア
  if (sel.result && !RESULTS[sel.result].ball) {
    sel.position = null;
    sel.ballType = null;
  }
  syncSelectionUI();
}

function clearSelection() {
  sel = { position: null, ballType: null, result: null };
  syncSelectionUI();
}

function syncSelectionUI() {
  // フィールドのマーカー
  POSITIONS.forEach((pos) => {
    const g = document.getElementById("pos-" + pos.key);
    if (g) g.classList.toggle("sel", sel.position === pos.key);
  });
  // 打球種類
  document.querySelectorAll("[data-ball]").forEach((b) => {
    b.classList.toggle("sel", sel.ballType === b.dataset.ball);
  });
  // 結果
  document.querySelectorAll("[data-result]").forEach((b) => {
    b.classList.toggle("sel", sel.result === b.dataset.result);
  });
  // サマリー
  summaryEl.innerHTML = "";
  const batter = data.lineup[data.currentIndex];
  if (!batter) {
    summaryEl.innerHTML = '<span class="muted">先に打順を登録してください。</span>';
    return;
  }
  const parts = [];
  if (sel.position) parts.push(sel.position);
  if (sel.ballType) parts.push(sel.ballType);
  if (sel.result) parts.push(labelOf(sel.result));
  const label = document.createElement("span");
  label.textContent = (data.currentIndex + 1) + "番 " + batter.name + "：";
  summaryEl.appendChild(label);
  if (parts.length === 0) {
    const m = document.createElement("span");
    m.className = "muted";
    m.textContent = "打球方向・種類・結果を選んでください。";
    summaryEl.appendChild(m);
  } else {
    summaryEl.appendChild(document.createTextNode(parts.join("・")));
  }
}

// ---------------------------------------------------------------------------
// 記録・取り消し
// ---------------------------------------------------------------------------
function describe(play) {
  if (play.position) return [play.position, play.ballType, labelOf(play.result)].filter(Boolean).join("・");
  return labelOf(play.result);
}

function onRecord() {
  const batter = data.lineup[data.currentIndex];
  if (!batter) { showMsg(recordMsg, "先に打順を登録してください。", "error"); return; }
  if (!sel.result) { showMsg(recordMsg, "結果を選んでください。", "error"); return; }

  const def = RESULTS[sel.result];
  if (def.ball) {
    if (!sel.position) { showMsg(recordMsg, sel.result + "は打球方向（守備位置）をフィールドで選んでください。", "error"); return; }
    if (!sel.ballType) { showMsg(recordMsg, sel.result + "は打球の種類（ゴロ／フライ／ライナー）を選んでください。", "error"); return; }
  }

  const play = {
    id: "pl" + (data.seq++),
    batterId: batter.id,
    batterName: batter.name,
    result: sel.result,
    ballType: def.ball ? sel.ballType : null,
    position: def.ball ? sel.position : null,
  };
  data.plays.push(play);
  data.currentIndex = (data.currentIndex + 1) % data.lineup.length;
  clearSelection();
  save();
  renderAll();
  showMsg(recordMsg, batter.name + "：" + describe(play) + " を記録しました。", "ok");
}

function onUndo() {
  if (data.plays.length === 0) { showMsg(recordMsg, "取り消す記録がありません。", "error"); return; }
  const last = data.plays.pop();
  const idx = data.lineup.findIndex((p) => p.id === last.batterId);
  if (idx >= 0) data.currentIndex = idx;
  save();
  renderAll();
  showMsg(recordMsg, "直前の記録（" + last.batterName + "：" + describe(last) + "）を取り消しました。", "ok");
}

// ---------------------------------------------------------------------------
// 打順エディタ
// ---------------------------------------------------------------------------
function lineupRow(order, name, id) {
  const tr = document.createElement("tr");
  if (id) tr.dataset.id = id;
  tr.innerHTML = `
    <td class="ln-order">${order}</td>
    <td><input type="text" class="ln-name" placeholder="選手名"></td>
    <td class="col-del"><button type="button" class="btn-del" aria-label="この行を削除">×</button></td>
  `;
  tr.querySelector(".ln-name").value = name;
  tr.querySelector(".btn-del").addEventListener("click", () => {
    tr.remove();
    renumberLineup();
  });
  return tr;
}

function renumberLineup() {
  Array.from(lineupBody.querySelectorAll("tr")).forEach((tr, i) => {
    tr.querySelector(".ln-order").textContent = i + 1;
  });
}

function renderLineupEditor() {
  lineupBody.innerHTML = "";
  if (data.lineup.length > 0) {
    data.lineup.forEach((p, i) => lineupBody.appendChild(lineupRow(i + 1, p.name, p.id)));
  } else {
    // 打順は既定で9人分の空行を用意する（「＋選手を追加」で増減可）
    for (let k = 0; k < 9; k++) lineupBody.appendChild(lineupRow(k + 1, "", ""));
  }
}

function onAddLineup() {
  const order = lineupBody.querySelectorAll("tr").length + 1;
  lineupBody.appendChild(lineupRow(order, "", ""));
}

function onSaveLineup() {
  const rows = Array.from(lineupBody.querySelectorAll("tr"));
  const newLineup = [];
  rows.forEach((tr) => {
    const name = tr.querySelector(".ln-name").value.trim();
    if (name === "") return;
    let id = tr.dataset.id;
    if (!id) id = "p" + (data.seq++);
    newLineup.push({ id, name });
  });
  if (newLineup.length === 0) { showMsg(lineupMsg, "選手名を1人以上入力してください。", "error"); return; }
  data.lineup = newLineup;
  if (data.currentIndex >= newLineup.length) data.currentIndex = 0;
  save();
  renderLineupEditor();
  renderAll();
  showMsg(lineupMsg, "打順を登録しました（" + newLineup.length + "人）。", "ok");
}

// ---------------------------------------------------------------------------
// 打者送り
// ---------------------------------------------------------------------------
function stepBatter(delta) {
  const n = data.lineup.length;
  if (n === 0) return;
  data.currentIndex = (data.currentIndex + delta + n) % n;
  save();
  renderCurrentBatter();
  syncSelectionUI();
}

// ---------------------------------------------------------------------------
// 集計・描画
// ---------------------------------------------------------------------------
function statsFor(batterId) {
  const ps = data.plays.filter((p) => p.batterId === batterId);
  let pa = ps.length, ab = 0, h = 0, hr = 0, bb = 0, so = 0;
  ps.forEach((p) => {
    const r = RESULTS[p.result] || {};
    if (r.ab) ab++;
    if (r.hit) h++;
    if (p.result === "本塁打") hr++;
    if (p.result === "四球" || p.result === "死球") bb++;
    if (p.result === "三振") so++;
  });
  const avg = ab > 0 ? (h / ab).toFixed(3) : null;
  return { pa, ab, h, hr, bb, so, avg };
}

function renderCurrentBatter() {
  const orderEl = curBatterEl.querySelector(".order");
  const nameEl = curBatterEl.querySelector(".name");
  const batter = data.lineup[data.currentIndex];
  if (!batter) {
    orderEl.textContent = "–";
    nameEl.textContent = "打順を登録してください";
  } else {
    orderEl.textContent = (data.currentIndex + 1) + "番";
    nameEl.textContent = batter.name;
  }
}

function renderStats() {
  statsBody.innerHTML = "";
  statsFoot.innerHTML = "";
  if (data.lineup.length === 0 || data.plays.length === 0) {
    statsEmpty.style.display = "block";
    return;
  }
  statsEmpty.style.display = "none";

  let tPa = 0, tAb = 0, tH = 0, tHr = 0, tBb = 0, tSo = 0;
  data.lineup.forEach((p, i) => {
    const s = statsFor(p.id);
    tPa += s.pa; tAb += s.ab; tH += s.h; tHr += s.hr; tBb += s.bb; tSo += s.so;
    const avgCell = s.avg === null ? '<span class="avg-na">----</span>' : `<span class="avg">${s.avg}</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="ln-order">${i + 1}</td>
      <td class="col-name"></td>
      <td class="col-num">${s.pa}</td>
      <td class="col-num">${s.ab}</td>
      <td class="col-num">${s.h}</td>
      <td class="col-num">${s.hr}</td>
      <td class="col-num">${s.bb}</td>
      <td class="col-num">${s.so}</td>
      <td class="col-num">${avgCell}</td>
    `;
    tr.querySelector(".col-name").textContent = p.name;
    statsBody.appendChild(tr);
  });

  const teamAvg = tAb > 0 ? (tH / tAb).toFixed(3) : "----";
  statsFoot.innerHTML = `
    <tr>
      <td class="ln-order"></td>
      <td class="col-name">チーム合計</td>
      <td class="col-num">${tPa}</td>
      <td class="col-num">${tAb}</td>
      <td class="col-num">${tH}</td>
      <td class="col-num">${tHr}</td>
      <td class="col-num">${tBb}</td>
      <td class="col-num">${tSo}</td>
      <td class="col-num">${teamAvg}</td>
    </tr>
  `;
}

function renderSprayChart() {
  buildField(sprayFieldEl, { interactive: false, plays: data.plays });
}

function renderAll() {
  renderCurrentBatter();
  renderStats();
  renderSprayChart();
  syncSelectionUI();
}

// ---------------------------------------------------------------------------
// メッセージ
// ---------------------------------------------------------------------------
function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "message" + (type ? " " + type : "");
}

function onClearGame() {
  if (!confirm("この試合の打順・記録をすべて消去します。よろしいですか？")) return;
  localStorage.removeItem(GAME_KEY);
  data = { lineup: [], plays: [], currentIndex: 0, seq: 1 };
  clearSelection();
  renderLineupEditor();
  renderAll();
  showMsg(recordMsg, "この試合のデータを消去しました。", "ok");
}

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------
function init() {
  buildField(fieldEl, { interactive: true });

  document.getElementById("add-lineup").addEventListener("click", onAddLineup);
  document.getElementById("save-lineup").addEventListener("click", onSaveLineup);
  document.getElementById("prev-batter").addEventListener("click", () => stepBatter(-1));
  document.getElementById("next-batter").addEventListener("click", () => stepBatter(1));
  document.getElementById("record").addEventListener("click", onRecord);
  document.getElementById("undo").addEventListener("click", onUndo);
  document.getElementById("clear-selection").addEventListener("click", () => {
    clearSelection();
    showMsg(recordMsg, "", "");
  });
  document.getElementById("clear-game").addEventListener("click", onClearGame);

  document.querySelectorAll("[data-ball]").forEach((b) => {
    b.addEventListener("click", () => onSelectBallType(b.dataset.ball));
  });
  document.querySelectorAll("[data-result]").forEach((b) => {
    b.addEventListener("click", () => onSelectResult(b.dataset.result));
  });

  renderLineupEditor();
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);

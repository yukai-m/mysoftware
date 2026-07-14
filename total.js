"use strict";

/**
 * 草野球スコア記録 — 通算成績・グラフページ
 *
 * 「試合中入力」で保存した全試合（localStorage: kusayakyu_games_v1）を読み込み、
 *   1. 選手名ごとの通算成績（打率＝通算安打÷通算打数）
 *   2. 打率の推移グラフ（その試合の打率／通算打率の累積、SVG折れ線）
 *   3. 保存済み試合の一覧（削除可）
 * を表示する。
 */

const GAMES_KEY = "kusayakyu_games_v1";
const SVGNS = "http://www.w3.org/2000/svg";

// 結果ごとの分類（game.js と同じ定義: ab=打数に数える, hit=安打）
const RESULTS = {
  "安打":   { ab: true,  hit: true  },
  "二塁打": { ab: true,  hit: true  },
  "三塁打": { ab: true,  hit: true  },
  "本塁打": { ab: true,  hit: true  },
  "エラー": { ab: true,  hit: false },
  "野選":   { ab: true,  hit: false },
  "アウト": { ab: true,  hit: false },
  "併殺":   { ab: true,  hit: false },
  "三振":   { ab: true,  hit: false },
  "四球":   { ab: false, hit: false },
  "死球":   { ab: false, hit: false },
  "犠打":   { ab: false, hit: false },
  "犠飛":   { ab: false, hit: false },
};

// ---- DOM ----
const careerBody = document.getElementById("career-body");
const careerFoot = document.getElementById("career-foot");
const careerEmpty = document.getElementById("career-empty");
const gamesBody = document.getElementById("games-body");
const gamesEmpty = document.getElementById("games-empty");
const chartEl = document.getElementById("chart");
const chartEmpty = document.getElementById("chart-empty");
const chartLegend = document.getElementById("chart-legend");
const chartTarget = document.getElementById("chart-target");
const tooltip = document.getElementById("chart-tooltip");

let games = loadGames();

// ---------------------------------------------------------------------------
// 読み込み・保存
// ---------------------------------------------------------------------------
function loadGames() {
  try {
    const raw = localStorage.getItem(GAMES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error("保存済み試合の読み込みに失敗しました:", e);
    return [];
  }
}

function saveGames() {
  localStorage.setItem(GAMES_KEY, JSON.stringify(games));
}

// ---------------------------------------------------------------------------
// 集計
// ---------------------------------------------------------------------------
function emptyStat() {
  return { games: 0, pa: 0, ab: 0, h: 0, hr: 0, bb: 0, so: 0 };
}

function addPlay(stat, play) {
  const r = RESULTS[play.result] || {};
  stat.pa++;
  if (r.ab) stat.ab++;
  if (r.hit) stat.h++;
  if (play.result === "本塁打") stat.hr++;
  if (play.result === "四球" || play.result === "死球") stat.bb++;
  if (play.result === "三振") stat.so++;
}

// 1試合分を選手名→成績のMapに集計（名前はtrimして同名を同一選手とみなす）
function statsOfGame(game) {
  const byName = new Map();
  const nameOf = {};
  game.lineup.forEach((p) => { nameOf[p.id] = p.name.trim(); });
  game.plays.forEach((play) => {
    const name = (nameOf[play.batterId] || play.batterName || "").trim();
    if (!name) return;
    if (!byName.has(name)) byName.set(name, emptyStat());
    addPlay(byName.get(name), play);
  });
  return byName;
}

function avg(h, ab) { return ab > 0 ? (h / ab).toFixed(3) : null; }

// 全試合を選手名ごとに合算（登場順を保つ）
function careerStats() {
  const order = [];
  const total = new Map();
  games.forEach((game) => {
    statsOfGame(game).forEach((s, name) => {
      if (!total.has(name)) { total.set(name, emptyStat()); order.push(name); }
      const t = total.get(name);
      t.games++;
      t.pa += s.pa; t.ab += s.ab; t.h += s.h; t.hr += s.hr; t.bb += s.bb; t.so += s.so;
    });
  });
  return { order, total };
}

// ---------------------------------------------------------------------------
// 1. 通算成績表
// ---------------------------------------------------------------------------
function renderCareer() {
  careerBody.innerHTML = "";
  careerFoot.innerHTML = "";
  if (games.length === 0) {
    careerEmpty.style.display = "block";
    return;
  }
  careerEmpty.style.display = "none";

  const { order, total } = careerStats();
  const team = emptyStat();

  // 通算打率の高い順（打数0は末尾）
  const sorted = [...order].sort((a, b) => {
    const sa = total.get(a), sb = total.get(b);
    const va = sa.ab > 0 ? sa.h / sa.ab : -1;
    const vb = sb.ab > 0 ? sb.h / sb.ab : -1;
    return vb - va;
  });

  sorted.forEach((name) => {
    const s = total.get(name);
    team.pa += s.pa; team.ab += s.ab; team.h += s.h; team.hr += s.hr; team.bb += s.bb; team.so += s.so;
    const a = avg(s.h, s.ab);
    const avgCell = a === null ? '<span class="avg-na">----</span>' : `<span class="avg">${a}</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-name"></td>
      <td class="col-num">${s.games}</td>
      <td class="col-num">${s.pa}</td>
      <td class="col-num">${s.ab}</td>
      <td class="col-num">${s.h}</td>
      <td class="col-num">${s.hr}</td>
      <td class="col-num">${s.bb}</td>
      <td class="col-num">${s.so}</td>
      <td class="col-num">${avgCell}</td>
    `;
    tr.querySelector(".col-name").textContent = name;
    careerBody.appendChild(tr);
  });

  const teamAvg = avg(team.h, team.ab);
  careerFoot.innerHTML = `
    <tr>
      <td class="col-name">チーム合計</td>
      <td class="col-num">${games.length}</td>
      <td class="col-num">${team.pa}</td>
      <td class="col-num">${team.ab}</td>
      <td class="col-num">${team.h}</td>
      <td class="col-num">${team.hr}</td>
      <td class="col-num">${team.bb}</td>
      <td class="col-num">${team.so}</td>
      <td class="col-num">${teamAvg === null ? "----" : teamAvg}</td>
    </tr>
  `;
}

// ---------------------------------------------------------------------------
// 2. 打率推移グラフ（SVG折れ線・2系列）
//    系列1: その試合の打率　系列2: 通算打率（その試合までの累積）
// ---------------------------------------------------------------------------
function seriesFor(targetName) {
  const perGame = [];
  const career = [];
  let cumH = 0, cumAB = 0;
  games.forEach((game) => {
    let h = 0, ab = 0;
    if (targetName === "") {
      statsOfGame(game).forEach((s) => { h += s.h; ab += s.ab; });
    } else {
      const s = statsOfGame(game).get(targetName);
      if (s) { h = s.h; ab = s.ab; }
    }
    cumH += h; cumAB += ab;
    perGame.push(ab > 0 ? h / ab : null);
    career.push(cumAB > 0 ? cumH / cumAB : null);
  });
  return { perGame, career };
}

function shortDate(iso) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? Number(m[1]) + "/" + Number(m[2]) : "";
}

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function renderChart() {
  chartEl.innerHTML = "";
  tooltip.hidden = true;
  const hasData = games.length > 0;
  chartEmpty.style.display = hasData ? "none" : "block";
  chartLegend.style.display = hasData ? "flex" : "none";
  chartTarget.parentElement.style.display = hasData ? "flex" : "none";
  if (!hasData) return;

  const target = chartTarget.value;
  const { perGame, career } = seriesFor(target);
  const n = games.length;

  const W = 640, H = 300;
  const M = { top: 24, right: 64, bottom: 40, left: 46 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  // Y軸: 0〜（最大値+余白をキリのよい0.1刻みに）。最低0.4まで確保
  const values = [...perGame, ...career].filter((v) => v !== null);
  const rawMax = values.length ? Math.max(...values) : 0.4;
  const yMax = Math.max(0.4, Math.min(1, Math.ceil((rawMax + 0.05) * 10) / 10));

  const x = (i) => M.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => M.top + ih - (v / yMax) * ih;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "打率の推移グラフ" });

  // 横グリッド＋Y軸目盛り（0.1刻み）
  for (let v = 0; v <= yMax + 1e-9; v += 0.1) {
    const gy = y(v);
    svg.appendChild(svgEl("line", { x1: M.left, y1: gy, x2: W - M.right, y2: gy, class: "chart-grid" }));
    const t = svgEl("text", { x: M.left - 8, y: gy + 4, "text-anchor": "end", class: "chart-axis-text" });
    t.textContent = v.toFixed(1);
    svg.appendChild(t);
  }

  // X軸ラベル（試合数が多いときは間引く）
  const step = Math.ceil(n / 8);
  games.forEach((g, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    const t1 = svgEl("text", { x: x(i), y: H - M.bottom + 18, "text-anchor": "middle", class: "chart-axis-text" });
    t1.textContent = "第" + (i + 1) + "戦";
    svg.appendChild(t1);
    const t2 = svgEl("text", { x: x(i), y: H - M.bottom + 32, "text-anchor": "middle", class: "chart-axis-text" });
    t2.textContent = shortDate(g.date);
    svg.appendChild(t2);
  });

  // 折れ線（欠測=nullはスキップして繋ぐ）
  function drawLine(series, cls) {
    const pts = [];
    series.forEach((v, i) => { if (v !== null) pts.push(x(i) + "," + y(v)); });
    if (pts.length >= 2) svg.appendChild(svgEl("polyline", { points: pts.join(" "), class: cls }));
  }
  drawLine(career, "chart-line-career");
  drawLine(perGame, "chart-line-game");

  // 点（白の縁取り）＋ホバー用の当たり判定
  const seriesDefs = [
    { key: "career", data: career, dot: "chart-dot-career", label: "通算打率" },
    { key: "game", data: perGame, dot: "chart-dot-game", label: "その試合の打率" },
  ];
  seriesDefs.forEach((sd) => {
    sd.data.forEach((v, i) => {
      if (v === null) return;
      svg.appendChild(svgEl("circle", { cx: x(i), cy: y(v), r: 4.5, class: sd.dot }));
      const hit = svgEl("circle", { cx: x(i), cy: y(v), r: 13, class: "chart-hit" });
      hit.addEventListener("mouseenter", () => {
        tooltip.textContent = `第${i + 1}戦 ${shortDate(games[i].date)}　${sd.label} ${v.toFixed(3)}`;
        tooltip.hidden = false;
        const rect = chartEl.getBoundingClientRect();
        tooltip.style.left = (x(i) / W) * rect.width + "px";
        tooltip.style.top = (y(v) / H) * rect.height + "px";
      });
      hit.addEventListener("mouseleave", () => { tooltip.hidden = true; });
      svg.appendChild(hit);
    });
  });

  // 末尾の値だけ直接ラベル（重なるときは上下に振り分ける）
  function lastPoint(series) {
    for (let i = series.length - 1; i >= 0; i--) if (series[i] !== null) return { i, v: series[i] };
    return null;
  }
  const lg = lastPoint(perGame);
  const lc = lastPoint(career);
  const collide = lg && lc && lg.i === lc.i && Math.abs(y(lg.v) - y(lc.v)) < 16;
  if (lg) {
    const t = svgEl("text", { x: x(lg.i) + 10, y: y(lg.v) + (collide && lg.v < lc.v ? 14 : -8), class: "chart-label" });
    t.textContent = lg.v.toFixed(3);
    svg.appendChild(t);
  }
  if (lc && !(lg && lg.i === lc.i && lg.v === lc.v)) {
    const t = svgEl("text", { x: x(lc.i) + 10, y: y(lc.v) + (collide && lc.v <= lg.v ? 14 : -8), class: "chart-label" });
    t.textContent = lc.v.toFixed(3);
    svg.appendChild(t);
  }

  chartEl.appendChild(svg);
}

// 表示対象セレクトの選択肢（チーム全体＋登場する選手名）
function renderTargetOptions() {
  const current = chartTarget.value;
  chartTarget.innerHTML = '<option value="">チーム全体</option>';
  const { order } = careerStats();
  order.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    chartTarget.appendChild(opt);
  });
  if ([...chartTarget.options].some((o) => o.value === current)) chartTarget.value = current;
}

// ---------------------------------------------------------------------------
// 3. 保存済みの試合一覧
// ---------------------------------------------------------------------------
function renderGames() {
  gamesBody.innerHTML = "";
  gamesEmpty.style.display = games.length === 0 ? "block" : "none";

  games.forEach((game, i) => {
    let pa = 0, ab = 0, h = 0;
    statsOfGame(game).forEach((s) => { pa += s.pa; ab += s.ab; h += s.h; });
    const a = avg(h, ab);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-rank">第${i + 1}戦</td>
      <td>${game.date || ""}</td>
      <td class="col-num">${pa}</td>
      <td class="col-num">${ab}</td>
      <td class="col-num">${h}</td>
      <td class="col-num">${a === null ? "----" : a}</td>
      <td class="col-del"><button type="button" class="btn-del" aria-label="この試合を削除">×</button></td>
    `;
    tr.querySelector(".btn-del").addEventListener("click", () => {
      if (!confirm(`第${i + 1}戦（${game.date}）の記録を削除します。よろしいですか？`)) return;
      games.splice(i, 1);
      saveGames();
      renderAll();
    });
    gamesBody.appendChild(tr);
  });
}

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------
function renderAll() {
  renderCareer();
  renderTargetOptions();
  renderChart();
  renderGames();
}

chartTarget.addEventListener("change", renderChart);
document.addEventListener("DOMContentLoaded", renderAll);

// 焙煎記録アプリ（第1段階：生豆の登録・過去の記録の取り込み・一覧表示・焙煎カード（前・最中・後・味見）の入力）
// データはこのスマホのブラウザの中（localStorage）に保存する。共有のしくみはあとの段階で付ける。

const STORE_KEY = 'baisen-v1';

const PROCESSES = ['ウォッシュド', 'ナチュラル', 'ハニー', 'スマトラ式', 'その他'];

// 減り率（%）→ 焙煎度の名前の目安。「この値より下ならこの名前」
const ROAST_LEVELS = [
  [12, 'ライト'],
  [13.5, 'シナモン'],
  [15, 'ミディアム'],
  [16.5, 'ハイ'],
  [18, 'シティ'],
  [19.5, 'フルシティ'],
  [21.5, 'フレンチ'],
  [Infinity, 'イタリアン'],
];

// 過去の記録の豆。seed.js の bean と対応
const SEED_BEANS = {
  mandheling: { name: 'マンデリン バタックブルー', country: 'インドネシア' },
  myanmar: { name: 'ミャンマー ミドゥウィン村', country: 'ミャンマー', region: 'ミドゥウィン村', farm: 'マイクロミル', process: 'ウォッシュド' },
  kenya: { name: 'ケニアAA', country: 'ケニア', grade: 'AA' },
  ethiopia: { name: 'エチオピア シダモG2', country: 'エチオピア', region: 'シダモ', grade: 'G2' },
};

// ---------- データの読み書き ----------

let data = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved) return { beans: [], roasts: [], ...saved };
  } catch (e) { /* 読めなければ空から始める */ }
  return { beans: [], roasts: [] };
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------- 計算 ----------

function num(v) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

// 減り率（%）。重さがそろっていなければ null
function lossRate(r) {
  const a = num(r.inG), b = num(r.outG);
  if (!a || !b) return null;
  return (a - b) / a * 100;
}

// 倍率（投入量 ÷ 焼き上がり量）
function ratio(r) {
  const a = num(r.inG), b = num(r.outG);
  if (!a || !b) return null;
  return a / b;
}

// ハンドピック（焙煎後）のあとに残った量。焙煎度の計算には使わない（欠点豆を除いても焼け具合は変わらないため）
function usableG(r) {
  if (num(r.keptG) != null) return num(r.keptG);
  const out = num(r.outG), picked = num(r.pickAfterG);
  if (out == null || picked == null) return null;
  return Math.round((out - picked) * 10) / 10;
}

function roastLevel(loss) {
  if (loss == null) return null;
  return ROAST_LEVELS.find(([max]) => loss < max)[1];
}

// ロット番号：260105-01 ＝ 2026年1月5日の1回目
function makeLot(date, exceptId) {
  const [y, m, d] = date.split('-');
  const head = `${y.slice(2)}${m}${d}`;
  const sameDay = data.roasts.filter(r => r.id !== exceptId && r.date === date).length;
  return `${head}-${String(sameDay + 1).padStart(2, '0')}`;
}

function fmtDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  const w = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  return `${y}/${m}/${d}（${w}）`;
}

function fmtTime(sec) {
  return `${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}秒`;
}

// ハゼ・煎り止めの表示。過去の記録の「約8分〜10分」などはそのまま出す
function fmtEvent(e) {
  if (!e) return '―';
  if (e.text) return esc(e.text) + (e.temp ? `・${e.temp}℃` : '');
  const parts = [];
  if (e.sec != null) parts.push(fmtTime(e.sec));
  if (e.temp != null) parts.push(`${e.temp}℃`);
  return parts.join('・') || '―';
}

function g(v) {
  const n = num(v);
  return n == null ? '―' : `${n.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}g`;
}

function beanName(id) {
  return data.beans.find(b => b.id === id)?.name || '（豆が未登録）';
}

// ---------- 画面の共通部品 ----------

const main = document.getElementById('main');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');

let currentTab = 'roasts';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setHeader(title, onBack) {
  if (typeof stopVoice === 'function') stopVoice();
  titleEl.textContent = title;
  backBtn.hidden = !onBack;
  backBtn.onclick = onBack || null;
  window.scrollTo(0, 0);
}

function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  ({ roasts: renderRoasts, beans: renderBeans, settings: renderSettings })[tab]();
}

document.querySelectorAll('.tabbar button').forEach(b => {
  b.addEventListener('click', () => showTab(b.dataset.tab));
});

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

// ---------- 焙煎の一覧 ----------

const UI_KEY = 'baisen-ui';
let ui = { bean: '' };
try { ui = { ...ui, ...JSON.parse(localStorage.getItem(UI_KEY)) }; } catch (e) { /* 初期値のまま */ }

function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* 覚えられなくても動く */ }
}

function levelBadge(r) {
  const lv = r.level || roastLevel(lossRate(r));
  return lv ? `<span class="badge lv" data-lv="${esc(lv)}">${esc(lv)}</span>` : '';
}

function roastCard(r) {
  const loss = lossRate(r);
  return `
    <button class="card" data-roast="${r.id}">
      <div class="row">
        <div class="name">${esc(beanName(r.beanId))}</div>
        <span class="lot">${esc(r.lot)}</span>
      </div>
      <div class="sub">${fmtDate(r.date)} ${r.imported ? '<span class="badge old">過去の記録</span>' : ''}</div>
      <div class="nums">
        <span>${g(r.inG)} → <b>${g(r.outG)}</b></span>
        <span>減り率 <b>${loss == null ? '―' : loss.toFixed(1) + '%'}</b></span>
        ${levelBadge(r)}
      </div>
      ${latestTasting(r)?.total ? `<div class="sub">味見 ${stars(latestTasting(r).total)}${r.tastings.length > 1 ? `（${r.tastings.length}回）` : ''}</div>` : ''}
    </button>`;
}

function renderRoasts() {
  setHeader('焙煎記録');
  if (ui.bean && !data.beans.some(b => b.id === ui.bean)) ui.bean = '';

  const list = data.roasts
    .filter(r => !ui.bean || r.beanId === ui.bean)
    .sort((a, b) => b.date.localeCompare(a.date) || b.lot.localeCompare(a.lot));

  let html = `<button class="btn primary new-roast" id="newRoast">＋ 新しい焙煎を記録する</button>`;
  if (data.roasts.length) {
    html += `
      <div class="toolbar">
        <select id="beanFilter">
          <option value="">すべての豆（${data.roasts.length}回）</option>
          ${data.beans.map(b => {
            const n = data.roasts.filter(r => r.beanId === b.id).length;
            return `<option value="${b.id}" ${ui.bean === b.id ? 'selected' : ''}>${esc(b.name)}（${n}回）</option>`;
          }).join('')}
        </select>
      </div>`;
    let month = '';
    for (const r of list) {
      const m = r.date.slice(0, 7);
      if (m !== month) {
        month = m;
        html += `<div class="month">${Number(m.slice(0, 4))}年${Number(m.slice(5))}月</div>`;
      }
      html += roastCard(r);
    }
  } else {
    html += `<div class="empty">まだ焙煎の記録がありません。<br>「⚙️ 設定」から、過去の記録（9回分）を取り込めます。</div>`;
  }
  main.innerHTML = html;

  main.querySelector('#newRoast').addEventListener('click', () => editRoast());
  main.querySelector('#beanFilter')?.addEventListener('change', e => {
    ui.bean = e.target.value; saveUi(); renderRoasts();
  });
  main.querySelectorAll('[data-roast]').forEach(el => {
    el.addEventListener('click', () => showRoast(el.dataset.roast));
  });
}

// ---------- おすすめの焙煎度と、目指すカーブ（AIなしの目安） ----------

// 産地・精製方法から、おすすめの焙煎度を決める。上から順に当てはまるものを使う
const RECOMMEND_RULES = [
  { match: b => /スマトラ/.test(b.process) || /インドネシア|マンデリン|スマトラ/.test(b.text),
    level: 'フルシティ', reason: 'どっしりしたコクと苦味が持ち味。深めに焼くとよさが出やすい豆です' },
  { match: b => /エチオピア|ケニア|ルワンダ|ブルンジ|タンザニア/.test(b.text) && /ナチュラル/.test(b.process),
    level: 'シティ', reason: '果実のような甘い香りを残しつつ、発酵した感じをまとめやすい焙煎度です' },
  { match: b => /エチオピア|ケニア|ルワンダ|ブルンジ|タンザニア/.test(b.text),
    level: 'ハイ', reason: '花や柑橘のような香りと明るい酸味を生かすには、浅めが合いやすい豆です' },
  { match: b => /ブラジル/.test(b.text),
    level: 'シティ', reason: 'ナッツやチョコのような甘さとコクが出やすい焙煎度です' },
  { match: b => /コロンビア|グアテマラ|コスタリカ|パナマ|ホンジュラス|エルサルバドル|ニカラグア|メキシコ|ペルー/.test(b.text),
    level: 'シティ', reason: '酸味と甘さのバランスがとりやすい焙煎度です' },
  { match: () => true,
    level: 'シティ', reason: '迷ったときは、酸味と苦味のバランスがよいシティから始めるのがおすすめです' },
];

// 焙煎度ごとの「1ハゼから煎り止めまでの秒数」と「煎り止めの温度」の目安。
// たかさんの記録（ハイ：1分20秒〜1分30秒・190〜194℃、シティ前後：2分30秒・204℃、
// シティ〜フルシティ：4分10秒）と、一般的な目安から決めた
const DEVELOP = {
  ライト: [30, 182],
  シナモン: [50, 186],
  ミディアム: [70, 189],
  ハイ: [90, 193],
  シティ: [150, 200],
  フルシティ: [210, 205],
  フレンチ: [270, 212],
  イタリアン: [330, 218],
};
const BASE_FIRST_CRACK = { sec: 540, temp: 172 };  // 過去の記録がないときの1ハゼの目安（9分・172℃）

function recommendLevel(bean) {
  if (!bean) return null;
  const b = {
    text: [bean.name, bean.country, bean.region].filter(Boolean).join(' '),
    process: bean.process || '',
  };
  const rule = RECOMMEND_RULES.find(x => x.match(b));
  return { level: rule.level, reason: rule.reason };
}

// この豆の過去の焙煎（新しい順）
function pastRoasts(r) {
  return data.roasts
    .filter(x => x.id !== r.id && x.beanId === r.beanId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function lossRange(level) {
  const i = ROAST_LEVELS.findIndex(([, n]) => n === level);
  if (i < 0) return '';
  const lo = i ? ROAST_LEVELS[i - 1][0] : null, hi = ROAST_LEVELS[i][0];
  if (lo == null) return `${hi}%未満`;
  if (hi === Infinity) return `${lo}%以上`;
  return `${lo}〜${hi}%`;
}

function average(list) {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

// 1分ごとの温度から「底」を探す（いちばん低い温度のあと、上がり始めていれば底とみなす）
function bottomFromTemps(temps = []) {
  let best = null;
  temps.forEach((t, i) => {
    const v = num(t);
    if (i > 0 && v != null && (best == null || v < best.temp)) best = { sec: i * 60, temp: v };
  });
  if (!best) return null;
  const later = temps.slice(best.sec / 60 + 1).map(num).filter(v => v != null);
  return later.some(v => v > best.temp) ? best : null;
}

// 目指す焙煎度から、目標の1ハゼ・煎り止めと、温度の上がり方の線を作る
function targetPlan(r) {
  const level = r.targetLevel;
  if (!DEVELOP[level]) return null;

  // 1ハゼの目標：この豆の過去の記録（予熱のあり・なしが同じ回）の平均。なければ一般的な目安
  const past = pastRoasts(r).filter(x => !!x.preheat === !!r.preheat);
  const secs = past.map(x => x.firstCrack?.sec).filter(v => v != null);
  const temps = past.map(x => x.firstCrack?.temp).filter(v => v != null);
  const fc = {
    sec: Math.round((average(secs) ?? BASE_FIRST_CRACK.sec) / 10) * 10,
    temp: Math.round(average(temps) ?? BASE_FIRST_CRACK.temp),
  };
  const basis = secs.length ? `この豆の過去${secs.length}回の平均` : '一般的な目安';

  const [dev, dropTemp] = DEVELOP[level];
  const drop = { sec: fc.sec + dev, temp: Math.max(dropTemp, fc.temp + 6) };

  // 温度の上がり方：投入 →（予熱ありなら）底 → 1ハゼ まではだんだん上がり方がゆるやかに、1ハゼ → 煎り止めはまっすぐ
  const start = num(r.temps?.[0]) ?? (r.preheat ? 180 : 25);
  const bottom = r.preheat
    ? (r.turning?.sec != null && r.turning?.temp != null ? r.turning : bottomFromTemps(r.temps) || { sec: 90, temp: Math.round(start * 0.65) })
    : { sec: 0, temp: start };
  const tempAt = sec => {
    if (sec <= bottom.sec) {
      const x = bottom.sec ? sec / bottom.sec : 1;
      return start - (start - bottom.temp) * (1 - (1 - x) ** 2);
    }
    if (sec <= fc.sec) {
      const x = (sec - bottom.sec) / (fc.sec - bottom.sec);
      return bottom.temp + (fc.temp - bottom.temp) * (1 - (1 - x) ** 1.6);
    }
    const x = (sec - fc.sec) / (drop.sec - fc.sec);
    return fc.temp + (drop.temp - fc.temp) * x;
  };
  const points = [];
  for (let s = 0; s < drop.sec; s += 15) points.push([s, tempAt(s)]);
  points.push([drop.sec, drop.temp]);

  return { level, fc, drop, dev, basis, points };
}

function planText(plan) {
  return `1ハゼ <b>${fmtTime(plan.fc.sec)}・${plan.fc.temp}℃</b>（${plan.basis}）→ 煎り止め <b>${fmtTime(plan.drop.sec)}・${plan.drop.temp}℃</b>（1ハゼから${fmtTime(plan.dev)}）／減り率の目安 ${lossRange(plan.level)}`;
}

// 紙の焙煎シートの「赤い帯」：[分, 下の温度, 上の温度]。黄色の列（煎り止めの目安）は13〜15分
const NOTE_BAND = [
  [1, 100, 110], [2, 110, 120], [3, 120, 130], [4, 130, 140], [5, 140, 150],
  [6, 150, 160], [7, 150, 160], [8, 160, 170], [9, 160, 170], [10, 170, 180],
  [11, 170, 180], [12, 180, 190], [13, 190, 200], [14, 200, 210], [15, 210, 220],
  [16, 220, 230], [17, 220, 230],
];
const DROP_ZONE = [13, 15];

// 焙煎カーブのグラフ。赤い帯・黄色の列＝紙のシートの目安、点線＝目指すカーブ、実線＝今回の1分ごとの温度
function curveSvg(r, plan) {
  const temps = (r.temps || []).map((t, i) => [i * 60, num(t)]).filter(([, t]) => t != null);
  const events = [['firstCrack', '1ハゼ'], ['secondCrack', '2ハゼ'], ['drop', '煎り止め']]
    .map(([k, label]) => ({ ...r[k], label }))
    .filter(e => e.sec != null);
  const allS = [...temps.map(p => p[0]), ...(plan ? [plan.drop.sec] : []), ...events.map(e => e.sec)];
  const xMax = Math.max(16, Math.ceil(Math.max(0, ...allS) / 60) + 1);
  const band = NOTE_BAND.filter(([m]) => m <= xMax);
  const allT = [...temps.map(p => p[1]), ...(plan ? plan.points.map(p => p[1]) : []), ...events.map(e => e.temp).filter(v => v != null),
    ...band.flatMap(([, lo, hi]) => [lo - 5, hi + 5])];
  const yMin = Math.max(0, Math.floor((Math.min(...allT) - 10) / 20) * 20);
  const yMax = Math.ceil((Math.max(...allT) + 10) / 20) * 20;

  const W = 340, H = 220, L = 34, R = 10, T = 14, B = 26;
  const x = s => L + (s / 60) / xMax * (W - L - R);
  const y = t => T + (1 - (t - yMin) / (yMax - yMin)) * (H - T - B);
  const path = pts => pts.map(([s, t], i) => `${i ? 'L' : 'M'}${x(s).toFixed(1)},${y(t).toFixed(1)}`).join('');

  let svg = '';
  // 紙のシートと同じく、1マス＝1分・10℃。数字はマスのまん中
  const half = 30;
  svg += `<rect x="${x(DROP_ZONE[0] * 60 - half)}" y="${T}" width="${x(DROP_ZONE[1] * 60 + half) - x(DROP_ZONE[0] * 60 - half)}" height="${H - T - B}" class="zone"/>`;
  for (const [m, lo, hi] of band) {
    svg += `<rect x="${x(m * 60 - half)}" y="${y(hi + 5)}" width="${x(m * 60 + half) - x(m * 60 - half)}" height="${y(lo - 5) - y(hi + 5)}" class="band"/>`;
  }
  for (let t = yMin; t <= yMax; t += 20) {
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 4}" y="${y(t) + 4}" class="ax" text-anchor="end">${t}</text>`;
  }
  for (let m = 0; m <= xMax; m += 2) {
    svg += `<text x="${x(m * 60)}" y="${H - 8}" class="ax" text-anchor="middle">${m}分</text>`;
  }
  if (plan) {
    svg += `<path d="${path(plan.points)}" class="target"/>`;
    // 1ハゼ目標は点の左、煎り止め目標は点の上に書いて、近くても重ならないようにする
    const fx = x(plan.fc.sec), fy = y(plan.fc.temp), dx = x(plan.drop.sec), dy = y(plan.drop.temp);
    svg += `<circle cx="${fx}" cy="${fy}" r="5" class="target-dot"/><circle cx="${dx}" cy="${dy}" r="5" class="target-dot"/>`;
    svg += `<text x="${fx - 8}" y="${fy + 4}" class="target-label" text-anchor="end">1ハゼ目標</text>`;
    svg += `<text x="${Math.min(dx, W - R - 34)}" y="${dy - 10}" class="target-label" text-anchor="middle">煎り止め目標</text>`;
  }
  if (temps.length) {
    svg += `<path d="${path(temps)}" class="actual"/>`;
    svg += temps.map(([s, t]) => `<circle cx="${x(s)}" cy="${y(t)}" r="3" class="actual-dot"/>`).join('');
  }
  for (const e of events) {
    if (e.temp != null) {
      svg += `<rect x="${x(e.sec) - 4}" y="${y(e.temp) - 4}" width="8" height="8" transform="rotate(45 ${x(e.sec)} ${y(e.temp)})" class="event"/>`;
      svg += `<text x="${x(e.sec) + 8}" y="${y(e.temp) + 14}" class="event-label">${e.label}</text>`;
    } else {
      svg += `<line x1="${x(e.sec)}" x2="${x(e.sec)}" y1="${H - B}" y2="${H - B - 10}" class="event-tick"/>`;
    }
  }

  return `
    <svg class="curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="焙煎カーブのグラフ">${svg}</svg>
    <div class="legend">
      <span><i class="lg-band"></i>ノートの目安（赤い帯）</span>
      <span><i class="lg-zone"></i>煎り止めの目安（13〜15分）</span>
      ${plan ? `<span><i class="lg-target"></i>目指すカーブ（${esc(plan.level)}）</span>` : ''}
      <span><i class="lg-actual"></i>今回の温度</span>
      ${events.length ? '<span><i class="lg-event"></i>今回のハゼ・煎り止め</span>' : ''}
    </div>`;
}

// ---------- 焙煎カード（くわしく） ----------

function kvRows(rows) {
  return `<table class="kv">${rows.filter(Boolean).map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;
}

function showRoast(id) {
  const r = data.roasts.find(x => x.id === id);
  if (!r) return showTab('roasts');
  setHeader(r.lot, () => showTab('roasts'));

  const loss = lossRate(r), rt = ratio(r);
  const autoLv = roastLevel(loss);
  const plan = targetPlan(r);
  const opt = (label, v) => (v == null || v === '' ? null : [label, v]);

  let html = `
    <div class="card">
      <div class="name">${esc(beanName(r.beanId))}</div>
      <div class="sub">${fmtDate(r.date)}・ロット ${esc(r.lot)}</div>
      <div class="hero">
        <div><span>減り率</span><b>${loss == null ? '―' : loss.toFixed(1) + '%'}</b></div>
        <div><span>倍率</span><b>${rt == null ? '―' : rt.toFixed(2)}</b></div>
        <div><span>焙煎度の目安</span><b>${esc(autoLv || '―')}</b></div>
      </div>
    </div>

    <h2>焙煎の前</h2>
    <div class="card">${kvRows([
      opt('量った生豆', r.greenG != null ? g(r.greenG) : null),
      opt('ハンドピック（前）', r.pickBeforeG != null ? `${g(r.pickBeforeG)} 除いた` : null),
      ['投入量', g(r.inG)],
      opt('目指した焙煎度', esc(r.targetLevel)),
      ['予熱して投入', r.preheat ? `あり${r.chargeTemp ? `（約${r.chargeTemp}℃）` : ''}` : 'なし'],
      opt('気温・天気', [r.airTemp != null ? `${r.airTemp}℃` : '', r.weather].filter(Boolean).join('・')),
    ])}</div>

    <h2>焙煎の最中</h2>
    <div class="card">
    ${curveSvg(r, plan)}
    ${plan ? `<div class="note plan-text">目標：${planText(plan)}</div>` : ''}
    ${kvRows([
      opt('火力（はじめ）', esc(r.heat)),
      opt('回転速度', esc(r.rotation)),
      opt('温度の底', r.turning ? fmtEvent(r.turning) : null),
      ['1ハゼ', fmtEvent(r.firstCrack)],
      ['2ハゼ', fmtEvent(r.secondCrack)],
      ['煎り止め', fmtEvent(r.drop)],
    ])}
    ${r.ops?.length ? `<h2>途中の操作</h2>${kvRows(r.ops.map(o => [o.sec != null ? fmtTime(o.sec) : '―', esc(o.text)]))}` : ''}
    ${r.temps?.some(t => t != null) ? `<h2>1分ごとの温度</h2><div class="temps">${r.temps.map((t, i) => t == null ? '' : `<div><span>${i}分</span>${t}℃</div>`).join('')}</div>` : ''}
    </div>

    <h2>焙煎の後</h2>
    <div class="card">${kvRows([
      ['焼き上がり', g(r.outG)],
      opt('ハンドピック（後）', r.pickAfterG != null ? `${g(r.pickAfterG)} 除いた` : null),
      opt('ハンドピック後に残った量', usableG(r) != null ? g(usableG(r)) : null),
      ...(r.imported
        ? [['ノートの焙煎度', esc(r.noteLevel || '―')], ['ノートの減り率', esc(r.noteLoss || '―')]]
        : [['焙煎度（自分の判断）', esc(r.level || '―')]]),
      ['減り率', lossRate(r) == null ? '―' : `${lossRate(r).toFixed(1)}%（目安は「${roastLevel(lossRate(r))}」）`],
      opt('豆の色', esc(r.color)),
      opt('ムラ・チャフ', esc(r.unevenness)),
      ['メモ', esc(r.memo || '―')],
    ])}</div>
    ${tastingsHtml(r)}
    <button class="btn primary" id="editRoast">この焙煎カードを直す</button>`;

  if (r.imported) {
    html += `<p class="note">※ 手書きの焙煎ノートから取り込んだ記録です。${r.date < '2026' ? '2025年の記録はチェック印が中心のため、ハゼの時刻はおおよその値です。' : ''}</p>`;
  }
  main.innerHTML = html;
  main.querySelector('#editRoast').addEventListener('click', () => editRoast(r.id));
  main.querySelector('#addTasting').addEventListener('click', () => editTasting(r.id));
  main.querySelectorAll('[data-tasting]').forEach(el => {
    el.addEventListener('click', () => editTasting(r.id, el.dataset.tasting));
  });
}

// ---------- 声での温度入力 ----------

let activeVoice = null;  // 聞いている途中の声の入力。画面を移るときに止める

function stopVoice() {
  if (activeVoice) activeVoice.stop();
  activeVoice = null;
}

// 「百六十五」「165」「１６５」などを数にする
function parseJaNumber(text) {
  const s = text.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[,，\s]/g, '');
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const digits = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100 };
  if (!/^[〇零一二三四五六七八九十百]+$/.test(s)) return null;
  let total = 0, cur = 0;
  for (const c of s) {
    if (c in digits) cur = cur * 10 + digits[c];
    else { total += (cur || 1) * units[c]; cur = 0; }
  }
  return total + cur;
}

// 聞き取った言葉 →「何分の、何度」。分を言わなければ minute は null
function parseVoiceTemp(text) {
  const t = text.replace(/[。、．\s]/g, '').replace(/°C|℃|°/g, '度').replace(/(度|ど)(です)?$/, '');
  const NUM = '[0-9０-９〇零一二三四五六七八九十百.]+';
  const withMin = t.match(new RegExp(`^(${NUM})(?:分|ふん|ぷん)(${NUM})(?:度|℃)?$`));
  if (withMin) {
    const minute = parseJaNumber(withMin[1]), temp = parseJaNumber(withMin[2]);
    return minute != null && temp != null ? { minute, temp } : null;
  }
  const only = t.match(new RegExp(`^(${NUM})(?:度|℃)?$`));
  if (only) {
    const temp = parseJaNumber(only[1]);
    return temp != null ? { minute: null, temp } : null;
  }
  return null;
}

// ---------- 焙煎カードの入力 ----------

const WEATHERS = ['晴れ', 'くもり', '雨', '雪'];
const OP_CHIPS = ['火力を強めた', '火力を弱めた', '蓋を開けた', '蓋を閉めた', '回転を変えた'];
const EVENTS = [
  ['turning', '温度の底（いったん下がりきったところ）'],
  ['firstCrack', '1ハゼ'],
  ['secondCrack', '2ハゼ'],
  ['drop', '煎り止め'],
];
const DEFAULT_MINUTES = 16;  // 0分〜15分。黄色の列（13〜15分）まで

// 書きかけの内容。焙煎中に画面が消えたり、うっかり戻ったりしても残るように
const DRAFT_KEY = 'baisen-draft';

function readDraft(id) {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (d && d.forId === (id || 'new')) return d.roast;
  } catch (e) { /* なければ使わない */ }
  return null;
}

function writeDraft(id, roast) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ forId: id || 'new', roast })); } catch (e) { /* 覚えられなくても入力は続けられる */ }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 何もしない */ }
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 分・秒・℃ の3つの入力欄
function eventInputs(key, e) {
  const sec = e?.sec;
  return `
    <div class="time-in">
      <input name="${key}.min" inputmode="numeric" value="${sec != null ? Math.floor(sec / 60) : ''}"><span>分</span>
      <input name="${key}.sec" inputmode="numeric" value="${sec != null ? sec % 60 : ''}"><span>秒</span>
      <input name="${key}.temp" inputmode="numeric" value="${e?.temp ?? ''}"><span>℃</span>
    </div>
    ${e?.text ? `<div class="hint">ノートの記録：${esc(e.text)}</div>` : ''}`;
}

function readEvent(form, key, before) {
  const m = num(form.elements[`${key}.min`].value);
  const s = num(form.elements[`${key}.sec`].value);
  const t = num(form.elements[`${key}.temp`].value);
  if (m == null && s == null && t == null) return before?.text ? { text: before.text } : null;
  const e = {};
  if (m != null || s != null) e.sec = Math.round((m || 0) * 60 + (s || 0));
  if (t != null) e.temp = t;
  if (before?.text) e.text = before.text;
  // 数字を入れ直したら、ノートの「約8分」などは外す
  if (before?.text && (e.sec !== before.sec || e.temp !== before.temp)) delete e.text;
  return e;
}

function opRowHtml(o = {}) {
  const sec = o.sec;
  return `
    <div class="op-row">
      <input class="op-min" inputmode="numeric" value="${sec != null ? Math.floor(sec / 60) : ''}" placeholder="分">
      <input class="op-sec" inputmode="numeric" value="${sec != null ? sec % 60 : ''}" placeholder="秒">
      <input class="op-text" value="${esc(o.text || '')}" placeholder="例：火力を弱めた">
      <button type="button" class="x" aria-label="この行を消す">×</button>
    </div>`;
}

function editRoast(id) {
  const saved = data.roasts.find(r => r.id === id);
  const isNew = !saved;
  const draft = readDraft(id);
  const r = draft || (saved ? structuredClone(saved) : {
    date: todayIso(),
    beanId: data.roasts.length ? [...data.roasts].sort((a, b) => b.date.localeCompare(a.date))[0].beanId : '',
    preheat: true,
    temps: [],
    ops: [],
  });
  if (isNew && !draft) r.targetLevel = recommendLevel(data.beans.find(b => b.id === r.beanId))?.level || '';
  if (!r.temps?.length && r.chargeTemp != null) r.temps = [r.chargeTemp];
  r.temps = r.temps || [];
  r.ops = r.ops || [];

  const leave = () => (isNew ? showTab('roasts') : showRoast(id));
  let dirty = false;
  setHeader(isNew ? '新しい焙煎' : '焙煎カードを直す', () => {
    if (dirty && !confirm('入力した内容を保存せずに戻りますか？')) return;
    clearDraft();
    leave();
  });

  const minutes = Math.max(DEFAULT_MINUTES, r.temps.length + 1);
  const tempCells = n => Array.from({ length: n }, (_, i) => `
    <label class="t-cell"><span>${i === 0 ? '0分（投入）' : `${i}分`}</span>
      <input name="t${i}" inputmode="numeric" value="${r.temps[i] ?? ''}"></label>`).join('');

  main.innerHTML = `
    ${draft ? `<div class="preview">✏️ 書きかけの内容を戻しました</div>` : ''}
    <form id="roastForm" autocomplete="off">
      <h2>焙煎の前</h2>
      <div class="card">
        <div class="field"><label>焙煎日</label><input name="date" type="date" value="${esc(r.date)}"></div>
        <div class="field"><label>生豆</label>
          <select name="beanId">
            <option value="">選ぶ</option>
            ${data.beans.map(b => `<option value="${b.id}" ${r.beanId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
          </select>
          ${data.beans.length ? '' : '<div class="hint">先に「🫘 生豆」で豆を登録してください</div>'}
        </div>
        <div class="field"><label>目指す焙煎度</label>
          <div class="recommend" id="recommend"></div>
          <select name="targetLevel"><option value="">選ばない</option>${ROAST_LEVELS.map(([, n]) => `<option ${r.targetLevel === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <div class="hint">選ぶと「焙煎の最中」に、目指すカーブと1ハゼ・煎り止めの目標が出ます</div></div>
        <div class="field"><label>量った生豆の量（ハンドピックの前）</label>
          <div class="inline"><input name="greenG" inputmode="decimal" value="${r.greenG ?? ''}" placeholder="例：210"><span class="unit">g</span></div></div>
        <div class="field"><label>ハンドピックで除いた量</label>
          <div class="inline"><input name="pickBeforeG" inputmode="decimal" value="${r.pickBeforeG ?? ''}" placeholder="例：10"><span class="unit">g</span></div></div>
        <div class="field"><label>投入量（ハンドピックの後）</label>
          <div class="inline"><input name="inG" inputmode="decimal" value="${r.inG ?? ''}" placeholder="例：200"><span class="unit">g</span></div>
          <div class="hint">上の2つを入れると自動で計算します。直接入れることもできます</div></div>
        <div class="field"><label>予熱して投入</label>
          <div class="seg" data-name="preheat">
            <button type="button" data-v="1" class="${r.preheat ? 'on' : ''}">あり</button>
            <button type="button" data-v="" class="${r.preheat ? '' : 'on'}">なし</button>
          </div>
          <div class="hint">投入したときの温度は、下の「0分（投入）」に入れます</div></div>
        <div class="field"><label>気温・天気</label>
          <div class="inline">
            <input name="airTemp" inputmode="decimal" value="${r.airTemp ?? ''}" placeholder="気温"><span class="unit">℃</span>
            <select name="weather"><option value="">天気</option>${WEATHERS.map(w => `<option ${r.weather === w ? 'selected' : ''}>${w}</option>`).join('')}</select>
          </div></div>
      </div>

      <h2>焙煎の最中</h2>
      <div class="card">
        <div id="chartBox"></div>
        <div class="field"><label>1分ごとの温度（℃）</label>
          <button type="button" class="btn voice" id="voiceBtn">🎤 声で温度を入れる</button>
          <div class="voice-status" id="voiceStatus" hidden></div>
          <div class="temp-grid" id="tempGrid">${tempCells(minutes)}</div>
          <button type="button" class="add-line" id="addMinute">＋ 1分ふやす</button></div>
        <div class="field"><label>火力（はじめ）</label><input name="heat" value="${esc(r.heat || '')}" placeholder="例：中火、つまみ3"></div>
        <div class="field"><label>回転速度（目盛り）</label><input name="rotation" value="${esc(r.rotation || '')}" placeholder="例：5"></div>
        ${EVENTS.map(([key, label]) => `<div class="field"><label>${label}</label>${eventInputs(key, r[key])}</div>`).join('')}
        <div class="field"><label>途中の操作（火力・蓋など）</label>
          <div id="ops">${r.ops.map(opRowHtml).join('')}</div>
          <div class="chips">${OP_CHIPS.map(c => `<button type="button" class="chip">${c}</button>`).join('')}</div>
          <div class="hint">押すと1行ふえます。時刻（分・秒）を入れてください</div></div>
      </div>

      <h2>焙煎の後</h2>
      <div class="card">
        <div class="field"><label>焼き上がりの重さ（ハンドピックの前）</label>
          <div class="inline"><input name="outG" inputmode="decimal" value="${r.outG ?? ''}" placeholder="例：170"><span class="unit">g</span></div>
          <div class="hint">焙煎度（減り率）はこの重さで計算します</div>
          <div class="preview" id="lossPreview"></div></div>
        <div class="field"><label>ハンドピックで除いた量（焙煎後）</label>
          <div class="inline"><input name="pickAfterG" inputmode="decimal" value="${r.pickAfterG ?? ''}"><span class="unit">g</span></div>
        </div>
        <div class="field"><label>ハンドピックの後に残った量</label>
          <div class="inline"><input name="keptG" inputmode="decimal" value="${r.keptG ?? usableG(r) ?? ''}" placeholder="例：167"><span class="unit">g</span></div>
          <div class="hint">上の2つを入れると自動で計算します。直接入れることもできます</div></div>
        <div class="field"><label>焙煎度（自分の判断）</label>
          <select name="level"><option value="">選ぶ（空なら目安を使います）</option>${ROAST_LEVELS.map(([, n]) => `<option ${r.level === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <div class="preview" id="levelPreview"></div></div>
        <div class="field"><label>豆の色</label><input name="color" value="${esc(r.color || '')}" placeholder="例：明るい茶色、ツヤなし"></div>
        <div class="field"><label>ムラ・チャフの様子</label><input name="unevenness" value="${esc(r.unevenness || '')}" placeholder="例：ムラ少し、チャフ多め"></div>
        <div class="field"><label>ひとことメモ</label><textarea name="memo" placeholder="例：香ばしい。1ハゼから2分で終了">${esc(r.memo || '')}</textarea></div>
      </div>
    </form>
    <button class="btn primary" id="saveRoast">保存する</button>
    <div class="hint" style="text-align:center;margin-top:6px">焼き上がりや焙煎の後は、あとから「直す」で入れても大丈夫です</div>
    ${isNew ? '' : '<button class="btn danger" id="delRoast">この焙煎カードを消す</button>'}`;

  const form = main.querySelector('#roastForm');

  // 画面の内容 → 焙煎カードの形にまとめる
  const collect = () => {
    const f = form.elements;
    const temps = [];
    form.querySelectorAll('[name^="t"]').forEach(el => {
      const i = Number(el.name.slice(1));
      if (Number.isInteger(i)) temps[i] = num(el.value);
    });
    while (temps.length && temps[temps.length - 1] == null) temps.pop();
    const ops = [...form.querySelectorAll('.op-row')].map(row => {
      const m = num(row.querySelector('.op-min').value), s = num(row.querySelector('.op-sec').value);
      return {
        sec: m == null && s == null ? null : Math.round((m || 0) * 60 + (s || 0)),
        text: row.querySelector('.op-text').value.trim(),
      };
    }).filter(o => o.text || o.sec != null);
    const next = {
      ...r,
      date: f.date.value || todayIso(),
      beanId: f.beanId.value,
      targetLevel: f.targetLevel.value,
      greenG: num(f.greenG.value),
      inG: num(f.inG.value),
      pickBeforeG: num(f.pickBeforeG.value),
      preheat: !!form.querySelector('[data-name="preheat"] .on')?.dataset.v,
      airTemp: num(f.airTemp.value),
      weather: f.weather.value,
      temps: temps.map(t => t ?? null),
      chargeTemp: temps[0] ?? null,
      heat: f.heat.value.trim(),
      rotation: f.rotation.value.trim(),
      ops,
      outG: num(f.outG.value),
      pickAfterG: num(f.pickAfterG.value),
      keptG: num(f.keptG.value),
      level: f.level.value,
      color: f.color.value.trim(),
      unevenness: f.unevenness.value.trim(),
      memo: f.memo.value.trim(),
    };
    for (const [key] of EVENTS) next[key] = readEvent(form, key, r[key]);
    return next;
  };

  const updatePreview = () => {
    const now = collect();
    const loss = lossRate(now), rt = ratio(now);
    const box = main.querySelector('#lossPreview');
    box.hidden = loss == null;
    if (loss != null) box.textContent = `減り率 ${loss.toFixed(1)}%・倍率 ${rt.toFixed(2)}・目安「${roastLevel(loss)}」`;
    const lv = main.querySelector('#levelPreview');
    lv.textContent = loss == null
      ? '減り率：投入量と焼き上がりの重さを入れると出ます'
      : `減り率 ${loss.toFixed(1)}%（目安は「${roastLevel(loss)}」）`;
    updatePlan(now);
  };

  // おすすめの焙煎度と、目指すカーブのグラフ
  const updatePlan = now => {
    const bean = data.beans.find(b => b.id === now.beanId);
    const rec = recommendLevel(bean);
    const past = pastRoasts(now).slice(0, 3).map(x => {
      const l = lossRate(x);
      const name = x.level || x.noteLevel || roastLevel(l);
      return `${x.date.slice(2).replace(/-/g, '/')} 減り率${l == null ? '―' : l.toFixed(1) + '%'}${name ? `（${esc(name)}）` : ''}`;
    });
    main.querySelector('#recommend').innerHTML = rec
      ? `<div>おすすめは <b>${rec.level}</b></div><div class="why">${rec.reason}</div>${past.length ? `<div class="why">この豆の最近の焙煎：${past.join('、')}</div>` : ''}`
      : '<div class="why">生豆を選ぶと、おすすめの焙煎度が出ます</div>';
    const plan = targetPlan(now);
    main.querySelector('#chartBox').innerHTML = curveSvg(now, plan) + (plan
      ? `<div class="note plan-text">目標：${planText(plan)}</div>`
      : '<div class="note plan-text">「目指す焙煎度」を選ぶと、目指すカーブ（点線）と1ハゼ・煎り止めの目標も出ます</div>');
  };

  const remember = () => { dirty = true; writeDraft(id, collect()); updatePreview(); };

  // 投入量 ＝ 量った生豆 − ハンドピックで除いた量
  const autoInG = e => {
    if (e.target.name !== 'greenG' && e.target.name !== 'pickBeforeG') return;
    const green = num(form.elements.greenG.value);
    if (green == null) return;
    const picked = num(form.elements.pickBeforeG.value) || 0;
    form.elements.inG.value = Math.round((green - picked) * 10) / 10;
  };
  // 残った量 ＝ 焼き上がり − ハンドピックで除いた量（焙煎後）
  const autoKeptG = e => {
    if (e.target.name !== 'outG' && e.target.name !== 'pickAfterG') return;
    const out = num(form.elements.outG.value);
    if (out == null) return;
    const picked = num(form.elements.pickAfterG.value) || 0;
    form.elements.keptG.value = Math.round((out - picked) * 10) / 10;
  };
  form.addEventListener('input', autoKeptG);
  form.addEventListener('input', autoInG);
  form.addEventListener('change', e => {
    if (e.target.name !== 'beanId') return;
    const rec = recommendLevel(data.beans.find(b => b.id === e.target.value));
    if (rec) form.elements.targetLevel.value = rec.level;
  });
  form.addEventListener('input', remember);
  form.addEventListener('change', remember);
  updatePreview();

  form.querySelectorAll('.seg button').forEach(btn => btn.addEventListener('click', () => {
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
    remember();
  }));

  main.querySelector('#addMinute').addEventListener('click', () => {
    const grid = main.querySelector('#tempGrid');
    const i = grid.children.length;
    grid.insertAdjacentHTML('beforeend', `<label class="t-cell"><span>${i}分</span><input name="t${i}" inputmode="numeric"></label>`);
    grid.lastElementChild.querySelector('input').focus();
  });

  // 声で温度を入れる：「165」→ 次の空いている分へ、「3分165」→ 3分へ、「とりけし」→ 声で入れた最後を消す
  const voiceBtn = main.querySelector('#voiceBtn');
  const voiceStatus = main.querySelector('#voiceStatus');
  const voiceFilled = [];
  const cell = i => {
    const grid = main.querySelector('#tempGrid');
    while (grid.children.length <= i) main.querySelector('#addMinute').click();
    return form.elements[`t${i}`];
  };
  const nextEmpty = () => {
    const cells = [...form.querySelectorAll('.t-cell input')];
    let last = -1;
    cells.forEach((el, i) => { if (el.value.trim()) last = i; });
    return last + 1;
  };
  const say = (msg, ok = true) => {
    voiceStatus.hidden = false;
    voiceStatus.className = `voice-status ${ok ? '' : 'ng'}`;
    voiceStatus.textContent = msg;
  };
  const onHeard = text => {
    if (/取り?消し?|とりけし|もどす|戻す/.test(text)) {
      const i = voiceFilled.pop();
      if (i == null) return say('取り消すものがありません', false);
      cell(i).value = '';
      remember();
      return say(`${i}分の温度を消しました`);
    }
    const got = parseVoiceTemp(text);
    if (!got || got.temp < 0 || got.temp > 300) return say(`「${text}」は聞き取れませんでした。もう一度どうぞ`, false);
    const i = got.minute ?? nextEmpty();
    const el = cell(i);
    el.value = got.temp;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    voiceFilled.push(i);
    remember();
    say(`${i}分：${got.temp}℃ を入れました`);
  };

  voiceBtn.addEventListener('click', () => {
    if (activeVoice) { stopVoice(); return; }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      say('このスマホ・ブラウザでは声の入力が使えません。Safariで試してください', false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'ja-JP';
    rec.continuous = true;
    rec.interimResults = false;
    let on = true;
    rec.onresult = e => {
      for (let k = e.resultIndex; k < e.results.length; k++) {
        if (e.results[k].isFinal) onHeard(e.results[k][0].transcript.trim());
      }
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        on = false;
        say('マイクが使えません。iPhoneの「設定」でマイクを許可してください', false);
      }
    };
    // しばらく黙っていると止まるので、ボタンで止めるまで聞き直す
    rec.onend = () => { if (on && activeVoice === handle) { try { rec.start(); } catch (err) { /* すぐ次で再開 */ } } else finish(); };
    const finish = () => {
      voiceBtn.classList.remove('on');
      voiceBtn.textContent = '🎤 声で温度を入れる';
    };
    const handle = { stop: () => { on = false; try { rec.stop(); } catch (err) { /* もう止まっている */ } finish(); } };
    activeVoice = handle;
    rec.start();
    voiceBtn.classList.add('on');
    voiceBtn.textContent = '⏹ 声の入力を止める';
    say('聞いています。「165」や「3分 165」のように言ってください');
  });

  const opsBox = main.querySelector('#ops');
  form.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    opsBox.insertAdjacentHTML('beforeend', opRowHtml({ text: chip.textContent }));
    opsBox.lastElementChild.querySelector('.op-min').focus();
    remember();
  }));
  opsBox.addEventListener('click', e => {
    if (!e.target.classList.contains('x')) return;
    e.target.closest('.op-row').remove();
    remember();
  });

  main.querySelector('#saveRoast').addEventListener('click', () => {
    const next = collect();
    if (!next.beanId) { toast('生豆を選んでください'); form.elements.beanId.focus(); return; }
    if (isNew) {
      next.id = newId();
      next.lot = makeLot(next.date, next.id);
      data.roasts.push(next);
    } else {
      if (next.date !== saved.date) next.lot = makeLot(next.date, next.id);
      data.roasts[data.roasts.findIndex(x => x.id === id)] = next;
    }
    save();
    clearDraft();
    toast('保存しました');
    showRoast(next.id);
  });

  main.querySelector('#delRoast')?.addEventListener('click', () => {
    if (!confirm(`ロット ${saved.lot} の焙煎カードを消しますか？`)) return;
    data.roasts = data.roasts.filter(x => x.id !== id);
    save();
    clearDraft();
    showTab('roasts');
  });
}

// ---------- 味見 ----------

const BREWERS = ['HARIO Switch', 'ORIGAMI', 'カリタ', 'SIMPLIFY', 'ネル', 'その他'];
const TASTE_ITEMS = [
  ['aroma', '香り'],
  ['acidity', '酸味'],
  ['sweetness', '甘さ'],
  ['bitterness', '苦味'],
  ['body', 'コク'],
  ['aftertaste', '後味'],
];

function daysAfter(roastDate, date) {
  const toDay = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  return toDay(date) - toDay(roastDate);
}

function dots(n, max = 5) {
  if (!n) return '―';
  return `<span class="dots">${'●'.repeat(n)}<span>${'●'.repeat(max - n)}</span></span>`;
}

function stars(n) {
  if (!n) return '―';
  return `<span class="stars">${'★'.repeat(n)}<span>${'★'.repeat(5 - n)}</span></span>`;
}

// いちばん新しい味見
function latestTasting(r) {
  return [...(r.tastings || [])].sort((a, b) => b.date.localeCompare(a.date))[0];
}

function brewText(t) {
  const parts = [];
  if (t.brewer) parts.push(esc(t.brewer));
  if (t.doseG != null) parts.push(`豆${t.doseG}g`);
  if (t.grind) parts.push(`挽き目 ${esc(t.grind)}`);
  if (t.waterTemp != null) parts.push(`${t.waterTemp}℃`);
  if (t.brewSec != null) parts.push(fmtTime(t.brewSec));
  return parts.join('・');
}

function tastingsHtml(r) {
  const list = [...(r.tastings || [])].sort((a, b) => a.date.localeCompare(b.date));
  let html = '<h2>味見</h2>';
  if (!list.length) {
    html += '<div class="card"><div class="note">まだ味見の記録がありません</div></div>';
  }
  for (const t of list) {
    const d = daysAfter(r.date, t.date);
    html += `
      <button class="card tasting" data-tasting="${t.id}">
        <div class="row">
          <div class="name">${fmtDate(t.date)}</div>
          <span class="badge">焙煎から${d}日目</span>
        </div>
        ${brewText(t) ? `<div class="sub">${brewText(t)}</div>` : ''}
        <div class="taste-grid">
          ${TASTE_ITEMS.map(([k, label]) => `<div><span>${label}</span>${dots(t[k])}</div>`).join('')}
        </div>
        <div class="total">総合 ${stars(t.total)}</div>
        ${t.memo ? `<div class="sub">${esc(t.memo)}</div>` : ''}
      </button>`;
  }
  html += '<button class="btn ghost" id="addTasting">＋ 味見を記録する</button>';
  return html;
}

// 1〜5を押して選ぶボタン。同じ数をもう一度押すと消える
function rateHtml(name, value, kind) {
  return `<div class="rate ${kind}" data-name="${name}" data-v="${value || ''}">
    ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" class="${value >= n ? 'on' : ''}">${kind === 'star' ? '★' : n}</button>`).join('')}
  </div>`;
}

function editTasting(roastId, tastingId) {
  const r = data.roasts.find(x => x.id === roastId);
  if (!r) return showTab('roasts');
  const saved = (r.tastings || []).find(t => t.id === tastingId);
  const isNew = !saved;

  // 新しい味見は、前回の器具と淹れ方を最初から入れておく
  const last = data.roasts.flatMap(x => x.tastings || []).sort((a, b) => b.date.localeCompare(a.date))[0];
  const t = saved ? { ...saved } : {
    date: todayIso(),
    brewer: last?.brewer || '',
    doseG: last?.doseG ?? null,
    grind: last?.grind || '',
    waterTemp: last?.waterTemp ?? null,
    brewSec: last?.brewSec ?? null,
  };

  let dirty = false;
  setHeader(isNew ? '味見を記録' : '味見を直す', () => {
    if (dirty && !confirm('入力した内容を保存せずに戻りますか？')) return;
    showRoast(roastId);
  });

  main.innerHTML = `
    <div class="card">
      <div class="name">${esc(beanName(r.beanId))}</div>
      <div class="sub">焙煎 ${fmtDate(r.date)}・ロット ${esc(r.lot)}${r.level || roastLevel(lossRate(r)) ? `・${esc(r.level || roastLevel(lossRate(r)))}` : ''}</div>
    </div>
    <form id="tasteForm" autocomplete="off">
      <div class="card">
        <div class="field"><label>味見日</label><input name="date" type="date" value="${esc(t.date)}">
          <div class="preview" id="daysPreview"></div></div>
      </div>

      <h2>淹れ方</h2>
      <div class="card">
        <div class="field"><label>使った器具</label>
          <div class="chips pick" data-name="brewer">
            ${BREWERS.map(b => `<button type="button" class="chip ${t.brewer === b ? 'on' : ''}">${b}</button>`).join('')}
          </div></div>
        <div class="field"><label>豆の量</label>
          <div class="inline"><input name="doseG" inputmode="decimal" value="${t.doseG ?? ''}" placeholder="例：15"><span class="unit">g</span></div></div>
        <div class="field"><label>挽き目</label><input name="grind" value="${esc(t.grind || '')}" placeholder="例：中細挽き、目盛り4"></div>
        <div class="field"><label>お湯の温度</label>
          <div class="inline"><input name="waterTemp" inputmode="numeric" value="${t.waterTemp ?? ''}" placeholder="例：90"><span class="unit">℃</span></div></div>
        <div class="field"><label>抽出時間</label>
          <div class="time-in">
            <input name="brewMin" inputmode="numeric" value="${t.brewSec != null ? Math.floor(t.brewSec / 60) : ''}"><span>分</span>
            <input name="brewS" inputmode="numeric" value="${t.brewSec != null ? t.brewSec % 60 : ''}"><span>秒</span>
          </div></div>
      </div>

      <h2>味（1＝弱い 〜 5＝強い）</h2>
      <div class="card">
        ${TASTE_ITEMS.map(([k, label]) => `<div class="field rate-row"><label>${label}</label>${rateHtml(k, t[k], 'num')}</div>`).join('')}
      </div>

      <h2>総合点（おいしさ）</h2>
      <div class="card">
        ${rateHtml('total', t.total, 'star')}
        <div class="field" style="margin-top:14px"><label>ひとことメモ</label>
          <textarea name="memo" placeholder="例：冷めても甘い。もう少し深くてもよさそう">${esc(t.memo || '')}</textarea></div>
      </div>
    </form>
    <button class="btn primary" id="saveTasting">保存する</button>
    ${isNew ? '' : '<button class="btn danger" id="delTasting">この味見を消す</button>'}`;

  const form = main.querySelector('#tasteForm');

  const updateDays = () => {
    const d = daysAfter(r.date, form.elements.date.value || todayIso());
    main.querySelector('#daysPreview').textContent = d < 0 ? '焙煎日より前の日付になっています' : `焙煎から${d}日目`;
  };
  updateDays();
  form.addEventListener('input', () => { dirty = true; updateDays(); });

  form.querySelectorAll('.pick .chip').forEach(btn => btn.addEventListener('click', () => {
    const on = !btn.classList.contains('on');
    btn.parentElement.querySelectorAll('.chip').forEach(b => b.classList.remove('on'));
    btn.classList.toggle('on', on);
    dirty = true;
  }));

  form.querySelectorAll('.rate').forEach(box => box.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const n = Number(btn.dataset.n);
    const v = Number(box.dataset.v) === n ? 0 : n;
    box.dataset.v = v || '';
    box.querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.n) <= v));
    dirty = true;
  }));

  main.querySelector('#saveTasting').addEventListener('click', () => {
    const f = form.elements;
    const m = num(f.brewMin.value), s = num(f.brewS.value);
    const next = {
      ...t,
      id: t.id || newId(),
      date: f.date.value || todayIso(),
      brewer: form.querySelector('.pick .chip.on')?.textContent || '',
      doseG: num(f.doseG.value),
      grind: f.grind.value.trim(),
      waterTemp: num(f.waterTemp.value),
      brewSec: m == null && s == null ? null : Math.round((m || 0) * 60 + (s || 0)),
      memo: f.memo.value.trim(),
    };
    form.querySelectorAll('.rate').forEach(box => { next[box.dataset.name] = Number(box.dataset.v) || null; });

    r.tastings = (r.tastings || []).filter(x => x.id !== next.id);
    r.tastings.push(next);
    save();
    toast('保存しました');
    showRoast(roastId);
  });

  main.querySelector('#delTasting')?.addEventListener('click', () => {
    if (!confirm('この味見の記録を消しますか？')) return;
    r.tastings = r.tastings.filter(x => x.id !== tastingId);
    save();
    showRoast(roastId);
  });
}

// ---------- 生豆 ----------

function renderBeans() {
  setHeader('生豆');
  let html = '';
  if (!data.beans.length) {
    html += `<div class="empty">まだ生豆が登録されていません。<br>下のボタンから登録できます。</div>`;
  }
  for (const b of data.beans) {
    const n = data.roasts.filter(r => r.beanId === b.id).length;
    const sub = [b.country, b.region, b.process, b.shop].filter(Boolean).map(esc).join('・');
    html += `
      <button class="card" data-bean="${b.id}">
        <div class="row">
          <div class="name">${esc(b.name)}</div>
          ${b.pricePerKg ? `<span class="big">${Number(b.pricePerKg).toLocaleString()}<small style="font-size:12px">円/kg</small></span>` : ''}
        </div>
        <div class="sub">${sub || '産地などは未入力'}・焙煎 ${n}回</div>
      </button>`;
  }
  html += `<button class="btn primary" id="addBean">＋ 生豆を登録する</button>`;
  main.innerHTML = html;
  main.querySelector('#addBean').addEventListener('click', () => editBean());
  main.querySelectorAll('[data-bean]').forEach(el => {
    el.addEventListener('click', () => editBean(el.dataset.bean));
  });
}

const BEAN_FIELDS = [
  ['name', '名前（一覧に出る名前）', 'text', '例：エチオピア シダモG2'],
  ['country', '国', 'text', '例：エチオピア'],
  ['region', '地域', 'text', '例：シダモ'],
  ['farm', '農園・生産者', 'text', ''],
  ['variety', '品種', 'text', '例：在来種'],
  ['grade', '等級', 'text', '例：G1、AA'],
  ['process', '精製方法', 'select', ''],
  ['shop', '購入先', 'text', ''],
  ['purchaseDate', '購入日', 'date', ''],
  ['pricePerKg', '1kgあたりの値段（円・税込）', 'number', '例：3200'],
  ['memo', 'メモ', 'textarea', '販売店の説明や味の特徴など'],
];

function editBean(id) {
  const bean = data.beans.find(b => b.id === id) || {};
  const isNew = !bean.id;
  setHeader(isNew ? '生豆を登録' : '生豆を直す', () => showTab('beans'));

  const fieldHtml = ([key, label, type, ph]) => {
    const v = esc(bean[key] ?? '');
    let input;
    if (type === 'select') {
      input = `<select name="${key}"><option value="">選ぶ</option>${PROCESSES.map(p => `<option ${bean[key] === p ? 'selected' : ''}>${p}</option>`).join('')}</select>`;
    } else if (type === 'textarea') {
      input = `<textarea name="${key}" placeholder="${ph}">${v}</textarea>`;
    } else {
      const extra = type === 'number' ? 'inputmode="numeric"' : '';
      input = `<input name="${key}" type="${type === 'number' ? 'text' : type}" ${extra} value="${v}" placeholder="${ph}">`;
    }
    return `<div class="field"><label>${label}</label>${input}</div>`;
  };

  const used = data.roasts.filter(r => r.beanId === bean.id).length;
  main.innerHTML = `
    <form class="card" id="beanForm">
      ${BEAN_FIELDS.map(fieldHtml).join('')}
    </form>
    <button class="btn primary" id="saveBean">保存する</button>
    ${isNew ? '' : `<button class="btn danger" id="delBean">${used ? `この豆は${used}回の焙煎で使われているので消せません` : 'この生豆を消す'}</button>`}`;

  main.querySelector('#saveBean').addEventListener('click', () => {
    const form = main.querySelector('#beanForm');
    const next = { ...bean };
    for (const [key, , type] of BEAN_FIELDS) {
      const v = form.elements[key].value.trim();
      next[key] = type === 'number' ? num(v) : v;
    }
    if (!next.name) {
      toast('名前を入れてください');
      form.elements.name.focus();
      return;
    }
    if (isNew) {
      next.id = newId();
      data.beans.push(next);
    } else {
      data.beans[data.beans.findIndex(b => b.id === bean.id)] = next;
    }
    save();
    toast('保存しました');
    showTab('beans');
  });

  main.querySelector('#delBean')?.addEventListener('click', () => {
    if (used) return;
    if (!confirm(`「${bean.name}」を消しますか？`)) return;
    data.beans = data.beans.filter(b => b.id !== bean.id);
    save();
    showTab('beans');
  });
}

// ---------- 設定 ----------

function renderSettings() {
  setHeader('設定');
  const imported = data.roasts.some(r => r.imported);
  main.innerHTML = `
    <h2>過去の記録</h2>
    <div class="card">
      <div class="note">手書きの焙煎ノートのうち、読み取りが確かな9回分（2025年9月〜2026年7月）を取り込みます。豆も4種類が自動で登録されます。</div>
      ${imported
        ? `<div class="preview">✅ 取り込み済みです</div>`
        : `<button class="btn primary" id="importSeed">過去の記録（9回分）を取り込む</button>`}
    </div>

    <h2>バックアップ</h2>
    <div class="card">
      <div class="note">記録はこのスマホの中に保存されています。ときどき「書き出す」でファイルに残しておくと安心です。</div>
      <button class="btn ghost" id="exportData">バックアップを書き出す</button>
      <button class="btn ghost" id="importData">バックアップから戻す</button>
      <input type="file" id="importFile" accept=".json,application/json" hidden>
    </div>`;

  main.querySelector('#importSeed')?.addEventListener('click', () => {
    const n = importSeed();
    toast(`${n}回分を取り込みました`);
    showTab('roasts');
  });

  main.querySelector('#exportData').addEventListener('click', exportData);
  const file = main.querySelector('#importFile');
  main.querySelector('#importData').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    try {
      const restored = JSON.parse(await file.files[0].text());
      if (!Array.isArray(restored.beans) || !Array.isArray(restored.roasts)) throw new Error();
      if (!confirm(`生豆${restored.beans.length}種類・焙煎${restored.roasts.length}回分に置きかえます。今のスマホの記録は消えます。よろしいですか？`)) return;
      data = { beans: [], roasts: [], ...restored };
      save();
      toast('バックアップから戻しました');
      showTab('roasts');
    } catch (e) {
      toast('このファイルは読めませんでした');
    }
  });
}

function importSeed() {
  const beanIds = {};
  for (const [key, info] of Object.entries(SEED_BEANS)) {
    const found = data.beans.find(b => b.name === info.name);
    if (found) { beanIds[key] = found.id; continue; }
    const bean = { id: newId(), ...info };
    data.beans.push(bean);
    beanIds[key] = bean.id;
  }
  for (const s of SEED_ROASTS) {
    const r = {
      id: newId(),
      imported: true,
      date: s.date,
      beanId: beanIds[s.bean],
      inG: s.inG,
      outG: s.outG,
      preheat: s.preheat,
      chargeTemp: s.chargeTemp ?? null,
      firstCrack: s.firstCrack || null,
      secondCrack: s.secondCrack || null,
      drop: s.drop || null,
      noteLevel: s.noteLevel || '',
      noteLoss: s.noteLoss || '',
      memo: s.memo || '',
    };
    r.lot = makeLot(r.date, r.id);
    data.roasts.push(r);
  }
  save();
  return SEED_ROASTS.length;
}

function exportData() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `焙煎記録_バックアップ_${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

showTab('roasts');

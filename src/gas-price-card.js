/**
 * 中国油价一览卡片（适配「油捷 / you_jie」等油价 Home Assistant 集成）
 * 自定义卡片类型：custom:gas-price-card
 *
 * 用法（仪表盘 YAML）：
 *   type: custom:gas-price-card
 *   key: you_jie_jiang_su      # 实体前缀，即 sensor.<key>_gas92 等
 *   name: 江苏                 # 卡片标题（可选，优先用集成里的地区名）
 *
 * 设计参考 hxf14789/State-Grid-Electricity-Card：
 *   - 单文件 Lovelace 卡片（无构建步骤）
 *   - shadow DOM + 注入 CSS，深浅色跟随 HA 主题变量
 *   - setConfig / set hass 两个必需接口
 */

const GP_VERSION = "v1.0.8";

/* ============== 主题变量（跟随 HA 主题） ============== */
const BASE_CSS = `
:host{display:block;width:100%}
.wrap{
  --gp-bg:var(--ha-card-background, var(--card-background-color, #1e1e1e));
  --gp-text:var(--primary-text-color, #e8e8e8);
  --gp-muted:var(--secondary-text-color, #9a9a9a);
  --gp-panel:var(--secondary-background-color, #2a2a2a);
  --gp-line:rgba(128,128,128,.16);
  --gp-accent:#1aa179;
  --gp-accent2:#0d8f9c;
  --gp-on-accent:#ffffff;
  --gp-up:#e23b3b;        /* 涨 → 红（中国习惯） */
  --gp-down:#21a366;      /* 跌 → 绿 */
  --gp-flat:#2f8fd6;      /* 搁浅 → 蓝 */
  box-sizing:border-box;background:var(--gp-bg);
  border:1px solid var(--gp-line);border-radius:22px;padding:20px;
  width:100%;min-width:0;overflow:hidden;color:var(--gp-text);
  font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  font-size:15px;line-height:1.45;
}
.wrap *{box-sizing:border-box}
.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.brand{display:flex;gap:12px;align-items:center;min-width:0}
.logo{width:42px;height:42px;border-radius:13px;flex-shrink:0;
  background:linear-gradient(135deg,var(--gp-accent),var(--gp-accent2));
  display:flex;align-items:center;justify-content:center;font-size:22px;
  box-shadow:0 4px 14px rgba(13,143,156,.28)}
.title{font-size:21px;font-weight:800;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.subtitle{font-size:12.5px;color:var(--gp-muted);margin-top:3px;display:flex;align-items:center;gap:6px}
.dot{width:7px;height:7px;border-radius:50%;background:var(--gp-accent);box-shadow:0 0 0 3px rgba(26,161,121,.18)}
.refresh{appearance:none;border:none;cursor:pointer;flex:0 0 auto;padding:0;
  background:rgba(128,128,128,.16);color:var(--gp-text);
  width:42px;height:42px;min-width:42px;min-height:42px;border-radius:12px;
  display:flex;align-items:center;justify-content:center;line-height:0;
  transition:background .15s,transform .15s;-webkit-tap-highlight-color:transparent}
.refresh:hover{background:rgba(128,128,128,.26)}
.refresh:active{transform:scale(.92)}
/* 图标：SVG 对称图形，旋转中心恒为自身几何中心，不会偏移 */
.refresh .ri{display:block;flex:0 0 auto;width:24px;height:24px;margin:0;
  transform-origin:50% 50%;transform-box:view-box;will-change:transform}
.refresh.spin .ri{animation:gp-spin .8s linear infinite}
@keyframes gp-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

/* 价格网格 */
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:18px}
.tile{position:relative;background:var(--gp-panel);border-radius:16px;padding:13px 10px 12px;
  overflow:hidden;text-align:center;min-width:0}
.tile::before{content:"";position:absolute;left:0;top:0;right:0;height:4px;
  background:var(--gc,var(--gp-accent))}
.tile .g{font-size:12.5px;color:var(--gp-muted);font-weight:600;letter-spacing:.3px}
.tile .v{font-size:27px;font-weight:800;line-height:1.1;margin-top:7px;color:var(--gc,var(--gp-accent))}
.tile .u{font-size:11px;color:var(--gp-muted);margin-top:3px}
.tile.diesel{--gc:#3aa0c4}

/* 趋势条 */
.trend{display:flex;align-items:center;gap:10px;margin-top:14px;min-width:0;
  background:var(--gp-panel);border-radius:14px;padding:11px 14px}
.trend .chip{font-size:13px;font-weight:800;padding:4px 11px;border-radius:20px;white-space:nowrap;
  color:#fff;background:var(--gp-flat);display:inline-flex;align-items:center;gap:5px;flex-shrink:0}
.trend .chip.up{background:var(--gp-up)}
.trend .chip.down{background:var(--gp-down)}
.trend .tip{flex:1 1 auto;font-size:13px;color:var(--gp-muted);line-height:1.45;min-width:0;
  overflow:hidden;overflow-wrap:anywhere}
.trend .tip b{color:var(--gp-text);font-weight:700}

/* 底部信息条：下次调价（左） + 更新时间（右），屏幕允许时同一行、两端分布 */
.foot2{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:6px 10px;
  margin-top:14px;font-size:11.5px;color:var(--gp-muted);min-width:0}
.foot2 > span{white-space:nowrap;min-width:0}
/* 第一段抢右侧剩余空间 → 单行时天然形成两端分布；仅当真正放不下才由 flex-wrap 折行 */
.foot2 .next{margin-right:auto}
/* 下次调价：红加粗（沿用旧版强调，提示调价节点） */
.foot2 .next b{color:var(--gp-up);font-weight:800}
/* 更新时间：加粗标橙，作为底部时间信息的重点 */
.foot2 .upd b{color:#f59e0b;font-weight:800}

.empty{padding:22px;text-align:center;color:var(--gp-muted);font-size:13px}

/* 结构全端统一：四档油价任何宽度都是一行 4 列，不再折成 2×2 */
/* 旧浏览器兜底：按视口收字号，保证不越界 */
@media(max-width:520px){
  .tile .g{font-size:10.5px}
  .tile .v{font-size:18px}
  .tile .u{font-size:9.5px}
  .grid{gap:6px}
}
@media(max-width:430px){
  /* 移动端保持与桌面端完全一致的按钮/图标尺寸比例，不缩放 */
  .refresh{width:42px;height:42px;min-width:42px;min-height:42px}
  .refresh .ri{width:24px;height:24px}
}

/* 现代浏览器：字号随卡片自身宽度平滑自适应（容器查询），4 列永远刚好放得下 */
.wrap{container-type:inline-size}
@supports (container-type:inline-size){
  .tile{padding:clamp(9px,3.4cqw,13px) clamp(5px,2.6cqw,10px) clamp(8px,3.2cqw,12px)}
  .tile .g{font-size:clamp(9.5px,3cqw,12.5px);letter-spacing:clamp(0px,.3cqw,.3px)}
  .tile .v{font-size:clamp(15px,5.6cqw,27px);margin-top:clamp(4px,1.8cqw,7px)}
  .tile .u{font-size:clamp(9px,2.6cqw,11px)}
  .grid{gap:clamp(6px,2.6cqw,10px)}
  .foot2{font-size:clamp(10px,2.7cqw,11.5px)}
  .foot2 .next b{font-size:clamp(10.5px,2.9cqw,12px)}
  .foot2 .upd b{font-size:clamp(10.5px,2.9cqw,12px)}
}
/* 仅极窄卡片（内容宽 ≤280px，约等于卡片宽 ≤322px）才折行，且两段各自右对齐 */
@container (max-width:280px){
  .foot2 > span{flex:1 1 100%;text-align:right;white-space:normal}
  .foot2 .next{margin-right:0}
}
`;

/* ============== 工具函数 ============== */
function gpSensorOf(acc, suffix) {
  if (acc.entities && acc.entities[suffix]) return acc.entities[suffix];
  return `sensor.${acc.key}_${suffix}`;
}
function gpStr(hass, entity) {
  const s = hass && hass.states && hass.states[entity];
  if (!s) return null;
  const v = s.state;
  return v === undefined || v === null || v === "unknown" || v === "unavailable" ? null : String(v);
}
function gpNum(hass, entity) {
  const v = gpStr(hass, entity);
  if (v === null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function gpFmt(v, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  return v.toFixed(digits);
}
/* 清洗地区名：去掉「今日油价」「油价」等重复前缀与多余分隔符
 * 例：'油价-江苏' → '江苏'；'今日油价：江苏' → '江苏'；'江苏' → '江苏'
 */
function gpCleanRegion(s) {
  if (!s) return "";
  let t = String(s).trim();
  const pre = /^(今日油价|油价行情|油价查询|最新油价|油价|地区名称|地区|名称)\s*[-–—－_·:：|/、]?\s*/;
  for (let i = 0; i < 5 && pre.test(t); i++) t = t.replace(pre, "");
  return t.replace(/^[-–—－_·:：|/、\s]+/, "").replace(/[-–—－_·:：|/、\s]+$/, "").trim();
}
function gpRegionName(hass, acc) {
  // 地区名以 sensor.<key>_friendly_name 为准（集成里的地区实体）
  const direct = gpCleanRegion(gpStr(hass, gpSensorOf(acc, "friendly_name")));
  if (direct) return direct;
  // 兜底：从 92#/95# 实体的 friendly_name 属性里剥离油品名
  const probe = hass.states[gpSensorOf(acc, "gas92")] || hass.states[gpSensorOf(acc, "gas95")];
  const attr = probe && probe.attributes && probe.attributes.friendly_name;
  if (attr) {
    const cleaned = gpCleanRegion(String(attr).replace(/92#汽油|95#汽油|98#汽油|0#柴油|汽油|柴油/g, ""));
    if (cleaned) return cleaned;
  }
  return gpCleanRegion(acc.name) || "本地区";
}
function gpTrendInfo(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("涨") || t.includes("上调") || t.includes("up")) {
    return { cls: "up", arrow: "▲", label: text || "上涨" };
  }
  if (t.includes("跌") || t.includes("下调") || t.includes("降低") || t.includes("down")) {
    return { cls: "down", arrow: "▼", label: text || "下跌" };
  }
  if (t.includes("搁浅") || t.includes("不变") || t.includes("持平")) {
    return { cls: "flat", arrow: "━", label: text || "搁浅" };
  }
  return { cls: "flat", arrow: "━", label: text || "—" };
}
/* 清洗「下次调价」文本：去掉与标签重复的冗长前缀，只保留时间本体 */
function gpCleanNextTime(s) {
  if (!s) return s;
  const cleaned = s
    .replace(/^油价/, "")
    .replace(/^下次调价时间(为)?/, "")
    .replace(/^下次调价(为)?/, "")
    .replace(/^为/, "")
    .trim();
  return cleaned || s;
}
/* 统一日期时间格式：把「下次调价」等中文日期与「更新时间」统一成
 * YYYY-MM-DD HH:mm（与集成里 update_time 的风格一致），秒数统一舍去。
 * 例：'2026年11月12日 24:00' → '2026-11-12 24:00'
 *     '2026-10-31 02:18:03' → '2026-10-31 02:18'
 * 解析失败时原样返回，保证不报错。
 */
function gpNormalizeDate(s) {
  if (!s) return s;
  const t = String(s).trim();
  let y, m, d;
  const cn = t.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  const en = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (cn) { y = cn[1]; m = cn[2]; d = cn[3]; }
  else if (en) { y = en[1]; m = en[2]; d = en[3]; }
  else return s;
  let hh = "00", mm = "00";
  const tm = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (tm) { hh = tm[1]; mm = tm[2]; }
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)} ${pad(hh)}:${pad(mm)}`;
}

/* ============== 卡片类 ============== */
class GasPriceCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._spinTimer = null;
  }

  setConfig(config) {
    if (!config || !config.key) {
      throw new Error("请配置 key（实体前缀，例如 you_jie_jiang_su）");
    }
    this._config = {
      key: config.key,
      name: config.name || "",
      entities: config.entities || null,
      refresh_entity: config.refresh_entity || `button.${config.key}_refresh`,
    };
  }

  set hass(hass) {
    this._hass = hass;
    const sig = this._signature();
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }

  _signature() {
    if (!this._hass || !this._config) return "";
    const acc = this._config;
    const keys = ["gas92", "gas95", "gas98", "die0", "trend", "time",
      "tips", "update_time", "friendly_name"];
    return [acc.key, ...keys.map((k) => gpStr(this._hass, gpSensorOf(acc, k)) ?? "")].join("|");
  }

  getCardSize() { return 5; }

  _doRefresh() {
    if (!this._hass || !this._config.refresh_entity) return;
    try {
      this._hass.callService("button", "press", { entity_id: this._config.refresh_entity });
    } catch (e) { /* 忽略 */ }
    const btn = this.shadowRoot.querySelector(".refresh");
    if (btn) {
      btn.classList.add("spin");
      clearTimeout(this._spinTimer);
      this._spinTimer = setTimeout(() => btn.classList.remove("spin"), 1200);
    }
  }

  _render() {
    if (!this._hass || !this._config) return;
    const hass = this._hass;
    const acc = this._config;

    const region = gpRegionName(hass, acc);
    const gas92 = gpNum(hass, gpSensorOf(acc, "gas92"));
    const gas95 = gpNum(hass, gpSensorOf(acc, "gas95"));
    const gas98 = gpNum(hass, gpSensorOf(acc, "gas98"));
    const die0 = gpNum(hass, gpSensorOf(acc, "die0"));

    const trendRaw = gpStr(hass, gpSensorOf(acc, "trend"));
    const trend = gpTrendInfo(trendRaw);
    const tips = gpStr(hass, gpSensorOf(acc, "tips"));
    const nextTime = gpNormalizeDate(gpCleanNextTime(gpStr(hass, gpSensorOf(acc, "time"))));
    const updateTime = gpNormalizeDate(gpStr(hass, gpSensorOf(acc, "update_time")));

    const tiles = [
      { label: "92#汽油", val: gas92, color: "#ff7a45" },
      { label: "95#汽油", val: gas95, color: "#7b61ff" },
      { label: "98#汽油", val: gas98, color: "#f5a623" },
      { label: "0#柴油", val: die0, color: "#3aa0c4", diesel: true },
    ].map((t) => `
      <div class="tile${t.diesel ? " diesel" : ""}" style="--gc:${t.color}">
        <div class="g">${t.label}</div>
        <div class="v">${gpFmt(t.val)}</div>
        <div class="u">元/升</div>
      </div>`).join("");

    const tipHtml = tips
      ? `<div class="tip">调价提示：<b>${tips}</b></div>`
      : `<div class="tip">数据来自「${region}」油价集成，价格单位为元/升</div>`;

    this.shadowRoot.innerHTML = `
      <style>${BASE_CSS}</style>
      <div class="wrap">
        <div class="hd">
          <div class="brand">
            <div class="logo">⛽</div>
            <div style="min-width:0">
              <div class="title">今日油价-${region}</div>
              <div class="subtitle"><span class="dot"></span>实时油价一览 · ${GP_VERSION}</div>
            </div>
          </div>
          <button class="refresh" title="立即更新" aria-label="立即更新">
            <svg class="ri" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </button>
        </div>

        <div class="grid">${tiles}</div>

        <div class="trend">
          <span class="chip ${trend.cls}">${trend.arrow} ${trend.label}</span>
          ${tipHtml}
        </div>

        <div class="foot2">
          <span class="next">下次调价：<b>${nextTime || "--"}</b></span>
          <span class="upd">更新时间：<b>${updateTime || "--"}</b></span>
        </div>
      </div>`;

    const btn = this.shadowRoot.querySelector(".refresh");
    if (btn) btn.addEventListener("click", () => this._doRefresh());

    this._sig = this._signature();
  }
}

/* ============== 注册 ============== */
console.info("[gas-price-card] " + GP_VERSION + " loaded");
customElements.define("gas-price-card", GasPriceCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "gas-price-card",
  name: "中国油价一览",
  description: "展示 92/95/98# 汽油与 0# 柴油实时价格、调价趋势与下次调价时间",
});

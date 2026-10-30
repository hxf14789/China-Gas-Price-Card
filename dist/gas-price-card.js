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

const GP_VERSION = "v1.0.3";

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
.refresh{appearance:none;border:none;cursor:pointer;flex-shrink:0;
  background:rgba(128,128,128,.16);color:var(--gp-text);border-radius:11px;
  width:40px;height:40px;font-size:18px;display:flex;align-items:center;justify-content:center;
  transition:background .15s,transform .15s;-webkit-tap-highlight-color:transparent}
.refresh:hover{background:rgba(128,128,128,.26)}
.refresh:active{transform:scale(.92)}
.refresh .ri{display:inline-block;line-height:1}
.refresh.spin .ri{animation:gp-spin .8s linear infinite}
@keyframes gp-spin{to{transform:rotate(360deg)}}

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

/* 调价信息面板（上下两行，各占满整行） */
.panel{display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px}
.cell{background:var(--gp-panel);border-radius:14px;padding:11px 13px;min-width:0;overflow:hidden}
.cell .lab{font-size:12px;color:var(--gp-muted)}
.cell .val{font-size:15px;font-weight:700;margin-top:4px;color:var(--gp-text);line-height:1.4;
  white-space:normal;overflow-wrap:anywhere;word-break:break-word;max-width:100%}
.cell .val.warn{color:var(--gp-up)}

.foot{display:flex;justify-content:space-between;align-items:center;
  margin-top:14px;font-size:11.5px;color:var(--gp-muted)}
.foot .v{opacity:.6}

.empty{padding:22px;text-align:center;color:var(--gp-muted);font-size:13px}

@media(max-width:430px){
  .grid{grid-template-columns:repeat(2,1fr)}
  .panel{grid-template-columns:1fr}
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
function gpRegionName(hass, acc) {
  // 优先用独立实体，否则用第一个油价实体的 friendly_name 属性
  const direct = gpStr(hass, gpSensorOf(acc, "friendly_name"));
  if (direct) return direct;
  const probe = hass.states[gpSensorOf(acc, "gas92")] || hass.states[gpSensorOf(acc, "gas95")];
  const attr = probe && probe.attributes && probe.attributes.friendly_name;
  if (attr) return String(attr).replace(/92#汽油|95#汽油|98#汽油|0#柴油/g, "").trim() || String(attr);
  return acc.name || "本地区";
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
    const nextTime = gpCleanNextTime(gpStr(hass, gpSensorOf(acc, "time")));
    const updateTime = gpStr(hass, gpSensorOf(acc, "update_time"));

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

    const nextTimeHtml = nextTime
      ? `<div class="val warn">${nextTime}</div>`
      : `<div class="val">--</div>`;

    this.shadowRoot.innerHTML = `
      <style>${BASE_CSS}</style>
      <div class="wrap">
        <div class="hd">
          <div class="brand">
            <div class="logo">⛽</div>
            <div style="min-width:0">
              <div class="title">${region} · 今日油价</div>
              <div class="subtitle"><span class="dot"></span>实时油价一览 ${GP_VERSION}</div>
            </div>
          </div>
          <button class="refresh" title="立即更新" aria-label="立即更新"><span class="ri">⟳</span></button>
        </div>

        <div class="grid">${tiles}</div>

        <div class="trend">
          <span class="chip ${trend.cls}">${trend.arrow} ${trend.label}</span>
          ${tipHtml}
        </div>

        <div class="panel">
          <div class="cell">
            <div class="lab">下次调价</div>
            ${nextTimeHtml}
          </div>
        </div>

        <div class="foot">
          <span>更新时间：${updateTime || "--"}</span>
          <span class="v">${GP_VERSION}</span>
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

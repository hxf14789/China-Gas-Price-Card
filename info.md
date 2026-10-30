# 中国油价一览卡片

把「油捷 / you_jie」等油价集成里的 92/95/98# 汽油、0# 柴油价格、调价趋势与下次调价时间，整理成一张精美的一览表。

> ⚠️ **前置条件**：必须先安装油价集成（实体形如 `sensor.you_jie_<地区>_gas92`），本卡片只负责展示，不获取数据。

- 四宫格油价（元/升），大字号清晰可读
- 调价趋势自动着色：涨=红、跌=绿、搁浅=蓝
- 下次调价倒计时 + 调价日期 + 调价提示
- 一键刷新（调用 `button.<key>_refresh`）
- 深浅色自动跟随 Home Assistant 主题

![预览](preview.html)

安装后在仪表盘添加：

```yaml
type: custom:gas-price-card
key: you_jie_jiang_su
```

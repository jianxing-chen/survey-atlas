# Survey Atlas · 巡天数据查询系统

一个零依赖的纯静态网站：**59 个主流天文巡天的数据档案**——测光还是光谱、覆盖多大天区、能测到多暗、以什么节奏观测、发布了哪些数据产品、去哪里下载——用于快速判断某个巡天的数据是否适合你的科学问题。

**数据核实至 2026-10-08**（Gaia DR4 预计 2026-12；DESI 公开版为 DR1；Rubin DP2 已发布；Legacy DR11、LAMOST DR13、UltraVISTA DR6、COSMOS-Web DR1、VVVX 最终版……逐条经官方渠道核对）。

## 功能

| 区块 | 说明 |
|---|---|
| 类别索引条 | 首页九色索引，点击即筛选并跳到总表（色谱即导航） |
| 发布日历 | 2024–2027 关键发布节点（含 Gaia DR4、Euclid DR1、Rubin DR1 等未来日期） |
| 对比总表 | 59 × 11 列，**全列可排序**（数值列 N/A 恒沉底）、类型筛选、中英文搜索（`/` 聚焦） |
| 数据档案抽屉 | **点击任意行打开**：发布了什么数据 / 形态与规模 / 观测节奏 / 获取方式 / 科学适配；`← →` 浏览、`Esc` 关闭、URL 深链（`#d-巡天id`） |
| 面积×深度图 | 成像与光谱两张 SVG 散点图，标签自动避让 |
| 选型指南 | 按科学目标反查推荐数据集 |
| 来源 | 31 条官方来源与统计口径说明 |

## 项目结构

```
index.html   页面骨架（meta / SEO / OG）
style.css    全部样式（调色板在 :root，一处改全局生效）
data.js      全部数据 ← 改数据只动这个文件
app.js       全部逻辑（渲染 / 排序 / 筛选 / 抽屉 / 图表）
favicon.svg / favicon-32.png / apple-touch-icon.png
og.png       社交分享图（1200×630）
```

## 本地使用

直接双击 `index.html` 即可（无需构建、无需联网；加载 Google Fonts 失败会自动回退系统字体）。也可以 `python3 -m http.server` 后访问 http://localhost:8000 。

## 数据维护

所有内容集中在 `data.js`：按既有字段增删 `SURVEYS` 条目即可，渲染逻辑无需改动。数值键 `areaN / depthN / nN / rN` 供排序；`≈` 为约值、`⚠` 为未能二次核实的项。欢迎通过 PR 补充/更正（请附官方来源链接）。

## 部署到 GitHub Pages

1. 新建仓库（如 `survey-atlas`）并推送本目录；
2. 仓库 **Settings → Pages → Source 选 main 分支 / 根目录**，保存；
3. 约 1 分钟后访问 `https://<用户名>.github.io/survey-atlas/`。

命令行一条龙：

```bash
git init && git add -A && git commit -m "Survey Atlas: 59-survey data query system"
git branch -M main
git remote add origin git@github.com:<用户名>/survey-atlas.git
git push -u origin main
```

## License

[MIT](LICENSE) — 数据条目汇总自各巡天官方发布渠道，引用具体数值前请点击页面内链接到官方页面复核。

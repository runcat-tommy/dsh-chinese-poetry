# dsh-chinese-poetry

DeepSeek Harness Web 的**免 token 诗词查询插件**：在会话页头新增「诗词」标签页（与「对话」「轨迹」同级，排在轨迹之后），支持搜索、筛选、飞花令、每日一首、收藏与 AI 解读。

- 数据源：免费公共 API [诗泉 poetry.palemoky.com](https://poetry.palemoky.com/)（37 万首诗词，**无需注册、无需 API Key**，CORS 全开）
- AI 解读 / 关联典故：透传给 **dsh 自己的会话**，消耗你已有的模型配额，无需额外申请任何模型 Key
- 纯本地数据（收藏 / 历史 / 缓存），不建任何后端
- 要求：`dsh web 0.1.0-rc.6` 或更新版本

English: [README.en.md](README.en.md)

## 数据基座

本插件的全部诗词语料与查询接口来自开源项目 **[palemoky/chinese-poetry-api](https://github.com/palemoky/chinese-poetry-api)**（[诗泉 poetry.palemoky.com](https://poetry.palemoky.com/)），在此向原作者致谢。该服务免费、无需注册与 API Key、CORS 全开。若你的查询较慢，多为该服务端接口响应慢所致，请前往该项目向作者反馈。

## 本插件做了什么（相对基座的优化）

基座只提供原始接口（按作者 / 朝代 / 体裁分页、随机、搜索、统计等），本插件在其上做了面向「查询使用」的封装与优化：

- **免 token 的会话页视图**：在会话页头注册「诗词」标签页，无需任何模型 Key，纯前端调用公共接口。
- **朝代纠偏表**：公共接口对部分诗人（尤其宋代，如 曾丰 / 毕仲游 / 张侃 等）的朝代标注有误（误标为「唐」），本插件内置常见诗人朝代校正表，展示时自动纠正并标注「已校正」。
- **健壮的数据层**：内置令牌桶限速（搜索 6 次/分、其它 15 次/分）、本地缓存、429 指数退避、连续失败降级为缓存 / 离线兜底，避免被限流打挂、查询失败即报错。
- **离线兜底表**：内置约 90 首常备诗词，断网或接口不可用时仍能演示；2 字内短查询走本地精选并明确提示（3 字以上才检索全库 37 万首）。
- **飞花令**：输入一个字，随机给出含该字的诗，可连点换诗。
- **分享卡片图**：把任意一首诗渲染成一张古风诗图卡片（标题/作者·朝代/正文），一键下载 PNG 分享。
- **节日专题**：内置春节/元宵/清明/端午/七夕/中秋/重阳七节，点选即看代表诗（免 token），支持「随机相关」与「AI 应景赠诗」。  
- **收藏 / 历史 / 简繁**：收藏与最近搜索存于本地（localStorage），支持简体 / 繁体全局切换。
- **AI 解读**：一键把提示词写入 dsh 会话输入框（**不自动发送**，由你按回车确认），复用你已有的模型配额。
- **视图体验**：AI 解读后自动切到「对话」视图；诗词视图内容在对话 / 轨迹 / 诗词间切换时保留；最近搜索区块恒定显示。
- **双语文案 / 中英文文档**：界面文案与 README 均提供中英双语。

## 安装

### 方式一：npm 包（推荐）

```sh
dsh plugin --profile web add dsh-chinese-poetry
```

> 说明：`dsh-chinese-poetry` 已发布到 **npm**（<https://www.npmjs.com/package/dsh-chinese-poetry>），`dsh plugin add` 会直接从 npm registry 拉取并安装，无需手动 `npm install`；版本与 GitHub 仓库同步。

### 方式二：GitHub（发布后可用）

```sh
dsh plugin --profile web add github:<你的用户名>/dsh-chinese-poetry
```

### 方式三：本地源码安装（开发 / 调试）

```sh
cd dsh-chinese-poetry
dsh plugin --profile web add .
```

> 开发调试建议用活链接，改动源码即时生效（仍需重启 Web UI）：

```sh
dsh plugin --profile web add link:.
```

安装完成后**重启 `dsh web`**，打开任意会话，页头标签栏会出现 **「诗词」** 标签。

> 没有 pnpm 时先安装：`npm i -g pnpm`（`dsh plugin` 依赖 pnpm）。

## 使用

1. 打开一个会话（对话 / 轨迹 / 诗词任一界面）。
2. 点击页头 **「诗词」** 标签进入查询界面。
3. 搜索框输入任意词 / 句，或按作者 / 朝代 / 体裁筛选；支持飞花令（单字）、随机、每日一首、简繁切换、**节日专题**（选一个节看到其精选相关诗）。
4. 点开某首诗的详情，可复制（纯文本 / Markdown）、收藏，或点 **卡片图** 生成一张可下载的诗图卡片；点 **AI 解读** 会把提示词写入输入框，**由你按回车确认**后由 dsh 会话回答（不自动提交）。

## 功能路线图

- [x] M0：插件骨架 + 「诗词」标签页注册（与对话 / 轨迹并排，order 20）
- [x] M1：数据层（fetch 封装、令牌桶限速、本地缓存、429 退避、离线兜底表）＋ 搜索 / 随机 / 每日一首 视图
- [x] M2：筛选器（朝代 / 体裁下拉 + 常用作者 chips → 筛一首）、全局简繁切换、复制（纯文本 / Markdown）
- [x] M3：飞花令（单字 → 随机含字诗，可连点换诗）、收藏（localStorage）、最近搜索、AI 解读（写入会话输入框，不自动发送）
- [x] M4a：朝代纠偏表（内置常见诗人朝代校正，纠正公共 API 对宋代等诗人的错标，展示时标注「已校正」）、最近搜索区块恒定显示（含空态占位）、AI 解读后自动切到「对话」视图、视图内容跨标签页保留
- [x] M4b：数据基座致谢提示条（页内提示接口来源与反馈路径）、README / 界面文案中英双语、CHANGELOG、npm 版本 1.1.0
- [x] M4：分享卡片图（canvas 生成诗图卡片，可下载）、节日专题（春节/元宵/清明/端午/七夕/中秋/重阳，每节精选诗 + 随机相关 + AI 应景）、工具式 UI 打磨（空态提示、三视图整合、网格布局）
- [x] M5：GitHub 开源发布（runcat-tommy/dsh-chinese-poetry）

## 开发

```
dsh-chinese-poetry/
├── package.json          # dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml      # profile 层 bundle patch
├── lib/
│   ├── index.js          # node 半部（空 host，无行为）
│   └── client.js         # 浏览器半部：conversation.view 注册 + 视图
├── test/                 # host 冒烟 + client stub 注册断言
└── docs/                 # 调查 / 问卷 / 方案文档
```

```sh
npm test    # node --test "test/*.test.mjs"
```

本地调试（热更新需 dev:web 编译，否则改后重启 Web UI）：

```sh
dsh plugin --profile web add link:.
```

设计文档见 [docs/04-方案设计-定稿.md](docs/04-方案设计-定稿.md)。

## License

MIT

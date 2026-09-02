# dsh-chinese-poetry

DeepSeek Harness Web 的**免 token 诗词查询插件**：在会话页头新增「诗词」标签页（与「对话」「轨迹」同级，排在轨迹之后），支持搜索、筛选、飞花令、每日一首、收藏与 AI 解读。

- 数据源：免费公共 API [诗泉 poetry.palemoky.com](https://poetry.palemoky.com/)（37 万首诗词，**无需注册、无需 API Key**，CORS 全开）
- AI 解读 / 关联典故：透传给 **dsh 自己的会话**，消耗你已有的模型配额，无需额外申请任何模型 Key
- 纯本地数据（收藏 / 历史 / 缓存），不建任何后端
- 要求：`dsh web 0.1.0-rc.6` 或更新版本

English: [README.en.md](README.en.md)

## 安装

### 方式一：GitHub（发布后可用）

```sh
dsh plugin --profile web add github:<你的用户名>/dsh-chinese-poetry
```

### 方式二：本地源码安装（开发 / 调试）

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
3. 搜索框输入任意词 / 句，或按作者 / 朝代 / 体裁筛选；支持飞花令（单字）、随机、每日一首、简繁切换。
4. 点开某首诗的详情，可复制 / 生成卡片图 / 收藏；点 **AI 解读** 会把提示词写入输入框，**由你按回车确认**后由 dsh 会话回答（不自动提交）。

## 功能路线图

- [x] M0：插件骨架 + 「诗词」标签页注册（与对话 / 轨迹并排，order 20）
- [x] M1：数据层（fetch 封装、令牌桶限速、本地缓存、429 退避、离线兜底表）＋ 搜索 / 随机 / 每日一首 视图
- [x] M2：筛选器（朝代 / 体裁下拉 + 常用作者 chips → 筛一首）、全局简繁切换、复制（纯文本 / Markdown）
- [x] M3：飞花令（单字 → 随机含字诗，可连点换诗）、收藏（localStorage）、最近搜索、AI 解读（写入会话输入框，不自动发送）
- [x] M4a：朝代纠偏表（内置常见诗人朝代校正，纠正公共 API 对宋代等诗人的错标，展示时标注「已校正」）、最近搜索区块恒定显示（含空态占位）、AI 解读后自动切到「对话」视图、视图内容跨标签页保留
- [ ] M4：工具式 UI 打磨、分享卡片图、节日专题、双语文案
- [ ] M5：GitHub 开源发布

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

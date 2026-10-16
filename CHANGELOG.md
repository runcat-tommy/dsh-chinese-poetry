# Changelog

All notable changes to **dsh-chinese-poetry** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.1] - 2026-10-16

### Fixed
- **插件此前完全没有声明宿主版本要求，社区市场只能把它判为 `unknown`**：`package.json` 里没有任何 `peerDependencies`，而市场的判定逻辑（`dshmarket/lib/discovery-compatibility.js` 的 `deriveHostCompatibility`）只认三类声明——`engines.dsh`，以及 `peerDependencies` 里既在宿主包清单内、又匹配 `@deepseek-ai/dsh*` 的项。一条都没有 ⇒ 无法声明「我支持 0.2.x」，市场既不能说兼容、也不能据此给出安装建议。
  - 修复：新增 4 条宿主 peer 声明——`@deepseek-ai/dsh-client-runtime` / `dsh-client-locale` / `dsh-client-ui-slots` / `dsh-client-ui-conversation`，范围统一写 **`^0.1.0-rc.6 || ^0.2.0-rc.1`**（与 `dsh-unitverse` 1.1.2 起采用的写法一致）。这 4 条正是 `dsh.client.inject` 声明的那 4 个包，不多声明、不漏声明。
  - 为什么必须是两段式而不是只写 `^0.2.0-rc.1`：只声明 0.2.x 会让仍在 0.1.x 宿主上的用户直接被判 `incompatible`；两段式同时覆盖 `0.1.0-rc.6` / `0.1.0-rc.8` / `0.1.1-rc.2` / `0.2.0-rc.2` / `0.2.1-alpha.4` 五种宿主，全部判 `compatible`。**若日后两条线无法同时成立，以 0.2.x 为准，放弃 0.1.x。**
- 实测证据（本机宿主 `0.2.0-rc.2`，工具为仓库外的 `verify-compat.mjs`，判定直接复用 dshmarket 自己的函数）：改前 `unknown` → 改后 `compatible`，要求显示为 `^0.1.0-rc.6 || ^0.2.0-rc.1`；`profiles/web` 体检该插件无 peer 警告；Web GUI 内「诗词」标签页正常打开与查询。
- README（中/英）的「要求」表述由「`dsh web 0.1.0-rc.6` 或更新版本」改为「**0.1.0-rc.6+ 或 0.2.x**」，与新的声明范围一致。

### Notes
- 运行时代码零改动：`lib/client.js` / `lib/index.js` 与 1.4.0 完全一致，唯一改动是 `lib/client.js` 里 `PLUGIN_VERSION` 常量跟着版本号走（`1.4.0` → `1.4.1`），纯元数据（声明）+ 文档修复。

### Release
- npm：`dsh-chinese-poetry@1.4.1`
- GitHub：https://github.com/runcat-tommy/dsh-chinese-poetry

## [1.4.0] - 2026-09-11

### Changed
- The 诗词 tab now splits its three **independent** tools into **mutually exclusive, switchable panels** (搜索诗句 / 筛一首 / 飞花令) instead of stacking every control on one page. The segmented switcher sits at the top of the tool card and only the active tool's own controls render, each panel carrying a one-line hint.
- The recent-search block moved into the 搜索诗句 panel (still always visible there, with an empty-state placeholder).
- Global quick actions (随机一首 / 每日一首 / 节日 / 收藏 / 繁简) moved out of the tool card into their own row, so they no longer compete with the tool panels.
- The filter panel's action button is now labelled 随机取一首 / "Random pick" — it previously read 筛一首, which would have been identical to the new tab label.
- The active tool is remembered per session (view memory), so leaving the tab and coming back keeps the last tool.

## [1.3.0] - 2026-09-11

### Changed
- **UI redesign** of the 诗词 tab: the search box and its button now form one attached control group instead of a full-width input with the button stranded at the far right.
- Quick actions (随机一首 / 每日一首 / 节日 / 收藏 / 繁简) moved out of the search row into their own pill row, so the primary action and the secondary tools no longer compete for attention.
- Filters (朝代 / 体裁 / 作者 / 筛一首 / 重置 / 飞花令 / 常用诗人) regrouped into a single bordered toolbar card; 飞花令 is pushed to the right of that card and 常用诗人 sits on its own line inside it.
- Unified radius/spacing/color tokens, a clearer type scale and calmer dividers; result rows, festival cards and the footer got consistent card styling with hover states.
- View toggles (节日 / 收藏) now use an outlined "active" style instead of the solid primary style, reserving solid fill for the primary actions.

### Added
- Empty state: before the first search the view now shows a guidance card with one-tap sample keywords (明月 / 春风 / 江南 / 相思 / 登高 / 黄河) instead of a blank canvas.

### Fixed
- The "结果: 0" meta line is no longer rendered before any search has run, removing meaningless status noise on first open.

## [1.2.5] - 2026-09-03

### Changed
- README / README.en: added a UI preview screenshot (`assets/preview-zh.jpg` / `assets/preview-en.jpg`) and a share-card export example (`assets/image_export_demo.png`); refreshed the npm page accordingly.

## [1.2.4] - 2026-09-02

### Changed
- README / README.en: added the npm package install method (`dsh plugin --profile web add dsh-chinese-poetry`) as the primary option; refreshed the npm page accordingly.

## [1.2.3] - 2026-09-02

### Changed
- Moved the data-base credit line ("数据接口来自开源项目 palemoky/chinese-poetry-api…") from the top of the view down into the footer, stacked above the version line, so it no longer crowds the search toolbar.

## [1.2.2] - 2026-09-02

### Changed
- Share-card image now uses a **dynamic canvas height**: the card measures the wrapped title + body lines first, then sizes the canvas so long poems (将进酒 / 琵琶行, etc.) render in full instead of being clipped at the old fixed 860px. Short poems still floor at 860px for a consistent look.

## [1.2.1] - 2026-09-02

### Fixed
- Share-card image body layout: text lines could overlap (the first line of a long校勘 paragraph rendered on top of itself). The card now wraps every paragraph into a flat line list and draws each row with a strictly increasing y, so lines never collide. Added a fake-canvas test asserting monotonic line y and non-empty rows.

## [1.2.0] - 2026-09-02

### Added
- **Share card image**: render any poem as a parchment-style PNG card (title, author · dynasty, and the text) via `<canvas>`; a "卡片图 / Card" button in each poem's actions downloads it.
- **Festival topics**: a "节日 / Festivals" view with a grid of 7 festivals (春节 / 元宵 / 清明 / 端午 / 七夕 / 中秋 / 重阳). Picking one shows a featured (token-free) themed poem, plus "随机相关" (random poem containing the festival's keyword char) and "AI 应景" (hands off a prompt to your DSH composer, never auto-submits).
- Empty-state feedback in the search view after a query returns nothing.
- Exported `FESTIVALS`, `festivalById`, and `shareCardDataUrl` for testability.

### Changed
- Version bumped to **1.2.0** (`package.json` + `lib/client.js`).
- Tool-bar gains a "Festivals" toggle; the poetry result view is now a 3-way split (search / favs / festival).

## [1.1.0] - 2026-09-02

### Added
- In-view **credit note** at the top of the Poetry tab: attributes the data to the upstream open-source project `palemoky/chinese-poetry-api` and points slow-query feedback to that project. Bilingual (zh/en).
- **Bilingual README** (`README.md` + `README.en.md`) that documents the data base and every optimization the plugin adds, with the **dynasty correction table** called out explicitly.
- **CHANGELOG.md** in Keep a Changelog format.
- GitHub repository `Description` and `Topics` set via API to aid DSH plugin-marketplace discovery.

### Changed
- Version bumped to **1.1.0** (`package.json` + `lib/client.js`).
- Fixed the English README roadmap checkboxes (M1–M3 were still unchecked).
- Removed the not-yet-implemented "share card image" wording from the usage section (still a future milestone).

### Notes
- The plugin's data comes from the free public API `poetry.palemoky.com` (the `palemoky/chinese-poetry-api` project). It needs no registration, no API key, and has CORS open. Slow queries are usually the upstream service.
- The dynasty correction table fixes mislabeled Song-era poets (e.g. 曾丰 / 毕仲游 / 张侃, shown as 唐) by correcting the display and flagging "已校正".

## [0.5.0] - 2026-09-02

### Added
- **Dynasty correction table**: corrects the API's mislabeled dynasties for well-known poets and flags each correction with a "已校正" badge.
- **View content memory**: the Poetry tab's content survives switching between the Chat / Trajectory / Poetry tabs.
- **Always-visible recent-search block** with an empty-state placeholder and a Clear button.
- **Auto-switch to the Chat view** after AI explanation (never auto-submits).

## [0.4.1] - 2026-04-13

### Changed
- Feihua (飞花令) UX: empty-character clicks now guide the user and focus the input instead of silently searching.
- Recent-search chips moved to a prominent position and given a Clear button.
- AI explanation now attempts to switch the active view to the Chat tab.

## [0.4.0] - 2026-04-12

### Added
- Feihua (飞花令): enter one character, get random poems containing it; click again for another.
- Favorites (localStorage) and recent searches.
- AI explanation (writes a prompt into the DSH composer, never auto-submits).
- Offline fallback table (~90 poems) and honest 2-character search behavior.

## [0.3.0] - 2026-04-12

### Added
- Filters (dynasty / genre selects + common-author chips → "filter one").
- Global simplified / traditional (zh-Hans / zh-Hant) toggle.
- Copy as plain text or Markdown.

## [0.2.0] - 2026-04-12

### Added
- Robust data layer: fetch wrapper, token-bucket rate limiting, local cache, 429 exponential backoff, degraded (cache-only) mode.
- Search (3+ characters), random, and daily-poem views.

## [0.1.0] - 2026-04-12

### Added
- Plugin skeleton: "Poetry" conversation-view tab registered next to Chat / Trajectory (order 20).
- Host (`lib/index.js`) and browser (`lib/client.js`) halves with no build step.

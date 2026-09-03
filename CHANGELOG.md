# Changelog

All notable changes to **dsh-chinese-poetry** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.5] - 2026-04-13

### Changed
- README / README.en: added a UI preview screenshot (`assets/preview-zh.jpg` / `assets/preview-en.jpg`) and a share-card export example (`assets/image_export_demo.png`); refreshed the npm page accordingly.

## [1.2.4] - 2026-04-13

### Changed
- README / README.en: added the npm package install method (`dsh plugin --profile web add dsh-chinese-poetry`) as the primary option; refreshed the npm page accordingly.

## [1.2.3] - 2026-04-13

### Changed
- Moved the data-base credit line ("数据接口来自开源项目 palemoky/chinese-poetry-api…") from the top of the view down into the footer, stacked above the version line, so it no longer crowds the search toolbar.

## [1.2.2] - 2026-04-13

### Changed
- Share-card image now uses a **dynamic canvas height**: the card measures the wrapped title + body lines first, then sizes the canvas so long poems (将进酒 / 琵琶行, etc.) render in full instead of being clipped at the old fixed 860px. Short poems still floor at 860px for a consistent look.

## [1.2.1] - 2026-04-13

### Fixed
- Share-card image body layout: text lines could overlap (the first line of a long校勘 paragraph rendered on top of itself). The card now wraps every paragraph into a flat line list and draws each row with a strictly increasing y, so lines never collide. Added a fake-canvas test asserting monotonic line y and non-empty rows.

## [1.2.0] - 2026-04-13

### Added
- **Share card image**: render any poem as a parchment-style PNG card (title, author · dynasty, and the text) via `<canvas>`; a "卡片图 / Card" button in each poem's actions downloads it.
- **Festival topics**: a "节日 / Festivals" view with a grid of 7 festivals (春节 / 元宵 / 清明 / 端午 / 七夕 / 中秋 / 重阳). Picking one shows a featured (token-free) themed poem, plus "随机相关" (random poem containing the festival's keyword char) and "AI 应景" (hands off a prompt to your DSH composer, never auto-submits).
- Empty-state feedback in the search view after a query returns nothing.
- Exported `FESTIVALS`, `festivalById`, and `shareCardDataUrl` for testability.

### Changed
- Version bumped to **1.2.0** (`package.json` + `lib/client.js`).
- Tool-bar gains a "Festivals" toggle; the poetry result view is now a 3-way split (search / favs / festival).

## [1.1.0] - 2026-04-13

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

## [0.5.0] - 2026-04-13

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

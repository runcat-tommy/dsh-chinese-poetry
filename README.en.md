# dsh-chinese-poetry

A **token-free Chinese classical poetry plugin** for DeepSeek Harness Web: adds a "Poetry" tab to the session header (same ring as Chat / Trajectory, ordered right after Trajectory) with search, filters, 飞花令, a daily poem, favorites, and AI explanation.

- Data source: the free public API [诗泉 poetry.palemoky.com](https://poetry.palemoky.com/) (370k+ poems, **no registration, no API key**, CORS open)
- AI explanation / allusions: forwarded to **your own DSH session** — uses the model quota you already have, no extra model key needed
- All user data (favorites / history / cache) stays local; no backend is deployed
- Requires: `dsh web 0.1.0-rc.6` or newer

中文: [README.md](README.md)

## Data base

All poem corpus and query endpoints come from the open-source project **[palemoky/chinese-poetry-api](https://github.com/palemoky/chinese-poetry-api)** ([诗泉 poetry.palemoky.com](https://poetry.palemoky.com/)) — thanks to its author. The service is free, needs no registration or API key, and has CORS open. If your queries run slow, it is usually the upstream service — please report it to that project.

## What this plugin adds (optimizations over the base)

The base project exposes raw endpoints (paged by author / dynasty / genre, random, search, stats). This plugin wraps them into a query-oriented UI:

- **Token-free session tab**: registers a "Poetry" tab in the session header — pure front-end calls to the public API, no model key needed.
- **Dynasty correction table**: the API mislabels some poets (especially Song-era, e.g. 曾丰 / 毕仲游 / 张侃, shown as 唐). The plugin ships a correction table of well-known poets and corrects the display, flagging each one as "corrected".
- **Robust data layer**: token-bucket rate limiting (search 6/min, others 15/min), local caching, 429 exponential backoff, and degradation to cache / offline when failures stack up.
- **Offline fallback**: ~90 built-in poems keep the demo working offline; 2-character queries use local picks with an explicit note (only 3+ characters search the full 370k corpus).
- **飞花令 (Feihua)**: enter one character to get random poems containing it; click again for another.
- **Favorites / history / zh-Hans·zh-Hant**: stored locally (localStorage), with a global simplified/traditional toggle.
- **AI explanation**: drops a prompt into your DSH composer (**never auto-submits** — press Enter to confirm), reusing your existing model quota.
- **View UX**: auto-switches to the Chat view after AI explanation; the poetry tab's content survives switching among Chat / Trajectory / Poetry; the recent-search block is always visible.
- **Bilingual UI / docs**: both the UI copy and the README are provided in Chinese and English.

## Install

### From GitHub (once published)

```sh
dsh plugin --profile web add github:<your-username>/dsh-chinese-poetry
```

### Local source (development / debugging)

```sh
cd dsh-chinese-poetry
dsh plugin --profile web add .
```

For live development use the symlink form (changes take effect after restarting the Web UI):

```sh
dsh plugin --profile web add link:.
```

**Restart `dsh web`** after installing, then open any session — the header tab bar shows the **"Poetry"** tab.

> `dsh plugin` depends on pnpm: `npm i -g pnpm` if missing.

## Usage

1. Open a session (Chat / Trajectory / Poetry).
2. Click the **"Poetry"** tab in the session header.
3. Search any word/sentence, or filter by author / dynasty / genre; 飞花令 (single character), random, daily poem, and simplified/traditional switching are supported.
4. Open a poem's details to copy (plain text / Markdown) or favorite it; **AI Explain** fills the composer with a prompt — **press Enter yourself to confirm** (it never auto-submits).

## Roadmap

- [x] M0: plugin skeleton + "Poetry" tab registration (order 20, after Trajectory)
- [x] M1: data layer (fetch wrapper, token bucket rate limit, local cache, 429 backoff)
- [x] M2: search / filters / random / details / zh-Hans·zh-Hant / copy
- [x] M3: 飞花令, daily poem, favorites/history, AI-explain handoff
- [x] M4a: dynasty correction table, always-visible recent-search block, auto-switch to Chat after AI explain, view content memory
- [x] M4b: data-base credit note (in-view), bilingual UI/README copy, CHANGELOG, npm 1.1.0
- [ ] M4: deeper tool-style UI polish, share card image, festival topics
- [x] M5: open-source release on GitHub (runcat-tommy/dsh-chinese-poetry)

## Development

```
dsh-chinese-poetry/
├── package.json          # dsh.bundle.patch + dsh.client declaration
├── cordis.patch.yml      # profile-level bundle patch
├── lib/
│   ├── index.js          # node half (no-op host)
│   └── client.js         # browser half: conversation.view registration + view
├── test/                 # host smoke + client stub registration asserts
└── docs/                 # research / questionnaire / design docs
```

```sh
npm test    # node --test "test/*.test.mjs"
```

Design doc: [docs/04-方案设计-定稿.md](docs/04-方案设计-定稿.md) (Chinese).

## License

MIT

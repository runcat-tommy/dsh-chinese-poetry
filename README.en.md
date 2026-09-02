# dsh-chinese-poetry

A **token-free Chinese classical poetry plugin** for DeepSeek Harness Web: adds a "Poetry" tab to the session header (same ring as Chat / Trajectory, ordered right after Trajectory) with search, filters, 飞花令, a daily poem, favorites, and AI explanation.

- Data source: the free public API [诗泉 poetry.palemoky.com](https://poetry.palemoky.com/) (370k+ poems, **no registration, no API key**, CORS open)
- AI explanation / allusions: forwarded to **your own DSH session** — uses the model quota you already have, no extra model key needed
- All user data (favorites / history / cache) stays local; no backend is deployed
- Requires: `dsh web 0.1.0-rc.6` or newer

中文: [README.md](README.md)

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
4. Open a poem's details to copy / generate a share card / favorite it; **AI Explain** fills the composer with a prompt — **press Enter yourself to confirm** (it never auto-submits).

## Roadmap

- [x] M0: plugin skeleton + "Poetry" tab registration (order 20, after Trajectory)
- [ ] M1: data layer (fetch wrapper, token bucket rate limit, local cache, 429 backoff)
- [ ] M2: search / filters / random / details / zh-Hans·zh-Hant / copy
- [ ] M3: 飞花令, daily poem, favorites/history, AI-explain handoff
- [ ] M4: dense tool-style UI, share card image, festival topics, zh/en copy
- [ ] M5: open-source release on GitHub

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

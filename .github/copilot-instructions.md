# Project Guidelines

Japanese translation of [The Book of the Runtime (BOTR)](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/botr/) — a VitePress documentation site explaining .NET runtime internals.

## Build and Test

```bash
npm install          # Install dependencies (VitePress only)
npm run docs:dev     # Dev server at localhost with hot reload
npm run docs:build   # Production build → docs/.vitepress/dist
npm run docs:preview # Preview production build
```

Node.js 20 is used in CI. No linting or formatting tools are configured.

## Architecture

```
docs/                     # VitePress content root
├── .vitepress/config.mts # Site config (sidebar, nav, base URL)
├── index.md              # Home page (layout: home with hero/features)
├── <chapter>.md          # Chapter pages (29 files, flat structure)
└── images/               # PNG, SVG, Graphviz files
```

- Site base URL: `/the-book-of-the-runtime-ja/`
- Sidebar: single flat group listing all chapters (defined in `config.mts`)
- Deploy: GitHub Pages via `.github/workflows/deploy.yml` on push to `main`

## Content Conventions

### Page structure

Every chapter page follows this pattern:

```markdown
# 日本語タイトル

::: info 原文
この章の原文は [English Title](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/botr/<file>.md) です。
:::

本文...
```

- Title in Japanese as `#` heading (no frontmatter except `index.md`)
- `::: info 原文` block immediately after the title, linking to the original English source in `dotnet/runtime` repo (`main` branch)
- Exception: `porting-ryujit.md` and `ryujit-overview.md` link to `docs/design/coreclr/jit/` path

### Beginner annotations

Add `::: tip 💡 初心者向け補足` blocks to explain concepts for beginners. Use plain Japanese with analogies to familiar technologies (e.g., Java). Place them at first occurrence of technical terms or concept introductions.

```markdown
::: tip 💡 初心者向け補足
わかりやすい説明...
:::
```

### Translation in progress

Pages not yet fully translated end with:

```markdown
> 📖 この章はまだ翻訳途中です。[翻訳に貢献する](https://github.com/openjny/the-book-of-the-runtime-ja)
```

### Translation style

- Translate headings, body text, and author credits into Japanese
- Technical terms: katakana + English in parentheses — e.g., ガベージコレクション (GC), アロケータ (allocator)
- Preserve original author attribution: `著者: Name ([@handle](...)) - Year`
- Images: store in `docs/images/`, reference with relative paths `./images/filename.png`

## Adding a New Chapter

1. Create `docs/<chapter-name>.md` following the page structure above
2. Add the sidebar entry in [docs/.vitepress/config.mts](docs/.vitepress/config.mts) under `sidebar` items
3. Original sources: most from `docs/design/coreclr/botr/`, JIT-related from `docs/design/coreclr/jit/`

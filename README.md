# tikz-editor-embed-mirror

Static embeddable TikZ editor bundle for TeXlyre, designed to mirror the drawio-embed asset workflow.

This repository builds a static iframe-friendly editor from DominikPeters/tikz-editor. The build output has two top-level folders:

- `tikz-editor/` - the folder TeXlyre should install into `public/core/tikz-editor`
- `host/` - a GitHub Pages preview host that embeds `../tikz-editor/index.html` and exercises the postMessage API

## Build locally

```bash
npm install
TIKZ_EDITOR_REF=master npm run build
```

The generated static site is written to `dist/site/`.

## Build with GitHub Actions

The included workflow clones upstream TikZ editor, injects a small `apps/texlyre-embed` workspace app, builds the upstream parser/language/core packages, builds the static embed app, deploys GitHub Pages, and creates a release ZIP when a tag is pushed.

For production, prefer a commit SHA or release tag rather than `master`.

## GitHub Pages preview

After Pages deployment, open:

```text
https://texlyre.github.io/tikz-editor-embed-mirror/host/
```

The host page loads `../tikz-editor/index.html` and sends messages like:

```js
{ action: 'load', source: '...', autosave: 1 }
{ action: 'save' }
{ action: 'export', format: 'svg' }
```

## Embed postMessage API

The iframe sends JSON-stringified messages to its parent.

Iframe to host:

```js
{ event: 'init', version: '0.5.2-texlyre.1' }
{ event: 'loaded' }
{ event: 'change', source, xml: source }
{ event: 'autosave', source, xml: source, svg }
{ event: 'save', source, xml: source, svg }
{ event: 'export', format: 'svg', data: svg, source, xml: source, svg }
```

Host to iframe:

```js
{ action: 'load', source, autosave: 1 }
{ action: 'save' }
{ action: 'export', format: 'svg' }
{ action: 'export', format: 'tex' }
{ action: 'status', modified: false }
```

`xml` is intentionally aliased to the TikZ source so a TeXlyre wrapper can reuse parts of the draw.io save/export control flow with fewer changes.

## TeXlyre asset downloader entry

Once you create a tag like `v0.5.2-texlyre.1`, add the release ZIP to TeXlyre's `scripts/download-core-assets.cjs`. See `TEXLYRE_INTEGRATION.md` for the exact snippet.

## Notes

This embed deliberately uses an iframe even though TikZ editing could be done without one. It keeps the third-party editor/runtime isolated from TeXlyre, matching the production characteristics of the draw.io embed.

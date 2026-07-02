# TeXlyre integration notes

Add this asset to `scripts/download-core-assets.cjs` after publishing a release ZIP from this repo:

```js
{
	name: 'tikz-editor',
	version: 'v0.5.2-texlyre.1',
	url: (version) =>
		`https://github.com/TeXlyre/tikz-editor-embed-mirror/releases/download/${version}/tikz-editor-embed-${version}.zip`,
	dest: path.resolve(__dirname, '../public/core/tikz-editor'),
	extractPath: () => 'tikz-editor/',
}
```

Then TeXlyre's viewer can load:

```ts
const BASE_PATH = __BASE_PATH__;
const embedUrl = `${BASE_PATH}/core/tikz-editor/index.html`;
```

The iframe protocol mirrors the draw.io JSON-string postMessage flow:

```ts
iframe.contentWindow?.postMessage(JSON.stringify({
	action: 'load',
	source: tikzSource,
	autosave: 1,
}), tikzOrigin);
```

Save/export events use `source` and also alias it as `xml` so existing draw.io-style branches can be adapted with minimal changes.

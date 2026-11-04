import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const upstreamVersion = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')).version as string;

export default defineConfig({
	plugins: [react()],
	base: './',
	publicDir: path.resolve(__dirname, '../../packages/app/public'),
	define: {
		'import.meta.env.TIKZ_EDITOR_VERSION': JSON.stringify(upstreamVersion),
	},
	build: {
		outDir: 'dist',
		emptyOutDir: true,
		target: 'es2022',
		rollupOptions: {
			external: ['node:fs/promises'],
		},
	},
	resolve: {
		alias: [
			{ find: /^@tikz-editor\/app$/, replacement: path.resolve(__dirname, '../../packages/app/src/index.ts') },
			{ find: /^@tikz-editor\/app\/store$/, replacement: path.resolve(__dirname, '../../packages/app/src/store/store.ts') },
			{ find: /^@tikz-editor\/app\/settings\/useSettingsStore$/, replacement: path.resolve(__dirname, '../../packages/app/src/settings/useSettingsStore.ts') },
			{ find: /^@tikz-editor\/app\/app-menu$/, replacement: path.resolve(__dirname, '../../packages/app/src/app-menu/index.ts') },
			{ find: /^@tikz-editor\/app\/linked-file-sync$/, replacement: path.resolve(__dirname, '../../packages/app/src/linked-file-sync.ts') },
			{ find: /^@tikz-editor\/app\/platform\/current$/, replacement: path.resolve(__dirname, '../../packages/app/src/platform/current.ts') },
			{ find: /^@tikz-editor\/app\/platform\/types$/, replacement: path.resolve(__dirname, '../../packages/app/src/platform/types.ts') },
			{ find: /^@tikz-editor\/app\/store\/types$/, replacement: path.resolve(__dirname, '../../packages/app/src/store/types.ts') },
			{ find: /^@tikz-editor\/app\/workspace$/, replacement: path.resolve(__dirname, '../../packages/app/src/ui/workspace-apply.ts') },
			{ find: /^@tikz-editor\/lang-tikz$/, replacement: path.resolve(__dirname, '../../packages/lang-tikz/src/index.ts') },
			{ find: /^@tikz-editor\/lezer-tikz$/, replacement: path.resolve(__dirname, '../../packages/lezer-tikz/src/index.ts') },
			{ find: /^@tikz-editor\/lezer-tex$/, replacement: path.resolve(__dirname, '../../packages/lezer-tex/src/index.ts') },
			{ find: /^@tikz-editor\/core(?=\/|$)/, replacement: path.resolve(__dirname, '../../packages/core/src') },
		],
	},
	optimizeDeps: {
		exclude: ['mathlive'],
	},
	worker: {
		format: 'es',
	},
});

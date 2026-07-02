import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
	plugins: [react()],
	base: './',
	build: {
		outDir: 'dist',
		emptyOutDir: true,
		target: 'es2022',
	},
	resolve: {
		alias: {
			'@tikz-editor/lang-tikz': path.resolve(__dirname, '../../packages/lang-tikz/src/index.ts'),
			'@tikz-editor/lezer-tikz': path.resolve(__dirname, '../../packages/lezer-tikz/src/index.ts'),
			'tikz-editor': path.resolve(__dirname, '../../packages/core/src'),
		},
	},
});

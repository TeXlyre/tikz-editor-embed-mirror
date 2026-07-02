#!/usr/bin/env node
/*
 * Builds a static TeXlyre-friendly TikZ editor embed from DominikPeters/tikz-editor.
 *
 * Output:
 *   dist/site/tikz-editor/  - asset folder consumed by TeXlyre public/core/tikz-editor
 *   dist/site/host/         - GitHub Pages verification host
 */

const fs = require('fs-extra');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(repoRoot, '.build');
const upstreamDir = path.join(buildRoot, 'tikz-editor');
const embedAppDir = path.join(upstreamDir, 'apps', 'texlyre-embed');
const outRoot = path.join(repoRoot, 'dist', 'site');
const upstreamRepo = process.env.TIKZ_EDITOR_REPO || 'https://github.com/DominikPeters/tikz-editor.git';
const upstreamRef = process.env.TIKZ_EDITOR_REF || 'master';

async function run(cmd, args, opts = {}) {
	console.log(`$ ${cmd} ${args.join(' ')}`);
	await execFileAsync(cmd, args, {
		cwd: opts.cwd || repoRoot,
		stdio: 'inherit',
		maxBuffer: 1024 * 1024 * 128,
		env: { ...process.env, ...opts.env },
	});
}

function writeJson(file, value) {
	return fs.outputFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function cloneUpstream() {
	await fs.remove(buildRoot);
	await fs.ensureDir(buildRoot);
	await run('git', ['clone', '--depth', '1', '--branch', upstreamRef, upstreamRepo, upstreamDir]);
}

async function createEmbedWorkspace() {
	await fs.ensureDir(path.join(embedAppDir, 'src'));

	await writeJson(path.join(embedAppDir, 'package.json'), {
		name: '@texlyre/tikz-editor-embed',
		private: true,
		version: '0.5.2-texlyre.1',
		type: 'module',
		scripts: {
			build: 'vite build',
			dev: 'vite --host 0.0.0.0',
		},
		dependencies: {
			'@codemirror/commands': '^6.10.2',
			'@codemirror/state': '^6.5.4',
			'@codemirror/view': '^6.39.14',
			'@tikz-editor/lang-tikz': '0.5.2',
			codemirror: '^6.0.2',
			react: '^19.0.0',
			'react-dom': '^19.0.0',
		},
		devDependencies: {
			'@vitejs/plugin-react': '^4.3.0',
			vite: '^6.0.0',
			typescript: '^5.7.0',
		},
	});

	await fs.outputFile(
		path.join(embedAppDir, 'index.html'),
		`<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>TikZ Editor Embed</title>
	</head>
	<body>
		<div id="root"></div>
		<script type="module" src="/src/main.tsx"></script>
	</body>
</html>
`,
	);

	await fs.outputFile(
		path.join(embedAppDir, 'vite.config.ts'),
		`import { defineConfig } from 'vite';
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
`,
	);

	await fs.outputFile(
		path.join(embedAppDir, 'src', 'main.tsx'),
		`import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { basicSetup, EditorView } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { tikzLanguage } from '@tikz-editor/lang-tikz';
import { renderTikzToSvgAsync } from 'tikz-editor/render';
import './styles.css';

type HostMessage = {
	action?: string;
	event?: string;
	source?: string;
	xml?: string;
	format?: string;
	autosave?: 0 | 1 | boolean;
	modified?: boolean;
};

type RenderState = {
	status: 'idle' | 'rendering' | 'ready' | 'error';
	svg: string;
	error: string | null;
	diagnostics: string[];
};

const DEFAULT_SOURCE = String.raw\`\\begin{tikzpicture}
  \\draw[thick, blue] (0,0) circle (1cm);
  \\node at (0,0) {TikZ};
\\end{tikzpicture}
\`;

function postToHost(message: Record<string, unknown>) {
	window.parent?.postMessage(JSON.stringify(message), '*');
}

function normalizeIncomingSource(message: HostMessage): string | null {
	if (typeof message.source === 'string') return message.source;
	if (typeof message.xml === 'string') return message.xml;
	return null;
}

function useDebouncedRender(source: string) {
	const [renderState, setRenderState] = useState<RenderState>({
		status: 'idle',
		svg: '',
		error: null,
		diagnostics: [],
	});
	const requestId = useRef(0);

	useEffect(() => {
		const currentRequest = ++requestId.current;
		setRenderState((state) => ({ ...state, status: 'rendering', error: null }));

		const timer = window.setTimeout(() => {
			void renderTikzToSvgAsync(source, {
				parse: { includeContextDefinitions: true },
				svg: { includeXmlns: true, padding: 12 },
			}).then((result) => {
				if (requestId.current !== currentRequest) return;
				const diagnostics = [
					...result.renderDiagnostics.map((item) => item.message),
					...result.svg.diagnostics.map((item) => item.message),
				];
				setRenderState({
					status: 'ready',
					svg: result.svg.svg,
					error: null,
					diagnostics,
				});
			}).catch((error: unknown) => {
				if (requestId.current !== currentRequest) return;
				setRenderState({
					status: 'error',
					svg: '',
					error: error instanceof Error ? error.message : String(error),
					diagnostics: [],
				});
			});
		}, 180);

		return () => window.clearTimeout(timer);
	}, [source]);

	return renderState;
}

function CodeEditor({ source, onChange, onSave }: { source: string; onChange: (source: string) => void; onSave: () => void }) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const onChangeRef = useRef(onChange);
	const onSaveRef = useRef(onSave);
	const languageCompartment = useMemo(() => new Compartment(), []);

	useEffect(() => {
		onChangeRef.current = onChange;
		onSaveRef.current = onSave;
	}, [onChange, onSave]);

	useEffect(() => {
		if (!hostRef.current || viewRef.current) return;
		const view = new EditorView({
			parent: hostRef.current,
			state: EditorState.create({
				doc: source,
				extensions: [
					basicSetup,
					keymap.of([
						indentWithTab,
						{
							key: 'Mod-s',
							run: () => {
								onSaveRef.current();
								return true;
							},
						},
					]),
					languageCompartment.of(tikzLanguage()),
					EditorView.lineWrapping,
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							onChangeRef.current(update.state.doc.toString());
						}
					}),
				],
			}),
		});
		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, [languageCompartment]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const current = view.state.doc.toString();
		if (current === source) return;
		view.dispatch({ changes: { from: 0, to: current.length, insert: source } });
	}, [source]);

	return <div className="code-editor" ref={hostRef} />;
}

function App() {
	const [source, setSource] = useState(DEFAULT_SOURCE);
	const [autosave, setAutosave] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const renderState = useDebouncedRender(source);
	const sourceRef = useRef(source);
	const renderStateRef = useRef(renderState);
	const autosaveRef = useRef(autosave);

	useEffect(() => { sourceRef.current = source; }, [source]);
	useEffect(() => { renderStateRef.current = renderState; }, [renderState]);
	useEffect(() => { autosaveRef.current = autosave; }, [autosave]);

	const emitSave = useCallback((event = 'save') => {
		postToHost({ event, source: sourceRef.current, xml: sourceRef.current, svg: renderStateRef.current.svg });
		setHasChanges(false);
	}, []);

	useEffect(() => {
		postToHost({ event: 'init', version: '0.5.2-texlyre.1' });

		const handleMessage = (event: MessageEvent) => {
			let message: HostMessage | null = null;
			if (typeof event.data === 'string') {
				try { message = JSON.parse(event.data) as HostMessage; } catch { return; }
			} else if (event.data && typeof event.data === 'object') {
				message = event.data as HostMessage;
			}
			if (!message) return;

			const action = message.action || message.event;
			if (action === 'load') {
				const incoming = normalizeIncomingSource(message);
				if (incoming != null) {
					setSource(incoming.trim() ? incoming : DEFAULT_SOURCE);
					setHasChanges(false);
				}
				setAutosave(Boolean(message.autosave));
				postToHost({ event: 'loaded' });
				return;
			}
			if (action === 'export') {
				const format = message.format || 'svg';
				postToHost({ event: 'export', format, data: format === 'tex' || format === 'tikz' ? sourceRef.current : renderStateRef.current.svg, source: sourceRef.current, xml: sourceRef.current, svg: renderStateRef.current.svg });
				return;
			}
			if (action === 'save') {
				emitSave('save');
				return;
			}
			if (action === 'status' && typeof message.modified === 'boolean') {
				setHasChanges(message.modified);
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [emitSave]);

	const handleChange = (nextSource: string) => {
		setSource(nextSource);
		setHasChanges(true);
		postToHost({ event: 'change', source: nextSource, xml: nextSource });
		if (autosaveRef.current) {
			window.setTimeout(() => {
				postToHost({ event: 'autosave', source: sourceRef.current, xml: sourceRef.current, svg: renderStateRef.current.svg });
			}, 0);
		}
	};

	return (
		<div className="embed-shell">
			<header className="toolbar">
				<strong>TikZ Editor</strong>
				<span className={hasChanges ? 'dirty' : 'clean'}>{hasChanges ? 'Modified' : 'Saved'}</span>
				<span className="spacer" />
				<button type="button" onClick={() => emitSave('save')}>Save</button>
				<button type="button" onClick={() => postToHost({ event: 'export', format: 'svg', data: renderState.svg, source, xml: source, svg: renderState.svg })}>Export SVG</button>
			</header>
			<main className="main">
				<section className="pane source-pane"><CodeEditor source={source} onChange={handleChange} onSave={() => emitSave('save')} /></section>
				<section className="pane preview-pane">
					<div className="preview-status">{renderState.status === 'rendering' ? 'Rendering...' : renderState.status}</div>
					{renderState.error ? <pre className="error">{renderState.error}</pre> : null}
					{renderState.diagnostics.length > 0 ? <ul className="diagnostics">{renderState.diagnostics.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
					<div className="svg-preview" dangerouslySetInnerHTML={{ __html: renderState.svg }} />
				</section>
			</main>
		</div>
	);
}

createRoot(document.getElementById('root')!).render(<App />);
`,
	);

	await fs.outputFile(path.join(embedAppDir, 'src', 'styles.css'), `html, body, #root { margin: 0; width: 100%; height: 100%; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111827; color: #e5e7eb; }
.embed-shell { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }
.toolbar { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid #374151; background: #0f172a; }
.toolbar button { border: 1px solid #4b5563; border-radius: 0.375rem; background: #1f2937; color: #f9fafb; padding: 0.35rem 0.6rem; cursor: pointer; }
.toolbar button:hover { background: #374151; }
.spacer { flex: 1; }
.clean { color: #86efac; }
.dirty { color: #fbbf24; }
.main { display: grid; grid-template-columns: minmax(18rem, 1fr) minmax(18rem, 1fr); min-height: 0; flex: 1; }
.pane { min-width: 0; min-height: 0; }
.source-pane { border-right: 1px solid #374151; }
.code-editor { height: 100%; }
.cm-editor { height: 100%; background: #0b1220; color: #e5e7eb; }
.cm-gutters { background: #0f172a !important; color: #94a3b8 !important; border-right-color: #334155 !important; }
.cm-activeLine, .cm-activeLineGutter { background: rgba(148, 163, 184, 0.12) !important; }
.cm-scroller { font-family: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.preview-pane { position: relative; display: flex; flex-direction: column; background: #f8fafc; color: #111827; }
.preview-status { padding: 0.35rem 0.6rem; font-size: 0.75rem; color: #475569; border-bottom: 1px solid #e2e8f0; background: #ffffff; }
.svg-preview { flex: 1; min-height: 0; overflow: auto; display: grid; place-items: center; padding: 1rem; }
.svg-preview svg { max-width: 100%; max-height: 100%; background: white; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18); }
.error, .diagnostics { margin: 0.75rem; padding: 0.75rem; border-radius: 0.375rem; background: #fee2e2; color: #7f1d1d; white-space: pre-wrap; }
@media (max-width: 760px) { .main { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; } .source-pane { border-right: 0; border-bottom: 1px solid #374151; } }
`);
}

async function installAndBuild() {
	await run('npm', ['install'], { cwd: upstreamDir });
	await run('npm', ['run', '-w', '@tikz-editor/lezer-tikz', 'build'], { cwd: upstreamDir });
	await run('npm', ['run', '-w', '@tikz-editor/lang-tikz', 'build'], { cwd: upstreamDir });
	await run('npm', ['run', '-w', '@tikz-editor/core', 'build'], { cwd: upstreamDir });
	await run('npm', ['run', '-w', '@texlyre/tikz-editor-embed', 'build'], { cwd: upstreamDir });
}

async function copyOutputs() {
	await fs.remove(outRoot);
	await fs.ensureDir(outRoot);
	await fs.copy(path.join(embedAppDir, 'dist'), path.join(outRoot, 'tikz-editor'));
	await fs.copy(path.join(repoRoot, 'host'), path.join(outRoot, 'host'));
	await fs.outputFile(path.join(outRoot, '.nojekyll'), '');
	await fs.outputFile(path.join(outRoot, 'README.txt'), `This folder is generated by tikz-editor-embed-mirror.\n\nTeXlyre asset path: public/core/tikz-editor/\nGitHub Pages verification host: /host/\nBuilt from: ${upstreamRepo} @ ${upstreamRef}\n`);
}

async function main() {
	await cloneUpstream();
	await createEmbedWorkspace();
	await installAndBuild();
	await copyOutputs();
	console.log('\nBuilt dist/site with tikz-editor/ and host/');
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

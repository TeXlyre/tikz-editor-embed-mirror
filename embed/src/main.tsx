import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
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

const DEFAULT_SOURCE = String.raw`\begin{tikzpicture}
  \draw[thick, blue] (0,0) circle (1cm);
  \node at (0,0) {TikZ};
\end{tikzpicture}
`;

function postToHost(message: Record<string, unknown>) {
	window.parent?.postMessage(JSON.stringify(message), '*');
}

function App() {
	const [source, setSource] = useState(DEFAULT_SOURCE);
	const [svg, setSvg] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState('rendering');
	const [autosave, setAutosave] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const sourceRef = useRef(source);
	const svgRef = useRef(svg);
	const autosaveRef = useRef(autosave);

	useEffect(() => { sourceRef.current = source; }, [source]);
	useEffect(() => { svgRef.current = svg; }, [svg]);
	useEffect(() => { autosaveRef.current = autosave; }, [autosave]);

	useEffect(() => {
		let cancelled = false;
		setStatus('rendering');
		const timer = window.setTimeout(() => {
			void renderTikzToSvgAsync(source, {
				parse: { includeContextDefinitions: true },
				svg: { includeXmlns: true, padding: 12 },
			}).then((result) => {
				if (cancelled) return;
				setSvg(result.svg.svg);
				setError(null);
				setStatus('ready');
			}).catch((err: unknown) => {
				if (cancelled) return;
				setSvg('');
				setError(err instanceof Error ? err.message : String(err));
				setStatus('error');
			});
		}, 150);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [source]);

	function emitSave(event = 'save') {
		postToHost({ event, source: sourceRef.current, xml: sourceRef.current, svg: svgRef.current });
		setHasChanges(false);
	}

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
				const incoming = typeof message.source === 'string' ? message.source : message.xml;
				if (typeof incoming === 'string') {
					setSource(incoming.trim() ? incoming : DEFAULT_SOURCE);
					setHasChanges(false);
				}
				setAutosave(Boolean(message.autosave));
				postToHost({ event: 'loaded' });
			} else if (action === 'save') {
				emitSave('save');
			} else if (action === 'export') {
				const format = message.format || 'svg';
				postToHost({
					event: 'export',
					format,
					data: format === 'tex' || format === 'tikz' ? sourceRef.current : svgRef.current,
					source: sourceRef.current,
					xml: sourceRef.current,
					svg: svgRef.current,
				});
			} else if (action === 'status' && typeof message.modified === 'boolean') {
				setHasChanges(message.modified);
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	function onSourceChange(nextSource: string) {
		setSource(nextSource);
		setHasChanges(true);
		postToHost({ event: 'change', source: nextSource, xml: nextSource });
		if (autosaveRef.current) {
			window.setTimeout(() => emitSave('autosave'), 0);
		}
	}

	return (
		<div className="embed-shell">
			<header className="toolbar">
				<strong>TikZ Editor</strong>
				<span className={hasChanges ? 'dirty' : 'clean'}>{hasChanges ? 'Modified' : 'Saved'}</span>
				<span className="spacer" />
				<button type="button" onClick={() => emitSave('save')}>Save</button>
				<button type="button" onClick={() => postToHost({ event: 'export', format: 'svg', data: svg, source, xml: source, svg })}>Export SVG</button>
			</header>
			<main className="main">
				<section className="source-pane">
					<textarea spellCheck={false} value={source} onChange={(event) => onSourceChange(event.target.value)} />
				</section>
				<section className="preview-pane">
					<div className="preview-status">{status}</div>
					{error ? <pre className="error">{error}</pre> : null}
					<div className="svg-preview" dangerouslySetInnerHTML={{ __html: svg }} />
				</section>
			</main>
		</div>
	);
}

createRoot(document.getElementById('root')!).render(<App />);

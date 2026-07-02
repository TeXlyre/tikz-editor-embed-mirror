import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@tikz-editor/app';
import { setActiveEditorPlatform } from '@tikz-editor/app/platform/current';
import { useEditorStore } from '@tikz-editor/app/store';
import type { EditorPlatform } from '@tikz-editor/app/platform/types';
import type { DocumentFileRef } from '@tikz-editor/app/store/types';
import './styles.css';

type HostMessage = {
	action?: string;
	event?: string;
	source?: string;
	xml?: string;
	format?: string;
	autosave?: 0 | 1 | boolean;
	fileName?: string;
	name?: string;
	modified?: boolean;
};

type PendingEditorMessage = {
	source: string;
	svg: string;
};

const WORKSPACE_KEY = 'tikz-editor:workspace';
const CHANGE_THROTTLE_MS = 250;
const AUTOSAVE_DEBOUNCE_MS = 1000;
const DEFAULT_SOURCE = String.raw`\begin{tikzpicture}
  \draw[thick, blue] (0,0) circle (1cm);
  \node at (0,0) {TikZ};
\end{tikzpicture}
`;

let autosaveEnabled = false;
let lastSavedSource = DEFAULT_SOURCE;
let lastKnownSvg = '';
let currentFileName = 'document.tikz';

function postToHost(message: Record<string, unknown>) {
	window.parent?.postMessage(JSON.stringify(message), '*');
}

function sourceFromMessage(message: HostMessage): string | null {
	if (typeof message.source === 'string') return message.source;
	if (typeof message.xml === 'string') return message.xml;
	return null;
}

function wantsSvg(format?: string) {
	return typeof format === 'string' && format.toLowerCase().includes('svg');
}

function makeExportPayload(format: string | undefined) {
	const source = useEditorStore.getState().source;
	const requestedSvg = wantsSvg(format);
	const data = requestedSvg ? lastKnownSvg : source;

	if (requestedSvg && !lastKnownSvg.trim()) {
		return {
			event: 'export',
			format: format ?? 'svg',
			error: 'SVG is not ready yet. Wait for the preview to finish rendering and try again.',
			source,
			xml: source,
			svg: '',
			data: '',
		};
	}

	return {
		event: 'export',
		format: format ?? 'tikz',
		data,
		source,
		xml: source,
		svg: lastKnownSvg,
	};
}

function makeFileRef(name = currentFileName): DocumentFileRef {
	return { kind: 'virtual', name };
}

function makeWorkspaceSeed(source: string, fileName = currentFileName) {
	return JSON.stringify({
		workspaceVersion: 2,
		documents: [{
			id: 'texlyre-document',
			title: fileName,
			source,
			savedSource: source,
			activeFigureId: null,
			fileRef: makeFileRef(fileName),
			diskRevision: null,
			lastKnownDiskSource: source,
			externalChangeStatus: 'none',
			assistantThreadId: null,
			assistantWorkspacePath: null,
			assistantFigurePath: null,
			assistantPreviewPath: null,
		}],
		tabOrder: ['texlyre-document'],
		activeDocumentId: 'texlyre-document',
		recentDocumentIds: ['texlyre-document'],
	});
}

function createMemoryPersistence(initialSource: string): EditorPlatform['persistence'] {
	const values = new Map<string, string>();
	values.set(WORKSPACE_KEY, makeWorkspaceSeed(initialSource));
	return {
		load: (key) => values.get(key) ?? null,
		save: (key, value) => {
			values.set(key, value);
		},
	};
}

function createEmbedPlatform(initialSource: string): EditorPlatform {
	return {
		id: 'texlyre-embed',
		persistence: createMemoryPersistence(initialSource),
		clipboard: {
			readText: async () => navigator.clipboard?.readText?.() ?? '',
			writeText: async (text) => { await navigator.clipboard?.writeText?.(text); },
		},
		menu: {
			usesNativeMenuBar: false,
			usesNativeContextMenus: false,
			syncNativeMenu: () => {},
			showNativeContextMenu: () => {},
		},
		window: {
			setDocumentState: ({ dirty }) => {
				postToHost({ event: 'status', modified: Boolean(dirty) });
			},
			openExternalUrl: (url) => {
				const opened = window.open(url, '_blank', 'noopener,noreferrer');
				return opened != null;
			},
			showMessage: ({ title, message, kind }) => {
				postToHost({ event: 'message', title, message, kind });
			},
		},
		files: {
			openText: async () => ({ source: lastSavedSource, fileRef: makeFileRef() }),
			saveText: async (text, options) => {
				lastSavedSource = text;
				currentFileName = options?.suggestedName ?? options?.fileRef?.name ?? currentFileName;
				postToHost({ event: 'save', source: text, xml: text, svg: lastKnownSvg, fileName: currentFileName });
				return { status: 'saved', fileRef: makeFileRef(currentFileName) };
			},
			exportFile: async (content, options) => {
				const format = options.mimeType || options.fileName;
				postToHost(wantsSvg(format) ? makeExportPayload(format) : { ...makeExportPayload(format), data: content });
				return true;
			},
		},
	};
}

function loadIntoEditor(source: string, fileName = currentFileName) {
	currentFileName = fileName;
	lastSavedSource = source;
	lastKnownSvg = '';
	const store = useEditorStore.getState();
	store.dispatch({ type: 'CODE_EDITED', source });
	store.dispatch({ type: 'MARK_DOCUMENT_SAVED', fileRef: makeFileRef(fileName), lastKnownDiskSource: source });
	postToHost({ event: 'loaded' });
}

function HostBridge() {
	const previousSourceRef = useRef<string | null>(null);
	const previousSvgRef = useRef<string>('');
	const pendingChangeRef = useRef<PendingEditorMessage | null>(null);
	const pendingAutosaveRef = useRef<PendingEditorMessage | null>(null);
	const changeTimerRef = useRef<number | null>(null);
	const autosaveTimerRef = useRef<number | null>(null);

	useEffect(() => {
		postToHost({ event: 'init', version: '0.5.2-texlyre.1' });

		const flushChange = () => {
			changeTimerRef.current = null;
			const pending = pendingChangeRef.current;
			pendingChangeRef.current = null;
			if (!pending) return;
			postToHost({ event: 'change', source: pending.source, xml: pending.source, svg: pending.svg });
		};

		const scheduleChange = (source: string, svg: string) => {
			pendingChangeRef.current = { source, svg };
			if (changeTimerRef.current !== null) return;
			changeTimerRef.current = window.setTimeout(flushChange, CHANGE_THROTTLE_MS);
		};

		const flushAutosave = () => {
			autosaveTimerRef.current = null;
			const pending = pendingAutosaveRef.current;
			pendingAutosaveRef.current = null;
			if (!pending) return;
			postToHost({ event: 'autosave', source: pending.source, xml: pending.source, svg: pending.svg });
		};

		const scheduleAutosave = (source: string, svg: string) => {
			pendingAutosaveRef.current = { source, svg };
			if (autosaveTimerRef.current !== null) {
				window.clearTimeout(autosaveTimerRef.current);
			}
			autosaveTimerRef.current = window.setTimeout(flushAutosave, AUTOSAVE_DEBOUNCE_MS);
		};

		const flushPendingEditorMessages = () => {
			if (changeTimerRef.current !== null) {
				window.clearTimeout(changeTimerRef.current);
				flushChange();
			}
			if (autosaveTimerRef.current !== null) {
				window.clearTimeout(autosaveTimerRef.current);
				flushAutosave();
			}
		};

		const unsubscribe = useEditorStore.subscribe((state) => {
			const nextSvg = state.snapshot.svg?.svg ?? '';
			if (nextSvg && nextSvg !== previousSvgRef.current) {
				previousSvgRef.current = nextSvg;
				lastKnownSvg = nextSvg;
			}

			if (previousSourceRef.current === null) {
				previousSourceRef.current = state.source;
				return;
			}
			if (state.source === previousSourceRef.current) return;
			previousSourceRef.current = state.source;
			scheduleChange(state.source, lastKnownSvg);
			if (autosaveEnabled) {
				scheduleAutosave(state.source, lastKnownSvg);
			}
		});

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
				autosaveEnabled = Boolean(message.autosave);
				pendingChangeRef.current = null;
				pendingAutosaveRef.current = null;
				loadIntoEditor(sourceFromMessage(message) ?? DEFAULT_SOURCE, message.fileName ?? message.name ?? currentFileName);
			} else if (action === 'save') {
				flushPendingEditorMessages();
				const source = useEditorStore.getState().source;
				lastSavedSource = source;
				useEditorStore.getState().dispatch({ type: 'MARK_DOCUMENT_SAVED', fileRef: makeFileRef(currentFileName), lastKnownDiskSource: source });
				postToHost({ event: 'save', source, xml: source, svg: lastKnownSvg, fileName: currentFileName });
			} else if (action === 'export') {
				flushPendingEditorMessages();
				postToHost(makeExportPayload(message.format));
			} else if (action === 'status' && typeof message.modified === 'boolean' && !message.modified) {
				useEditorStore.getState().dispatch({ type: 'MARK_DOCUMENT_SAVED', fileRef: makeFileRef(currentFileName), lastKnownDiskSource: useEditorStore.getState().source });
			}
		};

		window.addEventListener('message', handleMessage);
		return () => {
			unsubscribe();
			window.removeEventListener('message', handleMessage);
			if (changeTimerRef.current !== null) window.clearTimeout(changeTimerRef.current);
			if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
		};
	}, []);

	return null;
}

setActiveEditorPlatform(createEmbedPlatform(DEFAULT_SOURCE));

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<HostBridge />
		<App />
	</StrictMode>,
);

const frame = document.getElementById('tikzFrame');
const source = document.getElementById('source');
const log = document.getElementById('log');
const MAX_LOG_ENTRIES = 100;
const STORAGE_KEY = 'texlyre:tikz-editor:storage';
const logEntries = [];

function getFrameSrc() {
	const storage = window.localStorage.getItem(STORAGE_KEY);
	return `../tikz-editor/index.html${storage ? `#storage=${encodeURIComponent(storage)}` : ''}`;
}

frame.src = getFrameSrc();

function appendLog(label, payload) {
	const at = new Date().toISOString();
	const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
	logEntries.push(`[${at}] ${label}\n${text}\n`);
	while (logEntries.length > MAX_LOG_ENTRIES) {
		logEntries.shift();
	}
	log.textContent = `${logEntries.join('\n')}\n`;
	log.scrollTop = log.scrollHeight;
}

function post(message) {
	appendLog('HOST → IFRAME', message);
	frame.contentWindow?.postMessage(JSON.stringify(message), '*');
}

window.addEventListener('message', (event) => {
	let payload = event.data;
	if (typeof payload === 'string') {
		try { payload = JSON.parse(payload); } catch {}
	}
	appendLog('IFRAME → HOST', payload);

	if (payload && typeof payload === 'object') {
		if (payload.event === 'persistence-save' && typeof payload.key === 'string' && typeof payload.value === 'string') {
			const storage = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
			storage[payload.key] = payload.value;
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
		}
		if (payload.event === 'init') {
			post({ action: 'load', source: source.value, autosave: 1 });
		}
		if ((payload.event === 'change' || payload.event === 'autosave' || payload.event === 'save') && typeof payload.source === 'string') {
			source.value = payload.source;
		}
	}
});

document.getElementById('load').addEventListener('click', () => {
	post({ action: 'load', source: source.value, autosave: 1 });
});

document.getElementById('save').addEventListener('click', () => {
	post({ action: 'save' });
});

document.getElementById('exportSvg').addEventListener('click', () => {
	post({ action: 'export', format: 'svg' });
});

document.getElementById('clearLog').addEventListener('click', () => {
	logEntries.length = 0;
	log.textContent = '';
});

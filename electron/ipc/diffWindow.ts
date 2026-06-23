import { BrowserWindow } from 'electron'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Mirrors src/components/DiffView.tsx lineClass(), but emits CSS class names.
function lineClass(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'add'
  if (line.startsWith('-') && !line.startsWith('---')) return 'del'
  if (line.startsWith('@@')) return 'hunk'
  return ''
}

function buildHtml(title: string, diff: string): string {
  const body = diff
    .split('\n')
    .map((l) => `<div class="${lineClass(l)}">${escapeHtml(l) || ' '}</div>`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  header { position: sticky; top: 0; padding: 6px 10px; border-bottom: 1px solid #8884;
           background: Canvas; color: GrayText; font-size: 11px; }
  pre { margin: 0; padding: 4px 0; line-height: 1.4; }
  pre > div { padding: 0 10px; white-space: pre-wrap; word-break: break-all; }
  .add { background: #e6ffec; color: #03543f; }
  .del { background: #ffebe9; color: #842029; }
  .hunk { color: #0969da; }
  @media (prefers-color-scheme: dark) {
    body { background: #1e1e1e; color: #d4d4d4; }
    .add { background: #0d2818; color: #6fd89a; }
    .del { background: #2d0f12; color: #f4a3a3; }
    .hunk { color: #6cb6ff; }
  }
</style></head>
<body><header>${escapeHtml(title)}</header><pre>${body}</pre></body></html>`
}

export function openDiffWindow(title: string, diff: string, parent?: BrowserWindow): void {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    parent,
    title,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  const html = buildHtml(title, diff)
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
}

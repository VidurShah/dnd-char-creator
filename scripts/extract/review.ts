/**
 * Renders data/packs/_pending/<book>.json into a self-contained HTML review
 * page. Approve/reject state is kept in the page (localStorage-backed, so a
 * refresh doesn't lose progress) and exported via a "Download decisions"
 * button — feed that file into compile.ts to produce the final pack.
 *
 * Usage: pnpm extract:review tashas
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function main() {
  const bookId = process.argv[2];
  if (!bookId) {
    console.error('Usage: tsx scripts/extract/review.ts <bookId>');
    process.exit(1);
  }

  const pendingPath = path.resolve(import.meta.dirname, '../../data/packs/_pending', `${bookId}.json`);
  const pending = JSON.parse(readFileSync(pendingPath, 'utf-8')) as {
    entry: { id: string; name: string; kind: string };
    page: number;
    verbatimQuote: string;
    confidence: number;
    status: string;
    conflictNote?: string;
  }[];

  const sorted = [...pending].sort((a, b) => a.confidence - b.confidence);

  const rows = sorted
    .map(
      (p, i) => `
    <div class="entry" data-id="${escapeHtml(p.entry.id)}" data-index="${i}">
      <div class="entry-header">
        <span class="kind">${escapeHtml(p.entry.kind)}</span>
        <h3>${escapeHtml(p.entry.name)}</h3>
        <span class="confidence conf-${p.confidence < 0.5 ? 'low' : p.confidence < 0.8 ? 'mid' : 'high'}">${(p.confidence * 100).toFixed(0)}%</span>
        <span class="page">p.${p.page}</span>
      </div>
      ${p.conflictNote ? `<p class="conflict">${escapeHtml(p.conflictNote)}</p>` : ''}
      <blockquote>${escapeHtml(p.verbatimQuote)}</blockquote>
      <div class="actions">
        <button class="approve" onclick="setStatus(${i}, 'approved')">Approve</button>
        <button class="reject" onclick="setStatus(${i}, 'rejected')">Reject</button>
        <span class="status" id="status-${i}">pending</span>
      </div>
    </div>`,
    )
    .join('\n');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Review: ${escapeHtml(bookId)}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; background: #f4ecd8; color: #241c15; }
  h1 { font-size: 1.5rem; }
  .toolbar { position: sticky; top: 0; background: #f4ecd8; padding: 1rem 0; border-bottom: 2px solid #24151530; margin-bottom: 1rem; display: flex; gap: 0.5rem; align-items: center; }
  .entry { border: 2px solid #24151530; padding: 1rem; margin-bottom: 1rem; background: #fbf7ef; }
  .entry-header { display: flex; align-items: baseline; gap: 0.75rem; }
  .entry-header h3 { margin: 0; flex: 1; }
  .kind { font-family: monospace; font-size: 0.7rem; text-transform: uppercase; background: #24151520; padding: 2px 6px; }
  .confidence { font-family: monospace; font-size: 0.75rem; padding: 2px 6px; }
  .conf-low { background: #a63d2f33; }
  .conf-mid { background: #b1502f33; }
  .conf-high { background: #5c7a5a33; }
  .page { font-family: monospace; font-size: 0.75rem; color: #6e6252; }
  blockquote { font-style: italic; color: #4a4136; border-left: 3px solid #24151530; padding-left: 0.75rem; margin: 0.5rem 0; }
  .conflict { color: #a63d2f; font-size: 0.85rem; }
  .actions { display: flex; gap: 0.5rem; align-items: center; }
  button { font-family: monospace; text-transform: uppercase; font-size: 0.75rem; padding: 4px 10px; border: 2px solid #241615; background: transparent; cursor: pointer; }
  button.approve.active { background: #5c7a5a; color: white; }
  button.reject.active { background: #a63d2f; color: white; }
  .status { font-family: monospace; font-size: 0.75rem; }
  #download { padding: 8px 16px; background: #241615; color: #fbf7ef; }
</style>
</head>
<body>
<div class="toolbar">
  <h1 style="flex:1">Review: ${escapeHtml(bookId)} (${pending.length} entries)</h1>
  <button id="download" onclick="downloadDecisions()">Download decisions.json</button>
</div>
${rows}
<script>
  const STORAGE_KEY = 'review-${escapeHtml(bookId)}';
  const ids = ${JSON.stringify(sorted.map((p) => p.entry.id))};
  let decisions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

  function render() {
    ids.forEach((id, i) => {
      const status = decisions[id] || 'pending';
      document.getElementById('status-' + i).textContent = status;
      const entryEl = document.querySelector('[data-index="' + i + '"]');
      entryEl.querySelector('.approve').classList.toggle('active', status === 'approved');
      entryEl.querySelector('.reject').classList.toggle('active', status === 'rejected');
    });
  }

  function setStatus(i, status) {
    const id = ids[i];
    decisions[id] = decisions[id] === status ? 'pending' : status;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
    render();
  }

  function downloadDecisions() {
    const blob = new Blob([JSON.stringify(decisions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '${bookId}-decisions.json';
    a.click();
  }

  render();
</script>
</body>
</html>`;

  const outPath = path.resolve(import.meta.dirname, '../../data/packs/_pending', `${bookId}-review.html`);
  writeFileSync(outPath, html);
  console.log(`Wrote review page to ${outPath}`);
  console.log(`Open it in a browser, approve/reject entries, download decisions.json into the same folder, then run:`);
  console.log(`  pnpm extract:compile ${bookId}`);
}

main();

/**
 * Opens the browser's print dialog for a standalone HTML document without
 * navigating away or opening a tab: the document is loaded into a hidden
 * iframe and printed from there. Everything is local, so it works offline —
 * which matters, since a printed sheet is the backup for a dead phone.
 */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  frame.srcdoc = html;

  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) {
      frame.remove();
      return;
    }
    // print() blocks until the dialog closes in most browsers, but not all
    // (mobile Safari returns at once), so removal waits for afterprint with a
    // generous fallback rather than yanking the frame out from under the dialog.
    const cleanup = () => setTimeout(() => frame.remove(), 500);
    win.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => frame.isConnected && frame.remove(), 60_000);
    win.focus();
    win.print();
  };

  document.body.appendChild(frame);
}

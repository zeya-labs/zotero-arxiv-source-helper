// SPDX-License-Identifier: AGPL-3.0-or-later
const notices = new WeakMap<object, { element: any; timer: any }>();
/** Stay in the owning document's CSS viewport; native screen coordinates mix DPI units. */
export function showNotice(win: any, message: string) {
  if (!win?.document?.createElementNS || win.closed) return;
  removeNotice(win);
  const element = win.document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  );
  element.id = "arxiv-source-helper-notice";
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.textContent = message;
  Object.assign(element.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "2147483647",
    maxWidth: "min(420px, calc(100vw - 40px))",
    boxSizing: "border-box",
    padding: "10px 16px",
    borderRadius: "8px",
    background: "#28323d",
    color: "#fff",
    boxShadow: "0 3px 14px #0003",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
    lineHeight: "1.5",
    fontWeight: "400",
    overflowWrap: "anywhere",
    pointerEvents: "none",
  });
  win.document.documentElement.appendChild(element);
  const timer = win.setTimeout(() => removeNotice(win), 2500);
  notices.set(win, { element, timer });
}
export function removeNotice(win: any) {
  const notice = notices.get(win);
  if (!notice) return;
  win.clearTimeout(notice.timer);
  notice.element.remove();
  notices.delete(win);
}

import { encode } from "uqr";
import { mobileHandoffUrl } from "./handoff";

export class MobileHandoff {
  private previous = "";
  private panel: HTMLElement;
  constructor(private root: HTMLElement, signal: AbortSignal) {
    this.panel = root.querySelector<HTMLElement>("[data-ar-mobile-panel]")!;
    root.querySelector("[data-ar-mobile-close]")?.addEventListener("click", () => {
      this.panel.hidden = true; root.querySelector<HTMLButtonElement>("[data-ar-mobile]")?.focus();
    }, { signal });
  }
  show(variant: string) {
    this.panel.hidden = false; this.update(variant);
    this.panel.focus();
  }
  update(variant: string) {
    if (this.panel.hidden) return;
    const document = this.root.ownerDocument;
    const current = document.location.href;
    const url = mobileHandoffUrl(this.root.dataset.handoffBase || current, current,
      this.root.dataset.handoffId || "", variant);
    const code = this.root.querySelector<HTMLElement>("[data-ar-qr]")!;
    const link = this.root.querySelector<HTMLAnchorElement>("[data-ar-mobile-link]")!;
    const unavailable = this.root.querySelector<HTMLElement>("[data-ar-mobile-unavailable]")!;
    unavailable.hidden = !!url; code.hidden = !url; link.hidden = !url;
    if (!url) { code.replaceChildren(); link.removeAttribute("href"); this.previous = ""; return; }
    if (this.previous === url) return;
    link.href = url;
    // Build SVG from QR matrix locally; no third-party QR service receives the URL.
    const { data, size } = encode(url, { ecc: "M", border: 4 });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`); svg.setAttribute("aria-hidden", "true");
    const background = document.createElementNS(svg.namespaceURI, "rect");
    background.setAttribute("width", String(size)); background.setAttribute("height", String(size)); background.setAttribute("fill", "white");
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("fill", "black");
    path.setAttribute("d", data.flatMap((row, y) => row.map((dark, x) => dark ? `M${x} ${y}h1v1h-1z` : "")).join(""));
    svg.setAttribute("shape-rendering", "crispEdges"); svg.append(background, path); code.replaceChildren(svg);
    this.previous = url;
  }
}

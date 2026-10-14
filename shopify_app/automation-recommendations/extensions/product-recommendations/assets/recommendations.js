(() => {
  if (customElements.get("automation-product-recommendations")) return;
  class ProductRecommendations extends HTMLElement {
    connectedCallback() {
      this.hidden = false;
      this.controller = new AbortController();
      this.load();
    }
    disconnectedCallback() { this.controller?.abort(); }
    hideEmpty() {
      if (!this.querySelector("[data-cards]")?.children.length && this.dataset.editor !== "true") this.hidden = true;
    }
    async load() {
      if (!this.dataset.source || this.dataset.complete === "true") { this.hideEmpty(); return; }
      try {
        const url = new URL(this.dataset.endpoint, location.origin);
        if (url.origin !== location.origin) { this.hideEmpty(); return; }
        url.searchParams.set("product_id", this.dataset.source);
        url.searchParams.set("section_id", this.dataset.section);
        url.searchParams.set("limit", this.dataset.limit);
        url.searchParams.set("intent", "related");
        const timer = setTimeout(() => this.controller.abort(), 10000);
        let response;
        try { response = await fetch(url, { signal: this.controller.signal, credentials: "same-origin" }); }
        finally { clearTimeout(timer); }
        if (!response.ok) throw new Error("Recommendations unavailable");
        const html = new DOMParser().parseFromString(await response.text(), "text/html");
        const block = Array.from(html.querySelectorAll("automation-product-recommendations"))
          .find((candidate) => candidate.dataset.blockId === this.dataset.blockId);
        if (!this.isConnected || !block) return;
        const nextCards = block.querySelector("[data-cards]");
        const cards = this.querySelector("[data-cards]");
        if (nextCards?.children.length && cards) {
          cards.replaceChildren(...nextCards.childNodes);
          const notice = this.querySelector("[data-notice]");
          if (notice) notice.hidden = block.querySelector("[data-notice]")?.hidden ?? true;
        }
      } catch { /* Preserve curated fallback/demo cards; hide empty output for shoppers. */ }
      this.hideEmpty();
    }
  }
  customElements.define("automation-product-recommendations", ProductRecommendations);
})();

(function () {
  "use strict";
  if (customElements.get("leather-vision")) return;

  class LeatherVision extends HTMLElement {
    connectedCallback() {
      if (this.controller) return;
      this.controller = new AbortController();
      queueMicrotask(() => { if (this.isConnected) this.init(); });
    }

    disconnectedCallback() {
      this.controller?.abort();
      this.controller = null;
      clearTimeout(this.pollTimer);
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
      this.revokeImages();
    }

    revokeImages() {
      (this.imageUrls || []).forEach((url) => URL.revokeObjectURL(url));
      this.imageUrls = [];
    }

    init() {
      const signal = this.controller.signal;
      this.copy = JSON.parse(this.dataset.lvCopy || "{}");
      this.form = this.querySelector("[data-lv-form]");
      this.imageInput = this.querySelector("[data-lv-image]");
      this.preview = this.querySelector("[data-lv-preview]");
      this.statusEl = this.querySelector("[data-lv-status]");
      this.demoEl = this.querySelector("[data-lv-demo]");
      this.errorEl = this.querySelector("[data-lv-error]");
      this.results = this.querySelector("[data-lv-results]");
      this.variationsEl = this.querySelector("[data-lv-variations]");
      this.submitBtn = this.querySelector("[data-lv-submit]");
      this.cartBtn = this.querySelector("[data-lv-cart]");
      this.variantInput = this.querySelector("[data-lv-variant]");
      this.selected = null;
      this.cartBusy = false;
      this.proxyPath = (this.dataset.proxyPath || "/apps/leather-vision").replace(/\/$/, "");
      if (!/^\/(apps|a|community|tools)\/[a-zA-Z0-9_-]+$/.test(this.proxyPath)) {
        this.setError(this.copy.error_generic);
        this.submitBtn.disabled = true;
        return;
      }
      this.storageKey = "leather-vision:" + this.proxyPath + ":" + this.dataset.blockId;
      this.imageInput.addEventListener("change", () => this.previewImage(), { signal });
      this.form.addEventListener("submit", (event) => { event.preventDefault(); void this.generate(); }, { signal });
      this.cartBtn?.addEventListener("click", () => { void this.addToCart(); }, { signal });
      try {
        const saved = JSON.parse(sessionStorage.getItem(this.storageKey) || "null");
        if (saved && /^[a-f0-9-]{36}$/.test(saved.id) && /^[a-f0-9]{64}$/.test(saved.token)) {
          this.job = saved;
          this.deadline = Date.now() + 30 * 60 * 1000;
          this.setBusy(true);
          void this.poll();
        }
      } catch { /* Storage can be disabled by the browser. */ }
      this.providerReady = this.configureProvider();
    }

    async configureProvider() {
      try {
        const config = await this.api("/config");
        if (config.provider !== "puter" || !this.isConnected) return;
        if (!window.LeatherVisionPuter) await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = this.dataset.puterScript;
          const timer = setTimeout(() => { script.remove(); reject(); }, 30000);
          script.onload = () => { clearTimeout(timer); resolve(); };
          script.onerror = () => { clearTimeout(timer); script.remove(); reject(); };
          document.head.append(script);
        });
        if (!this.isConnected) return;
        this.puter = new window.LeatherVisionPuter(this, config.puter);
        await this.puter.init();
      } catch {
        if (this.isConnected) this.setError(this.copy.error_connection);
        this.providerError = true;
      }
    }

    setStatus(text) { this.statusEl.textContent = text || ""; this.statusEl.hidden = !text; }
    setError(text) { this.errorEl.textContent = text || ""; this.errorEl.hidden = !text; }
    setBusy(busy) {
      this.form.setAttribute("aria-busy", String(busy));
      this.form.querySelectorAll("input, select, textarea, button").forEach((el) => { el.disabled = busy; });
      this.submitBtn.textContent = busy ? this.copy.generating : this.copy.submit;
    }
    persist() {
      try {
        if (this.job) sessionStorage.setItem(this.storageKey, JSON.stringify(this.job));
        else sessionStorage.removeItem(this.storageKey);
      } catch { /* The current page still works without storage. */ }
    }

    previewImage() {
      this.setError("");
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
      this.preview.replaceChildren();
      this.preview.hidden = true;
      const file = this.imageInput.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { this.setError(this.copy.error_size); this.imageInput.value = ""; return; }
      this.previewUrl = URL.createObjectURL(file);
      const img = document.createElement("img");
      img.src = this.previewUrl;
      img.alt = this.copy.upload_preview;
      img.className = "lv__preview-img";
      this.preview.append(img);
      this.preview.hidden = false;
    }

    async api(path, options = {}) {
      const response = await fetch(this.proxyPath + path, {
        ...options, credentials: "same-origin",
        signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(90000)]),
        headers: { Accept: "application/json", "X-Leather-Vision": "1",
          ...(this.job ? { Authorization: "Bearer " + this.job.token } : {}),
          ...options.headers },
      });
      let body;
      try { body = await response.json(); } catch {
        const message = [502, 503, 504].includes(response.status)
          ? (this.copy.error_connection || this.copy.error_generic) + " (HTTP " + response.status + ")"
          : this.copy.error_generic;
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }
      if (!response.ok) {
        const error = new Error(body.error || this.copy.error_generic);
        error.status = response.status;
        throw error;
      }
      return body;
    }

    async generate() {
      if (this.submitBtn.disabled) return;
      this.setError("");
      const file = this.imageInput.files[0];
      if (file && file.size > 8 * 1024 * 1024) { this.setError(this.copy.error_size); return; }
      if (!file && !this.form.elements.productType.value && !this.form.elements.instructions.value.trim()) {
        this.setError(this.copy.error_details); return;
      }
      try {
        await this.providerReady;
        if (this.providerError) { this.setError(this.copy.error_connection); return; }
        if (this.puter && !this.puter.connected()) { this.setError(this.copy.puter_connect_required); return; }
      } catch { this.setError(this.copy.error_connection); return; }
      if (!this.isConnected || this.submitBtn.disabled) return;
      clearTimeout(this.pollTimer);
      this.results.hidden = true;
      if (this.demoEl) this.demoEl.hidden = true;
      this.variationsEl.replaceChildren();
      this.revokeImages();
      this.selected = null;
      if (this.cartBtn) this.cartBtn.disabled = true;
      this.job = null;
      this.persist();
      const body = new FormData(this.form);
      if (!file) body.delete("image");
      this.setBusy(true);
      this.setStatus(file ? this.copy.uploading : this.copy.generating);
      try {
        const result = await this.api("/generations", { method: "POST", body });
        this.job = { id: result.generationId, token: result.token };
        this.persist();
        this.deadline = Date.now() + 30 * 60 * 1000;
        this.pollFailures = 0;
        if (result.clientGeneration) {
          if (!this.puter) throw new Error(this.copy.puter_connect_required);
          await this.puter.generate(result.clientGeneration);
        }
        void this.poll();
      } catch (error) {
        if (!this.isConnected) return;
        this.setBusy(false);
        this.setStatus("");
        this.setError(error.message || this.copy.error_generic);
      }
    }

    async poll() {
      if (!this.isConnected || !this.job) return;
      try {
        const result = await this.api("/generations/" + encodeURIComponent(this.job.id));
        if (result.status === "awaiting_client") {
          const body = new FormData(); body.set("action", "cancel");
          await this.api("/generations/" + this.job.id + "/result", { method: "POST", body }).catch(() => {});
          this.setBusy(false); this.setStatus(""); this.setError(this.copy.puter_interrupted);
          this.job = null; this.persist(); return;
        }
        this.pollFailures = 0;
        if (this.demoEl) this.demoEl.hidden = !result.demo;
        if (result.status === "ready") {
          this.setBusy(false);
          this.setStatus(result.demo ? this.copy.demo_done : this.copy.done);
          this.renderVariations(result.variations || [], result.selectedVariation);
          return;
        }
        if (result.status === "failed") {
          this.setBusy(false); this.setStatus(""); this.setError(result.error || this.copy.error_generic);
          this.job = null; this.persist(); return;
        }
        if (Date.now() > this.deadline) {
          this.setBusy(false); this.setStatus(""); this.setError(this.copy.error_timeout); return;
        }
        this.setStatus(this.copy.generating);
      } catch (error) {
        if (!this.isConnected) return;
        if (error.status === 403 || error.status === 404 || Date.now() > this.deadline) {
          this.setBusy(false); this.setStatus(""); this.setError(error.message || this.copy.error_generic);
          this.job = null; this.persist(); return;
        }
        this.pollFailures = (this.pollFailures || 0) + 1;
        this.setStatus(this.copy.reconnecting);
      }
      this.pollTimer = setTimeout(() => { void this.poll(); }, Math.min(15000, 2000 * (1 + (this.pollFailures || 0))));
    }

    // Images load with the capability token in a header, never in the image URL.
    async loadImage(img, url) {
      try {
        const res = await fetch(url, { credentials: "same-origin", signal: this.controller.signal,
          headers: { Authorization: "Bearer " + this.job.token } });
        if (!res.ok) throw new Error(String(res.status));
        const objectUrl = URL.createObjectURL(await res.blob());
        if (!this.isConnected) { URL.revokeObjectURL(objectUrl); return; }
        this.imageUrls.push(objectUrl);
        img.src = objectUrl;
      } catch {
        if (this.isConnected) img.alt = this.copy.error_generic;
      }
    }

    renderVariations(variations, selectedVariation) {
      this.variationsEl.replaceChildren();
      this.revokeImages();
      variations.forEach((v, index) => {
        const url = new URL(v.url, window.location.origin);
        if (url.origin !== window.location.origin || !url.pathname.startsWith(this.proxyPath + "/images/")) return;
        const card = document.createElement("article");
        card.className = "lv__card";
        const img = document.createElement("img");
        img.className = "lv__card-img";
        void this.loadImage(img, url.pathname);
        img.alt = this.copy.variation + " " + (index + 1);
        img.referrerPolicy = "no-referrer";
        img.loading = "lazy";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lv__btn lv__btn--secondary";
        btn.textContent = this.copy.select;
        btn.setAttribute("aria-pressed", "false");
        const select = () => {
          this.selected = v;
          this.variationsEl.querySelectorAll("article").forEach((el) => {
            el.classList.toggle("is-selected", el === card);
            const b = el.querySelector("button");
            b.textContent = el === card ? this.copy.selected : this.copy.select;
            b.setAttribute("aria-pressed", String(el === card));
          });
          if (this.cartBtn) this.cartBtn.disabled = !this.variantInput?.value;
          this.dispatchEvent(new CustomEvent("leather-vision:selected", {
            bubbles: true, detail: { generationId: this.job.id, variation: v },
          }));
        };
        btn.addEventListener("click", select, { signal: this.controller.signal });
        card.append(img, btn);
        this.variationsEl.append(card);
        if (v.id === selectedVariation) select();
      });
      this.results.hidden = !this.variationsEl.children.length;
      if (this.results.hidden) { this.setStatus(""); this.setError(this.copy.error_generic); }
    }

    async addToCart() {
      if (!this.job || !this.selected || !this.variantInput?.value || this.cartBusy) return;
      this.cartBusy = true;
      this.cartBtn.disabled = true;
      this.setError("");
      this.setStatus(this.copy.adding);
      try {
        const selection = await this.api("/generations/" + encodeURIComponent(this.job.id), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variationId: this.selected.id }),
        });
        const res = await fetch(this.dataset.cartAddUrl, {
          method: "POST", credentials: "same-origin", signal: this.controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ items: [{ id: this.variantInput.value, quantity: 1, properties: selection.properties }] }),
        });
        const cart = await res.json();
        if (!res.ok) throw new Error(cart.description || this.copy.error_cart);
        window.location.assign(this.dataset.cartUrl);
      } catch (error) {
        if (!this.isConnected) return;
        this.setStatus("");
        this.setError(error.message || this.copy.error_cart);
        this.cartBusy = false;
        this.cartBtn.disabled = false;
      }
    }
  }
  customElements.define("leather-vision", LeatherVision);
})();

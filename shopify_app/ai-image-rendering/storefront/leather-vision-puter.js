(function () {
  "use strict";
  if (window.LeatherVisionPuter) return;
  let sdk;
  function loadSdk() {
    if (window.puter) return Promise.resolve();
    if (!sdk) sdk = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.puter.com/v2/";
      script.async = true;
      const timer = setTimeout(() => { script.remove(); reject(new Error("SDK unavailable")); }, 30000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("SDK unavailable")); };
      document.head.append(script);
    }).catch((error) => { sdk = null; throw error; });
    return sdk;
  }

  window.LeatherVisionPuter = class {
    constructor(root, config) { this.root = root; this.config = config; }
    async init() {
      const root = this.root;
      this.button = root.querySelector("[data-lv-puter-connect]");
      root.querySelector("[data-lv-puter]").hidden = false;
      root.querySelector("[data-lv-puter-test]").hidden = !this.config.testMode;
      this.button.disabled = true;
      await loadSdk();
      if (!root.isConnected) return;
      this.updateButton();
      this.button.addEventListener("click", () => { void this.signIn(); }, { signal: root.controller.signal });
    }
    connected() { return Boolean(window.puter?.auth.isSignedIn()); }
    updateButton() {
      this.button.disabled = false;
      this.button.textContent = this.connected() ? this.root.copy.puter_connected : this.root.copy.puter_connect;
    }
    async signIn() {
      this.button.disabled = true;
      try {
        // Called directly from the button click so browsers allow the sign-in popup.
        await window.puter.auth.signIn();
        if (this.root.isConnected) this.root.setError("");
      } catch {
        if (this.root.isConnected) this.root.setError(this.root.copy.puter_connect_required);
      } finally { if (this.root.isConnected) this.updateButton(); }
    }
    async cancel() {
      if (!this.root.job) return;
      const body = new FormData(); body.set("action", "cancel");
      await this.root.api("/generations/" + this.root.job.id + "/result", { method: "POST", body }).catch(() => {});
    }
    async generate(spec) {
      const root = this.root, job = root.job;
      const active = () => root.isConnected && root.job === job && !root.controller.signal.aborted;
      const deadline = Date.now() + 20 * 60 * 1000;
      try {
        for (let i = 0; i < spec.prompts.length; i++) {
          if (!active()) return;
          root.setStatus(root.copy.generating + " " + (i + 1) + "/" + spec.prompts.length);
          let timer, abort;
          let image;
          try {
            image = await Promise.race([
              window.puter.ai.txt2img(spec.prompts[i], {
                model: spec.model, quality: spec.quality, test_mode: spec.testMode,
                ratio: { w: 1, h: 1 },
                ...(spec.referenceImage ? { input_image: spec.referenceImage, input_image_mime_type: "image/png" } : {}),
              }),
              new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Timed out")), Math.max(1, deadline - Date.now())); }),
              new Promise((_, reject) => {
                abort = () => reject(new Error("Page disconnected"));
                root.controller.signal.addEventListener("abort", abort, { once: true });
              }),
            ]);
          } finally { clearTimeout(timer); root.controller?.signal.removeEventListener("abort", abort); }
          if (!active()) return;
          const url = new URL(image.src);
          if (!["https:", "data:", "blob:"].includes(url.protocol)) throw new Error("Invalid image URL");
          // Never send the app capability or Shopify cookies to a provider image host.
          const response = await fetch(url.href, { credentials: "omit",
            signal: AbortSignal.any([root.controller.signal, AbortSignal.timeout(90000)]) });
          if (!response.ok) throw new Error("Image download failed");
          const reader = response.body?.getReader();
          const chunks = []; let size = 0;
          if (!reader) throw new Error("Missing image");
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error("Image too large"); }
            chunks.push(value);
          }
          if (!active()) return;
          const body = new FormData();
          body.set("image", new Blob(chunks, { type: response.headers.get("content-type") || "image/png" }), "result.png");
          body.set("variationId", "v" + (i + 1));
          await root.api("/generations/" + job.id + "/result", { method: "POST", body });
        }
      } catch (error) {
        if (!active()) return;
        await this.cancel();
        // The provider may have billed an interrupted request. Never automatically repeat it.
        const code = error?.errorCode || error?.code;
        throw new Error(code === "insufficient_funds" ? root.copy.puter_error_funds
          : code === "moderation_flagged" ? root.copy.puter_error_moderation : root.copy.puter_error);
      }
    }
  };
})();

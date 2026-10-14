(() => {
  if (customElements.get("leather-vision-flow")) return;
  class LeatherVisionFlow extends HTMLElement {
    connectedCallback() {
      if (this.controller) return;
      this.controller = new AbortController();
      queueMicrotask(() => { if (this.isConnected) this.init(); });
    }
    disconnectedCallback() { this.controller?.abort(); this.controller = null; }
    init() {
      this.form = this.closest("form");
      this.steps = Array.from(this.querySelectorAll("[data-flow-step]"));
      this.open = !this.value("leather") ? 1 : !this.value("color") ? 2 : 3;
      const signal = this.controller.signal;
      this.addEventListener("change", (event) => {
        if (!["leather", "color"].includes(event.target.name)) return;
        // The supplied palette is available for every category, so valid choices persist.
        this.open = event.target.name === "leather" ? 2 : 3;
        this.update();
        this.querySelector(`[data-flow-toggle="${this.open}"]`)?.focus({ preventScroll: true });
      }, { signal });
      this.addEventListener("click", (event) => {
        const button = event.target.closest("[data-flow-toggle]");
        if (!button || button.disabled) return;
        this.open = Number(button.dataset.flowToggle);
        this.update();
      }, { signal });
      this.update();
    }
    value(name) { return this.form.querySelector(`input[name="${name}"]:checked`); }
    update() {
      const leather = this.value("leather"), color = this.value("color");
      this.steps.forEach((step) => {
        const number = Number(step.dataset.flowStep);
        step.hidden = number === 2 ? !leather : number === 3 ? !leather || !color : false;
        const choice = number === 1 ? leather : number === 2 ? color : null;
        step.classList.toggle("is-complete", Boolean(choice));
        const button = step.querySelector("[data-flow-toggle]");
        button.setAttribute("aria-expanded", String(this.open === number));
        step.querySelector("[data-flow-panel]").hidden = this.open !== number;
        const summary = step.querySelector("[data-flow-summary]");
        if (summary) summary.textContent = choice?.dataset.label || choice?.value || "";
      });
    }
    validate() {
      const missing = !this.value("leather") ? 1 : !this.value("color") ? 2 : 0;
      if (missing) {
        this.open = missing;
        this.update();
        this.steps[missing - 1].querySelector("input")?.focus();
      }
      return this.form.reportValidity();
    }
  }
  customElements.define("leather-vision-flow", LeatherVisionFlow);
})();

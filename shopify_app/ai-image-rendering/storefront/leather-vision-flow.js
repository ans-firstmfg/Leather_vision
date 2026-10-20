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
      this.group = this.querySelector("[data-leather-group]");
      this.querySelectorAll("[data-leather-groups]").forEach((card) => {
        card.title = card.querySelector(".lv__choice-label")?.textContent || "";
      });
      const signal = this.controller.signal;
      this.addEventListener("change", (event) => {
        if (event.target === this.group) this.filterArticles();
        if (!["leather", "color"].includes(event.target.name)) return;
        this.update();
      }, { signal });
      this.update();
    }
    value(name) { return this.form.querySelector(`input[name="${name}"]:checked`); }
    filterArticles() {
      this.querySelectorAll("[data-leather-groups]").forEach((card) => {
        card.hidden = Boolean(this.group?.value) && !card.dataset.leatherGroups.split("|").includes(this.group.value);
      });
      const choices = this.querySelector(".lv__choices--catalog");
      if (choices) choices.scrollTop = 0;
    }
    update() {
      const leather = this.value("leather"), color = this.value("color");
      this.steps.forEach((step) => {
        const number = Number(step.dataset.flowStep);
        const choice = number === 1 ? leather : number === 2 ? color : null;
        step.classList.toggle("is-complete", Boolean(choice));
        const summary = step.querySelector("[data-flow-summary]");
        if (summary) summary.textContent = choice?.dataset.label || choice?.closest("label")?.querySelector(".lv__choice-label")?.textContent || choice?.value || "";
      });
    }
    validate() {
      const missing = !this.value("leather") ? 1 : !this.value("color") ? 2 : 0;
      if (missing) {
        if (missing === 1 && this.group) { this.group.value = ""; this.filterArticles(); }
        this.steps[missing - 1].querySelector("input")?.focus();
      }
      return this.form.reportValidity();
    }
  }
  customElements.define("leather-vision-flow", LeatherVisionFlow);
})();

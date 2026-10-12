import { Component } from '@theme/component';

class MaterialBuilder extends Component {
  /** @type {AbortController | undefined} */
  controller;

  connectedCallback() {
    super.connectedCallback();
    this.bindTabs();
  }

  updatedCallback() {
    super.updatedCallback();
    this.bindTabs();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.controller?.abort();
  }

  bindTabs() {
    this.controller?.abort();
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const tabs = [...this.querySelectorAll('.material-builder__tab')].filter(
      (tab) => tab instanceof HTMLButtonElement
    );
    const activate = (/** @type {HTMLButtonElement} */ selected) => {
      for (const tab of tabs) {
        const active = tab === selected;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      }
      for (const panel of this.querySelectorAll('.material-builder__panel')) {
        if (!(panel instanceof HTMLElement)) continue;
        const active = panel.id === selected.getAttribute('aria-controls');
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
      }
    };
    for (const [index, tab] of tabs.entries()) {
      tab.addEventListener('click', () => activate(tab), { signal });
      tab.addEventListener('keydown', (event) => {
        const rtl = getComputedStyle(this).direction === 'rtl';
        let target;
        if (event.key === 'ArrowRight') target = tabs[(index + (rtl ? -1 : 1) + tabs.length) % tabs.length];
        else if (event.key === 'ArrowLeft') target = tabs[(index + (rtl ? 1 : -1) + tabs.length) % tabs.length];
        else if (event.key === 'Home') target = tabs[0];
        else if (event.key === 'End') target = tabs[tabs.length - 1];
        if (!target) return;
        event.preventDefault();
        activate(target);
        target.focus();
      }, { signal });
    }
    const selected = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') || tabs[0];
    if (selected) activate(selected);
  }
}

if (!customElements.get('material-builder-component')) {
  customElements.define('material-builder-component', MaterialBuilder);
}

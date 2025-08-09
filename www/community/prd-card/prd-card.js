class PrdCard extends HTMLElement {
  static getStubConfig() { return { entity: 'sensor.polskie_radio_dzieciom_schedule' }; }
  set hass(hass) { this._hass = hass; this._render(); }
  setConfig(config) {
    if (!config || !config.entity) throw new Error('Entity is required');
    this.config = config;
    this._render();
  }

  _t(key) {
    const lang = (this._hass && (this._hass.locale?.language || this._hass.language)) || (navigator.language || 'en');
    const l = ('' + lang).toLowerCase().startsWith('pl') ? 'pl' : 'en';
    const dict = {
      en: { now: 'Now', next: 'Next', show: 'Show rest of day', hide: 'Hide', nothing: 'Nothing currently', starts: 'starts', entity_missing: 'Entity not found' },
      pl: { now: 'Teraz', next: 'Następne', show: 'Pokaż resztę dnia', hide: 'Ukryj', nothing: 'Brak audycji', starts: 'start', entity_missing: 'Nie znaleziono encji' }
    };
    return (dict[l] && dict[l][key]) || (dict.en[key]) || key;
  }

  _render() {
    if (!this._hass || this.rendered) return;
    this.rendered = true;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .card { padding: 14px 14px 0px 14px; }
        /* Grid row: [thumb] [text] [time] */
        .row { display: grid; grid-template-columns: 48px 1fr auto; gap: 12px; align-items: center; }
        .row + .row { margin-top: 8px; }

        .thumb { width: 48px; height: 48px; border-radius: 6px; object-fit: cover; background: rgba(127,127,127,0.2); }
        .thumb.thumb--placeholder { display: inline-block; }

        .text { min-width: 0; }
        .title { font-weight: 600; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .title a { color: inherit; text-decoration: none; }
        .title a:hover { text-decoration: underline; }
        .meta { color: var(--secondary-text-color); font-size: 0.9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .time { color: var(--secondary-text-color); margin-left: 8px; white-space: nowrap; }

        progress { width: 100%; height: 10px; margin: 8px 0 6px; -webkit-appearance: none; appearance: none; }
        progress::-webkit-progress-bar { background-color: var(--divider-color); border-radius: 6px; }
        progress::-webkit-progress-value { background-color: var(--primary-color); border-radius: 6px; }
        progress::-moz-progress-bar { background-color: var(--primary-color); border-radius: 6px; }

        /* Chevron hover without movement */
        .expand { cursor:pointer; color: var(--secondary-text-color); margin-top:0; user-select: none; display:flex; align-items:center; justify-content:center; padding: 2px 0; }
        .expand ha-icon { --mdc-icon-size: 22px; transition: color 120ms ease, opacity 120ms ease; }
        .expand:hover ha-icon { color: var(--primary-color); opacity: .95; }
        .expand:active ha-icon { opacity: .85; }
        .expand:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; border-radius: 4px; }

        .hidden { display:none; }

        .list .item { padding: 10px 0; border-top: 1px solid var(--divider-color); }
      </style>
      <ha-card>
        <div class="card">
          <div id="current" class="row"></div>
          <progress id="progress" max="100" value="0" aria-label="progress"></progress>
          <div id="next" class="row"></div>
          <div id="expand" class="expand" role="button" aria-expanded="false" title="${this._t('show')}" aria-label="${this._t('show')}">
            <ha-icon id="expandIcon" icon="mdi:chevron-down"></ha-icon>
          </div>
          <div id="list" class="list hidden"></div>
        </div>
      </ha-card>`;
    this.$ = (sel) => root.querySelector(sel);

    const expand = this.$('#expand');
    const expandIcon = this.$('#expandIcon');
    const listEl = this.$('#list');
    const setExpandState = (expanded) => {
      expand.setAttribute('aria-expanded', String(expanded));
      expand.setAttribute('title', expanded ? this._t('hide') : this._t('show'));
      expand.setAttribute('aria-label', expanded ? this._t('hide') : this._t('show'));
      expandIcon.setAttribute('icon', expanded ? 'mdi:chevron-up' : 'mdi:chevron-down');
    };
    expand.addEventListener('click', () => {
      listEl.classList.toggle('hidden');
      setExpandState(!listEl.classList.contains('hidden'));
    });
    expand.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expand.click(); }
    });
    expand.tabIndex = 0;

    this._update();
    this._timer = setInterval(() => this._update(), 30000);
  }

  _fmt(t) { return t ? new Date(t).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''; }
  _mmss(sec) { if (sec == null) return ''; const m = Math.floor(sec/60); const s = sec%60; return `${m}:${s.toString().padStart(2,'0')}`; }

  // Build an IMG element HTML with alt/title for hover tooltips
  _img(prog) {
    const src = prog && prog.photo; const title = prog && (prog.description || prog.title || '');
    return src ? `<img class="thumb" src="${src}" alt="${prog.title || ''}" title="${title}">`
               : `<span class="thumb thumb--placeholder" title="${title}"></span>`;
  }

  // Make title clickable if article_link is available
  _titleLink(prog, prefixText = '') {
    const label = `${prefixText ? prefixText + ': ' : ''}${prog.title || ''}`;
    if (prog.article_link) {
      return `<a href="${prog.article_link}" target="_blank" rel="noopener noreferrer" title="${prog.description || prog.title || ''}">${label}</a>`;
    }
    return label;
  }

  _update() {
    if (!this._hass) return;
    const ent = this._hass.states[this.config.entity || 'sensor.polskie_radio_dzieciom_schedule'];
    if (!ent) {
      this.$('#current').innerHTML = `<div class="title">${this._t('entity_missing')}: ${(this.config && this.config.entity) || ''}</div>`;
      this.$('#progress').value = 0;
      this.$('#next').innerHTML = '';
      this.$('#list').innerHTML = '';
      return;
    }
    const attrs = ent.attributes || {};
    const cur = attrs.current;
    const next = attrs.next;

    // Current row
    this.$('#current').innerHTML = cur ? `
      ${this._img(cur)}
      <div class="text" title="${cur.description || ''}">
        <div class="title">${this._titleLink(cur, this._t('now'))}</div>
        <div class="meta">${cur.leaders_names || ''}</div>
      </div>
      <div class="time">${cur.start_time} - ${cur.stop_time}</div>
    ` : `<div>${this._t('nothing')}</div>`;

    // Progress
    let progress = 0;
    if (cur && cur.start && cur.stop) {
      const now = Date.now();
      const start = new Date(cur.start).getTime();
      const stop = new Date(cur.stop).getTime();
      if (stop > start) {
        progress = Math.max(0, Math.min(100, Math.round(((now - start) / (stop - start)) * 100)));
      }
    }
    this.$('#progress').value = progress;

    // Next row (only start time)
    this.$('#next').innerHTML = next ? `
      ${this._img(next)}
      <div class="text" title="${next.description || ''}">
        <div class="title">${this._titleLink(next, this._t('next'))}</div>
        <div class="meta">${next.leaders_names || ''}</div>
      </div>
      <div class="time">${next.start_time}</div>
    ` : '';

    // Rest of day (exclude the 'next' item if present)
    const listRaw = attrs.rest_of_day || [];
    const list = next ? listRaw.filter(p => {
      if (p && next && p.id != null && next.id != null) return p.id !== next.id;
      if (p && next && p.start && next.start) return p.start !== next.start;
      if (p && next && p.start_time && next.start_time) return p.start_time !== next.start_time;
      return !(p && next && p.title === next.title && p.photo === next.photo);
    }) : listRaw;

    this.$('#list').innerHTML = list.map(p => `
      <div class="item" title="${p.description || ''}">
        <div class="row">
          ${this._img(p)}
          <div class="text">
            <div class="title">${this._titleLink(p)}</div>
            <div class="meta">${p.leaders_names || ''}</div>
          </div>
          <div class="time">${p.start_time}</div>
        </div>
      </div>`).join('');
  }

  disconnectedCallback() { if (this._timer) clearInterval(this._timer); }

  getCardSize() { return 3; }
}

customElements.define('prd-card', PrdCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'prd-card',
  name: 'Polskie Radio Dzieciom',
  description: 'Current and upcoming schedule with progress and countdown'
});

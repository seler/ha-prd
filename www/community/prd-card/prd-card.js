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
      en: { now: 'Now', next: 'Next', show: 'Show rest of day', hide: 'Hide', nothing: 'Nothing currently', starts: 'starts' },
      pl: { now: 'Teraz', next: 'Następne', show: 'Pokaż resztę dnia', hide: 'Ukryj', nothing: 'Brak audycji', starts: 'start' }
    };
    return (dict[l] && dict[l][key]) || (dict.en[key]) || key;
  }

  _render() {
    if (!this._hass || this.rendered) return;
    this.rendered = true;
    const root = this.attachShadow({ mode: 'open' });
  root.innerHTML = `
      <style>
        .card { padding: 16px; }
        .row { display:flex; justify-content:space-between; align-items:center; margin: 6px 0; }
        .title { font-weight:600; }
        .time { color: var(--secondary-text-color); margin-left:8px; }
        progress { width: 100%; height: 12px; }
        .expand { cursor:pointer; color: var(--primary-color); margin-top:8px; }
        .hidden { display:none; }
        .list .item { padding: 6px 0; border-top: 1px solid var(--divider-color); }
      </style>
      <ha-card>
        <div class="card">
          <div id="current" class="row"></div>
          <progress id="progress" max="100" value="0"></progress>
          <div id="next" class="row"></div>
      <div id="expand" class="expand">${this._t('show')}</div>
          <div id="list" class="list hidden"></div>
        </div>
      </ha-card>`;
    this.$ = (sel) => root.querySelector(sel);
    this.$('#expand').addEventListener('click', () => {
      this.$('#list').classList.toggle('hidden');
    this.$('#expand').textContent = this.$('#list').classList.contains('hidden') ? this._t('show') : this._t('hide');
    });
    this._update();
    this._timer = setInterval(() => this._update(), 30000);
  }

  _fmt(t) { return t ? new Date(t).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''; }
  _mmss(sec) { if (sec == null) return ''; const m = Math.floor(sec/60); const s = sec%60; return `${m}:${s.toString().padStart(2,'0')}`; }

  _update() {
    if (!this._hass) return;
    const ent = this._hass.states[this.config.entity || 'sensor.polskie_radio_dzieciom_schedule'];
    if (!ent) return;
  const attrs = ent.attributes || {};
    const cur = attrs.current;
    const next = attrs.next;
  this.$('#current').innerHTML = cur ? `<div class="title">${this._t('now')}: ${cur.title}</div><div class="time">${cur.start_time} - ${cur.stop_time}</div>` : `<div>${this._t('nothing')}</div>`;
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
    let nextCountdown = '';
    if (next && next.start) {
      const now = Date.now();
      const start = new Date(next.start).getTime();
      const diff = Math.max(0, Math.round((start - now) / 1000));
      nextCountdown = this._mmss(diff);
    }
  this.$('#next').innerHTML = next ? `<div class="title">${this._t('next')}: ${next.title}</div><div class="time">${this._t('starts')} ${next.start_time} in ${nextCountdown}</div>` : '';

    const list = attrs.rest_of_day || [];
    this.$('#list').innerHTML = list.map(p => `<div class="item"><span class="title">${p.title}</span> <span class="time">${p.start_time}</span></div>`).join('');
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

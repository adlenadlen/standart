// /modules/gro-core.js
// ЕДИНЫЙ ЯДРОВОЙ МОДУЛЬ ДЛЯ ВСЕХ ОБЪЕКТОВ
// - База хранится в МСК (X=Север, Y=Восток).
// - MSK ↔ WGS-84 через SK-42 (зона задаётся в конфиге).
// - CSV URL и зона СК-42 приходят извне (через объектный файл /OBJECT/gro-OBJECT.js).

/* ================================
   ВСПОМОГАТЕЛЬНОЕ
==================================*/

const DEFAULT_TOWGS84 = '23.92,-141.27,-80.9,0,0.35,0.82,-0.12';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}
function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/* ================================
   DATA MANAGER (CSV)
==================================*/

class DataManager {
  constructor({ csvUrl }) {
    assert(csvUrl, 'csvUrl обязателен');
    this.csvUrl = csvUrl;
    // Ожидаемый заголовок: Название, Север, Восток, Отметка, Код
    this.rusHeaders = ['Название', 'Север', 'Восток', 'Отметка', 'Код'];
  }

  async fetchData() {
    try {
      console.log('[CSV] GET:', this.csvUrl);
      const txt = await this._fetchTxt(this.csvUrl, { timeoutMs: 15000 });
      return this._parseCSV(txt);
    } catch (e) {
      console.error('[CSV] fetch failed:', e);
      throw e;
    }
  }

  async _fetchTxt(url, { timeoutMs = 10000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    try {
      const resp = await fetch(url, {
        headers: { 'Accept': 'text/csv' },
        cache: 'no-store',
        signal: controller.signal
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      // Безопасный декодер (срежет BOM)
      return new TextDecoder('utf-8', { fatal: false })
        .decode(new Uint8Array(buf))
        .replace(/^\uFEFF/, '');
    } finally {
      clearTimeout(timer);
    }
  }

  _parseCSV(csv) {
    const lines = csv.replace(/\r\n?/g, '\n').split('\n').map(l => l.trim());
    // обрезаем пустые
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    if (!lines.length) return [];

    // детект разделителя
    const headerLine = lines[0];
    const delim = this._detectDelimiter(headerLine);
    const headers = this._splitCSV(headerLine, delim)_

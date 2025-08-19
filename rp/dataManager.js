// modules/dataManager.js
export class DataManager {
  constructor() {
    this.csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR0xN6ovbBTM2VPZ5rVliXcFiMz13AJunM83sVSnGfn1Rt-5l3DulZ54jzKBVUF8zFmdK_CKEIGCnF4/pub?gid=0&single=true&output=csv';
    this.COORD_SYSTEM = 'МСК';

    // Русские заголовки
    this.rusHeaders = ['Название', 'Север', 'Восток', 'Отметка', 'Код'];

    // ✅ Исправлено: Север -> Xraw, Восток -> Yraw
    this.headerMap = {
      'Название': 'Point',
      'Север': 'Xraw',   // Northing -> X
      'Восток': 'Yraw',  // Easting  -> Y
      'Отметка': 'H',
      'Код': 'Info'
    };
  }

  async fetchData() {
    console.log(`Загрузка CSV из Google Sheets: ${this.csvUrl}`);
    const csvText = await this.fetchWithTimeout(this.csvUrl, { timeoutMs: 15000 });
    return this.parseCSV(csvText);
  }

  async fetchWithTimeout(url, { timeoutMs = 10000 } = {}) {
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
      const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf));
      return text.replace(/^\uFEFF/, '');
    } finally {
      clearTimeout(timer);
    }
  }

  parseCSV(csvText) {
    const lines = csvText.replace(/\r\n?/g, '\n').split('\n').map(l => l.trim());
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    if (lines.length === 0) return [];

    const rawHeader = lines[0];
    const delimiter = this.detectDelimiter(rawHeader);
    const headerParts = this.parseCSVLine(rawHeader, delimiter).map(s => s.trim());
    const headerIndex = new Map(headerParts.map((name, idx) => [name, idx]));
    const hasRusHeader = this.rusHeaders.every(h => headerIndex.has(h));
    if (!hasRusHeader) console.warn('Предупреждение: заголовки отличаются от ожидаемых', { headerParts });

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw) continue;

      const parts = this.parseCSVLine(raw, delimiter);
      const getByRu = (ruName) => {
        const idx = headerIndex.get(ruName);
        return idx != null ? (parts[idx] ?? '') : '';
      };

      const Point = String(getByRu('Название')).trim();

      // ✅ Исправлено: берём X из "Север", Y из "Восток"
      const xStr = String(getByRu('Север')).replace(',', '.').trim();   // X
      const yStr = String(getByRu('Восток')).replace(',', '.').trim();  // Y
      const hStr = String(getByRu('Отметка')).replace(',', '.').trim();
      const Info = String(getByRu('Код')).trim();

      const Xraw = Number.parseFloat(xStr);
      const Yraw = Number.parseFloat(yStr);
      const H    = hStr === '' ? NaN : Number.parseFloat(hStr);

      if (!Number.isFinite(Xraw) || !Number.isFinite(Yraw)) {
        console.warn(`Строка ${i + 1}: пропуск из-за некорректных координат`, { xStr, yStr });
        continue;
      }

      records.push({
        id: `rp_${i + 1}`,
        fields: {
          CoordSystem: this.COORD_SYSTEM,
          Point,
          Xraw,
          Yraw,
          H: Number.isFinite(H) ? H : NaN,
          Info
        }
      });
    }

    console.log(`Обработано записей: ${records.length}`);
    return records;
  }

  detectDelimiter(headerLine) {
    const comma = (headerLine.match(/,/g) || []).length;
    const semi  = (headerLine.match(/;/g) || []).length;
    return semi > comma ? ';' : ',';
  }

  parseCSVLine(line, delimiter = ',') {
    const out = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  getCoordinateSystemStats(records) {
    const stats = {};
    for (const r of records) {
      const key = r.fields.CoordSystem || 'UNKNOWN';
      stats[key] = (stats[key] || 0) + 1;
    }
    return stats;
  }
}

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
    const headers = this._splitCSV(headerLine, delim).map(s => s.trim());
    const idx = new Map(headers.map((h, i) => [h, i]));
    const hasRus = this.rusHeaders.every(h => idx.has(h));
    if (!hasRus) {
      console.warn('[CSV] Заголовки отличаются от ожидаемых:', headers);
    }

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (!row) continue;
      const parts = this._splitCSV(row, delim);
      const get = (name) => {
        const j = idx.get(name);
        return j != null ? (parts[j] ?? '') : '';
      };

      const Point = String(get('Название')).trim();
      const xStr = String(get('Север')).replace(',', '.').trim();
      const yStr = String(get('Восток')).replace(',', '.').trim();
      const hStr = String(get('Отметка')).replace(',', '.').trim();
      const Info = String(get('Код')).trim();

      const Xraw = parseFloat(xStr);
      const Yraw = parseFloat(yStr);
      const H    = hStr === '' ? NaN : parseFloat(hStr);

      if (!Number.isFinite(Xraw) || !Number.isFinite(Yraw)) {
        console.warn(`[CSV] Строка ${i + 1}: пропуск (некорректные координаты)`, { xStr, yStr });
        continue;
      }

      records.push({
        id: `rp_${i + 1}`,
        fields: {
          CoordSystem: 'МСК',
          Point,
          Xraw,
          Yraw,
          H: Number.isFinite(H) ? H : NaN,
          Info
        }
      });
    }

    console.log(`[CSV] Обработано записей: ${records.length}`);
    return records;
  }

  _detectDelimiter(head) {
    const c = (head.match(/,/g) || []).length;
    const s = (head.match(/;/g) || []).length;
    return s > c ? ';' : ',';
  }

  _splitCSV(line, delim = ',') {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else { q = !q; }
      } else if (ch === delim && !q) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }
}

/* ================================
   COORDINATE SYSTEM (MSK/SK-42/WGS)
==================================*/

class CoordinateSystem {
  constructor({ zone, towgs84 }) {
    this.zone = Number(zone);                       // номер зоны СК-42 (например, 13)
    this.towgs84 = towgs84 || DEFAULT_TOWGS84;     // Bursa-Wolf параметры
    this.epsg = 28400 + this.zone;                 // EPSG:28413 для зоны 13 и т.д.
    this._initProj4();
  }

  get zoneOffset() { return this.zone * 1_000_000; } // «зонный миллион»
  _lon0() { return this.zone * 6 - 3; }              // центральный меридиан зоны (°E)
  _x0() { return this.zone * 1_000_000 + 500_000; }  // x_0 для т. Меркатора (ГК)

  _initProj4() {
    if (typeof proj4 === 'undefined') {
      console.warn('[proj4] не найден — MSK↔WGS будет недоступно');
      return;
    }
    const def = `+proj=tmerc +lat_0=0 +lon_0=${this._lon0()} +k=1 +x_0=${this._x0()} +y_0=0 +ellps=krass +towgs84=${this.towgs84} +units=m +no_defs`;
    proj4.defs(`EPSG:${this.epsg}`, def);
    proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
  }

  /**
   * MSK -> WGS84 (lat,lon)
   * Порядок для proj4: [Easting, Northing] = [Y + zone*1e6, X]
   */
  toWGS84(xMSK, yMSK) {
    if (typeof proj4 === 'undefined') return null;
    const northing = toNumber(xMSK);
    const easting  = toNumber(yMSK) + this.zoneOffset;
    if (!Number.isFinite(northing) || !Number.isFinite(easting)) return null;
    try {
      const [lon, lat] = proj4(`EPSG:${this.epsg}`, 'EPSG:4326', [easting, northing]);
      return { lat, lon };
    } catch (e) {
      console.error('[proj4] toWGS84 error:', e);
      return null;
    }
  }

  /**
   * WGS84 -> MSK (x,y)
   */
  fromWGS84(lat, lon) {
    if (typeof proj4 === 'undefined') return { x: NaN, y: NaN };
    try {
      const [easting, northing] = proj4('EPSG:4326', `EPSG:${this.epsg}`, [toNumber(lon), toNumber(lat)]);
      const xMSK = northing;
      const yMSK = easting - this.zoneOffset;
      return { x: xMSK, y: yMSK };
    } catch (e) {
      console.error('[proj4] fromWGS84 error:', e);
      return { x: NaN, y: NaN };
    }
  }
}

/* ================================
   GEOLOCATION SERVICE
==================================*/

class GeolocationService {
  constructor(coord) {
    this.coord = coord; // CoordinateSystem
    this.options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
  }

  async getCurrentPosition() {
    if (!('geolocation' in navigator)) {
      throw new Error('Геолокация не поддерживается вашим браузером');
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => reject(this._wrapErr(err)),
        this.options
      );
    });
  }

  async getCurrentPositionMSK() {
    const pos = await this.getCurrentPosition();
    const lat = Number(pos.coords.latitude);
    const lon = Number(pos.coords.longitude);
    const msk = this.wgsToMSK(lat, lon);
    if (!Number.isFinite(msk.x) || !Number.isFinite(msk.y)) {
      throw new Error('Не удалось преобразовать координаты в МСК');
    }
    return { x: msk.x, y: msk.y, raw: pos };
  }

  mskToWGS(x, y) {
    try { return this.coord.toWGS84(x, y) || { lat: NaN, lon: NaN }; }
    catch { return { lat: NaN, lon: NaN }; }
  }
  wgsToMSK(lat, lon) {
    try { return this.coord.fromWGS84(lat, lon); }
    catch { return { x: NaN, y: NaN }; }
  }

  makeGoogleMapsUrl(lat, lon, z = 18) { return `https://www.google.com/maps?q=${lat},${lon}&z=${z}`; }
  makeYandexMapsUrl(lat, lon, z = 18) { return `https://yandex.ru/maps/?pt=${lon},${lat}&z=${z}&l=map`; }

  _wrapErr(error) {
    switch (error.code) {
      case error.PERMISSION_DENIED:    return new Error('Доступ к геолокации запрещён');
      case error.POSITION_UNAVAILABLE: return new Error('Информация о местоположении недоступна');
      case error.TIMEOUT:              return new Error('Тайм-аут запроса местоположения');
      default:                         return new Error('Неизвестная ошибка геолокации');
    }
  }
}

/* ================================
   SEARCH ENGINE (MSK)
==================================*/

class SearchEngine {
  constructor({ geolocation } = {}) {
    this.geolocation = geolocation || null;
  }

  search(database, term, mode = 'contains', ignoreChars = false) {
    if (!term) return [];
    const query = ignoreChars ? this._norm(term) : String(term).toLowerCase();
    return database.filter(r => {
      const name = r?.fields?.Point;
      if (!name) return false;
      const v = ignoreChars ? this._norm(name) : String(name).toLowerCase();
      return mode === 'exact' ? v === query : v.includes(query);
    });
  }

  _norm(s) {
    return String(s).toLowerCase().replace(/[\._,\-]/g, '');
  }

  async findNearby(database, referenceRecord, maxDistance = 300) {
    const ref = this._msk(referenceRecord?.fields);
    if (!this._ok(ref)) throw new Error('Некорректные координаты исходной точки');
    const out = [];
    for (const rec of database) {
      if (rec.id === referenceRecord.id) continue;
      const c = this._msk(rec?.fields);
      if (!this._ok(c)) continue;
      const d = Math.hypot(c.x - ref.x, c.y - ref.y);
      if (d <= maxDistance) out.push({ record: rec, distance: d, coords: c });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }

  async findNearbyLocation(database, userWGS, maxDistance = 300) {
    if (!this.geolocation?.wgsToMSK) throw new Error('GeolocationService не подключён');
    const user = this.geolocation.wgsToMSK(userWGS.latitude, userWGS.longitude);
    if (!this._ok(user)) throw new Error('Не удалось преобразовать координаты пользователя в МСК');

    const out = [];
    for (const rec of database) {
      const c = this._msk(rec?.fields);
      if (!this._ok(c)) continue;
      const d = Math.hypot(c.x - user.x, c.y - user.y);
      if (d <= maxDistance) out.push({ record: rec, distance: d, coords: c });
    }
    return { userCoords: user, points: out.sort((a, b) => a.distance - b.distance) };
  }

  _msk(f) { return { x: toNumber(f?.Xraw), y: toNumber(f?.Yraw) }; }
  _ok(p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y); }
}

/* ================================
   UI CONTROLLER (MSK + карты)
==================================*/

class UIController {
  constructor(app) {
    this.app = app;
    this.elements = {};
    this.debounceTimer = null;
    this.popupHistory = [];
  }

  init() {
    this._createElements();
    this._bindEvents();
  }

  _createElements() {
    const searchControls = document.getElementById('searchControls');
    searchControls.innerHTML = this._searchControlsHTML();

    const conversionControls = document.getElementById('conversionControls');
    conversionControls.innerHTML = this._conversionControlsHTML();

    this.elements = {
      searchInput: document.getElementById('searchInput'),
      outputList: document.getElementById('outputList'),
      messageState: document.getElementById('messageState'),
      nearbyPopup: document.getElementById('nearbyPopup'),
      manualCoordX: document.getElementById('manualCoordX'),
      manualCoordY: document.getElementById('manualCoordY'),
      manualResultX: document.getElementById('manualResultX'),
      manualResultY: document.getElementById('manualResultY'),
      manualLat: document.getElementById('manualLat'),
      manualLon: document.getElementById('manualLon'),
      manualOpenMaps: document.getElementById('manualOpenMaps')
    };
  }

  _searchControlsHTML() {
    return `
      <div class="control-row">
        <span class="control-label">Режим поиска:</span>
        <div class="search-mode-toggle">
          <input id="searchContains" name="searchMode" type="radio" value="contains" checked>
          <label for="searchContains">Содержит</label>
          <input id="searchExact" name="searchMode" type="radio" value="exact">
          <label for="searchExact">Точно</label>
        </div>
      </div>
      <div class="control-row">
        <span class="control-label">Игнор. спецсимв.:</span>
        <div class="ignore-chars-toggle">
          <input id="ignoreOff" name="ignoreMode" type="radio" value="off" checked>
          <label for="ignoreOff">Выкл</label>
          <input id="ignoreOn"  name="ignoreMode" type="radio" value="on">
          <label for="ignoreOn">Вкл</label>
        </div>
      </div>
      <div class="control-row search-row">
        <input id="searchInput" type="text" placeholder="Поиск по названию..." class="search-input">
        <button id="geolocateButton" class="b geolocate-button" title="Поиск по геолокации">📍</button>
      </div>
    `;
  }

  _conversionControlsHTML() {
    return `
      <div class="control-row"><span class="control-label">MSK → WGS-84:</span></div>
      <div class="control-row">
        <label for="manualCoordX" class="control-label">X (Север, MSK):</label>
        <input id="manualCoordX" type="text" placeholder="Введите X" class="manual-coord-input" inputmode="decimal">
      </div>
      <div class="control-row">
        <label for="manualCoordY" class="control-label">Y (Восток, MSK):</label>
        <input id="manualCoordY" type="text" placeholder="Введите Y" class="manual-coord-input" inputmode="decimal">
      </div>
      <div class="control-row">
        <span class="control-label">Результат MSK:</span>
        <div class="conversion-result">
          X: <span id="manualResultX">---</span>
          Y: <span id="manualResultY">---</span>
        </div>
      </div>
      <div class="control-row">
        <span class="control-label">WGS-84:</span>
        <div class="conversion-result">
          lat: <span id="manualLat">---</span>
          lon: <span id="manualLon">---</span>
          <button id="manualOpenMaps" class="b" style="margin-left:8px;">Открыть в картах</button>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    // Поиск
    this.elements.searchInput.addEventListener('input', () => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.app.performSearch(this.elements.searchInput.value.trim());
      }, 400);
    });

    // Режим поиска
    document.querySelectorAll('input[name="searchMode"]').forEach(r => {
      r.addEventListener('change', (e) => {
        this.app.updateSettings({ searchMode: e.target.value });
        if (this.elements.searchInput.value.trim()) {
          this.app.performSearch(this.elements.searchInput.value.trim());
        }
      });
    });

    // Игнор-символы
    document.querySelectorAll('input[name="ignoreMode"]').forEach(r => {
      r.addEventListener('change', (e) => {
        this.app.updateSettings({ shouldIgnoreChars: e.target.value === 'on' });
        if (this.elements.searchInput.value.trim()) {
          this.app.performSearch(this.elements.searchInput.value.trim());
        }
      });
    });

    // Геолокация
    document.getElementById('geolocateButton').addEventListener('click', () => {
      this.app.findNearbyUserLocation();
    });

    // Клики по результатам
    this.elements.outputList.addEventListener('click', (e) => {
      if (e.target.classList.contains('map-link')) return;
      const row = e.target.closest('.output-line');
      if (!row) return;
      const id = row.dataset.recordId;
      const rec = this.app.state.fullDatabase.find(r => r.id === id);
      if (rec) this.showPointDetails(rec);
    });

    // Ручной блок MSK→WGS
    this._bindConversionEvents();
  }

  _bindConversionEvents() {
    const update = () => {
      const xStr = this.elements.manualCoordX.value.trim().replace(',', '.');
      const yStr = this.elements.manualCoordY.value.trim().replace(',', '.');

      if (!xStr || !yStr) {
        this.elements.manualResultX.textContent = '---';
        this.elements.manualResultY.textContent = '---';
        this.elements.manualLat.textContent = '---';
        this.elements.manualLon.textContent = '---';
        return;
      }

      const x = parseFloat(xStr);
      const y = parseFloat(yStr);

      this.elements.manualResultX.textContent = this._fmt(x);
      this.elements.manualResultY.textContent = this._fmt(y);

      const w = this.app.geolocation.mskToWGS(x, y);
      if (w && Number.isFinite(w.lat) && Number.isFinite(w.lon)) {
        this.elements.manualLat.textContent = this._fmt(w.lat, 6);
        this.elements.manualLon.textContent = this._fmt(w.lon, 6);
      } else {
        this.elements.manualLat.textContent = '---';
        this.elements.manualLon.textContent = '---';
      }
    };

    this.elements.manualCoordX.addEventListener('input', update);
    this.elements.manualCoordY.addEventListener('input', update);

    this.elements.manualOpenMaps.addEventListener('click', () => {
      const lat = Number(String(this.elements.manualLat.textContent).replace(',', '.'));
      const lon = Number(String(this.elements.manualLon.textContent).replace(',', '.'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      window.open(this.app.geolocation.makeGoogleMapsUrl(lat, lon), '_blank', 'noopener,noreferrer');
      window.open(this.app.geolocation.makeYandexMapsUrl(lat, lon), '_blank', 'noopener,noreferrer');
    });
  }

  displayRecords(records) {
    if (this.app.state.isLoading) { this.showLoading(); return; }
    if (!records.length) {
      this.showMessage(
        this.app.state.fullDatabase.length === 0
          ? 'База данных пуста или произошла ошибка загрузки'
          : this.elements.searchInput.value.trim() === ''
            ? 'База данных загружена. Введите запрос для поиска...'
            : 'Ничего не найдено по вашему запросу'
      );
      return;
    }
    this.elements.messageState.style.display = 'none';
    this.elements.outputList.style.display = 'block';

    const frag = document.createDocumentFragment();
    for (const rec of records) frag.appendChild(this._createRecordElement(rec));
    this.elements.outputList.innerHTML = '';
    this.elements.outputList.appendChild(frag);

    this.app.state.visibleRecords = records;
  }

  _createRecordElement(record, showDistance = false, distance = null) {
    const div = document.createElement('div');
    div.className = 'output-line';
    div.dataset.recordId = record.id;

    const f = record.fields;

    if (showDistance && distance != null) {
      const span = document.createElement('span');
      span.className = 'nearby-distance';
      span.textContent = `${distance.toFixed(1)}м`;
      div.appendChild(span);
    }

    const name = document.createElement('span');
    name.className = 'point-name';
    name.textContent = f.Point || 'N/A';
    div.appendChild(name);

    if (f.Info) {
      const info = document.createElement('span');
      info.className = 'point-info';
      info.textContent = f.Info;
      div.appendChild(info);
    }

    const links = this._createMapLinks(f);
    if (links) div.appendChild(links);

    return div;
  }

  _createMapLinks(fields) {
    const w = this.app.geolocation.mskToWGS(fields.Xraw, fields.Yraw);
    if (!w || !Number.isFinite(w.lat) || !Number.isFinite(w.lon)) return null;

    const wrap = document.createElement('div');
    wrap.className = 'map-links';

    const aG = document.createElement('a');
    aG.href = this.app.geolocation.makeGoogleMapsUrl(w.lat, w.lon);
    aG.textContent = 'G';
    aG.className = 'map-link b';
    aG.target = '_blank';
    aG.title = 'Google Карты';
    wrap.appendChild(aG);

    const aY = document.createElement('a');
    aY.href = this.app.geolocation.makeYandexMapsUrl(w.lat, w.lon);
    aY.textContent = 'Я';
    aY.className = 'map-link b';
    aY.target = '_blank';
    aY.title = 'Яндекс Карты';
    wrap.appendChild(aY);

    return wrap;
  }

  async showPointDetails(record, addToHistory = true) {
    if (addToHistory) this.popupHistory = [];

    const f = record.fields;
    const popup = document.getElementById('nearbyPopup');

    const box = document.createElement('div');
    box.className = 'popup-content';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'popup-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.title = 'Закрыть';
    box.appendChild(closeBtn);

    if (this.popupHistory.length > 0) {
      const backBtn = document.createElement('button');
      backBtn.className = 'popup-back-btn';
      backBtn.innerHTML = '←';
      backBtn.title = 'Назад';
      box.appendChild(backBtn);
    }

    const header = document.createElement('div');
    header.className = 'popup-header';

    const title = document.createElement('h3');
    title.className = 'popup-title';
    title.textContent = f.Point || 'N/A';
    header.appendChild(title);

    if (f.Info) {
      const subtitle = document.createElement('div');
      subtitle.className = 'popup-subtitle';
      subtitle.textContent = f.Info;
      header.appendChild(subtitle);
    }

    const coordsDiv = document.createElement('div');
    coordsDiv.className = 'popup-coordinates';
    coordsDiv.innerHTML = `
      <strong>X (MSK):</strong> ${this._fmt(f.Xraw)}<br>
      <strong>Y (MSK):</strong> ${this._fmt(f.Yraw)}<br>
      <strong>H:</strong> ${this._fmt(f.H)}
    `;
    header.appendChild(coordsDiv);

    const links = this._createMapLinks(f);
    if (links) {
      links.className = 'map-links popup-map-links';
      header.appendChild(links);
    }

    box.appendChild(header);

    // Ближайшие
    const nearWrap = document.createElement('div');
    nearWrap.className = 'nearby-section';
    nearWrap.innerHTML = `<h4 class="nearby-title">Ближайшие точки (до 300м):</h4><div class="nearby-list"></div>`;
    box.appendChild(nearWrap);

    popup.innerHTML = '';
    popup.appendChild(box);
    popup.style.display = 'flex';

    if (addToHistory) this.popupHistory.push(record);

    const list = nearWrap.querySelector('.nearby-list');
    const nearby = await this.app.searchEngine.findNearby(this.app.state.fullDatabase, record, 300);
    if (!nearby.length) {
      const nores = document.createElement('div');
      nores.className = 'no-results';
      nores.textContent = 'Поблизости нет других точек';
      list.appendChild(nores);
    } else {
      for (const item of nearby) {
        const el = this._createRecordElement(item.record, true, item.distance);
        el.addEventListener('click', (e) => {
          if (e.target.classList.contains('map-link')) return;
          this.popupHistory.push(record);
          this.showPointDetails(item.record, false);
        });
        list.appendChild(el);
      }
    }

    // обработчики закрытия/назад
    const onClick = (e) => {
      if (e.target === popup || e.target.classList.contains('popup-close-btn')) this.closePopup();
      else if (e.target.classList.contains('popup-back-btn')) this.goBack();
    };
    popup.addEventListener('click', onClick, { once: true });
  }

  goBack() {
    if (!this.popupHistory.length) return;
    const prev = this.popupHistory.pop();
    this.showPointDetails(prev, false);
  }

  closePopup() {
    document.getElementById('nearbyPopup').style.display = 'none';
    this.popupHistory = [];
  }

  _fmt(v, digits = 3) {
    if (v === null || v === undefined || isNaN(v)) return 'N/A';
    return Number(v).toFixed(digits);
  }

  showMessage(message) {
    this.elements.messageState.textContent = message;
    this.elements.messageState.style.display = 'block';
    this.elements.messageState.classList.remove('error');
    this.elements.outputList.style.display = 'none';
  }
  showError(message) {
    this.elements.messageState.textContent = message;
    this.elements.messageState.style.display = 'block';
    this.elements.messageState.classList.add('error');
    this.elements.outputList.style.display = 'none';
  }
  showLoading() {
    this.elements.messageState.innerHTML = '<span class="loading-spinner"></span> Загрузка данных...';
    this.elements.messageState.style.display = 'block';
    this.elements.messageState.classList.remove('error');
    this.elements.outputList.style.display = 'none';
  }
}

/* ================================
   ПРИЛОЖЕНИЕ
==================================*/

export class GROApp {
  /**
   * @param {Object} config
   * @param {string} config.csvUrl             — URL CSV для конкретного объекта
   * @param {Object} config.sk42               — параметры СК-42
   * @param {number} config.sk42.zone          — номер зоны (например, 13)
   * @param {string=} config.sk42.towgs84      — опционально заменить параметры Bursa-Wolf
   */
  constructor(config = {}) {
    assert(config.csvUrl, 'Не задан csvUrl в конфигурации');
    assert(config.sk42 && config.sk42.zone, 'Не задана sk42.zone в конфигурации');

    // Сервисы
    this.coord = new CoordinateSystem({
      zone: Number(config.sk42.zone),
      towgs84: config.sk42.towgs84 || DEFAULT_TOWGS84
    });
    this.dataManager  = new DataManager({ csvUrl: config.csvUrl });
    this.geolocation  = new GeolocationService(this.coord);
    this.searchEngine = new SearchEngine({ geolocation: this.geolocation });
    this.uiController = new UIController(this);

    // Состояние
    this.state = {
      fullDatabase: [],
      displayedRecords: [],
      shouldIgnoreChars: false,
      searchMode: 'contains',
      isLoading: false,
      visibleRecords: []
    };
  }

  async init() {
    try {
      this.uiController.init();
      await this.loadData();
    } catch (e) {
      console.error('[App] init error:', e);
      this.uiController.showError('Ошибка инициализации приложения');
    }
  }

  async loadData() {
    this.state.isLoading = true;
    this.uiController.showLoading();
    try {
      const data = await this.dataManager.fetchData();
      this.state.fullDatabase = data;
      this.state.displayedRecords = [];
      this.state.visibleRecords = [];
      this.uiController.displayRecords([]);
      this.uiController.showMessage('База данных загружена. Введите запрос для поиска...');
    } catch (e) {
      this.uiController.showError(`Ошибка загрузки данных: ${e.message}`);
    } finally {
      this.state.isLoading = false;
    }
  }

  performSearch(searchTerm) {
    if (this.state.isLoading) return;

    if (!searchTerm) {
      this.state.displayedRecords = [];
      this.state.visibleRecords = [];
      this.uiController.displayRecords([]);
      return;
    }

    this.state.displayedRecords = this.searchEngine.search(
      this.state.fullDatabase,
      searchTerm,
      this.state.searchMode,
      this.state.shouldIgnoreChars
    );

    this.state.visibleRecords = this.state.displayedRecords;
    this.uiController.displayRecords(this.state.displayedRecords);
  }

  updateSettings(settings) {
    Object.assign(this.state, settings);
    if (this.state.visibleRecords?.length) {
      this.uiController.displayRecords(this.state.visibleRecords);
    }
  }

  async findNearbyUserLocation() {
    try {
      const pos = await this.geolocation.getCurrentPosition(); // WGS-84 из браузера
      const result = await this.searchEngine.findNearbyLocation(
        this.state.fullDatabase,
        pos.coords,
        300
      );
      this.uiController.showNearbyLocationPopup(result);
    } catch (e) {
      this.uiController.showError(`Ошибка геолокации: ${e.message}`);
    }
  }
}

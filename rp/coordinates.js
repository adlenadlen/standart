// modules/coordinates.js
// Конвенция: "Север" = X (northing), "Восток" = Y (easting)
export class CoordinateSystem {
  constructor() {
    // Только MSK и SK-42 (и WGS84 через proj4)
    this.OFFSET_SK42_ZONE13 = 13_000_000; // добавляется к Y при переходе MSK -> SK-42

    this.transformCache = new Map();
    this.maxCacheSize = 5000;

    this.initProj4();
  }

  initProj4() {
    if (typeof proj4 !== 'undefined') {
      // EPSG:28413 — СК-42 / Гаусс-Крюгер, зона 13 (центральный меридиан 75°E)
      // x_0 = 13 500 000, y_0 = 0; эллипсоид Красовского, Bursa-Wolf к WGS84.
      proj4.defs(
        "EPSG:28413",
        "+proj=tmerc +lat_0=0 +lon_0=75 +k=1 +x_0=13500000 +y_0=0 +ellps=krass " +
        "+towgs84=23.92,-141.27,-80.9,0,0.35,0.82,-0.12 +units=m +no_defs"
      );
      proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
    } else {
      console.warn("proj4.js не найден — toWGS84/fromWGS84 будут недоступны.");
    }
  }

  /** Публичное API с кешированием */
  transform(x, y, fromSystem, toSystem) {
    const fx = Number(x), fy = Number(y);
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) return { x: NaN, y: NaN };

    const fs = String(fromSystem || '').toLowerCase();
    const ts = String(toSystem || '').toLowerCase();

    if (fs === ts) return { x: fx, y: fy };

    const key = `${fx},${fy},${fs}->${ts}`;
    const cached = this.transformCache.get(key);
    if (cached) return cached;

    const res = this._performTransform(fx, fy, fs, ts);

    if (this.transformCache.size >= this.maxCacheSize) {
      const firstKey = this.transformCache.keys().next().value;
      this.transformCache.delete(firstKey);
    }
    this.transformCache.set(key, res);
    return res;
  }

  /** Внутреннее преобразование без кеша */
  _performTransform(x, y, fs, ts) {
    // Поддерживаем только msk, sk42
    if (!['msk', 'sk-42', 'sk42'].includes(fs) && fs !== 'msk') {
      return { x: NaN, y: NaN };
    }
    if (!['msk', 'sk-42', 'sk42'].includes(ts) && ts !== 'msk') {
      return { x: NaN, y: NaN };
    }

    const isSK = (s) => s === 'sk42' || s === 'sk-42';

    // MSK <-> SK-42 — только сдвиг по Y на 13 000 000
    if (fs === 'msk' && isSK(ts)) {
      return { x, y: y + this.OFFSET_SK42_ZONE13 };
    }
    if (isSK(fs) && ts === 'msk') {
      return { x, y: y - this.OFFSET_SK42_ZONE13 };
    }

    // если тут — значит либо msk->msk, sk42->sk42 (что отфильтровано выше), либо неподдерживаемая пара
    return { x: NaN, y: NaN };
  }

  // ---------- Проекции через proj4 (SK-42 зона 13 <-> WGS84) ----------

  /**
   * Перевод в WGS84 (lat/lon).
   * Допускает вход как MSK, так и SK-42: MSK предварительно конвертируется в SK-42 (добавляем 13 млн к Y).
   */
  toWGS84(x, y, fromSystem) {
    if (typeof proj4 === 'undefined') throw new Error('proj4.js не загружен');

    const fs = String(fromSystem || '').toLowerCase();
    let xSK = Number(x), ySK = Number(y);
    if (!Number.isFinite(xSK) || !Number.isFinite(ySK)) return null;

    if (fs === 'msk') {
      // MSK -> SK-42
      ySK = ySK + this.OFFSET_SK42_ZONE13;
    } else if (fs === 'sk42' || fs === 'sk-42') {
      // уже SK-42, ничего
    } else {
      return null; // не поддерживаем другие источники
    }

    try {
      // Порядок для proj4: [Easting, Northing] = [Y, X]
      const [lon, lat] = proj4("EPSG:28413", "EPSG:4326", [ySK, xSK]);
      return { lat, lon };
    } catch (e) {
      console.error('Ошибка преобразования в WGS84:', e);
      return null;
    }
  }

  /**
   * Перевод из WGS84 (lat/lon) в указанную систему: MSK или SK-42.
   * Сначала 4326 -> 28413 (получаем SK-42), затем при необходимости SK-42 -> MSK (вычитаем 13 млн из Y).
   */
  fromWGS84(lat, lon, toSystem) {
    if (typeof proj4 === 'undefined') throw new Error('proj4.js не загружен');

    const ts = String(toSystem || '').toLowerCase();
    try {
      const [easting, northing] = proj4("EPSG:4326", "EPSG:28413", [Number(lon), Number(lat)]);
      if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
        return { x: NaN, y: NaN };
      }

      if (ts === 'sk42' || ts === 'sk-42') {
        // Вернём как есть в SK-42
        return { x: northing, y: easting };
      }
      if (ts === 'msk') {
        // SK-42 -> MSK: вычесть 13 000 000 из Y
        return { x: northing, y: easting - this.OFFSET_SK42_ZONE13 };
      }

      return { x: NaN, y: NaN };
    } catch (e) {
      console.error('Ошибка преобразования из WGS84:', e);
      return { x: NaN, y: NaN };
    }
  }
}

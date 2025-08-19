// modules/searchEngine.js
// Поиск и "ближайшие" в ПЛОСКОЙ системе МСК (метры).
// Никаких переключений СК: база хранит точки в МСК (X=Север, Y=Восток).
// Для преобразования из WGS-84 используем внешний geolocation-сервис (инъекция зависимостей).

export class SearchEngine {
  /**
   * @param {Object} deps
   * @param {GeolocationService} deps.geolocation  Экземпляр geolocation.js (для WGS84 -> MSK)
   */
  constructor({ geolocation } = {}) {
    this.geolocation = geolocation || null;
  }

  // ---------- Текстовый поиск по названию точки ----------

  /**
   * Поиск по полю fields.Point
   * @param {Array} database
   * @param {string} searchTerm
   * @param {'contains'|'exact'} mode
   * @param {boolean} ignoreChars  — игнорировать ._,- при сравнении
   * @returns {Array} отфильтрованный список записей
   */
  search(database, searchTerm, mode = 'contains', ignoreChars = false) {
    if (!searchTerm) return [];

    const normalizedTerm = ignoreChars
      ? this.normalizeValue(searchTerm)
      : String(searchTerm).toLowerCase();

    return database.filter(record => {
      const pointValue = record?.fields?.Point;
      if (!pointValue) return false;

      const normalizedValue = ignoreChars
        ? this.normalizeValue(pointValue)
        : String(pointValue).toLowerCase();

      return mode === 'exact'
        ? normalizedValue === normalizedTerm
        : normalizedValue.includes(normalizedTerm);
    });
  }

  /**
   * Нормализация строки для мягкого поиска:
   * - нижний регистр
   * - удаляем . _ , -
   */
  normalizeValue(str) {
    if (!str) return '';
    return String(str).toLowerCase().replace(/[\._,\-]/g, '');
    // при желании сюда можно добавить trim и collapse spaces
  }

  // ---------- Ближайшие точки к эталонной (в МСК) ----------

  /**
   * Найти точки в пределах maxDistance (м) от переданной записи.
   * Расчёт в МСК (евклидово расстояние в метрах).
   * @param {Array} database
   * @param {Object} referenceRecord  — запись из базы (в МСК)
   * @param {number} maxDistance      — порог, м
   * @returns {Promise<Array<{record, distance, coords}>>} отсортировано по distance
   */
  async findNearby(database, referenceRecord, maxDistance = 300) {
    const ref = this.getCoordinatesMSK(referenceRecord?.fields);
    if (!this._isFinitePair(ref)) {
      throw new Error('Некорректные координаты исходной точки (MSK)');
    }

    const results = [];
    for (const rec of database) {
      if (rec.id === referenceRecord.id) continue;

      const c = this.getCoordinatesMSK(rec?.fields);
      if (!this._isFinitePair(c)) continue;

      const distance = this.calculateDistance(ref, c);
      if (distance <= maxDistance) {
        results.push({ record: rec, distance, coords: c });
      }
    }

    return results.sort((a, b) => a.distance - b.distance);
  }

  // ---------- Ближайшие точки к позиции пользователя (вход WGS-84) ----------

  /**
   * Найти ближайшие к пользователю точки (пользовательские координаты даны в WGS-84).
   * Внутри переводим WGS-84 → МСК через geolocation, затем считаем расстояния в МСК.
   * @param {Array} database
   * @param {{latitude:number, longitude:number}} userCoordsWGS
   * @param {number} maxDistance
   * @returns {Promise<{userCoords:{x:number,y:number}, points:Array<{record,distance,coords}>}>}
   */
  async findNearbyLocation(database, userCoordsWGS, maxDistance = 300) {
    if (!this.geolocation?.wgsToMSK) {
      throw new Error('GeolocationService не подключён: отсутствует wgsToMSK()');
    }

    const userMSK = this.geolocation.wgsToMSK(
      Number(userCoordsWGS.latitude),
      Number(userCoordsWGS.longitude)
    );
    if (!this._isFinitePair(userMSK)) {
      throw new Error('Не удалось преобразовать координаты пользователя в МСК');
    }

    const points = [];
    for (const rec of database) {
      const c = this.getCoordinatesMSK(rec?.fields);
      if (!this._isFinitePair(c)) continue;

      const distance = this.calculateDistance(userMSK, c);
      if (distance <= maxDistance) {
        points.push({ record: rec, distance, coords: c });
      }
    }

    return {
      userCoords: userMSK,
      points: points.sort((a, b) => a.distance - b.distance)
    };
  }

  // ---------- Вспомогательные ----------

  /**
   * Внутреннее представление координат записи — всегда МСК.
   * @param {Object} fields  — ожидает поля Xraw, Yraw (в МСК)
   * @returns {{x:number,y:number}}
   */
  getCoordinatesMSK(fields) {
    const x = Number(fields?.Xraw);
    const y = Number(fields?.Yraw);
    return { x, y };
  }

  /**
   * Евклидово расстояние в плоскости МСК (метры).
   */
  calculateDistance(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.hypot(dx, dy);
  }

  _isFinitePair(p) {
    return p && Number.isFinite(p.x) && Number.isFinite(p.y);
  }
}

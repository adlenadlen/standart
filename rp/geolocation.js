// modules/geolocation.js - Модуль работы с геолокацией и картами (MSK ↔ WGS-84)
import { CoordinateSystem } from './coordinates.js';

export class GeolocationService {
  constructor() {
    this.options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    // Используем координатный модуль для преобразований MSK ↔ WGS-84
    this.coord = new CoordinateSystem();
  }

  // ---- Браузерная геолокация ----

  async getCurrentPosition() {
    if (!('geolocation' in navigator)) {
      throw new Error('Геолокация не поддерживается вашим браузером');
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position),
        (error) => reject(this._wrapGeoError(error)),
        this.options
      );
    });
  }

  /** Вернёт текущую позицию пользователя сразу в МСК */
  async getCurrentPositionMSK() {
    const pos = await this.getCurrentPosition();
    const lat = Number(pos.coords.latitude);
    const lon = Number(pos.coords.longitude);

    const msk = this.wgsToMSK(lat, lon);
    if (!Number.isFinite(msk.x) || !Number.isFinite(msk.y)) {
      throw new Error('Не удалось преобразовать координаты в МСК');
    }

    return {
      x: msk.x,
      y: msk.y,
      raw: pos
    };
  }

  // ---- Преобразования координат (делегирует в coordinates.js) ----

  /** MSK -> WGS-84 { lat, lon } */
  mskToWGS(xMSK, yMSK) {
    try {
      const r = this.coord.toWGS84(xMSK, yMSK, 'msk');
      // toWGS84 может вернуть null при ошибке
      if (!r || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) {
        return { lat: NaN, lon: NaN };
      }
      return r;
    } catch {
      return { lat: NaN, lon: NaN };
    }
  }

  /** WGS-84 -> MSK { x, y } */
  wgsToMSK(lat, lon) {
    try {
      const r = this.coord.fromWGS84(lat, lon, 'msk');
      if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) {
        return { x: NaN, y: NaN };
      }
      return r;
    } catch {
      return { x: NaN, y: NaN };
    }
  }

  // ---- Карты ----

  /** Google Maps URL для lat/lon */
  makeGoogleMapsUrl(lat, lon, zoom = 18) {
    return `https://www.google.com/maps?q=${lat},${lon}&z=${zoom}`;
  }

  /** Яндекс.Карты URL для lat/lon */
  makeYandexMapsUrl(lat, lon, zoom = 18) {
    return `https://yandex.ru/maps/?pt=${lon},${lat}&z=${zoom}&l=map`;
  }

  /** Открыть координаты одновременно в Google и Яндекс картах */
  openInMaps(lat, lon, zoom = 18) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const g = this.makeGoogleMapsUrl(lat, lon, zoom);
    const y = this.makeYandexMapsUrl(lat, lon, zoom);
    // два окна — каждое в новой вкладке
    window.open(g, '_blank', 'noopener,noreferrer');
    window.open(y, '_blank', 'noopener,noreferrer');
  }

  // ---- Вспомогательное ----

  _wrapGeoError(error) {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return new Error('Доступ к геолокации запрещён');
      case error.POSITION_UNAVAILABLE:
        return new Error('Информация о местоположении недоступна');
      case error.TIMEOUT:
        return new Error('Тайм-аут запроса местоположения');
      default:
        return new Error('Неизвестная ошибка геолокации');
    }
  }
}

// modules/coordinates.js - Модуль работы с координатами
export class CoordinateSystem {
    constructor() {
        // Константы преобразования координат
        this.constants = {
            MSK: {
                IZP: { X0: 6305600, Y0: 557800, K1: 0.8048621495, K2: 0.5934618103 },
                GFU: { X0: 6301571.65, Y0: 561132.43, K1: 0.4303677383, K2: 0.90265363489 }
            }
        };
        
        // Кэш для преобразований
        this.transformCache = new Map();
        
        // Инициализация proj4
        this.initProj4();
    }
    
    initProj4() {
        if (typeof proj4 !== 'undefined') {
            proj4.defs("EPSG:28418", "+proj=tmerc +lat_0=0 +lon_0=105 +k=1 +x_0=18500000 +y_0=0 +ellps=krass +towgs84=23.92,-141.27,-80.9,-0,0.35,0.82,-0.12 +units=m +no_defs");
            proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
        }
    }
    
    transform(x, y, fromSystem, toSystem) {
        // Проверка кэша
        const cacheKey = `${x},${y},${fromSystem},${toSystem}`;
        if (this.transformCache.has(cacheKey)) {
            return this.transformCache.get(cacheKey);
        }
        
        const result = this._performTransform(x, y, fromSystem, toSystem);
        
        // Сохранение в кэш (ограничиваем размер кэша)
        if (this.transformCache.size > 10000) {
            const firstKey = this.transformCache.keys().next().value;
            this.transformCache.delete(firstKey);
        }
        this.transformCache.set(cacheKey, result);
        
        return result;
    }
    
    _performTransform(x, y, fromSystem, toSystem) {
        fromSystem = fromSystem.toLowerCase();
        toSystem = toSystem.toLowerCase();
        
        if (isNaN(x) || isNaN(y)) {
            return { x: NaN, y: NaN };
        }
        
        if (fromSystem === toSystem) {
            return { x, y };
        }
        
        // Преобразование в МСК
        let xMsk, yMsk;
        
        switch (fromSystem) {
            case 'msk':
                xMsk = x;
                yMsk = y;
                break;
            case 'izp':
                const izpConst = this.constants.MSK.IZP;
                xMsk = this._localToMskX(x, y, izpConst);
                yMsk = this._localToMskY(x, y, izpConst);
                break;
            case 'gfu':
                const gfuConst = this.constants.MSK.GFU;
                xMsk = this._localToMskX(x, y, gfuConst);
                yMsk = this._localToMskY(x, y, gfuConst);
                break;
            default:
                return { x: NaN, y: NaN };
        }
        
        // Преобразование из МСК в целевую систему
        switch (toSystem) {
            case 'msk':
                return { x: xMsk, y: yMsk };
            case 'izp':
                const izpConst2 = this.constants.MSK.IZP;
                return {
                    x: this._mskToLocalX(xMsk, yMsk, izpConst2),
                    y: this._mskToLocalY(xMsk, yMsk, izpConst2)
                };
            case 'gfu':
                const gfuConst2 = this.constants.MSK.GFU;
                return {
                    x: this._mskToLocalX(xMsk, yMsk, gfuConst2),
                    y: this._mskToLocalY(xMsk, yMsk, gfuConst2)
                };
            default:
                return { x: NaN, y: NaN };
        }
    }
    
    _mskToLocalX(xMsk, yMsk, constants) {
        return (xMsk - constants.X0) * constants.K1 + (yMsk - constants.Y0) * constants.K2;
    }
    
    _mskToLocalY(xMsk, yMsk, constants) {
        return (yMsk - constants.Y0) * constants.K1 - (xMsk - constants.X0) * constants.K2;
    }
    
    _localToMskX(xLocal, yLocal, constants) {
        return constants.X0 + xLocal * constants.K1 - yLocal * constants.K2;
    }
    
    _localToMskY(xLocal, yLocal, constants) {
        return constants.Y0 + xLocal * constants.K2 + yLocal * constants.K1;
    }
    
    toWGS84(x, y, fromSystem) {
        if (typeof proj4 === 'undefined') {
            throw new Error('proj4.js не загружен');
        }
        
        const mskCoords = this.transform(x, y, fromSystem, 'msk');
        if (isNaN(mskCoords.x) || isNaN(mskCoords.y)) {
            return null;
        }
        
        const sk42_x = mskCoords.x;
        const sk42_y = mskCoords.y + 18000000;
        
        try {
            const wgsCoords = proj4("EPSG:28418", "EPSG:4326", [sk42_y, sk42_x]);
            return { lat: wgsCoords[1], lon: wgsCoords[0] };
        } catch (e) {
            console.error('Ошибка преобразования в WGS84:', e);
            return null;
        }
    }
    
    fromWGS84(lat, lon, toSystem) {
        if (typeof proj4 === 'undefined') {
            throw new Error('proj4.js не загружен');
        }
        
        try {
            const sk42Coords = proj4("EPSG:4326", "EPSG:28418", [lon, lat]);
            const msk_x = sk42Coords[1];
            const msk_y = sk42Coords[0] - 18000000;
            
            return this.transform(msk_x, msk_y, 'msk', toSystem);
        } catch (e) {
            console.error('Ошибка преобразования из WGS84:', e);
            return { x: NaN, y: NaN };
        }
    }
}

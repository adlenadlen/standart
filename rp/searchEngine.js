// modules/searchEngine.js - Модуль поиска
import { CoordinateSystem } from './coordinates.js';

export class SearchEngine {
    constructor() {
        this.coordSystem = new CoordinateSystem();
    }
    
    search(database, searchTerm, mode = 'contains', ignoreChars = false) {
        if (!searchTerm) return [];
        
        const normalizedTerm = ignoreChars 
            ? this.normalizeValue(searchTerm) 
            : searchTerm.toLowerCase();
        
        return database.filter(record => {
            const pointValue = record.fields.Point;
            if (!pointValue) return false;
            
            const normalizedValue = ignoreChars 
                ? this.normalizeValue(pointValue) 
                : pointValue.toLowerCase();
            
            return mode === 'exact' 
                ? normalizedValue === normalizedTerm 
                : normalizedValue.includes(normalizedTerm);
        });
    }
    
    normalizeValue(str) {
        if (!str) return '';
        return str.toLowerCase().replace(/[\._,\-]/g, '');
    }
    
    async findNearby(database, referencePoint, coordMode, maxDistance) {
        const refCoords = this.getCoordinates(referencePoint.fields, coordMode);
        if (isNaN(refCoords.x) || isNaN(refCoords.y)) {
            throw new Error('Некорректные координаты исходной точки');
        }
        
        const nearbyPoints = [];
        
        for (const record of database) {
            if (record.id === referencePoint.id) continue;
            
            const coords = this.getCoordinates(record.fields, coordMode);
            if (isNaN(coords.x) || isNaN(coords.y)) continue;
            
            const distance = this.calculateDistance(refCoords, coords);
            if (distance <= maxDistance) {
                nearbyPoints.push({
                    record,
                    distance,
                    coords
                });
            }
        }
        
        return nearbyPoints.sort((a, b) => a.distance - b.distance);
    }
    
    async findNearbyLocation(database, userCoords, coordMode, maxDistance) {
        const userCoordsInSystem = this.coordSystem.fromWGS84(
            userCoords.latitude,
            userCoords.longitude,
            coordMode
        );
        
        if (isNaN(userCoordsInSystem.x) || isNaN(userCoordsInSystem.y)) {
            throw new Error('Не удалось преобразовать координаты');
        }
        
        const nearbyPoints = [];
        
        for (const record of database) {
            const coords = this.getCoordinates(record.fields, coordMode);
            if (isNaN(coords.x) || isNaN(coords.y)) continue;
            
            const distance = this.calculateDistance(userCoordsInSystem, coords);
            if (distance <= maxDistance) {
                nearbyPoints.push({
                    record,
                    distance,
                    coords
                });
            }
        }
        
        return {
            userCoords: userCoordsInSystem,
            points: nearbyPoints.sort((a, b) => a.distance - b.distance)
        };
    }
    
    getCoordinates(fields, targetMode) {
        const sourceSystem = fields.CoordSystem.toLowerCase();
        return this.coordSystem.transform(
            fields.Xraw,
            fields.Yraw,
            sourceSystem,
            targetMode
        );
    }
    
    calculateDistance(coord1, coord2) {
        const dx = coord2.x - coord1.x;
        const dy = coord2.y - coord1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

// modules/geolocation.js - Модуль работы с геолокацией
export class GeolocationService {
    constructor() {
        this.options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };
    }
    
    async getCurrentPosition() {
        if (!navigator.geolocation) {
            throw new Error('Геолокация не поддерживается вашим браузером');
        }
        
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => resolve(position),
                (error) => reject(this.handleError(error)),
                this.options
            );
        });
    }
    
    handleError(error) {
        switch (error.code) {
            case error.PERMISSION_DENIED:
                return new Error('Доступ к геолокации запрещен');
            case error.POSITION_UNAVAILABLE:
                return new Error('Информация о местоположении недоступна');
            case error.TIMEOUT:
                return new Error('Тайм-аут запроса местоположения');
            default:
                return new Error('Неизвестная ошибка геолокации');
        }
    }
}

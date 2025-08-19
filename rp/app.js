// app.js - Обновленный главный модуль (убираем разделитель)
import { CoordinateSystem } from 'coordinates.js';
import { DataManager } from 'dataManager.js';
import { UIController } from 'uiController.js';
import { SearchEngine } from 'searchEngine.js';
import { GeolocationService } from 'geolocation.js';

class GROApp {
    constructor() {
        this.coordinateSystem = new CoordinateSystem();
        this.dataManager = new DataManager();
        this.searchEngine = new SearchEngine();
        this.geolocationService = new GeolocationService();
        this.uiController = new UIController(this);
        
        this.state = {
            fullDatabase: [],
            displayedRecords: [],
            currentCoordMode: 'izp',
            shouldIgnoreChars: false,
            searchMode: 'contains',
            isLoading: false
        };
    }
    
    async init() {
        try {
            this.uiController.init();
            await this.loadData();
        } catch (error) {
            console.error('Ошибка инициализации приложения:', error);
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
            this.uiController.displayRecords([]);
            this.uiController.showMessage('База данных загружена. Введите запрос для поиска...');
        } catch (error) {
            this.uiController.showError(`Ошибка загрузки данных: ${error.message}`);
        } finally {
            this.state.isLoading = false;
        }
    }
    
    performSearch(searchTerm) {
        if (this.state.isLoading) return;
        
        if (!searchTerm) {
            this.state.displayedRecords = [];
            this.uiController.displayRecords([]);
            return;
        }
        
        this.state.displayedRecords = this.searchEngine.search(
            this.state.fullDatabase,
            searchTerm,
            this.state.searchMode,
            this.state.shouldIgnoreChars
        );
        
        this.uiController.displayRecords(this.state.displayedRecords);
    }
    
    updateSettings(settings) {
        Object.assign(this.state, settings);
        
        if (settings.currentCoordMode !== undefined) {
            this.uiController.displayRecords(this.state.displayedRecords);
        }
    }
    
    async findNearbyPoints(referencePoint) {
        const nearbyPoints = await this.searchEngine.findNearby(
            this.state.fullDatabase,
            referencePoint,
            this.state.currentCoordMode,
            300
        );
        
        this.uiController.showNearbyPopup(nearbyPoints, referencePoint);
    }
    
    async findNearbyUserLocation() {
        try {
            const position = await this.geolocationService.getCurrentPosition();
            const nearbyPoints = await this.searchEngine.findNearbyLocation(
                this.state.fullDatabase,
                position.coords,
                this.state.currentCoordMode,
                300
            );
            
            this.uiController.showNearbyLocationPopup(nearbyPoints, position.coords);
        } catch (error) {
            this.uiController.showError(`Ошибка геолокации: ${error.message}`);
        }
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    const app = new GROApp();
    app.init();
});

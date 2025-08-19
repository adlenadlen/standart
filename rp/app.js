// app.js — главный модуль (только МСК)
// ВНИМАНИЕ: пути импортов предполагают структуру /modules/*.js
import { DataManager }       from 'dataManager.js';
import { UIController }      from 'uiController.js';
import { SearchEngine }      from 'searchEngine.js';
import { GeolocationService } from 'geolocation.js';

class GROApp {
  constructor() {
    // Сервисы
    this.dataManager = new DataManager();
    this.geolocation = new GeolocationService();      // ← так UI сможет вызвать app.geolocation.mskToWGS(...)
    this.searchEngine = new SearchEngine({ geolocation: this.geolocation });
    this.uiController = new UIController(this);

    // Состояние
    this.state = {
      fullDatabase: [],
      displayedRecords: [],
      shouldIgnoreChars: false,
      searchMode: 'contains',
      isLoading: false,
      visibleRecords: [] // для перерисовки без повторного поиска
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
      this.state.visibleRecords = [];
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

  // сейчас настраиваем только режим поиска и игнор-символы
  updateSettings(settings) {
    Object.assign(this.state, settings);
    // Перерисуем текущие записи, если уже что-то показано
    if (this.state.visibleRecords?.length) {
      this.uiController.displayRecords(this.state.visibleRecords);
    }
  }

  // Поиск ближайших к выбранной записи (всегда в МСК)
  async findNearbyPoints(referenceRecord) {
    try {
      const nearbyPoints = await this.searchEngine.findNearby(
        this.state.fullDatabase,
        referenceRecord,
        300
      );
      // В UI показ ближайших инициируется из showPointDetails -> populateNearbyList,
      // поэтому отдельного попапа здесь не открываем.
      return nearbyPoints;
    } catch (e) {
      console.error(e);
      this.uiController.showError('Не удалось найти ближайшие точки');
      return [];
    }
  }

  // Поиск ближайших к текущему положению пользователя
  async findNearbyUserLocation() {
    try {
      const position = await this.geolocation.getCurrentPosition(); // WGS-84 из браузера
      const result = await this.searchEngine.findNearbyLocation(
        this.state.fullDatabase,
        position.coords,
        300
      );
      // UI ожидает объект { userCoords: {x,y}, points: [...] }
      this.uiController.showNearbyLocationPopup(result);
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

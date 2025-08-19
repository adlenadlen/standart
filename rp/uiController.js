// modules/uiController.js - Полный модуль управления интерфейсом
import { CoordinateSystem } from './coordinates.js';

export class UIController {
    constructor(app) {
        this.app = app;
        this.coordSystem = new CoordinateSystem();
        this.elements = {};
        this.debounceTimer = null;
        this.popupHistory = [];
    }
    
    init() {
        this.createElements();
        this.bindEvents();
    }
    
    createElements() {
        const searchControls = document.getElementById('searchControls');
        searchControls.innerHTML = this.createSearchControlsHTML();
        
        const conversionControls = document.getElementById('conversionControls');
        conversionControls.innerHTML = this.createConversionControlsHTML();
        
        this.elements = {
            searchInput: document.getElementById('searchInput'),
            outputList: document.getElementById('outputList'),
            messageState: document.getElementById('messageState'),
            nearbyPopup: document.getElementById('nearbyPopup'),
            nearbyList: document.getElementById('nearbyList'),
            nearbyPopupTitle: document.getElementById('nearbyPopupTitle'),
            manualCoordX: document.getElementById('manualCoordX'),
            manualCoordY: document.getElementById('manualCoordY'),
            manualResultX: document.getElementById('manualResultX'),
            manualResultY: document.getElementById('manualResultY')
        };
    }
    
    createSearchControlsHTML() {
        return `
            <div class="control-row">
                <span class="control-label">Целевая СК:</span>
                <div class="coord-toggle">
                    <input id="toggleIzp" name="coordSystem" type="radio" value="izp" checked>
                    <label for="toggleIzp">ИЗП</label>
                    <input id="toggleMsk" name="coordSystem" type="radio" value="msk">
                    <label for="toggleMsk">МСК</label>
                    <input id="toggleGfu" name="coordSystem" type="radio" value="gfu">
                    <label for="toggleGfu">ГФУ</label>
                </div>
            </div>
            <div class="control-row">
                <span class="control-label">Совпадение:</span>
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
                    <input id="ignoreOn" name="ignoreMode" type="radio" value="on">
                    <label for="ignoreOn">Вкл</label>
                </div>
            </div>
            <div class="control-row search-row">
                <input id="searchInput" type="text" placeholder="Поиск по названию..." class="search-input">
                <button id="geolocateButton" class="b geolocate-button" title="Поиск по геолокации">📍</button>
            </div>
        `;
    }
    
    createConversionControlsHTML() {
        return `
            <div class="control-row">
                <span class="control-label">Исходная система:</span>
                <div class="coord-toggle">
                    <input id="manualSourceIzp" name="manualSourceSystem" type="radio" value="izp" checked>
                    <label for="manualSourceIzp">ИЗП</label>
                    <input id="manualSourceMsk" name="manualSourceSystem" type="radio" value="msk">
                    <label for="manualSourceMsk">МСК</label>
                    <input id="manualSourceGfu" name="manualSourceSystem" type="radio" value="gfu">
                    <label for="manualSourceGfu">ГФУ</label>
                </div>
            </div>
            <div class="control-row">
                <label for="manualCoordX" class="control-label">X (Север):</label>
                <input id="manualCoordX" type="text" placeholder="Введите X" class="manual-coord-input" inputmode="decimal">
            </div>
            <div class="control-row">
                <label for="manualCoordY" class="control-label">Y (Восток):</label>
                <input id="manualCoordY" type="text" placeholder="Введите Y" class="manual-coord-input" inputmode="decimal">
            </div>
            <div class="control-row">
                <span class="control-label">Целевая система:</span>
                <div class="coord-toggle">
                    <input id="manualTargetIzp" name="manualTargetSystem" type="radio" value="izp">
                    <label for="manualTargetIzp">ИЗП</label>
                    <input id="manualTargetMsk" name="manualTargetSystem" type="radio" value="msk" checked>
                    <label for="manualTargetMsk">МСК</label>
                    <input id="manualTargetGfu" name="manualTargetSystem" type="radio" value="gfu">
                    <label for="manualTargetGfu">ГФУ</label>
                </div>
            </div>
            <div class="control-row">
                <span class="control-label">Результат:</span>
                <div class="conversion-result">
                    X: <span id="manualResultX">---</span>
                    Y: <span id="manualResultY">---</span>
                </div>
            </div>
        `;
    }
    
    bindEvents() {
        // Поиск
        this.elements.searchInput.addEventListener('input', () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.app.performSearch(this.elements.searchInput.value.trim());
            }, 400);
        });
        
        // Переключатели
        document.querySelectorAll('input[name="coordSystem"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.app.updateSettings({ currentCoordMode: e.target.value });
            });
        });
        
        document.querySelectorAll('input[name="searchMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.app.updateSettings({ searchMode: e.target.value });
                if (this.elements.searchInput.value.trim()) {
                    this.app.performSearch(this.elements.searchInput.value.trim());
                }
            });
        });
        
        document.querySelectorAll('input[name="ignoreMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
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
        
        // Клики по записям в основном списке
        this.elements.outputList.addEventListener('click', (e) => {
            if (e.target.classList.contains('map-link')) {
                return;
            }
            
            const outputLine = e.target.closest('.output-line');
            if (outputLine) {
                e.preventDefault();
                const recordId = outputLine.dataset.recordId;
                const record = this.app.state.fullDatabase.find(r => r.id === recordId);
                if (record) {
                    this.showPointDetails(record);
                }
            }
        });
        
        // Закрытие попапа
        this.elements.nearbyPopup.addEventListener('click', (e) => {
            if (e.target === this.elements.nearbyPopup || e.target.classList.contains('popup-close-btn')) {
                this.closePopup();
            } else if (e.target.classList.contains('popup-back-btn')) {
                this.goBack();
            }
        });
        
        // Конвертация координат
        this.bindConversionEvents();
    }
    
    bindConversionEvents() {
        const updateConversion = () => {
            const sourceSystem = document.querySelector('input[name="manualSourceSystem"]:checked').value;
            const targetSystem = document.querySelector('input[name="manualTargetSystem"]:checked').value;
            
            const xValue = this.elements.manualCoordX.value.trim().replace(',', '.');
            const yValue = this.elements.manualCoordY.value.trim().replace(',', '.');
            
            if (!xValue || !yValue) {
                this.elements.manualResultX.textContent = '---';
                this.elements.manualResultY.textContent = '---';
                return;
            }
            
            const x = parseFloat(xValue);
            const y = parseFloat(yValue);
            
            const result = this.coordSystem.transform(x, y, sourceSystem, targetSystem);
            this.elements.manualResultX.textContent = this.formatCoordinate(result.x);
            this.elements.manualResultY.textContent = this.formatCoordinate(result.y);
        };
        
        document.querySelectorAll('input[name="manualSourceSystem"], input[name="manualTargetSystem"]').forEach(radio => {
            radio.addEventListener('change', updateConversion);
        });
        
        this.elements.manualCoordX.addEventListener('input', updateConversion);
        this.elements.manualCoordY.addEventListener('input', updateConversion);
    }
    
    displayRecords(records) {
        if (this.app.state.isLoading) {
            this.showLoading();
            return;
        }
        
        if (records.length === 0) {
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
        
        const fragment = document.createDocumentFragment();
        
        records.forEach(record => {
            const element = this.createRecordElement(record);
            fragment.appendChild(element);
        });
        
        this.elements.outputList.innerHTML = '';
        this.elements.outputList.appendChild(fragment);
    }
    
    createRecordElement(record, showDistance = false, distance = null) {
        const div = document.createElement('div');
        div.className = 'output-line';
        div.dataset.recordId = record.id;
        
        const fields = record.fields;
        
        // Расстояние (если нужно показывать)
        if (showDistance && distance !== null) {
            const distanceSpan = document.createElement('span');
            distanceSpan.className = 'nearby-distance';
            distanceSpan.textContent = `${distance.toFixed(1)}м`;
            div.appendChild(distanceSpan);
        }
        
        // Название точки
        const pointName = document.createElement('span');
        pointName.className = 'point-name';
        pointName.textContent = fields.Point || 'N/A';
        div.appendChild(pointName);
        
        // Примечание
        if (fields.Info) {
            const info = document.createElement('span');
            info.className = 'point-info';
            info.textContent = fields.Info;
            div.appendChild(info);
        }
        
        // Кнопки карт
        const mapLinks = this.createMapLinks(fields);
        if (mapLinks) {
            div.appendChild(mapLinks);
        }
        
        return div;
    }
    
    createMapLinks(fields) {
        const wgsCoords = this.coordSystem.toWGS84(
            fields.Xraw,
            fields.Yraw,
            fields.CoordSystem.toLowerCase()
        );
        
        if (!wgsCoords) return null;
        
        const mapLinks = document.createElement('div');
        mapLinks.className = 'map-links';
        
        const googleLink = document.createElement('a');
        googleLink.href = `https://www.google.com/maps?q=${wgsCoords.lat},${wgsCoords.lon}`;
        googleLink.textContent = 'G';
        googleLink.className = 'map-link b';
        googleLink.target = '_blank';
        googleLink.title = 'Google Карты';
        mapLinks.appendChild(googleLink);
        
        const yandexLink = document.createElement('a');
        yandexLink.href = `https://yandex.ru/maps/?pt=${wgsCoords.lon},${wgsCoords.lat}&z=18&l=map`;
        yandexLink.textContent = 'Я';
        yandexLink.className = 'map-link b';
        yandexLink.target = '_blank';
        yandexLink.title = 'Яндекс Карты';
        mapLinks.appendChild(yandexLink);
        
        return mapLinks;
    }
    
    showPointDetails(record, addToHistory = true) {
        if (addToHistory) {
            this.popupHistory = [];
        }
        
        const fields = record.fields;
        const coords = this.coordSystem.transform(
            fields.Xraw,
            fields.Yraw,
            fields.CoordSystem.toLowerCase(),
            this.app.state.currentCoordMode
        );
        
        // Создаем содержимое попапа
        const popupContent = document.createElement('div');
        popupContent.className = 'popup-content';
        
        // Кнопки управления
        const closeBtn = document.createElement('button');
        closeBtn.className = 'popup-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.title = 'Закрыть';
        popupContent.appendChild(closeBtn);
        
        if (this.popupHistory.length > 0) {
            const backBtn = document.createElement('button');
            backBtn.className = 'popup-back-btn';
            backBtn.innerHTML = '←';
            backBtn.title = 'Назад';
            popupContent.appendChild(backBtn);
        }
        
        // Заголовок
        const header = document.createElement('div');
        header.className = 'popup-header';
        
        const title = document.createElement('h3');
        title.className = 'popup-title';
        title.textContent = fields.Point || 'N/A';
        header.appendChild(title);
        
        // Примечание
        if (fields.Info) {
            const subtitle = document.createElement('div');
            subtitle.className = 'popup-subtitle';
            subtitle.textContent = fields.Info;
            header.appendChild(subtitle);
        }
        
        // Координаты
        const coordsDiv = document.createElement('div');
        coordsDiv.className = 'popup-coordinates';
        coordsDiv.innerHTML = `
            <strong>X:</strong> ${this.formatCoordinate(coords.x)}<br>
            <strong>Y:</strong> ${this.formatCoordinate(coords.y)}<br>
            <strong>H:</strong> ${this.formatCoordinate(fields.H)}
        `;
        header.appendChild(coordsDiv);
        
        // Кнопки карт
        const mapLinks = this.createMapLinks(fields);
        if (mapLinks) {
            mapLinks.className = 'map-links popup-map-links';
            header.appendChild(mapLinks);
        }
        
        popupContent.appendChild(header);
        
        // Ближайшие точки
        const nearbySection = document.createElement('div');
        nearbySection.className = 'nearby-section';
        
        const nearbyTitle = document.createElement('h4');
        nearbyTitle.className = 'nearby-title';
        nearbyTitle.textContent = 'Ближайшие точки (до 300м):';
        nearbySection.appendChild(nearbyTitle);
        
        const nearbyList = document.createElement('div');
        nearbyList.className = 'nearby-list';
        nearbySection.appendChild(nearbyList);
        
        popupContent.appendChild(nearbySection);
        
        // Загружаем ближайшие точки
        this.app.searchEngine.findNearby(
            this.app.state.fullDatabase,
            record,
            this.app.state.currentCoordMode,
            300
        ).then(nearbyPoints => {
            this.populateNearbyList(nearbyList, nearbyPoints, record);
        });
        
        // Показываем попап
        this.elements.nearbyPopup.innerHTML = '';
        this.elements.nearbyPopup.appendChild(popupContent);
        this.elements.nearbyPopup.style.display = 'flex';
        
        if (addToHistory) {
            this.popupHistory.push(record);
        }
    }
    
    populateNearbyList(container, nearbyPoints, currentRecord) {
        container.innerHTML = '';
        
        if (nearbyPoints.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'no-results';
            noResults.textContent = 'Поблизости нет других точек';
            container.appendChild(noResults);
            return;
        }
        
        nearbyPoints.forEach(item => {
            const element = this.createRecordElement(item.record, true, item.distance);
            
            element.addEventListener('click', (e) => {
                if (e.target.classList.contains('map-link')) {
                    return;
                }
                this.popupHistory.push(currentRecord);
                this.showPointDetails(item.record, false);
            });
            
            container.appendChild(element);
        });
    }
    
    showNearbyLocationPopup(result, userCoords) {
        const popupContent = document.createElement('div');
        popupContent.className = 'popup-content';
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'popup-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.title = 'Закрыть';
        popupContent.appendChild(closeBtn);
        
        const header = document.createElement('div');
        header.className = 'popup-header';
        
        const title = document.createElement('h3');
        title.className = 'popup-title';
        title.textContent = 'Геолокация';
        header.appendChild(title);
        
        const coordsDiv = document.createElement('div');
        coordsDiv.className = 'popup-coordinates';
        coordsDiv.innerHTML = `
            Ваше местоположение (${this.app.state.currentCoordMode.toUpperCase()}):<br>
            <strong>X:</strong> ${this.formatCoordinate(result.userCoords.x)}<br>
            <strong>Y:</strong> ${this.formatCoordinate(result.userCoords.y)}
        `;
        header.appendChild(coordsDiv);
        
        popupContent.appendChild(header);
        
        const nearbySection = document.createElement('div');
        nearbySection.className = 'nearby-section';
        
        const nearbyTitle = document.createElement('h4');
        nearbyTitle.className = 'nearby-title';
        nearbyTitle.textContent = 'Ближайшие точки (до 300м):';
        nearbySection.appendChild(nearbyTitle);
        
        const nearbyList = document.createElement('div');
        nearbyList.className = 'nearby-list';
        
        if (result.points.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'no-results';
            noResults.textContent = 'Поблизости нет точек';
            nearbyList.appendChild(noResults);
        } else {
            result.points.forEach(item => {
                const element = this.createRecordElement(item.record, true, item.distance);
                
                element.addEventListener('click', (e) => {
                    if (e.target.classList.contains('map-link')) {
                        return;
                    }
                    this.showPointDetails(item.record);
                });
                
                nearbyList.appendChild(element);
            });
        }
        
        nearbySection.appendChild(nearbyList);
        popupContent.appendChild(nearbySection);
        
        this.elements.nearbyPopup.innerHTML = '';
        this.elements.nearbyPopup.appendChild(popupContent);
        this.elements.nearbyPopup.style.display = 'flex';
        
        this.popupHistory = [];
    }
    
    goBack() {
        if (this.popupHistory.length > 0) {
            const previousRecord = this.popupHistory.pop();
            this.showPointDetails(previousRecord, false);
        }
    }
    
    closePopup() {
        this.elements.nearbyPopup.style.display = 'none';
        this.popupHistory = [];
    }
    
    formatCoordinate(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return 'N/A';
        }
        return parseFloat(value).toFixed(3);
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

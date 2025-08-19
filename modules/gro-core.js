// /modules/gro-core.js (LITE)
// MSK хранится как X=Север, Y=Восток. MSK↔WGS идёт через SK-42 (зона в конфиге).

/* ------------ helpers ------------ */
const DEFAULT_TOWGS84 = '23.92,-141.27,-80.9,0,0.35,0.82,-0.12';
const n = v => (v = Number(v), Number.isFinite(v) ? v : NaN);

/* ------------ DataManager (CSV) ------------ */
class DataManager {
  constructor({ csvUrl }) {
    if (!csvUrl) throw new Error('csvUrl обязателен');
    this.csvUrl = csvUrl;
  }
  async fetchData() {
    const resp = await fetch(this.csvUrl, { headers: { 'Accept':'text/csv' }, cache:'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = (await resp.text()).replace(/^\uFEFF/, '');
    return this.parseCSV(text);
  }
  // Ожидаем: Название,Север,Восток,Отметка,Код
  parseCSV(csv) {
    const lines = csv.replace(/\r\n?/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0];
    // если нужно авто-детект разделителя, раскомментируй следующую строку
    // const delim = ((header.match(/;/g)||[]).length > (header.match(/,/g)||[]).length) ? ';' : ',';
    const delim = ','; // упрощаем: Google CSV — запятая
    const split = (line) => {
      const out=[]; let cur='', q=false;
      for (let i=0;i<line.length;i++){
        const c=line[i];
        if (c === '"') { if (q && line[i+1] === '"') { cur+='"'; i++; } else q=!q; }
        else if (c===delim && !q) { out.push(cur); cur=''; }
        else cur+=c;
      }
      out.push(cur);
      return out;
    };

    const recs = [];
    for (let i=1;i<lines.length;i++){
      const p = split(lines[i]);
      // застраховаться на случай «нехватающих» полей
      const point = (p[0] || '').trim();
      const xStr  = (p[1] || '').replace(',', '.').trim();
      const yStr  = (p[2] || '').replace(',', '.').trim();
      const hStr  = (p[3] || '').replace(',', '.').trim();
      const info  = (p[4] || '').trim();

      const Xraw = parseFloat(xStr);
      const Yraw = parseFloat(yStr);
      const H    = hStr ? parseFloat(hStr) : NaN;
      if (!Number.isFinite(Xraw) || !Number.isFinite(Yraw)) continue;

      recs.push({
        id: `rp_${i+1}`,
        fields: { CoordSystem:'МСК', Point:point, Xraw, Yraw, H: Number.isFinite(H)?H:NaN, Info:info }
      });
    }
    return recs;
  }
}

/* ------------ Coordinates (MSK/SK-42/WGS) ------------ */
class CoordinateSystem {
  constructor({ zone, towgs84 }) {
    if (!zone) throw new Error('sk42.zone обязателен');
    this.zone = Number(zone);
    this.towgs84 = towgs84 || DEFAULT_TOWGS84;
    this.zoneOffset = this.zone * 1_000_000;           // зонный миллион
    this.lon0 = this.zone * 6 - 3;                     // центральный меридиан
    this.x0   = this.zone * 1_000_000 + 500_000;       // x0 в проекции
    // proj4-строка для зоны (СК-42, Красовский)
    this.projStr = `+proj=tmerc +lat_0=0 +lon_0=${this.lon0} +k=1 +x_0=${this.x0} +y_0=0 +ellps=krass +towgs84=${this.towgs84} +units=m +no_defs`;
  }
  toWGS84(xMSK, yMSK) {
    if (typeof proj4 === 'undefined') return null;
    const E = n(yMSK) + this.zoneOffset;
    const N = n(xMSK);
    if (!Number.isFinite(E) || !Number.isFinite(N)) return null;
    try {
      const [lon, lat] = proj4(this.projStr, 'WGS84', [E, N]);
      return { lat, lon };
    } catch { return null; }
  }
  fromWGS84(lat, lon) {
    if (typeof proj4 === 'undefined') return { x:NaN, y:NaN };
    try {
      const [E, N] = proj4('WGS84', this.projStr, [n(lon), n(lat)]);
      return { x: N, y: E - this.zoneOffset };
    } catch { return { x:NaN, y:NaN }; }
  }
}

/* ------------ Geolocation ------------ */
class GeolocationService {
  constructor(coord) {
    this.coord = coord;
    this.options = { enableHighAccuracy:true, timeout:10000, maximumAge:0 };
  }
  getCurrentPosition() {
    if (!('geolocation' in navigator)) return Promise.reject(new Error('Геолокация не поддерживается вашим браузером'));
    return new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, e => rej(this._err(e)), this.options)
    );
  }
  mskToWGS(x, y) { return this.coord.toWGS84(x, y) || { lat:NaN, lon:NaN }; }
  wgsToMSK(lat, lon){ return this.coord.fromWGS84(lat, lon); }
  makeGoogleMapsUrl(lat, lon, z=18){ return `https://www.google.com/maps?q=${lat},${lon}&z=${z}`; }
  makeYandexMapsUrl(lat, lon, z=18){ return `https://yandex.ru/maps/?pt=${lon},${lat}&z=${z}&l=map`; }
  _err(e){switch(e.code){case e.PERMISSION_DENIED:return new Error('Доступ к геолокации запрещён');
    case e.POSITION_UNAVAILABLE:return new Error('Информация о местоположении недоступна');
    case e.TIMEOUT:return new Error('Тайм-аут запроса местоположения');
    default:return new Error('Неизвестная ошибка геолокации');}}
}

/* ------------ SearchEngine ------------ */
class SearchEngine {
  constructor({ geolocation }={}){ this.geolocation = geolocation || null; }
  search(db, term, mode='contains', ignore=false){
    if (!term) return [];
    const q = ignore ? this._norm(term) : String(term).toLowerCase();
    return db.filter(r=>{
      const p = r?.fields?.Point; if (!p) return false;
      const v = ignore ? this._norm(p) : String(p).toLowerCase();
      return mode==='exact' ? v===q : v.includes(q);
    });
  }
  _norm(s){ return String(s).toLowerCase().replace(/[\._,\-]/g,''); }
  async findNearby(db, ref, max=300){
    const a = this._msk(ref?.fields); if (!this._ok(a)) throw new Error('Некорректные координаты исходной точки');
    const out=[]; for (const r of db){ if (r.id===ref.id) continue;
      const b=this._msk(r.fields); if(!this._ok(b)) continue;
      const d=Math.hypot(b.x-a.x,b.y-a.y); if(d<=max) out.push({record:r,distance:d,coords:b});
    }
    return out.sort((x,y)=>x.distance-y.distance);
  }
  async findNearbyLocation(db, userWGS, max=300){
    if (!this.geolocation?.wgsToMSK) throw new Error('GeolocationService не подключён');
    const u=this.geolocation.wgsToMSK(userWGS.latitude, userWGS.longitude);
    if(!this._ok(u)) throw new Error('Не удалось преобразовать координаты пользователя');
    const out=[]; for(const r of db){ const c=this._msk(r.fields); if(!this._ok(c)) continue;
      const d=Math.hypot(c.x-u.x,c.y-u.y); if(d<=max) out.push({record:r,distance:d,coords:c}); }
    return { userCoords:u, points: out.sort((x,y)=>x.distance-y.distance) };
  }
  _msk(f){ return { x:n(f?.Xraw), y:n(f?.Yraw) }; }
  _ok(p){ return p && Number.isFinite(p.x) && Number.isFinite(p.y); }
}

/* ------------ UI (минимум) ------------ */
class UIController {
  constructor(app){
    this.app=app; this.elements={}; this.debounce=null; this.popupHistory=[];
    this.onOverlayClick=this.onOverlayClick.bind(this);
    this.onKeyDown=this.onKeyDown.bind(this);
    this.popupEventsBound=false;
  }
  init(){ this._create(); this._bind(); }
  _create(){
    const sc=document.getElementById('searchControls');
    sc.innerHTML = `
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
      </div>`;
    const conv=document.querySelector('.conversion-section'); if (conv) conv.style.display='none';
    this.elements={ searchInput:document.getElementById('searchInput'),
      outputList:document.getElementById('outputList'),
      messageState:document.getElementById('messageState'),
      nearbyPopup:document.getElementById('nearbyPopup') };
    if (!this.popupEventsBound){
      this.elements.nearbyPopup.addEventListener('click', this.onOverlayClick);
      document.addEventListener('keydown', this.onKeyDown);
      this.popupEventsBound=true;
    }
  }
  _bind(){
    this.elements.searchInput.addEventListener('input', ()=>{
      clearTimeout(this.debounce);
      this.debounce=setTimeout(()=>this.app.performSearch(this.elements.searchInput.value.trim()),400);
    });
    document.querySelectorAll('input[name="searchMode"]').forEach(r=>{
      r.addEventListener('change',e=>{
        this.app.updateSettings({searchMode:e.target.value});
        if (this.elements.searchInput.value.trim()) this.app.performSearch(this.elements.searchInput.value.trim());
      });
    });
    document.querySelectorAll('input[name="ignoreMode"]').forEach(r=>{
      r.addEventListener('change',e=>{
        this.app.updateSettings({shouldIgnoreChars:e.target.value==='on'});
        if (this.elements.searchInput.value.trim()) this.app.performSearch(this.elements.searchInput.value.trim());
      });
    });
    document.getElementById('geolocateButton').addEventListener('click',()=>this.app.findNearbyUserLocation());
    this.elements.outputList.addEventListener('click', (e)=>{
      if (e.target.classList.contains('map-link')) return;
      const row=e.target.closest('.output-line'); if(!row) return;
      const rec=this.app.state.fullDatabase.find(r=>r.id===row.dataset.recordId);
      if (rec) this.showPointDetails(rec, true);
    });
  }
  onOverlayClick(e){
    const overlay=this.elements.nearbyPopup; const t=e.target;
    if (t===overlay || t.classList.contains('popup-close-btn')) return void this.closePopup();
    if (t.classList.contains('popup-back-btn')) return void this.goBack();
  }
  onKeyDown(e){ if (e.key==='Escape' && this.isPopupOpen()) this.closePopup(); }
  isPopupOpen(){ return this.elements.nearbyPopup?.style.display === 'flex'; }

  displayRecords(records){
    if (this.app.state.isLoading) return this.showLoading();
    if (!records.length){
      this.showMessage(
        this.app.state.fullDatabase.length===0
          ? 'База данных пуста или произошла ошибка загрузки'
          : this.elements.searchInput.value.trim()===''
            ? 'База данных загружена. Введите запрос для поиска...'
            : 'Ничего не найдено по вашему запросу'
      ); return;
    }
    this.elements.messageState.style.display='none';
    this.elements.outputList.style.display='block';
    const frag=document.createDocumentFragment();
    for (const r of records) frag.appendChild(this._row(r));
    this.elements.outputList.innerHTML=''; this.elements.outputList.appendChild(frag);
    this.app.state.visibleRecords = records;
  }
  _row(record, showDist=false, dist=null){
    const d=document.createElement('div'); d.className='output-line'; d.dataset.recordId=record.id;
    const f=record.fields;
    if (showDist && dist!=null){ const s=document.createElement('span'); s.className='nearby-distance'; s.textContent=`${dist.toFixed(1)}м`; d.appendChild(s); }
    const name=document.createElement('span'); name.className='point-name'; name.textContent=f.Point||'N/A'; d.appendChild(name);
    if (f.Info){ const info=document.createElement('span'); info.className='point-info'; info.textContent=f.Info; d.appendChild(info); }
    const links=this._mapLinks(f); if (links) d.appendChild(links);
    return d;
  }
  _mapLinks(f){
    const w=this.app.geolocation.mskToWGS(f.Xraw,f.Yraw);
    if (!w || !Number.isFinite(w.lat) || !Number.isFinite(w.lon)) return null;
    const wrap=document.createElement('div'); wrap.className='map-links';
    const g=document.createElement('a'); g.href=this.app.geolocation.makeGoogleMapsUrl(w.lat,w.lon); g.textContent='G'; g.className='map-link b'; g.target='_blank'; g.title='Google Карты';
    const y=document.createElement('a'); y.href=this.app.geolocation.makeYandexMapsUrl(w.lat,w.lon); y.textContent='Я'; y.className='map-link b'; y.target='_blank'; y.title='Яндекс Карты';
    wrap.appendChild(g); wrap.appendChild(y); return wrap;
  }
  async showPointDetails(record, reset=false){
    if (reset) this.popupHistory=[];
    const f=record.fields, popup=this.elements.nearbyPopup;
    const box=document.createElement('div'); box.className='popup-content';
    const close=document.createElement('button'); close.className='popup-close-btn'; close.innerHTML='×'; close.title='Закрыть'; box.appendChild(close);
    if (this.popupHistory.length>0){ const back=document.createElement('button'); back.className='popup-back-btn'; back.innerHTML='←'; back.title='Назад'; box.appendChild(back); }
    const header=document.createElement('div'); header.className='popup-header';
    const title=document.createElement('h3'); title.className='popup-title'; title.textContent=f.Point||'N/A'; header.appendChild(title);
    if (f.Info){ const sub=document.createElement('div'); sub.className='popup-subtitle'; sub.textContent=f.Info; header.appendChild(sub); }
    const coords=document.createElement('div'); coords.className='popup-coordinates';
    coords.innerHTML=`<strong>X (Север):</strong> ${this._fmt(f.Xraw)}<br><strong>Y (Восток):</strong> ${this._fmt(f.Yraw)}<br><strong>H:</strong> ${this._fmt(f.H)}`;
    header.appendChild(coords);
    const links=this._mapLinks(f); if (links){ links.className='map-links popup-map-links'; header.appendChild(links); }
    box.appendChild(header);

    const nearWrap=document.createElement('div'); nearWrap.className='nearby-section';
    nearWrap.innerHTML=`<h4 class="nearby-title">Ближайшие точки (до 300м):</h4><div class="nearby-list"></div>`;
    box.appendChild(nearWrap);

    popup.innerHTML=''; popup.appendChild(box); popup.style.display='flex';

    const list=nearWrap.querySelector('.nearby-list');
    const nearby=await this.app.searchEngine.findNearby(this.app.state.fullDatabase, record, 300);
    if (!nearby.length){ const no=document.createElement('div'); no.className='no-results'; no.textContent='Поблизости нет других точек'; list.appendChild(no); }
    else {
      for (const it of nearby){
        const el=this._row(it.record,true,it.distance);
        el.addEventListener('click',(e)=>{ if (e.target.classList.contains('map-link')) return;
          this.popupHistory.push({type:'record',record}); this.showPointDetails(it.record,false); });
        list.appendChild(el);
      }
    }
  }
  showNearbyLocationPopup(result){
    const popup=this.elements.nearbyPopup;
    const box=document.createElement('div'); box.className='popup-content';
    const close=document.createElement('button'); close.className='popup-close-btn'; close.innerHTML='×'; close.title='Закрыть'; box.appendChild(close);
    const header=document.createElement('div'); header.className='popup-header';
    const title=document.createElement('h3'); title.className='popup-title'; title.textContent='Геолокация'; header.appendChild(title);
    const coords=document.createElement('div'); coords.className='popup-coordinates';
    coords.innerHTML=`Ваше местоположение:<br><strong>X (Север):</strong> ${this._fmt(result.userCoords.x)}<br><strong>Y (Восток):</strong> ${this._fmt(result.userCoords.y)}`;
    header.appendChild(coords); box.appendChild(header);
    const nearWrap=document.createElement('div'); nearWrap.className='nearby-section';
    nearWrap.innerHTML=`<h4 class="nearby-title">Ближайшие точки (до 300м):</h4><div class="nearby-list"></div>`;
    box.appendChild(nearWrap);

    const list=nearWrap.querySelector('.nearby-list');
    if (!result.points.length){ const no=document.createElement('div'); no.className='no-results'; no.textContent='Поблизости нет точек'; list.appendChild(no); }
    else {
      for (const it of result.points){
        const el=this._row(it.record,true,it.distance);
        el.addEventListener('click',(e)=>{ if (e.target.classList.contains('map-link')) return;
          this.popupHistory.push({type:'location',data:result}); this.showPointDetails(it.record,false); });
        list.appendChild(el);
      }
    }
    popup.innerHTML=''; popup.appendChild(box); popup.style.display='flex';
  }
  goBack(){
    const prev=this.popupHistory.pop(); if (!prev) return;
    if (prev.type==='record') this.showPointDetails(prev.record,false);
    else if (prev.type==='location') this.showNearbyLocationPopup(prev.data);
  }
  closePopup(){ this.elements.nearbyPopup.style.display='none'; this.popupHistory=[]; }
  _fmt(v,d=3){ return (v==null || isNaN(v)) ? 'N/A' : Number(v).toFixed(d); }
  showMessage(m){ this.elements.messageState.textContent=m; this.elements.messageState.style.display='block'; this.elements.messageState.classList.remove('error'); this.elements.outputList.style.display='none'; }
  showError(m){ this.elements.messageState.textContent=m; this.elements.messageState.style.display='block'; this.elements.messageState.classList.add('error'); this.elements.outputList.style.display='none'; }
  showLoading(){ this.elements.messageState.innerHTML='<span class="loading-spinner"></span> Загрузка данных...'; this.elements.messageState.style.display='block'; this.elements.messageState.classList.remove('error'); this.elements.outputList.style.display='none'; }
}

/* ------------ App ------------ */
export class GROApp {
  constructor(cfg={}){
    if (!cfg.csvUrl) throw new Error('Не задан csvUrl');
    if (!cfg.sk42?.zone) throw new Error('Не задана sk42.zone');
    this.coord = new CoordinateSystem({ zone:Number(cfg.sk42.zone), towgs84: cfg.sk42.towgs84 || DEFAULT_TOWGS84 });
    this.dataManager  = new DataManager({ csvUrl: cfg.csvUrl });
    this.geolocation  = new GeolocationService(this.coord);
    this.searchEngine = new SearchEngine({ geolocation: this.geolocation });
    this.ui          = new UIController(this);
    this.state = { fullDatabase:[], visibleRecords:[], shouldIgnoreChars:false, searchMode:'contains', isLoading:false };
  }
  async init(){ try{ this.ui.init(); await this.loadData(); } catch(e){ console.error(e); this.ui.showError('Ошибка инициализации приложения'); } }
  async loadData(){
    this.state.isLoading=true; this.ui.showLoading();
    try{
      const data = await this.dataManager.fetchData();
      this.state.fullDatabase = data; this.state.visibleRecords = [];
      this.ui.displayRecords([]); this.ui.showMessage('База данных загружена. Введите запрос для поиска...');
    } catch(e){ this.ui.showError(`Ошибка загрузки данных: ${e.message}`); }
    finally{ this.state.isLoading=false; }
  }
  performSearch(term){
    if (this.state.isLoading) return;
    if (!term){ this.state.visibleRecords=[]; this.ui.displayRecords([]); return; }
    const res = this.searchEngine.search(this.state.fullDatabase, term, this.state.searchMode, this.state.shouldIgnoreChars);
    this.state.visibleRecords = res; this.ui.displayRecords(res);
  }
  updateSettings(s){ Object.assign(this.state, s); if (this.state.visibleRecords?.length) this.ui.displayRecords(this.state.visibleRecords); }
  async findNearbyUserLocation(){
    try{
      const pos = await this.geolocation.getCurrentPosition();
      const result = await this.searchEngine.findNearbyLocation(this.state.fullDatabase, pos.coords, 300);
      this.ui.showNearbyLocationPopup(result);
    } catch(e){ this.ui.showError(`Ошибка геолокации: ${e.message}`); }
  }
}

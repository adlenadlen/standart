// gro-core.js
export class GROApp {
  constructor(config) {
    if (!config?.csvUrl) throw new Error('csvUrl обязателен');
    if (!config?.sk42?.zone) throw new Error('sk42.zone обязателен');

    // 1) координатка с параметрами из конфига
    this.coord = new CoordinateSystem({
      zone: Number(config.sk42.zone),
      towgs84: config.sk42.towgs84 || '23.92,-141.27,-80.9,0,0.35,0.82,-0.12'
    });

    // 2) сервисы, которым не нужен доступ к самому конфигу
    this.dataManager   = new DataManager({ csvUrl: config.csvUrl });
    this.geolocation   = new GeolocationService(this.coord);
    this.searchEngine  = new SearchEngine({ geolocation: this.geolocation });
    this.uiController  = new UIController(this);

    this.state = {
      fullDatabase: [],
      displayedRecords: [],
      shouldIgnoreChars: false,
      searchMode: 'contains',
      isLoading: false,
      visibleRecords: []
    };
  }

  async init() {
    try {
      this.uiController.init();
      await this.loadData();
    } catch (e) {
      console.error('Ошибка инициализации:', e);
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
    } catch (e) {
      this.uiController.showError(`Ошибка загрузки данных: ${e.message}`);
    } finally {
      this.state.isLoading = false;
    }
  }

  performSearch(term) {
    if (this.state.isLoading) return;
    if (!term) {
      this.state.displayedRecords = [];
      this.state.visibleRecords = [];
      this.uiController.displayRecords([]);
      return;
    }
    this.state.displayedRecords = this.searchEngine.search(
      this.state.fullDatabase,
      term,
      this.state.searchMode,
      this.state.shouldIgnoreChars
    );
    this.state.visibleRecords = this.state.displayedRecords;
    this.uiController.displayRecords(this.state.displayedRecords);
  }

  updateSettings(settings) {
    Object.assign(this.state, settings);
    if (this.state.visibleRecords?.length) {
      this.uiController.displayRecords(this.state.visibleRecords);
    }
  }

  async findNearbyUserLocation() {
    try {
      const pos = await this.geolocation.getCurrentPosition();
      const result = await this.searchEngine.findNearbyLocation(
        this.state.fullDatabase,
        pos.coords,
        300
      );
      this.uiController.showNearbyLocationPopup(result);
    } catch (e) {
      this.uiController.showError(`Ошибка геолокации: ${e.message}`);
    }
  }
}

/* ====== Ниже — сокращённые версии зависимостей (такие же как у нас были), только важные места ====== */

class DataManager {
  constructor({ csvUrl }) { this.csvUrl = csvUrl; this.rusHeaders=['Название','Север','Восток','Отметка','Код']; }
  async fetchData(){
    const txt=await this._fetchTxt(this.csvUrl); return this._parseCSV(txt);
  }
  async _fetchTxt(url,{timeoutMs=15000}={}){
    const c=new AbortController(); const t=setTimeout(()=>c.abort(new Error('timeout')),timeoutMs);
    try{const r=await fetch(url,{headers:{'Accept':'text/csv'},cache:'no-store',signal:c.signal});
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf=await r.arrayBuffer();
      return new TextDecoder('utf-8').decode(new Uint8Array(buf)).replace(/^\uFEFF/,'');
    } finally{clearTimeout(t);}
  }
  _parseCSV(csv){
    const lines=csv.replace(/\r\n?/g,'\n').split('\n').map(l=>l.trim()).filter(Boolean);
    if(!lines.length) return [];
    const header=lines[0]; const delim=((header.match(/;/g)||[]).length>(header.match(/,/g)||[]).length)?';':',';
    const headParts=this._split(header,delim).map(s=>s.trim()); const idx=new Map(headParts.map((n,i)=>[n,i]));
    const recs=[]; for(let i=1;i<lines.length;i++){const parts=this._split(lines[i],delim);
      const get= (n)=>{const j=idx.get(n); return j!=null?(parts[j]??''):'';};
      const point=String(get('Название')).trim();
      const xStr=String(get('Север')).replace(',', '.').trim();
      const yStr=String(get('Восток')).replace(',', '.').trim();
      const hStr=String(get('Отметка')).replace(',', '.').trim();
      const info=String(get('Код')).trim();
      const Xraw=parseFloat(xStr), Yraw=parseFloat(yStr), H=hStr===''?NaN:parseFloat(hStr);
      if(!Number.isFinite(Xraw)||!Number.isFinite(Yraw)) continue;
      recs.push({id:`rp_${i+1}`,fields:{CoordSystem:'МСК',Point:point,Xraw,Yraw,H:Number.isFinite(H)?H:NaN,Info:info}});
    }
    return recs;
  }
  _split(line,del=','){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];
    if(ch==='"'){ if(q && line[i+1]==='"'){cur+='"';i++;} else q=!q; }
    else if(ch===del && !q){ out.push(cur); cur=''; } else cur+=ch; }
    out.push(cur); return out;
  }
}

class CoordinateSystem {
  constructor({zone,towgs84}){ this.zone=Number(zone); this.towgs84=towgs84; this.epsg=28400+this.zone; this._initProj4(); }
  get zoneOffset(){ return this.zone*1_000_000; }
  _initProj4(){ if(typeof proj4==='undefined') {console.warn('proj4 отсутствует'); return;}
    const lon0=this.zone*6-3; const x0=this.zone*1_000_000+500_000;
    proj4.defs(`EPSG:${this.epsg}`, `+proj=tmerc +lat_0=0 +lon_0=${lon0} +k=1 +x_0=${x0} +y_0=0 +ellps=krass +towgs84=${this.towgs84} +units=m +no_defs`);
    proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
  }
  toWGS84(xMSK,yMSK){ if(typeof proj4==='undefined') return null;
    const E = Number(yMSK)+this.zoneOffset, N = Number(xMSK);
    if(!Number.isFinite(E)||!Number.isFinite(N)) return null;
    const [lon,lat]=proj4(`EPSG:${this.epsg}`,'EPSG:4326',[E,N]); return {lat,lon};
  }
  fromWGS84(lat,lon){ if(typeof proj4==='undefined') return {x:NaN,y:NaN};
    const [E,N]=proj4('EPSG:4326',`EPSG:${this.epsg}`,[Number(lon),Number(lat)]);
    return { x:N, y:E-this.zoneOffset };
  }
}

class GeolocationService {
  constructor(coord){ this.coord=coord; this.options={enableHighAccuracy:true,timeout:10000,maximumAge:0}; }
  async getCurrentPosition(){
    if(!('geolocation'in navigator)) throw new Error('Геолокация не поддерживается вашим браузером');
    return new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,e=>rej(this._err(e)),this.options));
  }
  wgsToMSK(lat,lon){ return this.coord.fromWGS84(lat,lon); }
  mskToWGS(x,y){ return this.coord.toWGS84(x,y) || {lat:NaN,lon:NaN}; }
  makeGoogleMapsUrl(lat,lon,z=18){ return `https://www.google.com/maps?q=${lat},${lon}&z=${z}`; }
  makeYandexMapsUrl(lat,lon,z=18){ return `https://yandex.ru/maps/?pt=${lon},${lat}&z=${z}&l=map`; }
  _err(e){switch(e.code){case e.PERMISSION_DENIED:return new Error('Доступ к геолокации запрещён');
    case e.POSITION_UNAVAILABLE:return new Error('Позиция недоступна'); case e.TIMEOUT:return new Error('Тайм-аут');
    default:return new Error('Неизвестная ошибка геолокации');}}
}

class SearchEngine {
  constructor({geolocation}={}){ this.geolocation=geolocation||null; }
  search(db,term,mode='contains',ignore=false){
    if(!term) return [];
    const q=ignore?this._norm(term):String(term).toLowerCase();
    return db.filter(r=>{const p=r?.fields?.Point; if(!p) return false;
      const v=ignore?this._norm(p):String(p).toLowerCase();
      return mode==='exact'?v===q:v.includes(q);});
  }
  async findNearby(db,ref,max=300){
    const refXY=this._msk(ref?.fields); if(!this._ok(refXY)) throw new Error('Некорректные координаты');
    const out=[]; for(const r of db){ if(r.id===ref.id) continue;
      const c=this._msk(r?.fields); if(!this._ok(c)) continue;
      const d=Math.hypot(c.x-refXY.x,c.y-refXY.y); if(d<=max) out.push({record:r,distance:d,coords:c}); }
    return out.sort((a,b)=>a.distance-b.distance);
  }
  async findNearbyLocation(db,userWGS,max=300){
    if(!this.geolocation?.wgsToMSK) throw new Error('GeolocationService не подключён');
    const u=this.geolocation.wgsToMSK(userWGS.latitude,userWGS.longitude); if(!this._ok(u)) throw new Error('Не удалось преобразовать позицию');
    const out=[]; for(const r of db){ const c=this._msk(r?.fields); if(!this._ok(c)) continue;
      const d=Math.hypot(c.x-u.x,c.y-u.y); if(d<=max) out.push({record:r,distance:d,coords:c}); }
    return { userCoords:u, points: out.sort((a,b)=>a.distance-b.distance) };
  }
  _msk(f){ return {x:Number(f?.Xraw), y:Number(f?.Yraw)}; }
  _ok(p){ return p && Number.isFinite(p.x) && Number.isFinite(p.y); }
  _norm(s){ return String(s).toLowerCase().replace(/[\._,\-]/g,''); }
}

class UIController {
  constructor(app){ this.app=app; this.elements={}; this.debounce=null; this.popupHistory=[]; }
  init(){ /* ...вставь свой код UI из предыдущей версии с МСК и geolocation... */ }
}

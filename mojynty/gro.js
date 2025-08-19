// /OBJECT/gro-OBJECT.js
import { GROApp } from '/modules/gro-core.js';

// 👇 сюда кладёшь *только* данные объекта
const CONFIG = {
  // единственный источник CSV для этого объекта:
  csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRkRjRcPWV00OcdyIwJiEZ_ae6FSJOSAM7ul9WBc_iyTBBNYPVhyG_KBFTeVfeRuDDAq2iijFortQ_Y/pub?gid=0&single=true&output=csv',
  // зона СК-42, которую используем для MSK↔WGS-84:
  sk42: { zone: 13 },

  // не обязательно, но удобно хранить тут же:
  links: {
    // страница "Просмотр таблицы" для этого же объекта (если нужна)
    sheetView: 'https://docs.google.com/spreadsheets/d/1GvYauDBU3fgt_MQ78ruIXHVqZnzk_wh1Y8860ERumoQ/edit?usp=sharing'
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  // инициализация ядра с конфигом объекта
  const app = new GROApp(CONFIG);
  await app.init();

  // Привяжем кнопки к адресам конкретного объекта
  const aCsv   = document.getElementById('downloadCsvLink');
  const aSheet = document.getElementById('viewSheetLink');
  if (aCsv)   aCsv.href   = CONFIG.csvUrl;
  if (aSheet && CONFIG.links?.sheetView) aSheet.href = CONFIG.links.sheetView;
});

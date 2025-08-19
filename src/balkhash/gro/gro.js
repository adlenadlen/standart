// /OBJECT/gro-OBJECT.js
import { GROApp } from '/modules/gro-core.js';

// 👇 сюда кладёшь *только* данные объекта
const CONFIG = {
  // единственный источник CSV для этого объекта:
  csvUrl: '/balkhash/gro-csv',
  // зона СК-42, которую используем для MSK↔WGS-84:
  sk42: { zone: 13 },

  // не обязательно, но удобно хранить тут же:
  links: {
    // страница "Просмотр таблицы" для этого же объекта (если нужна)
    sheetView: '/balkhash/gro-sheet'
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

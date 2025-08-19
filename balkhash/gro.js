// /OBJECT/gro-OBJECT.js
import { GROApp } from '/modules/gro-core.js';

const CONFIG = {
  csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR0xN6ovbBTM2VPZ5rVliXcFiMz13AJunM83sVSnGfn1Rt-5l3DulZ54jzKBVUF8zFmdK_CKEIGCnF4/pub?gid=0&single=true&output=csv,
  sk42: {
    zone: 13
    // при необходимости можно добавить towgs84: '23.92,-141.27,-80.9,0,0.35,0.82,-0.12'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const app = new GROApp(CONFIG);
  app.init();
});

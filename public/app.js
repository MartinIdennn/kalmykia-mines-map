'use strict';

// ---- Утилиты ----------------------------------------------------------------

// Формат рублей: 12 345 ₽
function formatRub(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('ru-RU') + ' ₽';
}

// Безопасный fetch JSON с проверкой статуса
async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* тело может быть пустым / не JSON */
  }
  if (!res.ok) {
    const msg = (data && data.error) || `Ошибка запроса (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function formatDonorDate(at) {
  if (!at) return '';
  // Бэк отдаёт UTC-строку "YYYY-MM-DD HH:MM:SS" без маркера зоны — нормализуем
  // в ISO с 'Z', иначе браузер трактует её как локальное время (сдвиг на offset).
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(at)
    ? at.replace(' ', 'T') + 'Z'
    : at;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ---- Данные: статический JSON + донаты в localStorage -----------------------
// Сайт хостится как статика (GitHub Pages), поэтому данные рудников лежат в
// data/mines.json, а донаты сохраняются в браузере посетителя (localStorage).
let MINES = [];
const DONATE_KEY = 'kalmykia_donations_v1';

function loadLocalDonations() {
  try {
    return JSON.parse(localStorage.getItem(DONATE_KEY)) || {};
  } catch (_) {
    return {};
  }
}
function saveLocalDonation(mineId, donor) {
  const all = loadLocalDonations();
  (all[mineId] = all[mineId] || []).push(donor);
  localStorage.setItem(DONATE_KEY, JSON.stringify(all));
}
// Сумма сбора = сидовые донаты + локальные донаты этого браузера
function computeRaised(mine) {
  const sum = (arr) => (arr || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
  return sum(mine.donors) + sum(loadLocalDonations()[mine.id]);
}
// Список донатеров: свежие локальные сверху, затем демонстрационные
function mergedDonors(mine) {
  const local = (loadLocalDonations()[mine.id] || []).slice().reverse();
  return local.concat(mine.donors || []);
}

// ---- Карта ------------------------------------------------------------------

const map = L.map('map', { minZoom: 6, maxZoom: 14 }).setView([46.3, 45.0], 7);

// Префикс атрибуции без украинского флага (Leaflet 1.8+ добавляет его по умолчанию)
map.attributionControl.setPrefix(
  '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>'
);

// Базовые слои: «Схема» (CartoDB Voyager — чистая карта без меток ООПТ) и
// «Спутник» (Esri World Imagery). Переключаются контролом справа сверху.
const baseSchema = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  {
    subdomains: 'abcd',
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  }
);
const baseSatellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 19,
    attribution:
      'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  }
);
baseSatellite.addTo(map); // слой по умолчанию — спутник

L.control
  .layers(
    { Схема: baseSchema, Спутник: baseSatellite },
    null,
    { position: 'topright' }
  )
  .addTo(map);

// ---- Граница Калмыкии: обводка + маска (затемнить всё вокруг) ----------------
// Загружаем GeoJSON границы региона, рисуем контур, накрываем всё снаружи маской
// (полигон «весь мир» с дырками по форме Калмыкии) и запираем карту по границам.
fetch('kalmykia.geojson')
  .then((r) => r.json())
  .then((geo) => {
    // Контур республики
    const outline = L.geoJSON(geo, {
      style: { color: '#c8902a', weight: 2, fill: false },
      interactive: false,
    }).addTo(map);

    // Кольца Калмыкии как [lat,lng] (внешние кольца всех полигонов MultiPolygon)
    const polys = geo.type === 'MultiPolygon' ? geo.coordinates : [geo.coordinates];
    const holes = polys.map((poly) => poly[0].map(([lng, lat]) => [lat, lng]));

    // Маска: внешнее кольцо «весь мир» + дырки по форме региона → залито всё, кроме Калмыкии
    const world = [
      [-90, -360],
      [-90, 360],
      [90, 360],
      [90, -360],
    ];
    L.polygon([world, ...holes], {
      stroke: false,
      fillColor: '#0b1622',
      fillOpacity: 0.8,
      interactive: false,
    }).addTo(map);

    // Запираем обзор в границах региона
    const b = outline.getBounds();
    map.fitBounds(b, { padding: [20, 20] });
    map.setMaxBounds(b.pad(0.12));
    map.setMinZoom(map.getBoundsZoom(b));
  })
  .catch((err) => console.error('Не удалось загрузить границу Калмыкии:', err));

// ---- Заповедник «Чёрные земли» ----------------------------------------------
// Два кластера ООПТ: степной (сайгак) и Маныч-Гудило (птицы). Рисуем зелёным.
const RESERVE_DESC =
  '<strong>Заповедник «Чёрные земли»</strong><br/>' +
  'Государственный природный биосферный заповедник, создан в 1990 году — единственный в России ' +
  'для изучения и сохранения степных, полупустынных и пустынных экосистем. Степной участок служит ' +
  'восстановлению популяции сайгака; участок «Озеро Маныч-Гудило» охраняет места гнездования и ' +
  'миграции водоплавающих и околоводных птиц. Входит во Всемирную сеть биосферных резерватов ЮНЕСКО.';

fetch('chernye-zemli.geojson')
  .then((r) => r.json())
  .then((geo) => {
    L.geoJSON(geo, {
      style: {
        color: '#1f7a4d',
        weight: 2,
        dashArray: '6 4',
        fillColor: '#3cb371',
        fillOpacity: 0.22,
      },
    })
      .bindTooltip('Заповедник «Чёрные земли»', {
        permanent: true,
        direction: 'center',
        className: 'reserve-label',
      })
      .bindPopup(RESERVE_DESC, { maxWidth: 320 })
      .addTo(map);
  })
  .catch((err) => console.error('Не удалось загрузить границу заповедника:', err));

// ---- Легенда ----------------------------------------------------------------
const legend = L.control({ position: 'bottomright' });
legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'map-legend');
  div.innerHTML =
    '<div><span class="lg-swatch lg-mine"></span> Источник / рудник</div>' +
    '<div><span class="lg-swatch lg-reserve"></span> Заповедник «Чёрные земли»</div>';
  return div;
};
legend.addTo(map);

// Кастомный маркер-пин источника (CSS-капля с эмблемой)
const mineIcon = L.divIcon({
  className: 'mine-pin',
  html: '<div class="pin"><div class="pin-glyph">⛏</div></div>',
  iconSize: [30, 42],
  iconAnchor: [15, 42],
  popupAnchor: [0, -38],
});

// ---- Подписи районных центров и сёл ------------------------------------------
// Районные центры Калмыкии (13 районов + столица) и несколько сёл. Координаты
// приблизительные, для ориентира на карте.
const DISTRICT_CENTERS = [
  { name: 'Элиста', lat: 46.308, lng: 44.27 },
  { name: 'Городовиковск', lat: 46.0903, lng: 41.9347 },
  { name: 'Яшалта', lat: 46.34, lng: 42.27 },
  { name: 'Приютное', lat: 46.0917, lng: 43.5722 },
  { name: 'Ики-Бурул', lat: 45.7592, lng: 44.5097 },
  { name: 'Троицкое', lat: 46.45, lng: 44.4 },
  { name: 'Кетченеры', lat: 47.35, lng: 44.27 },
  { name: 'Малые Дербеты', lat: 47.955, lng: 44.678 },
  { name: 'Садовое', lat: 47.76, lng: 44.54 },
  { name: 'Большой Царын', lat: 47.69, lng: 45.4 },
  { name: 'Цаган Аман', lat: 47.5556, lng: 46.7222 },
  { name: 'Яшкуль', lat: 46.1742, lng: 45.3431 },
  { name: 'Комсомольский', lat: 45.34, lng: 46.0 },
  { name: 'Лагань', lat: 45.3914, lng: 47.3479 },
];
const VILLAGES = [
  { name: 'Хулхута', lat: 46.3, lng: 46.43 },
  { name: 'Утта', lat: 46.37, lng: 46.07 },
  { name: 'Адык', lat: 45.55, lng: 45.95 },
  { name: 'Чилгир', lat: 46.55, lng: 45.3 },
  { name: 'Артезиан', lat: 45.4, lng: 46.83 },
  { name: 'Цаган-Нур', lat: 47.683, lng: 45.9 },
  { name: 'Хар-Булук', lat: 46.25, lng: 44.55 },
];

function addPlaceLabel(p, className) {
  L.tooltip({ permanent: true, direction: 'center', className, interactive: false })
    .setLatLng([p.lat, p.lng])
    .setContent(p.name)
    .addTo(map);
}
DISTRICT_CENTERS.forEach((p) => addPlaceLabel(p, 'place-label place-district'));
VILLAGES.forEach((p) => addPlaceLabel(p, 'place-label place-village'));

// ---- Состояние панели -------------------------------------------------------

const panel = document.getElementById('panel');
const els = {
  name: document.getElementById('mine-name'),
  description: document.getElementById('mine-description'),
  gallery: document.getElementById('gallery'),
  progressBar: document.getElementById('progress-bar'),
  progressText: document.getElementById('progress-text'),
  budgetBody: document.getElementById('budget-body'),
  budgetTotal: document.getElementById('budget-total'),
  donorsList: document.getElementById('donors-list'),
  form: document.getElementById('donate-form'),
  donorName: document.getElementById('donor-name'),
  donorAmount: document.getElementById('donor-amount'),
  submit: document.getElementById('donate-submit'),
  error: document.getElementById('donate-error'),
};

let currentMine = null; // подробные данные текущего рудника

function openPanel() {
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
}

function closePanel() {
  panel.classList.add('hidden');
  panel.setAttribute('aria-hidden', 'true');
  currentMine = null;
}

document.getElementById('panel-close').addEventListener('click', closePanel);

// ---- Рендер прогресса -------------------------------------------------------

function renderProgress(raised, goal) {
  const g = Number(goal) || 0;
  const r = Number(raised) || 0;
  const pct = g > 0 ? Math.min(100, Math.round((r / g) * 100)) : 0;
  els.progressBar.style.width = pct + '%';
  els.progressText.textContent =
    `Собрано ${formatRub(r)} из ${formatRub(g)} (${pct}%)`;
}

// ---- Рендер донатеров -------------------------------------------------------

function renderDonors(donors) {
  els.donorsList.innerHTML = '';
  if (!donors || donors.length === 0) {
    const li = document.createElement('li');
    li.className = 'donors-empty';
    li.textContent = 'Пока нет донатеров. Станьте первым!';
    els.donorsList.appendChild(li);
    return;
  }
  donors.forEach((d) => els.donorsList.appendChild(buildDonorItem(d)));
}

function buildDonorItem(d) {
  const li = document.createElement('li');
  li.className = 'donor-item';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'donor-name';
  nameSpan.textContent = d.name || 'Аноним';

  const amountSpan = document.createElement('span');
  amountSpan.className = 'donor-amount';
  amountSpan.textContent = formatRub(d.amount);

  const dateSpan = document.createElement('span');
  dateSpan.className = 'donor-date';
  dateSpan.textContent = formatDonorDate(d.at);

  li.appendChild(nameSpan);
  li.appendChild(amountSpan);
  if (dateSpan.textContent) li.appendChild(dateSpan);
  return li;
}

// ---- Рендер сметы -----------------------------------------------------------

function renderBudget(budget) {
  els.budgetBody.innerHTML = '';
  let total = 0;
  (budget || []).forEach((b) => {
    total += Number(b.amount) || 0;
    const tr = document.createElement('tr');
    const tdItem = document.createElement('td');
    tdItem.textContent = b.item || '';
    const tdAmount = document.createElement('td');
    tdAmount.textContent = formatRub(b.amount);
    tr.appendChild(tdItem);
    tr.appendChild(tdAmount);
    els.budgetBody.appendChild(tr);
  });
  els.budgetTotal.textContent = formatRub(total);
}

// ---- Рендер галереи ---------------------------------------------------------

function renderGallery(photos) {
  els.gallery.innerHTML = '';
  const list = photos || [];
  if (list.length === 0) {
    els.gallery.classList.add('empty');
    els.gallery.textContent = 'Фотографий пока нет';
    return;
  }
  els.gallery.classList.remove('empty');
  list.forEach((url) => {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Фото рудника';
    img.loading = 'lazy';
    els.gallery.appendChild(img);
  });
}

// ---- Открытие рудника -------------------------------------------------------

function openMine(id) {
  els.error.textContent = '';
  const mine = MINES.find((m) => m.id === id);
  if (!mine) return;
  currentMine = mine;

  els.name.textContent = mine.name || '';
  els.description.textContent = mine.description || '';
  renderGallery(mine.photos);
  renderBudget(mine.budget);
  renderProgress(computeRaised(mine), mine.goal);
  renderDonors(mergedDonors(mine));

  els.form.reset();
  openPanel();
}

// ---- Форма доната -----------------------------------------------------------

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.error.textContent = '';

  if (!currentMine) return;

  const name = els.donorName.value.trim();
  const amount = Number(els.donorAmount.value);

  // Клиентская валидация
  if (!name) {
    els.error.textContent = 'Укажите имя.';
    els.donorName.focus();
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    els.error.textContent = 'Сумма должна быть положительным числом.';
    els.donorAmount.focus();
    return;
  }

  els.submit.disabled = true;
  try {
    // Статическая версия: донат сохраняется в браузере (localStorage)
    const at = new Date().toISOString().replace('T', ' ').slice(0, 19); // UTC
    const donor = { name, amount, at };
    saveLocalDonation(currentMine.id, donor);

    // Обновляем прогресс и список без перезагрузки
    renderProgress(computeRaised(currentMine), currentMine.goal);
    renderDonors(mergedDonors(currentMine));
    els.form.reset();
  } catch (err) {
    els.error.textContent = err.message || 'Не удалось сохранить донат.';
  } finally {
    els.submit.disabled = false;
  }
});

// ---- Загрузка маркеров ------------------------------------------------------

async function loadMines() {
  try {
    MINES = (await fetchJSON('data/mines.json')) || [];
    MINES.forEach((mine) => {
      if (typeof mine.lat !== 'number' || typeof mine.lng !== 'number') return;
      const marker = L.marker([mine.lat, mine.lng], { icon: mineIcon }).addTo(map);
      const raised = computeRaised(mine);
      const pct =
        mine.goal > 0 ? Math.min(100, Math.round((raised / mine.goal) * 100)) : 0;
      marker.bindPopup(
        `<strong>${escapeHtml(mine.name)}</strong><br/>` +
          `${escapeHtml(mine.short)}<br/>` +
          `<small>Собрано ${formatRub(raised)} из ${formatRub(mine.goal)} (${pct}%)</small>`
      );
      marker.on('click', () => openMine(mine.id));
    });
  } catch (err) {
    console.error('Ошибка загрузки рудников:', err);
    alert('Не удалось загрузить список рудников: ' + err.message);
  }
}

loadMines();

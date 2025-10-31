// ---- Config (Open-Meteo) ----
const API_GEO = "https://geocoding-api.open-meteo.com/v1/search";
const API_WX = "https://api.open-meteo.com/v1/forecast";

// ---- DOM refs ----
const elSearch = document.getElementById("search");
const elSugs = document.getElementById("suggestions");
const elGrid = document.getElementById("grid");
const elStatus = document.getElementById("status");

const elPlace = document.getElementById("placeLabel");
const elNowE = document.getElementById("nowEmoji");
const elNowT = document.getElementById("nowTemp");
const elNowU = document.getElementById("nowUnit");
const elNowD = document.getElementById("nowDesc");
const elNowM = document.getElementById("nowMeta");

const elHourly = document.getElementById("hourly");
const elDaily = document.getElementById("daily");

const btnC = document.getElementById("btnC");
const btnF = document.getElementById("btnF");
const geoBtn = document.getElementById("geoBtn");

// ---- Local storage keys ----
const LS_CITY = "vw.cityName";
const LS_UNITS = "vw.units";

// ---- State ----
let units = localStorage.getItem(LS_UNITS) || "metric"; // "metric" | "imperial"
let place = null; // { name, country, lat, lon }
let abortCtl = null;

// ---- Init ----
hydrateUnits(units);
bootstrap();

// ---- Events ----
btnC.addEventListener("click", () => setUnits("metric"));
btnF.addEventListener("click", () => setUnits("imperial"));
geoBtn.addEventListener("click", useGeolocation);

elSearch.addEventListener(
  "input",
  debounce(async (e) => {
    const q = e.target.value.trim();
    if (!q) {
      toggleSuggestions(false);
      return;
    }
    const results = await searchPlaces(q);
    renderSuggestions(results);
  }, 300)
);

document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocomplete")) toggleSuggestions(false);
});

// ---- Functions ----
function setUnits(u) {
  units = u;
  localStorage.setItem(LS_UNITS, u);
  btnC.classList.toggle("active", u === "metric");
  btnF.classList.toggle("active", u === "imperial");
  // re-render if we already have data
  if (place) loadWeather(place);
}

function hydrateUnits(u) {
  btnC.classList.toggle("active", u === "metric");
  btnF.classList.toggle("active", u === "imperial");
  elNowU.textContent = u === "imperial" ? "°F" : "°C";
}

async function bootstrap() {
  const last = localStorage.getItem(LS_CITY) || "Tirana";
  elSearch.value = last;
  const results = await searchPlaces(last, 1);
  const p = results[0] || {
    name: "Tirana",
    country: "AL",
    lat: 41.3275,
    lon: 19.8187,
  };
  place = p;
  await loadWeather(place);
}

async function useGeolocation() {
  if (!navigator.geolocation) return setStatus("Geolocation not supported.");
  setStatus("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      place = { name: "My location", country: "", lat, lon };
      elSearch.value = "My location";
      await loadWeather(place);
    },
    (err) => {
      console.error(err);
      setStatus("Failed to get location.");
    }
  );
}

function toggleSuggestions(show) {
  elSugs.classList.toggle("show", !!show);
}

function renderSuggestions(list) {
  elSugs.innerHTML = "";
  if (!list.length) return toggleSuggestions(false);
  list.forEach((item) => {
    const li = document.createElement("li");
    li.role = "option";
    li.textContent = `${item.name}${item.country ? ", " + item.country : ""}`;
    li.addEventListener("click", () => {
      place = item;
      elSearch.value = `${item.name}${item.country ? ", " + item.country : ""}`;
      toggleSuggestions(false);
      loadWeather(place);
    });
    elSugs.appendChild(li);
  });
  toggleSuggestions(true);
}

async function searchPlaces(q, count = 5) {
  try {
    if (abortCtl) abortCtl.abort();
    abortCtl = new AbortController();
    const url = new URL(API_GEO);
    url.search = new URLSearchParams({
      name: q,
      count,
      language: "en",
      format: "json",
    }).toString();
    const res = await fetch(url, { signal: abortCtl.signal });
    const data = await res.json();
    return (data.results || []).map((r) => ({
      name: r.name,
      country: r.country_code,
      lat: r.latitude,
      lon: r.longitude,
    }));
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
    return [];
  }
}

async function loadWeather(p) {
  try {
    setStatus("Loading weather…");
    elGrid.classList.add("hidden");
    const url = new URL(API_WX);
    url.search = new URLSearchParams({
      latitude: p.lat,
      longitude: p.lon,
      timezone: "auto",
      current:
        "temperature_2m,wind_speed_10m,relative_humidity_2m,weather_code",
      hourly: "temperature_2m,weather_code",
      daily: "temperature_2m_max,temperature_2m_min,weather_code",
      forecast_days: 5,
    }).toString();

    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather request failed");
    const wx = await res.json();

    // Update UI
    localStorage.setItem(LS_CITY, p.name);
    renderNow(wx, p);
    renderHourly(wx.hourly);
    renderDaily(wx.daily);

    elGrid.classList.remove("hidden");
    setStatus("");
  } catch (e) {
    console.error(e);
    setStatus("Failed to load weather.");
  }
}

function renderNow(wx, p) {
  const cur = wx.current;
  const { icon, label } = wxInfo(cur.weather_code);
  const t = convertTemp(cur.temperature_2m, units);
  elPlace.textContent = `${p.name}${p.country ? ", " + p.country : ""}`;
  elNowE.textContent = icon;
  elNowT.textContent = Math.round(t);
  elNowU.textContent = units === "imperial" ? "°F" : "°C";
  elNowD.textContent = label;
  elNowM.textContent = `Humidity ${
    cur.relative_humidity_2m
  }% • Wind ${Math.round(cur.wind_speed_10m)} ${
    units === "imperial" ? "mph" : "m/s"
  }`;
}

function renderHourly(hourly) {
  // slice next 12 hours
  const items = hourly.time.slice(0, 12).map((t, i) => ({
    time: t,
    temp: hourly.temperature_2m[i],
    code: hourly.weather_code[i],
  }));
  elHourly.innerHTML = "";
  for (const x of items) {
    const div = document.createElement("div");
    const { icon, label } = wxInfo(x.code);
    div.className = "hour";
    div.innerHTML = `
      <div class="cap">${fmtTime(x.time)}</div>
      <div class="t">${Math.round(convertTemp(x.temp, units))}${
      units === "imperial" ? "°F" : "°C"
    }</div>
      <div class="i" aria-hidden="true" style="font-size:18px">${icon}</div>
      <div class="cap subtle">${label}</div>
    `;
    elHourly.appendChild(div);
  }
}

function renderDaily(daily) {
  elDaily.innerHTML = "";
  const days = daily.time.slice(0, 5).map((t, i) => ({
    date: t,
    tmax: daily.temperature_2m_max[i],
    tmin: daily.temperature_2m_min[i],
    code: daily.weather_code[i],
  }));
  for (const d of days) {
    const { icon, label } = wxInfo(d.code);
    const card = document.createElement("div");
    card.className = "day";
    card.innerHTML = `
      <div class="cap">${fmtDate(d.date)}</div>
      <div style="font-size:20px">${icon} ${label}</div>
      <div>High ${Math.round(convertTemp(d.tmax, units))}${
      units === "imperial" ? "°F" : "°C"
    }
        • Low ${Math.round(convertTemp(d.tmin, units))}${
      units === "imperial" ? "°F" : "°C"
    }</div>
    `;
    elDaily.appendChild(card);
  }
}

// ---- Helpers ----
function setStatus(msg) {
  elStatus.textContent = msg || "";
}
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
function convertTemp(celsius, u) {
  return u === "imperial" ? (celsius * 9) / 5 + 32 : celsius;
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

// Minimal map for Open-Meteo weather_code → emoji + label
function wxInfo(code) {
  const MAP = [
    { codes: [0], label: "Clear", icon: "☀️" },
    { codes: [1, 2], label: "Partly cloudy", icon: "🌤️" },
    { codes: [3], label: "Overcast", icon: "☁️" },
    { codes: [45, 48], label: "Fog", icon: "🌫️" },
    { codes: [51, 53, 55, 56, 57], label: "Drizzle", icon: "🌦️" },
    { codes: [61, 63, 65, 66, 67], label: "Rain", icon: "🌧️" },
    { codes: [71, 73, 75, 77], label: "Snow", icon: "❄️" },
    { codes: [80, 81, 82], label: "Showers", icon: "🌦️" },
    { codes: [95, 96, 99], label: "Thunderstorm", icon: "⛈️" },
  ];
  return MAP.find((m) => m.codes.includes(code)) || { label: "—", icon: "❔" };
}

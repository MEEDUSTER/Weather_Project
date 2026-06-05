import './style.css'

const API_KEY = '9e6f4809065d9ed2dcdab0b825c4d367';
const app = document.getElementById('app');
let currentCity = 'London, GB';
let currentUnit = 'metric';
let weatherState = null;
let refreshTimer = null;
const STORAGE_KEY = 'weather:lastCity';

function formatHour(dt, timezoneOffset) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(new Date((dt + timezoneOffset) * 1000));
}

function formatDay(dt, timezoneOffset) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date((dt + timezoneOffset) * 1000));
}

function getWeatherIcon(iconCode) {
  const icons = {
    '01d': '☀️',
    '01n': '🌙',
    '02d': '⛅',
    '02n': '☁️',
    '03d': '☁️',
    '03n': '☁️',
    '04d': '☁️',
    '04n': '☁️',
    '09d': '🌧',
    '09n': '🌧',
    '10d': '🌦',
    '10n': '🌧',
    '11d': '⛈',
    '11n': '⛈',
    '13d': '❄️',
    '13n': '❄️',
    '50d': '🌫',
    '50n': '🌫',
  };
  return icons[iconCode] || '☁️';
}

async function fetchCoordinates(city) {
  const response = await fetch(
    `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`
  );
  if (!response.ok) {
    throw new Error('Unable to fetch city coordinates');
  }

  const data = await response.json();
  if (!data.length) {
    throw new Error('City not found');
  }

  return data[0];
}

async function fetchWeather(lat, lon) {
  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&units=${currentUnit}&exclude=alerts&appid=${API_KEY}`
  );
  if (!response.ok) {
    let text = await response.text();
    try {
      const json = JSON.parse(text);
      throw new Error(json.message || 'Unable to fetch weather data');
    } catch {
      throw new Error(text || 'Unable to fetch weather data');
    }
  }
  return response.json();
}

async function fetchWeatherFallback(lat, lon) {
  
  const curRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${currentUnit}&appid=${API_KEY}`);
  if (!curRes.ok) {
    let t = await curRes.text();
    try { t = JSON.parse(t).message } catch (e) {}
    throw new Error(t || 'Unable to fetch current weather');
  }
  const cur = await curRes.json();

  const foreRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${currentUnit}&appid=${API_KEY}`);
  if (!foreRes.ok) {
    let t = await foreRes.text();
    try { t = JSON.parse(t).message } catch (e) {}
    throw new Error(t || 'Unable to fetch forecast');
  }
  const fore = await foreRes.json();

  const hourly = (fore.list || []).slice(0, 9).map(item => ({
    dt: item.dt,
    temp: item.main.temp,
    pop: item.pop || 0,
    weather: item.weather || [{ icon: '01d', description: item.weather?.[0]?.description || '' }]
  }));

  return {
    timezone_offset: 0,
    current: {
      dt: Math.floor(Date.now() / 1000),
      temp: cur.main.temp,
      feels_like: cur.main.feels_like,
      wind_speed: cur.wind?.speed || 0,
      humidity: cur.main.humidity,
      visibility: cur.visibility || 0,
      pressure: cur.main.pressure,
      uvi: 0,
      dew_point: cur.main.temp - 2,
      weather: cur.weather,
    },
    hourly,
    daily: [],
    minutely: [],
  };
}

async function loadWeather(city) {
  try {
    const cityLabelEl = document.getElementById('city-label');
    const mainTempEl = document.getElementById('main-temp');
    if (cityLabelEl) cityLabelEl.textContent = 'Loading...';
    if (mainTempEl) mainTempEl.textContent = '--';
    const location = await fetchCoordinates(city);
    let weather;
    try {
      weather = await fetchWeather(location.lat, location.lon);
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('invalid api key')) {
        console.warn('One Call failed, attempting fallback:', e.message);
        weather = await fetchWeatherFallback(location.lat, location.lon);
      } else {
        throw e;
      }
    }

    weatherState = {
      city: `${location.name}${location.state ? `, ${location.state}` : ''}, ${location.country}`,
      coords: { lat: location.lat, lon: location.lon },
      timezoneOffset: weather.timezone_offset,
      current: weather.current,
      daily: weather.daily.slice(0, 8),
      hourly: weather.hourly.slice(0, 9),
      minutely: weather.minutely ? weather.minutely.slice(0, 5) : [],
    };
    currentCity = city;
    render();
  } catch (error) {
    console.error(error);
    const msg = error?.message || 'Unable to fetch weather data';
    const cityLabelEl = document.getElementById('city-label');
    const subtitleEl = document.getElementById('subtitle');
    if (cityLabelEl) cityLabelEl.textContent = 'Unable to fetch weather data';
    if (subtitleEl) subtitleEl.textContent = msg;
  }
}

function render() {
  const state = weatherState;
  const cityLabel = state?.city || currentCity;
  const current = state?.current;
  const daily = state?.daily || [];
  const hourly = state?.hourly || [];
  const minutely = state?.minutely || [];
  const temperatures = hourly.map(item => item.temp);
  const minTemp = Math.min(...temperatures, 0);
  const maxTemp = Math.max(...temperatures, 0);

  const chartLineHtml = hourly
    .map(item => {
      const height = maxTemp === minTemp ? 68 : 25 + ((item.temp - minTemp) / (maxTemp - minTemp)) * 65;
      return `<span style="height: ${height}%"></span>`;
    })
    .join('');

  const mapBbox = state
    ? `${state.coords.lon - 0.22}%2C${state.coords.lat - 0.14}%2C${state.coords.lon + 0.22}%2C${state.coords.lat + 0.14}`
    : '-0.295%2C51.47%2C-0.08%2C51.54';

  const cityLabelEl = document.getElementById('city-label');
  const subtitleEl = document.getElementById('subtitle');
  const mainTempEl = document.getElementById('main-temp');
  const descEl = document.getElementById('condition-desc');
  const feelsEl = document.getElementById('condition-feels');
  const iconEl = document.getElementById('weather-icon');
  const timeEl = document.getElementById('current-time');
  const metricsContainer = document.getElementById('metrics-container');
  const dayTabs = document.getElementById('day-tabs');
  const chartLine = document.getElementById('chart-line');
  const hourlyList = document.getElementById('hourly-list');
  const mapFrame = document.getElementById('map-frame');
  const precipRow = document.getElementById('precip-row');

  if (cityLabelEl) cityLabelEl.textContent = cityLabel;
  if (subtitleEl) subtitleEl.textContent = 'Weather data refreshed from OpenWeather';

  if (current) {
    if (mainTempEl) mainTempEl.textContent = `${Math.round(current.temp)}°`;
    if (descEl) descEl.textContent = current.weather[0].description;
    if (feelsEl) feelsEl.textContent = `Feels like ${Math.round(current.feels_like)}°`;
    if (iconEl) iconEl.textContent = getWeatherIcon(current.weather[0].icon);
    if (timeEl) timeEl.textContent = formatHour(current.dt, state.timezoneOffset);
  }

  if (metricsContainer) {
    metricsContainer.innerHTML = '';
    if (current) {
      const metrics = [
        { label: 'Wind', value: `${Math.round(current.wind_speed)} ${currentUnit === 'metric' ? 'm/s' : 'mph'}` },
        { label: 'Humidity', value: `${current.humidity}%` },
        { label: 'Visibility', value: `${Math.round((current.visibility || 0) / 1000)} km` },
        { label: 'Pressure', value: `${current.pressure} hPa` },
        { label: 'UV Index', value: `${current.uvi}` },
        { label: 'Dew Point', value: `${Math.round(current.dew_point)}°` },
      ];
      metrics.forEach(m => {
        const div = document.createElement('div');
        div.className = 'metric-chip';
        div.innerHTML = `<span>${m.label}</span><strong>${m.value}</strong>`;
        metricsContainer.appendChild(div);
      });
    }
  }

  if (dayTabs) {
    dayTabs.innerHTML = daily.map((item, index) => `
      <button class="day-tab ${index === 0 ? 'active' : ''}" type="button">
        <span class="day-name">${index === 0 ? 'Today' : formatDay(item.dt, state.timezoneOffset)}</span>
        <span class="day-icon">${getWeatherIcon(item.weather[0].icon)}</span>
        <span class="day-temp">${Math.round(item.temp.day)}°</span>
      </button>
    `).join('');
  }

  if (chartLine) chartLine.innerHTML = chartLineHtml;

  if (hourlyList) {
    hourlyList.innerHTML = hourly.map(hour => `
      <div class="hourly-item">
        <time>${formatHour(hour.dt, state.timezoneOffset)}</time>
        <div class="temp">${Math.round(hour.temp)}°</div>
        <div class="chance">${Math.round(hour.pop * 100)}%</div>
      </div>
    `).join('');
  }

  if (mapFrame && state) {
    mapFrame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${mapBbox}&layer=mapnik&marker=${state.coords.lat}%2C${state.coords.lon}`;
  }

  if (precipRow) {
    precipRow.innerHTML = minutely.map((point, index) => `
      <div class="precip-item">
        <strong>${index === 0 ? 'Now' : `${formatHour(point.dt, state.timezoneOffset)}`}</strong>
        <span>${(point.precipitation || 0).toFixed(1)} mm</span>
      </div>
    `).join('');
  }

  initControls();
}

function initControls() {
  const unitButtons = document.querySelectorAll('.unit');
  const form = document.getElementById('search-form');
  const input = document.getElementById('city-input');

  unitButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const selectedUnit = button.dataset.unit;
      if (selectedUnit === currentUnit) return;
      currentUnit = selectedUnit;
      unitButtons.forEach(btn => btn.classList.toggle('active', btn === button));
      await loadWeather(currentCity);
    });
  });

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const city = input?.value.trim();
    if (!city) return;
    currentCity = city;
    try { localStorage.setItem(STORAGE_KEY, city); } catch (e) {}
    await loadWeather(city);
  });
}


try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) currentCity = saved;
} catch (e) {}

loadWeather(currentCity);

if (refreshTimer) {
  clearInterval(refreshTimer);
}
refreshTimer = setInterval(() => loadWeather(currentCity), 10 * 60 * 1000);

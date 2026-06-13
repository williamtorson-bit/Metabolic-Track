import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  BarChart3,
  CalendarDays,
  Clock,
  Download,
  Flame,
  Gauge,
  Moon,
  Plus,
  RefreshCcw,
  Salad,
  Scale,
  Settings,
  Sun,
  TimerReset,
  Upload,
  Utensils,
  Zap
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'metabolic-track-v2';
const LEGACY_STORAGE_KEY = 'metabolic-track-v1';
const KG_PER_LB = 0.45359237;

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toLocalDateTimeInput(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const offsetMs = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toLocalDateInput(date = new Date()) {
  return toLocalDateTimeInput(date).slice(0, 10);
}

function getInitialState() {
  return {
    appName: 'Metabolic Track',
    theme: 'dark',
    targetWeightKg: 95,
    lowCarbStartDate: '',
    dailyCarbTarget: 30,
    weightEntries: [
      { id: createId(), date: '2025-07-06T18:45', weightKg: 138.5, note: 'Baseline before low-carb plan' },
      { id: createId(), date: '2025-07-16T14:45', weightKg: 133.7, note: 'Work scale' },
      { id: createId(), date: '2025-07-23T08:24', weightKg: 131.8, note: 'Home scale' },
      { id: createId(), date: '2025-07-29T08:10', weightKg: 129.45, note: 'Home scale' },
      { id: createId(), date: '2025-08-02T10:43', weightKg: 128.75, note: 'Home scale recheck' }
    ],
    fasts: [],
    activeFast: null,
    foodLogs: []
  };
}

function normaliseState(rawState) {
  const fallback = getInitialState();
  if (!rawState || typeof rawState !== 'object') return fallback;

  const weightEntries = Array.isArray(rawState.weightEntries)
    ? rawState.weightEntries
        .map(entry => ({
          id: entry.id || createId(),
          date: entry.date || '',
          weightKg: Number(entry.weightKg),
          note: entry.note || ''
        }))
        .filter(entry => Number.isFinite(entry.weightKg) && entry.weightKg > 0 && !Number.isNaN(new Date(entry.date).getTime()))
    : fallback.weightEntries;

  const fasts = Array.isArray(rawState.fasts)
    ? rawState.fasts.map(fast => ({ ...fast, id: fast.id || createId() })).filter(fast => fast.start && fast.end)
    : [];

  const foodLogs = Array.isArray(rawState.foodLogs)
    ? rawState.foodLogs.map(log => ({
        id: log.id || createId(),
        date: log.date || '',
        carbs: Number(log.carbs || 0),
        protein: Number(log.protein || 0),
        notes: log.notes || ''
      })).filter(log => log.date)
    : [];

  return {
    ...fallback,
    ...rawState,
    theme: rawState.theme === 'light' ? 'light' : 'dark',
    targetWeightKg: Number(rawState.targetWeightKg) || fallback.targetWeightKg,
    dailyCarbTarget: Number(rawState.dailyCarbTarget) || fallback.dailyCarbTarget,
    weightEntries,
    fasts,
    foodLogs,
    activeFast: rawState.activeFast?.start ? rawState.activeFast : null
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? normaliseState(JSON.parse(raw)) : getInitialState();
  } catch {
    return getInitialState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toKg(value, unit) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return unit === 'lb' || unit === 'lbs' || unit === 'pounds' ? +(num * KG_PER_LB).toFixed(2) : +num.toFixed(2);
}

function fmtKg(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(2)} kg`;
}

function fmtDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function daysBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return (end - start) / (1000 * 60 * 60 * 24);
}

function sortByDate(entries) {
  return [...entries]
    .filter(entry => entry?.date && !Number.isNaN(new Date(entry.date).getTime()))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function trendStats(entries, targetWeightKg) {
  const sorted = sortByDate(entries).filter(entry => Number.isFinite(entry.weightKg) && entry.weightKg > 0);
  if (sorted.length === 0) return {};

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalChange = +(first.weightKg - last.weightKg).toFixed(2);
  const elapsedDays = Math.max(daysBetween(first.date, last.date), 1);
  const weeklyRate = +(totalChange / elapsedDays * 7).toFixed(2);
  const startToTarget = Math.max(first.weightKg - targetWeightKg, 0.1);
  const remaining = targetWeightKg ? +(last.weightKg - targetWeightKg).toFixed(2) : null;
  const progress = targetWeightKg ? Math.min(100, Math.max(0, ((first.weightKg - last.weightKg) / startToTarget) * 100)) : null;
  const etaWeeks = weeklyRate > 0 && remaining > 0 ? +(remaining / weeklyRate).toFixed(1) : null;
  const latest7Days = sorted.filter(entry => daysBetween(entry.date, last.date) <= 7);
  const sevenDayChange = latest7Days.length > 1
    ? +(latest7Days[0].weightKg - latest7Days[latest7Days.length - 1].weightKg).toFixed(2)
    : null;

  return { first, last, totalChange, elapsedDays, weeklyRate, remaining, progress, etaWeeks, sevenDayChange, count: sorted.length };
}

function movingAverage(entries, window = 3) {
  const sorted = sortByDate(entries).filter(entry => Number.isFinite(entry.weightKg) && entry.weightKg > 0);
  return sorted.map((entry, index) => {
    const slice = sorted.slice(Math.max(0, index - window + 1), index + 1);
    const avg = slice.reduce((sum, item) => sum + item.weightKg, 0) / slice.length;
    return { ...entry, movingAverage: +avg.toFixed(2) };
  });
}

function fastingStage(hours) {
  if (hours < 4) return { title: 'Fed / early post-meal stage', detail: 'Your body is likely still using recent food energy. Keep hydration steady and avoid unnecessary snacking.' };
  if (hours < 12) return { title: 'Post-absorptive stage', detail: 'Insulin may be falling and stored glycogen use is increasing. Hunger often comes in waves.' };
  if (hours < 24) return { title: 'Fat-burning transition', detail: 'Glycogen use continues and fat oxidation may increase, especially if carbohydrate intake has been low.' };
  if (hours < 48) return { title: 'Ketosis likely increasing', detail: 'Many people begin producing more ketones in this window, but timing varies by carb intake, activity and metabolic health.' };
  if (hours < 72) return { title: 'Deeper fasting state', detail: 'Ketones may be higher. Prioritise fluids, sodium/electrolytes and stop if you feel unwell.' };
  return { title: 'Prolonged fast caution zone', detail: 'This is beyond routine intermittent fasting. Consider medical advice, especially with medicines, diabetes, kidney disease or symptoms.' };
}

function lowCarbStage(lowCarbStartDate, dailyCarbTarget, latestCarbs) {
  if (!lowCarbStartDate) return { title: 'Set your low-carb start date', detail: 'Add the date you started low-carb so the app can estimate your metabolic stage.' };

  const days = Math.max(0, Math.floor(daysBetween(`${lowCarbStartDate}T00:00`, new Date())));
  const target = Number(dailyCarbTarget) || 30;
  const carbWarning = latestCarbs !== null && latestCarbs !== undefined && Number(latestCarbs) > target;

  if (carbWarning) return { title: 'Carb target exceeded recently', detail: `Your latest logged carbs were above your ${target}g target, so ketosis may be reduced or delayed.` };
  if (days < 1) return { title: 'Day 0–1: low-carb start', detail: 'Your body is likely reducing glucose availability and beginning to use stored glycogen.' };
  if (days < 3) return { title: 'Day 1–3: glycogen depletion phase', detail: 'Water weight may drop quickly. Salt, hydration and consistent meals can reduce headaches and fatigue.' };
  if (days < 7) return { title: 'Day 3–7: ketosis may begin', detail: 'If carbs are consistently low, many people start moving into nutritional ketosis in this period.' };
  if (days < 21) return { title: 'Week 2–3: fat adaptation building', detail: 'Energy and appetite may become steadier. Weight trend is more useful than single readings.' };
  return { title: 'Longer-term low-carb phase', detail: 'Focus on sustainability: protein, fibre/low-carb vegetables, electrolytes, sleep, resistance exercise and relapse planning.' };
}

function parseDateCandidate(input) {
  const cleaned = String(input || '').trim().replace(/@/g, ' ');
  if (!cleaned) return null;

  const isoMatch = cleaned.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?\b/);
  if (isoMatch) {
    const [, yyyy, mm, dd, hh = '12', min = '00'] = isoMatch;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dmyMatch = cleaned.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s*(?:at)?\s*(\d{1,2}):(\d{2}))?\b/i);
  if (dmyMatch) {
    const [, dd, mm, yyyy, hh = '12', min = '00'] = dmyMatch;
    const year = yyyy.length === 2 ? Number(`20${yyyy}`) : Number(yyyy);
    const date = new Date(year, Number(mm) - 1, Number(dd), Number(hh), Number(min));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const loose = new Date(cleaned);
  return Number.isNaN(loose.getTime()) ? null : loose;
}

function removeDateFromRow(row) {
  return String(row || '')
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}(?:[T\s]+\d{1,2}:\d{2})?\b/, '')
    .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}(?:\s*(?:@|at)?\s*\d{1,2}:\d{2})?\b/i, '')
    .replace(/[,;\t]+/g, ' ')
    .trim();
}

function parseWeightText(text) {
  const rows = String(text || '').split(/\r?\n/).map(row => row.trim()).filter(Boolean);
  const parsed = [];

  for (const row of rows) {
    if (/^date\s*[,;\t]?\s*weight/i.test(row) || /^weight\s*[,;\t]?\s*date/i.test(row)) continue;

    const columns = row.split(/[,;\t]/).map(part => part.trim()).filter(Boolean);
    let date = null;
    let weight = null;
    let unit = /\b(lb|lbs|pounds)\b/i.test(row) ? 'lb' : 'kg';
    let note = '';

    if (columns.length >= 2) {
      const dateIndex = columns.findIndex(column => parseDateCandidate(column));
      if (dateIndex !== -1) {
        date = parseDateCandidate(columns[dateIndex]);
        const weightIndex = columns.findIndex((column, index) => index !== dateIndex && /\d+(?:\.\d+)?/.test(column));
        if (weightIndex !== -1) {
          const weightMatch = columns[weightIndex].match(/\d+(?:\.\d+)?/);
          weight = weightMatch ? Number(weightMatch[0]) : null;
          unit = /\b(lb|lbs|pounds)\b/i.test(columns[weightIndex] + ' ' + row) ? 'lb' : 'kg';
          note = columns.filter((_, index) => ![dateIndex, weightIndex].includes(index)).join(' ');
        }
      }
    }

    if (!date || !weight) {
      date = parseDateCandidate(row);
      const withoutDate = removeDateFromRow(row);
      const weightMatch = withoutDate.match(/\b(\d{2,3}(?:\.\d+)?)\s*(kg|lb|lbs|pounds)?\b/i);
      weight = weightMatch ? Number(weightMatch[1]) : null;
      unit = /\b(lb|lbs|pounds)\b/i.test(weightMatch?.[2] || row) ? 'lb' : 'kg';
      note = withoutDate.replace(weightMatch?.[0] || '', '').replace(/^[:\-\s]+/, '').trim();
    }

    const kg = toKg(weight, unit);
    if (date && kg) {
      parsed.push({ id: createId(), date: toLocalDateTimeInput(date), weightKg: kg, note });
    }
  }

  return parsed;
}

function mergeWeightEntries(existing, incoming) {
  const seen = new Set(existing.map(entry => `${entry.date}|${Number(entry.weightKg).toFixed(2)}`));
  const unique = incoming.filter(entry => {
    const key = `${entry.date}|${Number(entry.weightKg).toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return sortByDate([...existing, ...unique]);
}

function downloadFile(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function LogoMark({ compact = false }) {
  return (
    <svg className={compact ? 'logo-mark compact' : 'logo-mark'} viewBox="0 0 120 120" role="img" aria-label="Metabolic Track logo">
      <defs>
        <linearGradient id="logoRing" x1="18" y1="18" x2="104" y2="104" gradientUnits="userSpaceOnUse">
          <stop stopColor="#57DFF7" />
          <stop offset="0.55" stopColor="#7DE5B2" />
          <stop offset="1" stopColor="#C4F35F" />
        </linearGradient>
        <linearGradient id="logoTrend" x1="25" y1="66" x2="94" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor="#57DFF7" />
          <stop offset="1" stopColor="#C4F35F" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="48" className="logo-base" />
      <path className="logo-ring" d="M60 12a48 48 0 1 0 38.4 76.8" />
      <path className="logo-ticks" d="M70 13a48 48 0 0 1 34 38" />
      <path className="logo-needle" d="M60 12v31" />
      <circle className="logo-node hollow" cx="60" cy="47" r="8" />
      <path className="logo-trend" d="M24 66l24 13 22 10 27 4" />
      <circle className="logo-node" cx="24" cy="66" r="7" />
      <circle className="logo-node mid" cx="48" cy="79" r="7" />
      <circle className="logo-node warm" cx="70" cy="89" r="7" />
      <circle className="logo-node bright" cx="97" cy="93" r="7" />
    </svg>
  );
}

function StatCard({ icon: Icon, label, value, helper }) {
  return (
    <div className="stat-card">
      <div className="stat-icon"><Icon size={20} /></div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {helper && <span>{helper}</span>}
      </div>
    </div>
  );
}

function WeightChart({ entries }) {
  const data = movingAverage(entries).filter(entry => entry.weightKg > 0);
  if (data.length < 2) return <div className="empty">Add at least two weight readings to see a trend graph.</div>;

  const width = 760;
  const height = 300;
  const padding = 44;
  const minWeight = Math.min(...data.map(item => item.weightKg)) - 1;
  const maxWeight = Math.max(...data.map(item => item.weightKg)) + 1;
  const minDate = new Date(data[0].date).getTime();
  const maxDate = new Date(data[data.length - 1].date).getTime();
  const x = item => padding + ((new Date(item.date).getTime() - minDate) / Math.max(maxDate - minDate, 1)) * (width - padding * 2);
  const y = weight => height - padding - ((weight - minWeight) / Math.max(maxWeight - minWeight, 1)) * (height - padding * 2);
  const line = data.map(item => `${x(item)},${y(item.weightKg)}`).join(' ');
  const avgLine = data.map(item => `${x(item)},${y(item.movingAverage)}`).join(' ');

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Weight trend chart">
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
        <line x1={padding} x2={padding} y1={padding} y2={height - padding} />
        {[0, 0.25, 0.5, 0.75, 1].map(marker => {
          const yy = padding + marker * (height - padding * 2);
          const label = maxWeight - marker * (maxWeight - minWeight);
          return <g key={marker}><line className="grid" x1={padding} x2={width - padding} y1={yy} y2={yy} /><text x="8" y={yy + 4}>{label.toFixed(1)}</text></g>;
        })}
        <polyline className="trend-line" points={line} />
        <polyline className="avg-line" points={avgLine} />
        {data.map(item => <circle key={item.id} cx={x(item)} cy={y(item.weightKg)} r="4"><title>{`${fmtDate(item.date)}: ${fmtKg(item.weightKg)}`}</title></circle>)}
      </svg>
      <div className="legend"><span>Actual readings</span><span>3-reading moving average</span></div>
    </div>
  );
}

function App() {
  const [state, setState] = useState(loadState);
  const [now, setNow] = useState(new Date());
  const [weightForm, setWeightForm] = useState({ date: toLocalDateTimeInput(), weight: '', unit: 'kg', note: '' });
  const [fastTarget, setFastTarget] = useState(24);
  const [foodForm, setFoodForm] = useState({ date: toLocalDateInput(), carbs: '', protein: '', notes: '' });
  const [pasteText, setPasteText] = useState('');
  const [importPreview, setImportPreview] = useState([]);

  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [state.theme]);

  const stats = useMemo(() => trendStats(state.weightEntries, state.targetWeightKg), [state.weightEntries, state.targetWeightKg]);
  const latestFood = sortByDate(state.foodLogs).at(-1);
  const lowCarb = lowCarbStage(state.lowCarbStartDate, Number(state.dailyCarbTarget), latestFood?.carbs);
  const activeHours = state.activeFast ? Math.max(0, (now - new Date(state.activeFast.start)) / (1000 * 60 * 60)) : 0;
  const fastStage = fastingStage(activeHours);
  const activeFastProgress = state.activeFast ? Math.min(100, activeHours / Math.max(Number(state.activeFast.targetHours) || 24, 1) * 100) : 0;

  function update(patch) {
    setState(previous => ({ ...previous, ...patch }));
  }

  function addWeight(event) {
    event.preventDefault();
    const kg = toKg(weightForm.weight, weightForm.unit);
    if (!kg || !weightForm.date) return;
    const newEntry = { id: createId(), date: weightForm.date, weightKg: kg, note: weightForm.note.trim() };
    update({ weightEntries: mergeWeightEntries(state.weightEntries, [newEntry]) });
    setWeightForm({ date: toLocalDateTimeInput(), weight: '', unit: 'kg', note: '' });
  }

  function addFoodLog(event) {
    event.preventDefault();
    if (!foodForm.date) return;
    update({
      foodLogs: [...state.foodLogs, {
        id: createId(),
        date: `${foodForm.date}T12:00`,
        carbs: Number(foodForm.carbs || 0),
        protein: Number(foodForm.protein || 0),
        notes: foodForm.notes.trim()
      }]
    });
    setFoodForm({ date: toLocalDateInput(), carbs: '', protein: '', notes: '' });
  }

  function startFast() {
    update({ activeFast: { id: createId(), start: new Date().toISOString(), targetHours: Number(fastTarget) || 24 } });
  }

  function endFast() {
    if (!state.activeFast) return;
    const end = new Date().toISOString();
    const hours = +((new Date(end) - new Date(state.activeFast.start)) / (1000 * 60 * 60)).toFixed(2);
    update({ fasts: [...state.fasts, { ...state.activeFast, end, hours }], activeFast: null });
  }

  function handleImportPreview() {
    setImportPreview(parseWeightText(pasteText));
  }

  function importWeights() {
    update({ weightEntries: mergeWeightEntries(state.weightEntries, importPreview) });
    setPasteText('');
    setImportPreview([]);
  }

  function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setImportPreview(parseWeightText(result));
      setPasteText(result);
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function resetDemo() {
    if (window.confirm('This will clear your saved app data and restore the demo data. Continue?')) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      setState(getInitialState());
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <div className="brand-row">
            <LogoMark />
            <div>
              <div className="eyebrow"><Flame size={18} /> all-in-one weight, fasting and low-carb tracker</div>
              <h1>{state.appName}</h1>
            </div>
          </div>
          <p>Record weight, import historical readings, track fasts, monitor low-carb consistency and review metabolic stage estimates from one Vercel-ready app.</p>
        </div>
        <button type="button" className="theme-toggle" onClick={() => update({ theme: state.theme === 'dark' ? 'light' : 'dark' })}>
          {state.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} {state.theme === 'dark' ? 'Light' : 'Dark'} mode
        </button>
      </header>

      <section className="grid stats-grid">
        <StatCard icon={Scale} label="Latest weight" value={fmtKg(stats.last?.weightKg)} helper={stats.last ? fmtDate(stats.last.date) : 'No reading yet'} />
        <StatCard icon={Activity} label="Total change" value={stats.totalChange !== undefined ? `${stats.totalChange.toFixed(2)} kg` : '—'} helper={stats.count ? `Across ${stats.count} readings` : ''} />
        <StatCard icon={BarChart3} label="Average weekly trend" value={stats.weeklyRate !== undefined ? `${stats.weeklyRate.toFixed(2)} kg/week` : '—'} helper="Based on first to latest reading" />
        <StatCard icon={Gauge} label="Target progress" value={stats.progress !== null && stats.progress !== undefined ? `${stats.progress.toFixed(0)}%` : '—'} helper={stats.etaWeeks ? `Estimated ${stats.etaWeeks} weeks to target` : 'Set target weight'} />
      </section>

      <section className="panel chart-panel">
        <div className="section-title"><BarChart3 /><div><h2>Weight trend analysis</h2><p>Single readings can be misleading. The moving average helps show the true direction.</p></div></div>
        <WeightChart entries={state.weightEntries} />
        <div className="insight-box">
          <strong>Current interpretation:</strong> {stats.weeklyRate > 1.5 ? 'Your current rate is rapid. A large early drop can be water and glycogen. Watch the weekly trend rather than one reading.' : stats.weeklyRate > 0 ? 'Your overall trend is downward. Continue monitoring consistency, sleep, hydration and carb intake.' : stats.weeklyRate < 0 ? 'Your trend is upward. Review carb intake, portion size, snacking, eating window and consistency before drawing conclusions from one reading.' : 'Add more readings to generate a reliable interpretation.'}
        </div>
      </section>

      <section className="grid two-col">
        <div className="panel">
          <div className="section-title"><Plus /><div><h2>Add weight reading</h2><p>Use kg or lb. The app stores everything internally in kg.</p></div></div>
          <form className="form" onSubmit={addWeight}>
            <label>Date and time<input type="datetime-local" value={weightForm.date} onChange={event => setWeightForm({ ...weightForm, date: event.target.value })} /></label>
            <label>Weight<input type="number" min="1" step="0.01" value={weightForm.weight} onChange={event => setWeightForm({ ...weightForm, weight: event.target.value })} placeholder="e.g. 128.75" /></label>
            <label>Unit<select value={weightForm.unit} onChange={event => setWeightForm({ ...weightForm, unit: event.target.value })}><option value="kg">kg</option><option value="lb">lb</option></select></label>
            <label>Notes<input value={weightForm.note} onChange={event => setWeightForm({ ...weightForm, note: event.target.value })} placeholder="Home scale, after fast, evening etc." /></label>
            <button type="submit"><Plus size={16} /> Save weight</button>
          </form>
        </div>

        <div className="panel">
          <div className="section-title"><Upload /><div><h2>Upload or paste old data</h2><p>Paste CSV/text or upload a CSV file. Example: 23/07/2025 08:24, 131.8, kg, home scale.</p></div></div>
          <textarea value={pasteText} onChange={event => setPasteText(event.target.value)} placeholder="Date, Weight, Unit, Note&#10;23/07/2025 08:24, 131.8, kg, Home scale&#10;02/08/2025 @ 10:43: 128.75 kg, Recheck" />
          <div className="button-row">
            <label className="file-button"><Upload size={16} /> Upload CSV<input type="file" accept=".csv,.txt" onChange={handleFileUpload} /></label>
            <button type="button" onClick={handleImportPreview}><RefreshCcw size={16} /> Preview import</button>
            <button type="button" onClick={importWeights} disabled={!importPreview.length}><Plus size={16} /> Import {importPreview.length || ''}</button>
          </div>
          {importPreview.length > 0 && <p className="success">Found {importPreview.length} valid readings ready to import. Existing matching readings will be skipped.</p>}
        </div>
      </section>

      <section className="grid two-col">
        <div className="panel fasting-panel">
          <div className="section-title"><Clock /><div><h2>Fasting timer</h2><p>Start a fast, set a target and monitor your current fasting stage.</p></div></div>
          {state.activeFast ? (
            <div className="timer-card">
              <span>Active fast</span>
              <strong>{Math.floor(activeHours)}h {Math.floor((activeHours % 1) * 60)}m</strong>
              <div className="progress"><div style={{ width: `${activeFastProgress}%` }} /></div>
              <p>Started: {fmtDate(state.activeFast.start)} · Target: {state.activeFast.targetHours}h</p>
              <h3>{fastStage.title}</h3>
              <p>{fastStage.detail}</p>
              <button type="button" onClick={endFast}><TimerReset size={16} /> End fast</button>
            </div>
          ) : (
            <div className="form compact">
              <label>Target fast length<select value={fastTarget} onChange={event => setFastTarget(event.target.value)}><option value="16">16 hours</option><option value="20">20 hours</option><option value="24">24 hours</option><option value="36">36 hours</option><option value="48">48 hours</option><option value="72">72 hours</option></select></label>
              <button type="button" onClick={startFast}><Clock size={16} /> Start fast now</button>
            </div>
          )}
          <div className="history-list">
            <h3>Recent fasts</h3>
            {sortByDate(state.fasts).slice(-4).reverse().map(fast => <div key={fast.id}><span>{fmtDate(fast.start)}</span><strong>{fast.hours}h</strong></div>)}
            {!state.fasts.length && <p className="muted">No completed fasts yet.</p>}
          </div>
        </div>

        <div className="panel">
          <div className="section-title"><Salad /><div><h2>Low-carb tracker</h2><p>Estimate your current low-carb stage using start date and carb target.</p></div></div>
          <div className="form compact">
            <label>Low-carb start date<input type="date" value={state.lowCarbStartDate} onChange={event => update({ lowCarbStartDate: event.target.value })} /></label>
            <label>Daily carb target, grams<input type="number" min="0" value={state.dailyCarbTarget} onChange={event => update({ dailyCarbTarget: Number(event.target.value) })} /></label>
            <label>Target weight, kg<input type="number" min="1" step="0.1" value={state.targetWeightKg} onChange={event => update({ targetWeightKg: Number(event.target.value) })} /></label>
          </div>
          <div className="stage-card"><Zap /><div><h3>{lowCarb.title}</h3><p>{lowCarb.detail}</p></div></div>
          <form className="form" onSubmit={addFoodLog}>
            <h3>Daily food log</h3>
            <label>Date<input type="date" value={foodForm.date} onChange={event => setFoodForm({ ...foodForm, date: event.target.value })} /></label>
            <label>Carbs, grams<input type="number" min="0" value={foodForm.carbs} onChange={event => setFoodForm({ ...foodForm, carbs: event.target.value })} placeholder="e.g. 25" /></label>
            <label>Protein, grams<input type="number" min="0" value={foodForm.protein} onChange={event => setFoodForm({ ...foodForm, protein: event.target.value })} placeholder="optional" /></label>
            <label>Notes<input value={foodForm.notes} onChange={event => setFoodForm({ ...foodForm, notes: event.target.value })} placeholder="eggs, avocado, meat, vegetables" /></label>
            <button type="submit"><Utensils size={16} /> Save food log</button>
          </form>
        </div>
      </section>

      <section className="panel education-panel">
        <div className="section-title"><Flame /><div><h2>Low-carb and fasting guide</h2><p>Educational prompts to keep the plan structured and safer.</p></div></div>
        <div className="guide-grid">
          <article><h3>Ketosis</h3><p>Ketosis usually means your body is producing more ketones because carbohydrate intake is low or fasting is prolonged. The app estimates likelihood only; blood ketone testing is needed for confirmation.</p></article>
          <article><h3>Electrolytes</h3><p>Early low-carb water loss can lower sodium and make you feel weak or headachy. Consider hydration, salt intake and balanced nutrition unless you have medical restrictions.</p></article>
          <article><h3>Protein and fibre</h3><p>Prioritise adequate protein and low-carb vegetables where tolerated. This supports satiety, bowel function and muscle retention during weight loss.</p></article>
          <article><h3>When to be careful</h3><p>Seek medical advice if you have diabetes, kidney disease, pregnancy, eating-disorder history, fainting, chest pain, severe weakness or you take glucose-lowering medication.</p></article>
        </div>
      </section>

      <section className="grid two-col">
        <div className="panel">
          <div className="section-title"><Settings /><div><h2>App controls</h2><p>Export, backup or reset your local data.</p></div></div>
          <label className="full-label">App name<input value={state.appName} onChange={event => update({ appName: event.target.value })} /></label>
          <div className="button-row">
            <button type="button" onClick={() => downloadFile('metabolic-track-backup.json', JSON.stringify(state, null, 2))}><Download size={16} /> Export backup</button>
            <button type="button" onClick={() => downloadFile('weight-data.csv', 'date,weight_kg,note\n' + sortByDate(state.weightEntries).map(entry => `${entry.date},${entry.weightKg},"${(entry.note || '').replaceAll('"', '""')}"`).join('\n'), 'text/csv')}><Download size={16} /> Export CSV</button>
            <button type="button" className="danger" onClick={resetDemo}><RefreshCcw size={16} /> Reset demo</button>
          </div>
        </div>
        <div className="panel">
          <div className="section-title"><CalendarDays /><div><h2>Recent weight readings</h2><p>Your latest entries, newest first.</p></div></div>
          <div className="table-list">
            {sortByDate(state.weightEntries).reverse().slice(0, 8).map(entry => <div key={entry.id}><span>{fmtDate(entry.date)}</span><strong>{fmtKg(entry.weightKg)}</strong><em>{entry.note}</em></div>)}
          </div>
        </div>
      </section>

      <footer>
        <LogoMark compact />
        <p>This app provides educational estimates only and does not diagnose ketosis, diabetes or any medical condition. Use clinical judgement and seek professional advice where needed.</p>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);

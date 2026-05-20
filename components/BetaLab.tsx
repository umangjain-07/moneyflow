import React, { useEffect, useMemo, useState } from 'react';
import { db, subscribe } from '../services/storage';
import { Account, Category, Goal, Transaction } from '../types';
import { Activity, BarChart3, PieChart as PieIcon, Target, Zap, LineChart, Sparkles } from 'lucide-react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  RadialBarChart,
  RadialBar,
  ScatterChart,
  Scatter,
  ZAxis,
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  Cell,
  ReferenceLine
} from 'recharts';

const WidgetCard: React.FC<{ id: string; title: string; icon?: any; accent?: string; children: React.ReactNode }> = ({
  id,
  title,
  icon: Icon,
  accent = '#22d3ee',
  children
}) => (
  <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-[#0b1220]/90 p-5 shadow-2xl">
    <div
      className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full blur-3xl"
      style={{ background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)` }}
    />
    <div className="flex items-start justify-between mb-4">
      <div>
        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Node: {id}</p>
        <h3 className="text-sm font-bold text-slate-100 mt-1">{title}</h3>
      </div>
      {Icon && (
        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400">
          <Icon size={16} />
        </div>
      )}
    </div>
    {children}
  </div>
);

const PentagonBadge: React.FC<{ value: number }> = ({ value }) => (
  <div className="relative h-20 w-20">
    <svg viewBox="0 0 100 100" className="h-20 w-20">
      <defs>
        <linearGradient id="pentagonFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <polygon points="50,6 95,38 78,92 22,92 5,38" fill="none" stroke="#1f2937" strokeWidth="6" />
      <polygon points="50,12 88,40 73,86 27,86 12,40" fill="url(#pentagonFill)" />
      <text x="50" y="58" textAnchor="middle" fill="#e2e8f0" fontSize="22" fontWeight="700">
        {Math.round(value)}%
      </text>
    </svg>
  </div>
);

const SignalTile: React.FC<{ title: string; value: string; hint: string; accent?: string }> = ({
  title,
  value,
  hint,
  accent = '#22d3ee'
}) => (
  <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0b1220]/90 p-4">
    <div
      className="pointer-events-none absolute -top-8 right-0 h-20 w-20 rounded-full blur-2xl"
      style={{ background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)` }}
    />
    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{title}</p>
    <div className="text-2xl font-black text-slate-100 mt-1">{value}</div>
    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-2">{hint}</p>
  </div>
);

const DenseStat: React.FC<{ label: string; value: string; accent?: string }> = ({ label, value, accent = '#22d3ee' }) => (
  <div className="rounded-xl border border-slate-800/80 bg-[#0b1220]/90 px-3 py-2">
    <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{label}</div>
    <div className="text-sm font-black" style={{ color: accent }}>{value}</div>
  </div>
);

export const BetaLab: React.FC = () => {
  const [settings, setSettings] = useState(db.getSettings());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [health, setHealth] = useState(db.getFinancialHealth());

  useEffect(() => {
    const loadData = () => {
      const loaded = db.getSettings();
      setSettings(loaded);
      setTransactions(db.getTransactions());
      setAccounts(db.getAccounts());
      setCategories(db.getCategories());
      setGoals(db.getGoals());
      setHealth(db.getFinancialHealth());
      setRange((loaded.dashboardRange as RangeKey) || '6M');
      setCustomRange({ start: loaded.reportsCustomStart || '', end: loaded.reportsCustomEnd || '' });
      setPickedMonth(loaded.reportsPickedMonth || '');
    };

    loadData();
    const unsubscribe = subscribe(loadData);
    return () => unsubscribe();
  }, []);


  if (!settings.betaLabEnabled) {
    return (
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-10 text-center text-slate-400">
        Beta Lab is disabled. Enable it from Settings to access this page.
      </div>
    );
  }

  const formatMoney = (val: number) => `${settings.currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const formatCompact = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1000000) return `${(val / 1000000).toFixed(1)}m`;
    if (abs >= 1000) return `${(val / 1000).toFixed(1)}k`;
    return `${Math.round(val)}`;
  };

  const formatDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatMonthLabel = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  const formatDayLabel = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const getAccountCurrency = (accountId: string) => accounts.find(a => a.id === accountId)?.currency || settings.currency;

  type RangeKey = '1M' | '3M' | '6M' | '1Y' | 'ALL' | 'CUSTOM';
  const [range, setRange] = useState<RangeKey>(() => (db.getSettings().dashboardRange as RangeKey) || '6M');
  const [customRange, setCustomRange] = useState(() => ({
    start: db.getSettings().reportsCustomStart || '',
    end: db.getSettings().reportsCustomEnd || ''
  }));
  const [pickedMonth, setPickedMonth] = useState(() => db.getSettings().reportsPickedMonth || '');

  useEffect(() => {
    db.updateSettings({
      dashboardRange: range,
      reportsCustomStart: customRange.start,
      reportsCustomEnd: customRange.end,
      reportsPickedMonth: pickedMonth
    });
  }, [range, customRange.start, customRange.end, pickedMonth]);

  const [transactionView, setTransactionView] = useState<'ALL' | 'MONTH'>('ALL');
  const [selectedMonthKey, setSelectedMonthKey] = useState('');

  const monthToRange = (monthValue: string) => {
    if (!monthValue) return null;
    const [y, m] = monthValue.split('-').map(Number);
    if (!y || !m) return null;
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return { start, end };
  };

  const rangeInfo = useMemo(() => {
    const today = new Date();
    let startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let endDate = today;
    let label = range === 'ALL' ? 'All' : range;

    if (range === 'CUSTOM') {
      if (customRange.start && customRange.end) {
        startDate = new Date(customRange.start);
        endDate = new Date(customRange.end);
        label = 'Custom';
      } else {
        const monthRange = monthToRange(pickedMonth);
        if (monthRange) {
          startDate = monthRange.start;
          endDate = monthRange.end;
          label = pickedMonth;
        }
      }
    } else if (range === 'ALL') {
      if (transactions.length > 0) {
        const earliest = transactions.reduce((acc, t) => t.date < acc ? t.date : acc, transactions[0].date);
        const [y, m, d] = earliest.split('-').map(Number);
        startDate = new Date(y, m - 1, d);
      }
    } else {
      const monthsBack = range === '1M' ? 1 : range === '3M' ? 3 : range === '6M' ? 6 : 12;
      startDate = new Date(today.getFullYear(), today.getMonth() - monthsBack, today.getDate());
    }

    const startKey = formatDateKey(startDate);
    const endKey = formatDateKey(endDate);
    const rangeDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    return { startKey, endKey, rangeDays, label };
  }, [range, transactions, customRange.start, customRange.end, pickedMonth]);

  const rangeTxs = useMemo(
    () => transactions.filter(t => t.date >= rangeInfo.startKey && t.date <= rangeInfo.endKey),
    [transactions, rangeInfo.startKey, rangeInfo.endKey]
  );

  const rangeKpis = useMemo(() => {
    let income = 0;
    let expense = 0;
    let investment = 0;
    let goalFeed = 0;
    let sponsored = 0;

    rangeTxs.forEach(t => {
      const currency = getAccountCurrency(t.accountId);
      if (t.type === 'EXPENSE') {
        const net = Math.max(0, t.amount - (t.sponsoredAmount || 0));
        const netVal = db.convertAmount(net, currency, settings.currency);
        const sponsorVal = db.convertAmount(t.sponsoredAmount || 0, currency, settings.currency);
        expense += netVal;
        sponsored += sponsorVal;
      } else if (t.type === 'INCOME') {
        income += db.convertAmount(t.amount, currency, settings.currency);
      } else if (t.type === 'INVESTMENT') {
        investment += db.convertAmount(t.amount, currency, settings.currency);
      } else if (t.type === 'GOAL') {
        goalFeed += db.convertAmount(t.amount, currency, settings.currency);
      }
    });

    return { income, expense, investment, goalFeed, sponsored };
  }, [rangeTxs, settings.currency, accounts]);

  const monthlySeries = useMemo(() => {
    const start = new Date(rangeInfo.startKey);
    const end = new Date(rangeInfo.endKey);
    const iter = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    const byMonth = new Map<string, { key: string; label: string; date: Date; income: number; expense: number; investment: number; goals: number; net: number }>();

    while (iter <= last) {
      const key = `${iter.getFullYear()}-${String(iter.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(key, {
        key,
        label: formatMonthLabel(iter),
        date: new Date(iter),
        income: 0,
        expense: 0,
        investment: 0,
        goals: 0,
        net: 0
      });
      iter.setMonth(iter.getMonth() + 1);
    }

    rangeTxs.forEach(t => {
      const key = t.date.substring(0, 7);
      const entry = byMonth.get(key);
      if (!entry) return;
      if (t.categoryId === 'transfer_in' || t.categoryId === 'transfer_out') return;

      const currency = getAccountCurrency(t.accountId);
      const rawAmount = t.type === 'EXPENSE' ? Math.max(0, t.amount - (t.sponsoredAmount || 0)) : t.amount;
      const amount = db.convertAmount(rawAmount, currency, settings.currency);

      if (t.type === 'INCOME') entry.income += amount;
      if (t.type === 'EXPENSE') entry.expense += amount;
      if (t.type === 'INVESTMENT') entry.investment += amount;
      if (t.type === 'GOAL') entry.goals += amount;
    });

    byMonth.forEach(entry => {
      entry.net = entry.income - entry.expense - entry.investment - entry.goals;
    });

    return Array.from(byMonth.values());
  }, [rangeInfo.startKey, rangeInfo.endKey, rangeTxs, accounts, settings.currency]);

  const monthOptions = useMemo(
    () => monthlySeries.map(entry => ({ key: entry.key, label: entry.label })),
    [monthlySeries]
  );

  useEffect(() => {
    if (!monthOptions.length) return;
    if (selectedMonthKey && monthOptions.some(option => option.key === selectedMonthKey)) return;
    setSelectedMonthKey(monthOptions[monthOptions.length - 1].key);
  }, [monthOptions, selectedMonthKey]);

  const selectedMonthLabel = useMemo(() => {
    if (!selectedMonthKey) return 'Month';
    return monthOptions.find(option => option.key === selectedMonthKey)?.label || selectedMonthKey;
  }, [monthOptions, selectedMonthKey]);

  type DailyEntry = {
    key: string;
    label: string;
    date: Date;
    income: number;
    expense: number;
    investment: number;
    goals: number;
    net: number;
    txCount: number;
    expenseCount: number;
  };

  const buildRollingSeries = (series: DailyEntry[], shortWindow = 7, longWindow = 30) =>
    series.map((entry, idx) => {
      const shortSlice = series.slice(Math.max(0, idx - shortWindow + 1), idx + 1);
      const longSlice = series.slice(Math.max(0, idx - longWindow + 1), idx + 1);
      const net7 = shortSlice.reduce((sum, d) => sum + d.net, 0) / Math.max(1, shortSlice.length);
      const net30 = longSlice.reduce((sum, d) => sum + d.net, 0) / Math.max(1, longSlice.length);
      const exp7 = shortSlice.reduce((sum, d) => sum + d.expense, 0) / Math.max(1, shortSlice.length);
      return { ...entry, net7, net30, exp7 };
    });

  const buildHeatmapCells = (series: DailyEntry[]) => {
    const maxAbs = Math.max(1, ...series.map(d => Math.abs(d.net)));
    return series.map(entry => {
      const intensity = Math.min(1, Math.abs(entry.net) / maxAbs);
      const alpha = 0.15 + intensity * 0.6;
      const color = entry.net >= 0 ? `rgba(16, 185, 129, ${alpha})` : `rgba(244, 63, 94, ${alpha})`;
      return { ...entry, color, intensity };
    });
  };

  const dailySeries = useMemo<DailyEntry[]>(() => {
    const start = new Date(rangeInfo.startKey);
    const end = new Date(rangeInfo.endKey);
    const map = new Map<string, DailyEntry>();

    const cursor = new Date(start);
    while (cursor <= end) {
      const key = formatDateKey(cursor);
      map.set(key, {
        key,
        label: formatDayLabel(cursor),
        date: new Date(cursor),
        income: 0,
        expense: 0,
        investment: 0,
        goals: 0,
        net: 0,
        txCount: 0,
        expenseCount: 0
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    rangeTxs.forEach(t => {
      const entry = map.get(t.date);
      if (!entry) return;
      if (t.categoryId === 'transfer_in' || t.categoryId === 'transfer_out') return;

      const currency = getAccountCurrency(t.accountId);
      const rawAmount = t.type === 'EXPENSE' ? Math.max(0, t.amount - (t.sponsoredAmount || 0)) : t.amount;
      const amount = db.convertAmount(rawAmount, currency, settings.currency);
      entry.txCount += 1;

      if (t.type === 'INCOME') entry.income += amount;
      if (t.type === 'EXPENSE') {
        entry.expense += amount;
        entry.expenseCount += 1;
      }
      if (t.type === 'INVESTMENT') entry.investment += amount;
      if (t.type === 'GOAL') entry.goals += amount;
    });

    map.forEach(entry => {
      entry.net = entry.income - entry.expense - entry.investment - entry.goals;
    });

    return Array.from(map.values());
  }, [rangeInfo.startKey, rangeInfo.endKey, rangeTxs, accounts, settings.currency]);

  const rollingSeries = useMemo(() => buildRollingSeries(dailySeries), [dailySeries]);

  const monthTxs = useMemo(
    () => (selectedMonthKey ? rangeTxs.filter(t => t.date.startsWith(selectedMonthKey)) : []),
    [rangeTxs, selectedMonthKey]
  );

  const monthDailySeries = useMemo(
    () => (selectedMonthKey ? dailySeries.filter(day => day.key.startsWith(selectedMonthKey)) : []),
    [dailySeries, selectedMonthKey]
  );

  const monthRollingSeries = useMemo(() => buildRollingSeries(monthDailySeries), [monthDailySeries]);
  const heatmapCells = useMemo(() => buildHeatmapCells(dailySeries), [dailySeries]);
  const monthHeatmapCells = useMemo(() => buildHeatmapCells(monthDailySeries), [monthDailySeries]);

  const percentile = (values: number[], p: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = (sorted.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    const weight = idx - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  const buildExpenseStats = (values: number[]) => {
    const total = values.reduce((sum, val) => sum + val, 0);
    const avg = values.length > 0 ? total / values.length : 0;
    const p25 = percentile(values, 0.25);
    const median = percentile(values, 0.5);
    const p75 = percentile(values, 0.75);
    const p90 = percentile(values, 0.9);
    const p95 = percentile(values, 0.95);
    const max = values.length > 0 ? Math.max(...values) : 0;

    return { avg, p25, median, p75, p90, p95, max, count: values.length };
  };

  const buildExpenseDistribution = (values: number[]) => {
    if (values.length === 0) return [];
    const max = Math.max(1, ...values);
    const binCount = Math.min(24, Math.max(12, Math.round(Math.sqrt(values.length))));
    const binSize = max / binCount;
    const bins = new Array(binCount).fill(0);

    values.forEach(val => {
      const idx = Math.min(binCount - 1, Math.floor(val / binSize));
      bins[idx] += 1;
    });

    let cumulative = 0;
    const raw = bins.map((count, idx) => {
      const start = idx * binSize;
      const end = start + binSize;
      const mid = start + binSize / 2;
      const density = count / values.length;
      cumulative += density;
      return { mid, start, end, density, cumulative, count };
    });

    return raw.map((entry, idx) => {
      const prev = raw[idx - 1]?.density ?? entry.density;
      const next = raw[idx + 1]?.density ?? entry.density;
      return { ...entry, smooth: (prev + entry.density + next) / 3 };
    });
  };

  const expenseValues = useMemo(() => {
    const values: number[] = [];
    rangeTxs.forEach(t => {
      if (t.type !== 'EXPENSE') return;
      if (t.categoryId === 'transfer_in' || t.categoryId === 'transfer_out') return;
      const currency = getAccountCurrency(t.accountId);
      const net = Math.max(0, t.amount - (t.sponsoredAmount || 0));
      values.push(db.convertAmount(net, currency, settings.currency));
    });
    return values;
  }, [rangeTxs, accounts, settings.currency]);

  const monthExpenseValues = useMemo(() => {
    const values: number[] = [];
    monthTxs.forEach(t => {
      if (t.type !== 'EXPENSE') return;
      if (t.categoryId === 'transfer_in' || t.categoryId === 'transfer_out') return;
      const currency = getAccountCurrency(t.accountId);
      const net = Math.max(0, t.amount - (t.sponsoredAmount || 0));
      values.push(db.convertAmount(net, currency, settings.currency));
    });
    return values;
  }, [monthTxs, accounts, settings.currency]);

  const expenseStats = useMemo(() => buildExpenseStats(expenseValues), [expenseValues]);
  const monthExpenseStats = useMemo(() => buildExpenseStats(monthExpenseValues), [monthExpenseValues]);

  const expenseDistribution = useMemo(() => buildExpenseDistribution(expenseValues), [expenseValues]);
  const monthExpenseDistribution = useMemo(() => buildExpenseDistribution(monthExpenseValues), [monthExpenseValues]);

  const txStats = useMemo(() => {
    const validTxs = rangeTxs.filter(t => t.categoryId !== 'transfer_in' && t.categoryId !== 'transfer_out');
    const count = validTxs.length;
    const activeDays = dailySeries.filter(d => d.txCount > 0).length;
    const perDay = count / Math.max(1, rangeInfo.rangeDays);
    const avgTxSize = count > 0
      ? (rangeKpis.income + rangeKpis.expense + rangeKpis.investment + rangeKpis.goalFeed) / count
      : 0;

    return {
      count,
      activeDays,
      perDay,
      avgTxSize,
      activeRate: activeDays / Math.max(1, rangeInfo.rangeDays)
    };
  }, [rangeTxs, dailySeries, rangeInfo.rangeDays, rangeKpis]);

  const monthlyLedger = useMemo(() => {
    const stats = new Map<string, { txCount: number; expenseCount: number; expenseTotal: number; maxDailyExpense: number; activeDays: number }>();

    dailySeries.forEach(day => {
      const monthKey = day.key.substring(0, 7);
      const entry = stats.get(monthKey) || { txCount: 0, expenseCount: 0, expenseTotal: 0, maxDailyExpense: 0, activeDays: 0 };
      if (day.txCount > 0) entry.activeDays += 1;
      entry.txCount += day.txCount;
      entry.expenseCount += day.expenseCount;
      entry.expenseTotal += day.expense;
      entry.maxDailyExpense = Math.max(entry.maxDailyExpense, day.expense);
      stats.set(monthKey, entry);
    });

    return monthlySeries.map(entry => {
      const monthKey = entry.key;
      const detail = stats.get(monthKey) || { txCount: 0, expenseCount: 0, expenseTotal: 0, maxDailyExpense: 0, activeDays: 0 };
      const margin = entry.income > 0 ? (entry.net / entry.income) * 100 : 0;
      const avgExpenseTx = detail.expenseCount > 0 ? detail.expenseTotal / detail.expenseCount : 0;
      return {
        ...entry,
        txCount: detail.txCount,
        expenseCount: detail.expenseCount,
        avgExpenseTx,
        maxDailyExpense: detail.maxDailyExpense,
        activeDays: detail.activeDays,
        margin
      };
    });
  }, [monthlySeries, dailySeries]);

  const monthLedgerRow = useMemo(
    () => monthlyLedger.find(row => row.key === selectedMonthKey),
    [monthlyLedger, selectedMonthKey]
  );

  const expenseQuantiles = useMemo(() => [
    { label: 'P25', value: expenseStats.p25, color: '#0ea5e9' },
    { label: 'P50', value: expenseStats.median, color: '#38bdf8' },
    { label: 'P75', value: expenseStats.p75, color: '#22d3ee' },
    { label: 'P90', value: expenseStats.p90, color: '#f59e0b' },
    { label: 'P95', value: expenseStats.p95, color: '#f97316' },
    { label: 'Max', value: expenseStats.max, color: '#f43f5e' }
  ], [expenseStats]);

  const monthExpenseQuantiles = useMemo(() => [
    { label: 'P25', value: monthExpenseStats.p25, color: '#0ea5e9' },
    { label: 'P50', value: monthExpenseStats.median, color: '#38bdf8' },
    { label: 'P75', value: monthExpenseStats.p75, color: '#22d3ee' },
    { label: 'P90', value: monthExpenseStats.p90, color: '#f59e0b' },
    { label: 'P95', value: monthExpenseStats.p95, color: '#f97316' },
    { label: 'Max', value: monthExpenseStats.max, color: '#f43f5e' }
  ], [monthExpenseStats]);

  const buildRegression = (values: number[]) => {
    const n = values.length;
    if (n === 0) return { slope: 0, intercept: 0, sigma: 0 };
    if (n === 1) return { slope: 0, intercept: values[0], sigma: 0 };

    const xs = values.map((_, idx) => idx);
    const xMean = xs.reduce((sum, x) => sum + x, 0) / n;
    const yMean = values.reduce((sum, y) => sum + y, 0) / n;
    let num = 0;
    let den = 0;

    xs.forEach((x, i) => {
      num += (x - xMean) * (values[i] - yMean);
      den += (x - xMean) * (x - xMean);
    });

    const slope = den === 0 ? 0 : num / den;
    const intercept = yMean - slope * xMean;
    const residuals = values.map((y, i) => y - (intercept + slope * xs[i]));
    const sigma = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / Math.max(1, n - 1));
    return { slope, intercept, sigma };
  };

  const forecastData = useMemo(() => {
    if (monthlySeries.length === 0) return [];
    const values = monthlySeries.map(entry => entry.net);
    const { slope, intercept, sigma } = buildRegression(values);
    const horizon = Math.min(6, Math.max(4, Math.floor(monthlySeries.length / 2)));
    const band = sigma * 1.35;

    const base: Array<{
      label: string;
      netActual: number | null;
      netForecast: number | null;
      bandBase: number | null;
      bandRange: number | null;
      income: number | null;
      expense: number | null;
    }> = monthlySeries.map(entry => ({
      label: entry.label,
      netActual: entry.net,
      netForecast: null,
      bandBase: null,
      bandRange: null,
      income: entry.income,
      expense: entry.expense
    }));

    const lastDate = monthlySeries[monthlySeries.length - 1].date;
    for (let i = 1; i <= horizon; i += 1) {
      const futureDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + i, 1);
      const x = monthlySeries.length - 1 + i;
      const forecast = intercept + slope * x;
      base.push({
        label: formatMonthLabel(futureDate),
        netActual: null,
        netForecast: forecast,
        bandBase: forecast - band,
        bandRange: band * 2,
        income: null,
        expense: null
      });
    }

    return base;
  }, [monthlySeries]);

  const netStats = useMemo(() => {
    if (monthlySeries.length === 0) return { avgNet: 0, stdNet: 0, trend: 0 };
    const values = monthlySeries.map(entry => entry.net);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const { slope } = buildRegression(values);
    return { avgNet: mean, stdNet: Math.sqrt(variance), trend: slope };
  }, [monthlySeries]);

  const nextForecast = useMemo(() => {
    const next = forecastData.find(entry => entry.netForecast !== null && entry.netForecast !== undefined);
    return next?.netForecast || 0;
  }, [forecastData]);

  const goalTotals = useMemo(() => {
    const current = goals.reduce((sum, g) => sum + (g.currentAmount || 0), 0);
    const target = goals.reduce((sum, g) => sum + (g.targetAmount || 0), 0);
    const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
    return { current, target, pct };
  }, [goals]);

  const pentagonData = useMemo(() => {
    if (monthlySeries.length === 0) return [];

    const avgIncome = monthlySeries.reduce((sum, entry) => sum + entry.income, 0) / monthlySeries.length;
    const avgExpense = monthlySeries.reduce((sum, entry) => sum + entry.expense, 0) / monthlySeries.length;
    const avgInvest = monthlySeries.reduce((sum, entry) => sum + entry.investment, 0) / monthlySeries.length;
    const avgGoals = monthlySeries.reduce((sum, entry) => sum + entry.goals, 0) / monthlySeries.length;
    const maxIncome = Math.max(1, ...monthlySeries.map(entry => entry.income));

    const incomeStrength = Math.min(100, (avgIncome / maxIncome) * 100);
    const expenseDiscipline = avgIncome > 0 ? Math.max(0, 100 - (avgExpense / avgIncome) * 100) : 0;
    const investFocus = avgIncome > 0 ? Math.min(100, (avgInvest / avgIncome) * 100) : 0;
    const goalPace = avgIncome > 0 ? Math.min(100, (avgGoals / avgIncome) * 100) : 0;
    const stability = Math.max(0, Math.min(100, 100 - (netStats.stdNet / Math.max(1, Math.abs(netStats.avgNet))) * 100));

    return [
      { metric: 'Income', score: incomeStrength, target: 75 },
      { metric: 'Discipline', score: expenseDiscipline, target: 65 },
      { metric: 'Invest', score: investFocus, target: 20 },
      { metric: 'Goals', score: goalPace, target: 15 },
      { metric: 'Stability', score: stability, target: 70 }
    ];
  }, [monthlySeries, netStats]);

  const pentagonScore = useMemo(() => {
    if (pentagonData.length === 0) return 0;
    const sum = pentagonData.reduce((acc, entry) => acc + entry.score, 0);
    return sum / pentagonData.length;
  }, [pentagonData]);

  const liquidityOrbit = useMemo(() => {
    const free = health.freeLiquidAssets ?? health.liquidAssets;
    const locked = health.goalLockedAssets || 0;
    const invested = health.investedAssets;
    const total = Math.max(1, free + locked + invested);
    return [
      { name: 'Free', value: (free / total) * 100, amount: free, fill: '#22d3ee' },
      { name: 'Goal Locked', value: (locked / total) * 100, amount: locked, fill: '#f59e0b' },
      { name: 'Invested', value: (invested / total) * 100, amount: invested, fill: '#8b5cf6' }
    ];
  }, [health]);

  const categoryBars = useMemo(() => {
    const agg: Record<string, { name: string; value: number; color: string }> = {};
    rangeTxs.forEach(t => {
      if (t.type !== 'EXPENSE') return;
      if (t.categoryId === 'transfer_in' || t.categoryId === 'transfer_out') return;
      const cat = categories.find(c => c.id === t.categoryId);
      const currency = getAccountCurrency(t.accountId);
      const net = Math.max(0, t.amount - (t.sponsoredAmount || 0));
      const val = db.convertAmount(net, currency, settings.currency);
      const key = cat?.id || 'unknown';
      if (!agg[key]) {
        agg[key] = { name: cat?.name || 'Uncategorized', value: 0, color: cat?.color || '#64748b' };
      }
      agg[key].value += val;
    });

    return Object.values(agg).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [rangeTxs, categories, settings.currency, accounts]);

  const constellationData = useMemo(() => {
    const data: Array<{ x: number; y: number; z: number; label: string }> = [];
    rangeTxs.forEach(t => {
      if (t.type !== 'EXPENSE') return;
      if (t.categoryId === 'transfer_in' || t.categoryId === 'transfer_out') return;
      const d = new Date(t.date);
      const day = d.getDay();
      const weekday = day === 0 ? 7 : day;
      const currency = getAccountCurrency(t.accountId);
      const net = Math.max(0, t.amount - (t.sponsoredAmount || 0));
      const amount = db.convertAmount(net, currency, settings.currency);
      data.push({ x: amount, y: weekday, z: Math.min(40, Math.sqrt(amount)), label: t.description || 'Expense' });
    });

    return data;
  }, [rangeTxs, accounts, settings.currency]);

  const goalArcData = useMemo(() => [
    { name: 'Progress', value: goalTotals.pct, fill: '#f59e0b' }
  ], [goalTotals.pct]);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const goalHint = goalTotals.target > 0
    ? `${formatMoney(goalTotals.current)} / ${formatMoney(goalTotals.target)}`
    : 'No goal targets yet';
  const dailyTickInterval = Math.max(1, Math.floor(rollingSeries.length / 8));
  const monthDailyTickInterval = Math.max(1, Math.floor(monthRollingSeries.length / 8));
  const activeDailyTickInterval = transactionView === 'MONTH' ? monthDailyTickInterval : dailyTickInterval;
  const activeRollingSeries = transactionView === 'MONTH' ? monthRollingSeries : rollingSeries;
  const activeHeatmapCells = transactionView === 'MONTH' ? monthHeatmapCells : heatmapCells;
  const activeExpenseDistribution = transactionView === 'MONTH' ? monthExpenseDistribution : expenseDistribution;
  const activeExpenseStats = transactionView === 'MONTH' ? monthExpenseStats : expenseStats;
  const activeExpenseQuantiles = transactionView === 'MONTH' ? monthExpenseQuantiles : expenseQuantiles;
  const activeLedgerRows = transactionView === 'MONTH' ? (monthLedgerRow ? [monthLedgerRow] : []) : monthlyLedger;
  const dailyPulseTitle = transactionView === 'MONTH'
    ? `Daily Pulse (Net + Rolling · ${selectedMonthLabel})`
    : 'Daily Pulse (Net + Rolling)';
  const heatmapTitle = transactionView === 'MONTH'
    ? `Net Heatmap (${selectedMonthLabel})`
    : 'Net Heatmap (Daily)';
  const ledgerTitle = transactionView === 'MONTH'
    ? `Ledger Snapshot (${selectedMonthLabel})`
    : 'Ledger Grid (Monthly)';
  const distTitle = transactionView === 'MONTH'
    ? `Expense Distribution (${selectedMonthLabel})`
    : 'Expense Distribution Curve';

  return (
    <div className="relative space-y-6 animate-in fade-in duration-500 font-['Space_Grotesk']">
      <div className="pointer-events-none absolute -top-24 right-0 h-64 w-64 rounded-full bg-cyan-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-40 left-0 h-52 w-52 rounded-full bg-emerald-500/10 blur-[120px]" />

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Beta Lab</h1>
          <p className="text-slate-400 text-sm">Prediction curves, pentagon balance, and orbital analytics.</p>
        </div>
        <div className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
          <Zap size={12} /> Enabled
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-2">
          {(['1M', '3M', '6M', '1Y', 'ALL'] as const).map(key => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                range === key ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {key === 'ALL' ? 'All' : key}
            </button>
          ))}
          <button
            onClick={() => setRange('CUSTOM')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              range === 'CUSTOM' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Custom
          </button>
        </div>

        {range === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
              <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Start</span>
              <input
                type="date"
                className="bg-transparent text-slate-200 text-xs font-bold outline-none"
                value={customRange.start}
                onChange={(e) => {
                  setPickedMonth('');
                  setCustomRange(prev => ({ ...prev, start: e.target.value }));
                }}
              />
            </div>
            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
              <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">End</span>
              <input
                type="date"
                className="bg-transparent text-slate-200 text-xs font-bold outline-none"
                value={customRange.end}
                onChange={(e) => {
                  setPickedMonth('');
                  setCustomRange(prev => ({ ...prev, end: e.target.value }));
                }}
              />
            </div>
            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
              <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Month</span>
              <input
                type="month"
                className="bg-transparent text-slate-200 text-xs font-bold outline-none"
                value={pickedMonth}
                onChange={(e) => {
                  setCustomRange({ start: '', end: '' });
                  setPickedMonth(e.target.value);
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SignalTile title="Net Drift" value={formatMoney(netStats.avgNet)} hint="Avg net per month" accent="#22d3ee" />
        <SignalTile title="Volatility" value={formatMoney(netStats.stdNet)} hint="Net standard deviation" accent="#f59e0b" />
        <SignalTile title="Next Forecast" value={formatMoney(nextForecast)} hint="Projected next month" accent="#38bdf8" />
        <SignalTile title="Goal Charge" value={`${goalTotals.pct.toFixed(0)}%`} hint={goalHint} accent="#f59e0b" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <DenseStat label="Tx Count" value={txStats.count.toString()} accent="#38bdf8" />
        <DenseStat label="Tx/Day" value={txStats.perDay.toFixed(2)} accent="#22d3ee" />
        <DenseStat label="Active Days" value={`${txStats.activeDays} (${Math.round(txStats.activeRate * 100)}%)`} accent="#10b981" />
        <DenseStat label="Avg Tx" value={formatMoney(txStats.avgTxSize)} accent="#f59e0b" />
        <DenseStat label="Avg Exp" value={formatMoney(expenseStats.avg)} accent="#f97316" />
        <DenseStat label="Median Exp" value={formatMoney(expenseStats.median)} accent="#a855f7" />
        <DenseStat label="P90 Exp" value={formatMoney(expenseStats.p90)} accent="#f43f5e" />
        <DenseStat label="Max Exp" value={formatMoney(expenseStats.max)} accent="#ef4444" />
      </div>

      <WidgetCard id="FORE-01" title={`Prediction Curves (${rangeInfo.label})`} icon={LineChart} accent="#38bdf8">
        <div className="h-[280px]">
          {forecastData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={forecastData}>
                <defs>
                  <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="incomeGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <YAxis tickFormatter={formatCompact} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
                  formatter={(val: any, name?: string) => [formatMoney(Number(val)), name || 'Value']}
                />
                <Area dataKey="income" name="Income" stroke="#10b981" fill="url(#incomeGlow)" strokeWidth={1.5} connectNulls />
                <Area dataKey="bandBase" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} legendType="none" />
                <Area dataKey="bandRange" name="Forecast Band" stackId="band" stroke="none" fill="url(#forecastBand)" isAnimationActive={false} legendType="none" />
                <Line dataKey="expense" name="Expense" stroke="#f43f5e" strokeWidth={1.5} dot={false} connectNulls />
                <Line dataKey="netActual" name="Net (Actual)" stroke="#22d3ee" strokeWidth={2.5} dot={false} connectNulls />
                <Line dataKey="netForecast" name="Net (Forecast)" stroke="#38bdf8" strokeDasharray="6 4" strokeWidth={2} dot={false} connectNulls />
                <Legend iconSize={8} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-600">No data yet</div>
          )}
        </div>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-3">
          Band shows forecast variance. Range inflow: {formatMoney(rangeKpis.income)}
        </p>
      </WidgetCard>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-2">
            <button
              onClick={() => setTransactionView('ALL')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                transactionView === 'ALL' ? 'bg-slate-200 text-slate-900 shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              All Range
            </button>
            <button
              onClick={() => setTransactionView('MONTH')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                transactionView === 'MONTH' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Monthly Breakdown
            </button>
          </div>

          {transactionView === 'MONTH' && monthOptions.length > 0 && (
            <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
              {monthOptions.map(option => (
                <button
                  key={option.key}
                  onClick={() => setSelectedMonthKey(option.key)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    selectedMonthKey === option.key ? 'bg-emerald-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WidgetCard id="DAILY-01" title={dailyPulseTitle} icon={Activity} accent="#22d3ee">
          <div className="h-[260px]">
            {activeRollingSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={activeRollingSeries}>
                  <defs>
                    <linearGradient id="dailyNetGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="label"
                    interval={activeDailyTickInterval}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }}
                  />
                  <YAxis tickFormatter={formatCompact} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
                    formatter={(val: any, name?: string) => [formatMoney(Number(val)), name || 'Value']}
                  />
                  <Bar dataKey="expense" name="Expense" fill="#f43f5e" opacity={0.35} />
                  <Area dataKey="net" name="Net" stroke="#22d3ee" fill="url(#dailyNetGlow)" strokeWidth={2} connectNulls />
                  <Line dataKey="net7" name="Net 7D" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
                  <Line dataKey="net30" name="Net 30D" stroke="#a855f7" strokeWidth={1.2} dot={false} strokeDasharray="4 4" />
                  <Legend iconSize={8} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">No daily data</div>
            )}
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-3">Bars show daily spend; lines show net and rolling averages.</p>
        </WidgetCard>

        <WidgetCard id="HEAT-01" title={heatmapTitle} icon={Sparkles} accent="#10b981">
          <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1">
            {activeHeatmapCells.map(cell => (
              <div
                key={cell.key}
                className="h-5 rounded-sm border border-slate-900/70"
                style={{ backgroundColor: cell.color }}
                title={`${cell.key} | Net ${formatMoney(cell.net)} | Tx ${cell.txCount}`}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-widest">
            <span>Negative to Positive Net</span>
            <span>{activeHeatmapCells.length} days</span>
          </div>
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <WidgetCard id="PENTA-01" title="Pentagon Balance Matrix" icon={Sparkles} accent="#f59e0b">
          <div className="flex items-center gap-4">
            <div className="h-[220px] flex-1">
              {pentagonData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={pentagonData}>
                    <defs>
                      <linearGradient id="pentagonGlow" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <PolarGrid stroke="#1e293b" gridType="polygon" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#cbd5f5', fontSize: 10, fontWeight: 600 }} tickLine={false} />
                    <PolarRadiusAxis tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
                      formatter={(val: any) => [`${Number(val).toFixed(0)}%`, 'Score']}
                    />
                    <Radar dataKey="target" stroke="#334155" fill="#334155" fillOpacity={0.15} dot={false} />
                    <Radar dataKey="score" stroke="#f59e0b" fill="url(#pentagonGlow)" strokeWidth={2} dot={false} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-600">No data yet</div>
              )}
            </div>
            <div className="flex flex-col items-center gap-2">
              <PentagonBadge value={pentagonScore} />
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Balance Score</p>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard id="ORBIT-01" title="Liquidity Orbit" icon={PieIcon} accent="#22d3ee">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="30%" outerRadius="90%" data={liquidityOrbit} startAngle={90} endAngle={-270}>
                <Tooltip
                  contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
                  formatter={(val: any, name?: string, payload?: any) => [formatMoney(payload?.payload?.amount || 0), name || 'Value']}
                />
                <Legend iconSize={8} layout="vertical" verticalAlign="middle" align="right" />
                <RadialBar dataKey="value" cornerRadius={10} background />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-1">
            {liquidityOrbit.map(item => (
              <div key={item.name} className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.fill }}></span>
                  {item.name}
                </span>
                <span className="font-mono">{formatMoney(item.amount)}</span>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard id="GOAL-01" title="Goal Arc" icon={Target} accent="#f59e0b">
          <div className="relative h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="65%" outerRadius="95%" data={goalArcData} startAngle={210} endAngle={-30}>
                <Tooltip
                  contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
                  formatter={(val: any) => [`${Number(val).toFixed(0)}%`, 'Progress']}
                />
                <RadialBar dataKey="value" cornerRadius={12} background />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-3xl font-black text-amber-400">{goalTotals.pct.toFixed(0)}%</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Goal Charge</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-3">{goalHint}</p>
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WidgetCard id="PRISM-01" title="Category Prism" icon={BarChart3} accent="#a855f7">
          <div className="h-[240px]">
            {categoryBars.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryBars} layout="vertical" margin={{ left: 10, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" tickFormatter={formatCompact} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={90} axisLine={false} tickLine={false} tick={{ fill: '#cbd5f5', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
                    formatter={(val: any) => [formatMoney(Number(val)), 'Spend']}
                  />
                  <Bar dataKey="value" radius={[6, 6, 6, 6]}>
                    {categoryBars.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">No expenses yet</div>
            )}
          </div>
        </WidgetCard>

        <WidgetCard id="CONST-01" title="Spending Constellation" icon={Activity} accent="#38bdf8">
          <div className="h-[240px]">
            {constellationData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" dataKey="x" name="Amount" tickFormatter={formatCompact} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Weekday"
                    domain={[1, 7]}
                    tickFormatter={(val) => dayLabels[Math.max(0, Math.min(6, Number(val) - 1))]}
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                  />
                  <ZAxis type="number" dataKey="z" range={[60, 240]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
                    formatter={(val: any, name?: string, payload?: any) => {
                      if (name === 'x') return [formatMoney(Number(val)), 'Amount'];
                      return [val, name || 'Value'];
                    }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.label || 'Expense'}
                  />
                  <Scatter data={constellationData} fill="#38bdf8" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">No expenses in range</div>
            )}
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-3">Bubble size scales with spend intensity</p>
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <WidgetCard id="LEDGER-01" title={ledgerTitle} icon={LineChart} accent="#38bdf8">
            {activeLedgerRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] text-slate-300">
                  <thead className="uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="py-2 text-left">Month</th>
                      <th className="py-2 text-right">Income</th>
                      <th className="py-2 text-right">Expense</th>
                      <th className="py-2 text-right">Invest</th>
                      <th className="py-2 text-right">Goals</th>
                      <th className="py-2 text-right">Net</th>
                      <th className="py-2 text-right">Δ Net</th>
                      <th className="py-2 text-right">Margin</th>
                      <th className="py-2 text-right">Tx</th>
                      <th className="py-2 text-right">Avg Exp</th>
                      <th className="py-2 text-right">Max Day</th>
                      <th className="py-2 text-right">Active</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {activeLedgerRows.map(row => {
                      const rowIndex = monthlyLedger.findIndex(entry => entry.key === row.key);
                      const prevNet = rowIndex > 0 ? monthlyLedger[rowIndex - 1].net : 0;
                      const delta = row.net - prevNet;
                      const netClass = row.net >= 0 ? 'text-emerald-400' : 'text-rose-400';
                      const deltaClass = delta >= 0 ? 'text-emerald-400' : 'text-rose-400';
                      return (
                        <tr key={row.key} className="border-t border-slate-800/70">
                          <td className="py-2 text-left text-slate-400 font-bold">{row.label}</td>
                          <td className="py-2 text-right">{formatMoney(row.income)}</td>
                          <td className="py-2 text-right">{formatMoney(row.expense)}</td>
                          <td className="py-2 text-right">{formatMoney(row.investment)}</td>
                          <td className="py-2 text-right">{formatMoney(row.goals)}</td>
                          <td className={`py-2 text-right font-bold ${netClass}`}>{formatMoney(row.net)}</td>
                          <td className={`py-2 text-right font-bold ${deltaClass}`}>{delta >= 0 ? '+' : ''}{formatMoney(delta)}</td>
                          <td className="py-2 text-right">{row.margin.toFixed(0)}%</td>
                          <td className="py-2 text-right">{row.txCount}</td>
                          <td className="py-2 text-right">{formatMoney(row.avgExpenseTx)}</td>
                          <td className="py-2 text-right">{formatMoney(row.maxDailyExpense)}</td>
                          <td className="py-2 text-right">{row.activeDays}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-[160px] flex items-center justify-center text-slate-600">No ledger data</div>
            )}
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-3">
              Rows include margin, transaction volume, and peak daily spend.
            </p>
          </WidgetCard>
        </div>

        <WidgetCard id="DIST-01" title={distTitle} icon={PieIcon} accent="#f59e0b">
          <div className="h-[240px]">
            {activeExpenseDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={activeExpenseDistribution}>
                  <defs>
                    <linearGradient id="distBars" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="mid"
                    tickFormatter={(val) => formatCompact(Number(val))}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }}
                  />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(val) => `${Math.round(Number(val))}`}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }}
                    domain={[0, 'auto']}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(val) => `${Math.round(Number(val) * 100)}%`}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }}
                    domain={[0, 1]}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
                    formatter={(val: any, name?: string) => {
                      if (name === 'Count') return [Number(val).toFixed(0), 'Count'];
                      return [`${(Number(val) * 100).toFixed(2)}%`, 'Density'];
                    }}
                    labelFormatter={(_, payload) => {
                      const entry = payload?.[0]?.payload;
                      if (entry) return `Range ${formatMoney(entry.start)} - ${formatMoney(entry.end)}`;
                      return 'Expense Range';
                    }}
                  />
                  <Bar yAxisId="left" dataKey="count" name="Count" fill="url(#distBars)" radius={[6, 6, 0, 0]} />
                  <Line yAxisId="right" dataKey="smooth" name="Density" stroke="#38bdf8" strokeWidth={2.5} dot={false} />
                  <ReferenceLine yAxisId="right" x={activeExpenseStats.p25} stroke="#0ea5e9" strokeDasharray="3 3" />
                  <ReferenceLine yAxisId="right" x={activeExpenseStats.median} stroke="#38bdf8" strokeDasharray="3 3" />
                  <ReferenceLine yAxisId="right" x={activeExpenseStats.p75} stroke="#22d3ee" strokeDasharray="3 3" />
                  <ReferenceLine yAxisId="right" x={activeExpenseStats.p90} stroke="#f59e0b" strokeDasharray="3 3" />
                  <Legend iconSize={8} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">No expense distribution</div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
              <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Expense Count</p>
              <p className="text-sm font-black text-slate-100">{activeExpenseStats.count}</p>
            </div>
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
              <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Average Expense</p>
              <p className="text-sm font-black text-slate-100">{formatMoney(activeExpenseStats.avg)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {activeExpenseQuantiles.map(bucket => (
              <span key={bucket.label} className="text-[9px] uppercase tracking-widest px-2 py-1 rounded-full border border-slate-800 text-slate-400">
                <span className="font-bold" style={{ color: bucket.color }}>{bucket.label}</span> {formatMoney(bucket.value)}
              </span>
            ))}
          </div>
        </WidgetCard>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { db, subscribe } from '../services/storage';
import { Account, Category, Goal, Transaction } from '../types';
import { Activity, BarChart3, PieChart as PieIcon, Target, Zap } from 'lucide-react';
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
  Treemap,
  ScatterChart,
  Scatter,
  FunnelChart,
  Funnel,
  LabelList
} from 'recharts';

const WidgetCard: React.FC<{ id: string; title: string; icon?: any; children: React.ReactNode }> = ({ id, title, icon: Icon, children }) => (
  <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-5 shadow-xl">
    <div className="flex items-start justify-between mb-4">
      <div>
        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Widget: {id}</p>
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

export const BetaLab: React.FC = () => {
  const [settings, setSettings] = useState(db.getSettings());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    const loadData = () => {
      setSettings(db.getSettings());
      setTransactions(db.getTransactions());
      setAccounts(db.getAccounts());
      setCategories(db.getCategories());
      setGoals(db.getGoals());
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

  const formatDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getAccountCurrency = (accountId: string) => accounts.find(a => a.id === accountId)?.currency || settings.currency;

  type RangeKey = '1M' | '3M' | '6M' | '1Y' | 'ALL';
  const [range, setRange] = useState<RangeKey>('1M');

  const rangeInfo = useMemo(() => {
    const today = new Date();
    const endKey = formatDateKey(today);
    let startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let label = range === 'ALL' ? 'All' : range;

    if (range === 'ALL') {
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
    const rangeDays = Math.max(1, Math.round((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    return { startKey, endKey, rangeDays, label };
  }, [range, transactions]);

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

  const categoryData = useMemo(() => {
    const agg: Record<string, { name: string; value: number; color: string }> = {};
    rangeTxs.forEach(t => {
      if (t.type !== 'EXPENSE') return;
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

  const radialMixData = useMemo(() => {
    const base = Math.max(1, rangeKpis.income);
    return [
      { name: 'Out-of-Pocket', value: (rangeKpis.expense / base) * 100, fill: '#f43f5e' },
      { name: 'Invested', value: (rangeKpis.investment / base) * 100, fill: '#8b5cf6' },
      { name: 'Goals', value: (rangeKpis.goalFeed / base) * 100, fill: '#f59e0b' }
    ];
  }, [rangeKpis]);
  const radarTargetData = useMemo(
    () => [
      { metric: 'Expense', value: 50 },
      { metric: 'Invest', value: 20 },
      { metric: 'Goals', value: 10 },
      { metric: 'Sponsored', value: 0 },
      { metric: 'Residual', value: 20 }
    ],
    []
  );

  const radarFusionData = useMemo(() => {
    const incomeBase = Math.max(1, rangeKpis.income);
    const residual = Math.max(0, incomeBase - rangeKpis.expense - rangeKpis.investment - rangeKpis.goalFeed);
    const items = [
      { metric: 'Expense', actual: (rangeKpis.expense / incomeBase) * 100, absolute: rangeKpis.expense },
      { metric: 'Invest', actual: (rangeKpis.investment / incomeBase) * 100, absolute: rangeKpis.investment },
      { metric: 'Goals', actual: (rangeKpis.goalFeed / incomeBase) * 100, absolute: rangeKpis.goalFeed },
      { metric: 'Sponsored', actual: (rangeKpis.sponsored / incomeBase) * 100, absolute: rangeKpis.sponsored },
      { metric: 'Residual', actual: (residual / incomeBase) * 100, absolute: residual }
    ];

    const maxAbs = Math.max(1, ...items.map(item => item.absolute));
    return items.map(item => ({
      metric: item.metric,
      actual: item.actual,
      target: radarTargetData.find(t => t.metric === item.metric)?.value || 0,
      index: (item.absolute / maxAbs) * 100
    }));
  }, [rangeKpis, radarTargetData]);

  const radialOutflowData = useMemo(() => {
    const base = Math.max(1, rangeKpis.expense + rangeKpis.investment + rangeKpis.goalFeed);
    return [
      { name: 'Out-of-Pocket', value: (rangeKpis.expense / base) * 100, fill: '#f43f5e' },
      { name: 'Invested', value: (rangeKpis.investment / base) * 100, fill: '#8b5cf6' },
      { name: 'Goals', value: (rangeKpis.goalFeed / base) * 100, fill: '#f59e0b' }
    ];
  }, [rangeKpis]);

  const radialSponsorData = useMemo(() => {
    const base = Math.max(1, rangeKpis.expense + rangeKpis.sponsored);
    return [
      { name: 'Out-of-Pocket', value: (rangeKpis.expense / base) * 100, fill: '#f43f5e' },
      { name: 'Sponsored', value: (rangeKpis.sponsored / base) * 100, fill: '#f59e0b' }
    ];
  }, [rangeKpis]);

  const treemapData = useMemo(
    () => categoryData.map(cat => ({ name: cat.name, size: cat.value, color: cat.color })),
    [categoryData]
  );

  const scatterData = useMemo(() => {
    const data: Array<{ day: number; amount: number; label: string }> = [];
    const start = new Date(rangeInfo.startKey);

    rangeTxs.forEach(t => {
      if (t.type !== 'EXPENSE') return;
      const d = new Date(t.date);
      const dayOffset = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (dayOffset < 1 || dayOffset > rangeInfo.rangeDays) return;

      const currency = getAccountCurrency(t.accountId);
      const net = Math.max(0, t.amount - (t.sponsoredAmount || 0));
      const amount = db.convertAmount(net, currency, settings.currency);
      data.push({ day: dayOffset, amount, label: t.description || 'Expense' });
    });

    return data;
  }, [rangeTxs, rangeInfo.startKey, rangeInfo.rangeDays, settings.currency, accounts]);

  const funnelData = useMemo(() => {
    const income = Math.max(0, rangeKpis.income);
    const afterExpense = Math.max(0, income - rangeKpis.expense);
    const afterInvest = Math.max(0, afterExpense - rangeKpis.investment);
    const afterGoals = Math.max(0, afterInvest - rangeKpis.goalFeed);

    return [
      { name: 'Income', value: income },
      { name: 'After Expenses', value: afterExpense },
      { name: 'After Investments', value: afterInvest },
      { name: 'After Goals', value: afterGoals }
    ];
  }, [rangeKpis]);

  const renderTreemapNode = (props: any) => {
    const { x, y, width, height, payload, name } = props || {};
    if (!payload || width === undefined || height === undefined || x === undefined || y === undefined) {
      return <g />;
    }
    if (width < 40 || height < 30) return <g />;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={payload.color || '#64748b'} fillOpacity={0.35} stroke="#0f172a" />
        <text x={x + 8} y={y + 18} fill="#e2e8f0" fontSize={10} fontWeight={700}>
          {name || payload.name || 'Category'}
        </text>
      </g>
    );
  };

  const radarMetricLabels: Record<string, string> = {
    Expense: 'Out-of-Pocket',
    Invest: 'Invested',
    Goals: 'Goal Feeds',
    Sponsored: 'Sponsored',
    Residual: 'Residual'
  };

  const radarKeyLabels: Record<string, string> = {
    actual: 'Actual Share',
    target: 'Target Share',
    index: 'Absolute Index'
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Beta Lab</h1>
          <p className="text-slate-400 text-sm">Infographics sandbox with labeled widgets for later reuse.</p>
        </div>
        <div className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
          <Zap size={12} /> Enabled
        </div>
      </div>

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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <WidgetCard id="KPI-01" title="Income (Range)" icon={Activity}>
          <div className="text-2xl font-black text-emerald-400">{formatMoney(rangeKpis.income)}</div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-2">{rangeInfo.label} window</p>
        </WidgetCard>
        <WidgetCard id="KPI-02" title="Out-of-Pocket" icon={Activity}>
          <div className="text-2xl font-black text-rose-400">{formatMoney(rangeKpis.expense)}</div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-2">{rangeInfo.label} window</p>
        </WidgetCard>
        <WidgetCard id="KPI-03" title="Invested" icon={Activity}>
          <div className="text-2xl font-black text-purple-400">{formatMoney(rangeKpis.investment)}</div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-2">{rangeInfo.label} window</p>
        </WidgetCard>
        <WidgetCard id="KPI-04" title="Goal Feeds" icon={Target}>
          <div className="text-2xl font-black text-amber-400">{formatMoney(rangeKpis.goalFeed)}</div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-2">{rangeInfo.label} window</p>
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <WidgetCard id="CHART-01" title={`Balance Radar Fusion (${rangeInfo.label})`} icon={BarChart3}>
          <div className="h-[240px]">
            {radarFusionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarFusionData}>
                  <defs>
                    <linearGradient id="radarActual" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <PolarGrid stroke="#1e293b" radialLines={false} />
                  <PolarAngleAxis
                    dataKey="metric"
                    tickFormatter={(value) => radarMetricLabels[String(value)] || String(value)}
                    tick={{ fill: '#cbd5f5', fontSize: 10, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={12}
                  />
                  <PolarRadiusAxis
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
                    formatter={(val: any, name: string) => {
                      const numeric = Number(val);
                      const label = radarKeyLabels[name] || name;
                      if (name === 'index') return [numeric.toFixed(0), label];
                      return [`${numeric.toFixed(1)}%`, label];
                    }}
                  />
                  <Radar dataKey="index" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.08} strokeWidth={1} dot={false} />
                  <Radar dataKey="target" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.08} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  <Radar dataKey="actual" stroke="#f59e0b" fill="url(#radarActual)" strokeWidth={2} dot={false} />
                  <Legend iconSize={8} formatter={(value) => radarKeyLabels[String(value)] || String(value)} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">No data yet</div>
            )}
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-3">Actual vs target share with absolute index overlay</p>
        </WidgetCard>

        <WidgetCard id="CHART-02" title="Income Allocation Ring" icon={PieIcon}>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="25%" outerRadius="90%" data={radialMixData} startAngle={90} endAngle={-270}>
                <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }} formatter={(val: any) => [`${Number(val).toFixed(1)}%`, 'Share']} />
                <Legend iconSize={8} layout="vertical" verticalAlign="middle" align="right" />
                <RadialBar dataKey="value" cornerRadius={8} background />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </WidgetCard>

        <WidgetCard id="CHART-03" title="Category Footprint Treemap" icon={PieIcon}>
          <div className="h-[220px]">
            {treemapData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <Treemap data={treemapData} dataKey="size" stroke="#0f172a" content={renderTreemapNode} />
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">No expenses</div>
            )}
          </div>
          <div className="mt-3 space-y-1">
            {categoryData.map(cat => (
              <div key={cat.name} className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }}></span>
                  {cat.name}
                </span>
                <span className="font-mono">{formatMoney(cat.value)}</span>
              </div>
            ))}
          </div>
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WidgetCard id="CHART-07" title={`Outflow Allocation Ring (${rangeInfo.label})`} icon={PieIcon}>
          <div className="h-[220px]">
            {rangeKpis.expense + rangeKpis.investment + rangeKpis.goalFeed > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart innerRadius="25%" outerRadius="90%" data={radialOutflowData} startAngle={90} endAngle={-270}>
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }} formatter={(val: any) => [`${Number(val).toFixed(1)}%`, 'Share']} />
                  <Legend iconSize={8} layout="vertical" verticalAlign="middle" align="right" />
                  <RadialBar dataKey="value" cornerRadius={8} background />
                </RadialBarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">No outflow data</div>
            )}
          </div>
        </WidgetCard>

        <WidgetCard id="CHART-08" title={`Sponsorship Ring (${rangeInfo.label})`} icon={PieIcon}>
          <div className="h-[220px]">
            {rangeKpis.expense + rangeKpis.sponsored > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart innerRadius="25%" outerRadius="90%" data={radialSponsorData} startAngle={90} endAngle={-270}>
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }} formatter={(val: any) => [`${Number(val).toFixed(1)}%`, 'Share']} />
                  <Legend iconSize={8} layout="vertical" verticalAlign="middle" align="right" />
                  <RadialBar dataKey="value" cornerRadius={8} background />
                </RadialBarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">No sponsorship data</div>
            )}
          </div>
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WidgetCard id="CHART-05" title={`Expense Outlier Scatter (${rangeInfo.label})`} icon={Activity}>
          <div className="h-[220px]">
            {scatterData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" dataKey="day" name="Day" tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[1, rangeInfo.rangeDays]} />
                  <YAxis type="number" dataKey="amount" name="Amount" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
                    formatter={(val: any) => [formatMoney(Number(val)), 'Expense']}
                    labelFormatter={(label) => `Day ${label}`}
                  />
                  <Scatter data={scatterData} fill="#38bdf8" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">No expenses in range</div>
            )}
          </div>
        </WidgetCard>

        <WidgetCard id="LIST-01" title="Goals Progress" icon={Target}>
          <div className="space-y-3">
            {goals.length === 0 && (
              <div className="text-slate-500 text-sm">No goals found</div>
            )}
            {goals.map(goal => {
              const pct = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
              return (
                <div key={goal.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-bold">{goal.name}</span>
                    <span className="text-slate-500 font-mono">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: goal.color }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WidgetCard id="CHART-04" title={`Budget Funnel (${rangeInfo.label})`} icon={Zap}>
          <div className="h-[220px]">
            {funnelData[0]?.value > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }} formatter={(val: any) => [formatMoney(Number(val)), 'Amount']} />
                  <Funnel dataKey="value" data={funnelData} isAnimationActive>
                    <LabelList dataKey="name" position="right" fill="#94a3b8" fontSize={10} />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">No income yet</div>
            )}
          </div>
        </WidgetCard>

        <WidgetCard id="KPI-05" title="Sponsored Coverage" icon={Zap}>
          <div className="text-2xl font-black text-amber-400">
            {rangeKpis.expense + rangeKpis.sponsored > 0
              ? `${Math.round((rangeKpis.sponsored / (rangeKpis.expense + rangeKpis.sponsored)) * 100)}%`
              : '0%'}
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-2">Sponsored vs total expense</p>
        </WidgetCard>
      </div>
    </div>
  );
};

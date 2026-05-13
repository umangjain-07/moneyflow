
import React, { useEffect, useState, useMemo } from 'react';
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter } from 'recharts';
import { db, subscribe } from '../services/storage';
import { Transaction, Account, Category } from '../types';
import { TrendingUp, TrendingDown, Wallet, Calendar, ArrowDownCircle, ArrowUpCircle, PiggyBank, Activity, PieChart as PieIcon, BarChart3, Filter, Flame } from 'lucide-react';

const ReportCard = ({ title, value, subtext, icon: Icon, colorClass, delay }: any) => (
  <div 
    className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800 relative overflow-hidden flex flex-col justify-between h-full group hover:border-slate-700 transition-all animate-slide-up"
    style={{animationDelay: `${delay}ms`, opacity: 0}}
  >
    <div>
        <div className="flex justify-between items-start mb-2">
            <div className={`p-3 rounded-xl bg-slate-900/50 border border-slate-800 ${colorClass.replace('text-', 'text-opacity-80 ')}`}>
                <Icon size={24} className={colorClass} />
            </div>
        </div>
        <p className="text-slate-400 text-sm font-medium">{title}</p>
        <h3 className={`text-3xl font-bold mt-1 ${colorClass}`}>{value}</h3>
    </div>
    <div className="mt-4">
        <p className="text-xs text-slate-500">{subtext}</p>
    </div>
  </div>
);

export const Reports: React.FC = () => {
    const baseSettings = db.getSettings();
    const [settings, setSettings] = useState(baseSettings);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  // Date State
    const [timeRange, setTimeRange] = useState<string>(baseSettings.reportsTimeRange || 'THIS_MONTH');
    const [customStart, setCustomStart] = useState(baseSettings.reportsCustomStart || '');
    const [customEnd, setCustomEnd] = useState(baseSettings.reportsCustomEnd || '');
    const [pickedMonth, setPickedMonth] = useState(baseSettings.reportsPickedMonth || '');

  // Interactive State for Daily Chart
    const [spendingMode, setSpendingMode] = useState<'ACTIVITY' | 'BURNDOWN' | 'SCATTER'>(baseSettings.reportsSpendingMode || 'ACTIVITY');

  const loadData = () => {
        setSettings(db.getSettings());
    setTransactions(db.getTransactions());
    setCategories(db.getCategories());
    setAccounts(db.getAccounts());
  };

  useEffect(() => {
    loadData();
    const unsubscribe = subscribe(loadData);
    
    // Init default custom dates
    const now = new Date();
    if (!customEnd) setCustomEnd(now.toISOString().split('T')[0]);
    if (!customStart) {
        const lastMonth = new Date(now);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        setCustomStart(lastMonth.toISOString().split('T')[0]);
    }
    if (!pickedMonth) setPickedMonth(new Date().toISOString().slice(0, 7)); // YYYY-MM

    return () => unsubscribe();
  }, []);

    useEffect(() => {
        db.updateSettings({
                reportsTimeRange: timeRange,
                reportsSpendingMode: spendingMode,
                reportsPickedMonth: pickedMonth,
                reportsCustomStart: customStart,
                reportsCustomEnd: customEnd
        });
    }, [timeRange, spendingMode, pickedMonth, customStart, customEnd]);

  const formatMoney = (val: number) => {
    return `${settings.currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

    const getAccountCurrency = (accountId: string) => accounts.find(a => a.id === accountId)?.currency || settings.currency;

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return transactions.filter(t => {
        const d = new Date(t.date);
        
        switch (timeRange) {
            case 'THIS_MONTH':
                return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            case 'LAST_MONTH':
                const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
            case 'LAST_3_MONTHS':
                const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                return d >= threeMonthsAgo;
            case 'LAST_6_MONTHS':
                const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
                return d >= sixMonthsAgo;
            case 'THIS_YEAR':
                return d.getFullYear() === currentYear;
            case 'ALL':
                return true;
            case 'PICK_MONTH':
                return t.date.startsWith(pickedMonth);
            case 'CUSTOM_RANGE':
                return t.date >= customStart && t.date <= customEnd;
            default:
                return true;
        }
    });
  }, [transactions, timeRange, pickedMonth, customStart, customEnd]);

  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    let investment = 0;
    let needs = 0;
    let wants = 0;

    filteredTransactions.forEach(t => {
        const acc = accounts.find(a => a.id === t.accountId);
        const currency = acc ? acc.currency : settings.currency;
        const rawAmount = t.type === 'EXPENSE'
            ? Math.max(0, t.amount - (t.sponsoredAmount || 0))
            : t.amount;
        const amount = db.convertAmount(rawAmount, currency, settings.currency);
        const cat = categories.find(c => c.id === t.categoryId);

        if (t.type === 'INCOME') {
            income += amount;
        } else if (t.type === 'EXPENSE') {
            expense += amount;
            if (cat?.necessity === 'NEED') needs += amount;
            else wants += amount;
        } else if (t.type === 'INVESTMENT') {
            investment += amount;
        }
    });

    // Savings = Income - Expense (Investments are technically savings in the broad sense)
    const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;
    
    return { income, expense, investment, needs, wants, savingsRate };
  }, [filteredTransactions, accounts, categories, settings.currency]);

  // Chart: Capital Allocation (Needs, Wants, Investments)
  // Chart: Category Breakdown (Expense + Investment)
  const categoryData = useMemo(() => {
      const agg: Record<string, { name: string, value: number, color: string, type: string, icon: string }> = {};
      
      filteredTransactions.forEach(t => {
          if (t.type !== 'EXPENSE' && t.type !== 'INVESTMENT') return;
          const cat = categories.find(c => c.id === t.categoryId);
          const name = cat?.name || 'Uncategorized';
          const id = cat?.id || 'unknown';
          const color = cat?.color || '#64748b';
          const icon = cat?.icon || '🏷️';
          
          const acc = accounts.find(a => a.id === t.accountId);
          const rawAmount = t.type === 'EXPENSE'
              ? Math.max(0, t.amount - (t.sponsoredAmount || 0))
              : t.amount;
          const amount = db.convertAmount(rawAmount, acc?.currency || settings.currency, settings.currency);

          if (!agg[id]) {
              agg[id] = { name, value: 0, color, type: t.type, icon };
          }
          agg[id].value += amount;
      });

      return Object.values(agg).sort((a, b) => b.value - a.value);
  }, [filteredTransactions, categories, accounts, settings.currency]);

  // Chart: Burn Rate Velocity (Only Expenses)
  const burnRateData = useMemo(() => {
      const data: Record<string, { needs: number, wants: number, investment: number, sortKey: number }> = {};
      
      if (filteredTransactions.length === 0) return [];

      filteredTransactions.forEach(t => {
          if(t.type !== 'EXPENSE' && t.type !== 'INVESTMENT') return;
          const d = new Date(t.date);
          
          const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
          const sortKey = d.getFullYear() * 100 + d.getMonth();

          if(!data[key]) data[key] = { needs: 0, wants: 0, investment: 0, sortKey };

          const cat = categories.find(c => c.id === t.categoryId);
          const acc = accounts.find(a => a.id === t.accountId);
          const rawAmount = t.type === 'EXPENSE'
              ? Math.max(0, t.amount - (t.sponsoredAmount || 0))
              : t.amount;
          const amt = db.convertAmount(rawAmount, acc?.currency || settings.currency, settings.currency);
          
          if(t.type === 'INVESTMENT') {
              data[key].investment += amt;
          } else if(cat?.necessity === 'NEED') {
              data[key].needs += amt;
          } else {
              data[key].wants += amt;
          }
      });

      return Object.entries(data)
        .map(([name, val]) => ({ name, ...val }))
        .sort((a, b) => a.sortKey - b.sortKey);
  }, [filteredTransactions, categories, settings.currency]);

  // Chart: Daily Spending Trend & Burndown
  const dailyData = useMemo(() => {
      const now = new Date();
      let targetYear = now.getFullYear();
      let targetMonth = now.getMonth();
      let isSingleMonth = true;
      
      if (timeRange === 'PICK_MONTH' && pickedMonth) {
          const [y, m] = pickedMonth.split('-').map(Number);
          targetYear = y;
          targetMonth = m - 1;
      } else if (timeRange === 'LAST_MONTH') {
          const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          targetYear = lm.getFullYear();
          targetMonth = lm.getMonth();
      } else if (timeRange !== 'THIS_MONTH') {
          isSingleMonth = false;
      }

      const daysInMonth = isSingleMonth ? new Date(targetYear, targetMonth + 1, 0).getDate() : 31;
      const isCurrentMonthView = isSingleMonth && targetYear === now.getFullYear() && targetMonth === now.getMonth();
      const currentDayInMonth = now.getDate();

      // Initialize days with 0/null
      const days = Array.from({length: daysInMonth}, (_, i) => {
          const dayNum = i + 1;
          const isFutureDay = isCurrentMonthView && dayNum > currentDayInMonth;
          return { 
              day: dayNum, 
              expense: isFutureDay ? null : 0, 
              income: isFutureDay ? null : 0, 
              remainingPct: isFutureDay ? null : 100 
          };
      });
      
      filteredTransactions.forEach(t => {
          const d = new Date(t.date);
          const dayNum = d.getDate();
          const dayIdx = dayNum - 1;
          
          if (dayIdx >= 0 && dayIdx < days.length) {
              const acc = accounts.find(a => a.id === t.accountId);
              const rawAmount = t.type === 'EXPENSE'
                  ? Math.max(0, t.amount - (t.sponsoredAmount || 0))
                  : t.amount;
              const val = db.convertAmount(rawAmount, acc?.currency || settings.currency, settings.currency);
              
              if (days[dayIdx].expense !== null) {
                  if (t.type === 'EXPENSE') days[dayIdx].expense! += val;
                  if (t.type === 'INCOME') days[dayIdx].income! += val;
              }
          }
      });
      
      let remaining = stats.income;
      return days.map(d => {
          if (d.expense === null) return d; 
          
          remaining -= d.expense;
          const pct = stats.income > 0 ? (remaining / stats.income) * 100 : 0;
          return { ...d, remainingPct: pct };
      });
  }, [filteredTransactions, accounts, settings.currency, stats.income, timeRange, pickedMonth]);

  const reportRangeLabel = useMemo(() => {
      switch (timeRange) {
          case 'THIS_MONTH':
              return 'This Month';
          case 'LAST_MONTH':
              return 'Last Month';
          case 'LAST_3_MONTHS':
              return 'Last 3M';
          case 'LAST_6_MONTHS':
              return 'Last 6M';
          case 'THIS_YEAR':
              return 'This Year';
          case 'ALL':
              return 'All Time';
          case 'PICK_MONTH':
              return pickedMonth || 'Picked Month';
          case 'CUSTOM_RANGE':
              if (customStart && customEnd) return `${customStart} to ${customEnd}`;
              return 'Custom Range';
          default:
              return 'Range';
      }
  }, [timeRange, pickedMonth, customStart, customEnd]);

  const pulseScatterData = useMemo(() => {
      const data: Array<{ day: number; amount: number }> = [];
      filteredTransactions.forEach(t => {
          if (t.type !== 'EXPENSE') return;
          const d = new Date(t.date);
          const day = d.getDate();
          if (day < 1 || day > 31) return;

          const currency = getAccountCurrency(t.accountId);
          const net = Math.max(0, t.amount - (t.sponsoredAmount || 0));
          const amount = db.convertAmount(net, currency, settings.currency);
          data.push({ day, amount });
      });
      return data;
  }, [filteredTransactions, settings.currency, accounts]);

  const pulseScatterPointCount = pulseScatterData.length;

  const radarTargetData = useMemo(
      () => [
          { metric: 'Spending', value: 50 },
          { metric: 'Investing', value: 20 },
          { metric: 'Goals', value: 10 },
          { metric: 'Sponsored', value: 0 },
          { metric: 'Unspent', value: 20 }
      ],
      []
  );

  const radarKpis = useMemo(() => {
      let income = 0;
      let expense = 0;
      let investment = 0;
      let goalFeed = 0;
      let sponsored = 0;

      filteredTransactions.forEach(t => {
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
  }, [filteredTransactions, settings.currency, accounts]);

  const radarFusionData = useMemo(() => {
      const incomeBase = Math.max(1, radarKpis.income);
      const unspent = Math.max(0, incomeBase - radarKpis.expense - radarKpis.investment - radarKpis.goalFeed);
      const items = [
          { metric: 'Spending', actual: (radarKpis.expense / incomeBase) * 100, absolute: radarKpis.expense },
          { metric: 'Investing', actual: (radarKpis.investment / incomeBase) * 100, absolute: radarKpis.investment },
          { metric: 'Goals', actual: (radarKpis.goalFeed / incomeBase) * 100, absolute: radarKpis.goalFeed },
          { metric: 'Sponsored', actual: (radarKpis.sponsored / incomeBase) * 100, absolute: radarKpis.sponsored },
          { metric: 'Unspent', actual: (unspent / incomeBase) * 100, absolute: unspent }
      ];

      const maxAbs = Math.max(1, ...items.map(item => item.absolute));
      return items.map(item => ({
          metric: item.metric,
          actual: item.actual,
          target: radarTargetData.find(t => t.metric === item.metric)?.value || 0,
          index: (item.absolute / maxAbs) * 100
      }));
  }, [radarKpis, radarTargetData]);

  const radarKeyLabels: Record<string, string> = {
      actual: 'Actual Share',
      target: 'Target Share',
      index: 'Relative Size'
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold text-white mb-1">Reports</h1>
            <p className="text-slate-400 text-sm">Deep dive into your financial flows</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            {timeRange === 'PICK_MONTH' && (
                <input 
                    type="month" 
                    value={pickedMonth}
                    onChange={(e) => setPickedMonth(e.target.value)}
                    className="bg-slate-900 border border-slate-800 text-slate-200 text-sm rounded-xl py-2 px-3 outline-none"
                />
            )}
            {timeRange === 'CUSTOM_RANGE' && (
                <div className="flex gap-2">
                    <input 
                        type="date" 
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-slate-200 text-sm rounded-xl py-2 px-3 outline-none w-32"
                    />
                    <input 
                        type="date" 
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-slate-200 text-sm rounded-xl py-2 px-3 outline-none w-32"
                    />
                </div>
            )}

            <div className="relative group min-w-[160px]">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                <select
                    value={timeRange}
                    onChange={(e) => setTimeRange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-sm rounded-xl py-2.5 pl-10 pr-8 outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
                >
                    <option value="THIS_MONTH">This Month</option>
                    <option value="LAST_MONTH">Last Month</option>
                    <option value="LAST_3_MONTHS">Last 3 Months</option>
                    <option value="LAST_6_MONTHS">Last 6 Months</option>
                    <option value="THIS_YEAR">This Year</option>
                    <option value="ALL">All Time</option>
                    <option disabled>──────────</option>
                    <option value="PICK_MONTH">Pick Month...</option>
                    <option value="CUSTOM_RANGE">Custom Range...</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m1 1 4 4 4-4"/></svg>
                </div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ReportCard 
            title="Total Income" 
            value={formatMoney(stats.income)} 
            subtext="Earnings" 
            icon={ArrowUpCircle} 
            colorClass="text-emerald-500"
            delay={100} 
        />
        <ReportCard 
            title="Total Expenses" 
            value={formatMoney(stats.expense)} 
            subtext="Excludes Investments" 
            icon={ArrowDownCircle} 
            colorClass="text-rose-500" 
            delay={200}
        />
        <ReportCard 
            title="Invested" 
            value={formatMoney(stats.investment)} 
            subtext={`${stats.income > 0 ? ((stats.investment/stats.income)*100).toFixed(0) : 0}% of Income`} 
            icon={TrendingUp} 
            colorClass="text-purple-500" 
            delay={300}
        />
      </div>

      <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800 animate-slide-up" style={{animationDelay: '400ms'}}>
          <div className="flex justify-between items-center mb-6">
              <h3 className="text-white font-semibold flex items-center gap-2">
                  <Calendar size={18} className="text-blue-400" /> Daily Financial Pulse
              </h3>
              <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
                   <button 
                        onClick={() => setSpendingMode('ACTIVITY')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${spendingMode === 'ACTIVITY' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                   >
                       Activity
                   </button>
                   <button 
                        onClick={() => setSpendingMode('BURNDOWN')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${spendingMode === 'BURNDOWN' ? 'bg-indigo-500/20 text-indigo-400 shadow-sm border border-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                   >
                       <Flame size={12} /> Burndown
                   </button>
                    <button 
                        onClick={() => setSpendingMode('SCATTER')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${spendingMode === 'SCATTER' ? 'bg-sky-500/20 text-sky-300 shadow-sm border border-sky-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                       Scatter
                    </button>
              </div>
          </div>

                    <div className="h-[250px] w-full">
                                {(spendingMode === 'SCATTER' ? pulseScatterPointCount > 0 : dailyData.length > 0) ? (
                                spendingMode === 'SCATTER' ? (
                                    pulseScatterPointCount > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                                <ScatterChart>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                            <XAxis type="number" dataKey="day" name="Day of Month" tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[0, 31]} ticks={[0, 5, 10, 15, 20, 25, 31]} padding={{ left: 6, right: 10 }} />
                                                        <YAxis type="number" dataKey="amount" name="Amount" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                        <Tooltip
                                                            cursor={{ strokeDasharray: '3 3' }}
                                                            contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
                                                            formatter={(val: any) => [formatMoney(Number(val)), 'Expense']}
                                                        />
                                                    <Scatter data={pulseScatterData} fill="#38bdf8" />
                                                </ScatterChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-slate-600 italic font-medium">No expenses in range</div>
                                    )
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        {spendingMode === 'ACTIVITY' ? (
                        <BarChart data={dailyData} barGap={0}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} interval={2} padding={{ left: 6, right: 10 }} />
                            <Tooltip 
                                cursor={{fill: '#1e293b', opacity: 0.4}} 
                                contentStyle={{backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff'}} 
                                labelFormatter={(label) => `Day ${label}`}
                            />
                            <Bar dataKey="income" name="Income" fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={10} minPointSize={2} />
                            <Bar dataKey="expense" name="Expense" fill="#f43f5e" radius={[2, 2, 0, 0]} maxBarSize={10} minPointSize={2} />
                        </BarChart>
                    ) : (
                        <BarChart data={dailyData} barGap={0}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} interval={2} padding={{ left: 6, right: 10 }} />
                             <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fill: '#64748b', fontSize: 10}} 
                                unit="%" 
                                domain={[dataMin => Math.min(0, dataMin), dataMax => Math.max(100, dataMax)]} 
                             />
                            <Tooltip 
                                cursor={{fill: '#1e293b', opacity: 0.4}} 
                                contentStyle={{backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff'}} 
                                labelFormatter={(label) => `Day ${label}`}
                                formatter={(val: any) => [typeof val === 'number' ? val.toFixed(1) + '%' : 'Future', 'Remaining']}
                            />
                            <Bar dataKey="remainingPct" name="Remaining Budget" fill="#6366f1" radius={[2, 2, 0, 0]} maxBarSize={12} minPointSize={2} />
                        </BarChart>
                    )}
                  </ResponsiveContainer>
                )
              ) : (
                <div className="h-full flex items-center justify-center text-slate-600 italic font-medium">Gathering transactional history...</div>
              )}
          </div>
      </div>

      <div className="bg-[#0f172a] p-4 rounded-2xl border border-slate-800 animate-slide-up" style={{animationDelay: '450ms'}}>
          <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                  <BarChart3 size={16} className="text-cyan-400" /> Income Allocation
              </h3>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-900 px-2 py-1 rounded-full border border-slate-800 shadow-inner">
                  {reportRangeLabel}
              </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                  <div className="flex justify-between text-slate-400 mb-1"><span>Spending</span><span>{radarKpis.income > 0 ? ((radarKpis.expense / radarKpis.income) * 100).toFixed(0) : 0}%</span></div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-rose-500" style={{ width: `${Math.min(100, radarKpis.income > 0 ? (radarKpis.expense / radarKpis.income) * 100 : 0)}%` }}></div></div>
              </div>
              <div>
                  <div className="flex justify-between text-slate-400 mb-1"><span>Investing</span><span>{radarKpis.income > 0 ? ((radarKpis.investment / radarKpis.income) * 100).toFixed(0) : 0}%</span></div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-purple-500" style={{ width: `${Math.min(100, radarKpis.income > 0 ? (radarKpis.investment / radarKpis.income) * 100 : 0)}%` }}></div></div>
              </div>
              <div>
                  <div className="flex justify-between text-slate-400 mb-1"><span>Goals</span><span>{radarKpis.income > 0 ? ((radarKpis.goalFeed / radarKpis.income) * 100).toFixed(0) : 0}%</span></div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${Math.min(100, radarKpis.income > 0 ? (radarKpis.goalFeed / radarKpis.income) * 100 : 0)}%` }}></div></div>
              </div>
              <div>
                  <div className="flex justify-between text-slate-400 mb-1"><span>Unspent</span><span>{radarKpis.income > 0 ? (Math.max(0, ((radarKpis.income - radarKpis.expense - radarKpis.investment - radarKpis.goalFeed) / radarKpis.income) * 100)).toFixed(0) : 0}%</span></div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, radarKpis.income > 0 ? Math.max(0, ((radarKpis.income - radarKpis.expense - radarKpis.investment - radarKpis.goalFeed) / radarKpis.income) * 100) : 0)}%` }}></div></div>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-up" style={{animationDelay: '600ms'}}>
          
          <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800">
               <h3 className="text-white font-semibold mb-6 flex items-center gap-2">
                  <PieIcon size={18} className="text-purple-400" /> Outflow Distribution
               </h3>
               <div className="flex flex-col md:flex-row items-center gap-6">
                   <div className="h-[250px] w-full md:w-1/2">
                       {categoryData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={categoryData}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={2}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {categoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff'}} itemStyle={{color: '#fff'}} />
                                </PieChart>
                            </ResponsiveContainer>
                       ) : (
                           <div className="h-full flex items-center justify-center text-slate-600">No outflow data</div>
                       )}
                   </div>
                   <div className="w-full md:w-1/2 max-h-[250px] overflow-y-auto pr-2 scrollbar-thin text-xs">
                       {categoryData.map(cat => (
                           <div key={cat.name} className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0">
                               <div className="flex items-center gap-2">
                                   <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs bg-slate-900 border border-slate-800" style={{color: cat.color}}>
                                       {cat.icon}
                                   </div>
                                   <div className="flex flex-col">
                                       <span className="text-sm text-slate-300 font-medium truncate max-w-[120px]">{cat.name}</span>
                                       {cat.type === 'INVESTMENT' && <span className="text-[9px] text-purple-400 uppercase tracking-wider">Invest</span>}
                                   </div>
                               </div>
                               <span className="text-sm font-mono text-slate-400">{formatMoney(cat.value)}</span>
                           </div>
                       ))}
                   </div>
               </div>
          </div>

          <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800">
              <h3 className="text-white font-semibold mb-6 flex items-center gap-2">
                  <BarChart3 size={18} className="text-blue-400" /> Top Allocation
              </h3>
               <div className="h-[300px] w-full">
                   {categoryData.length > 0 ? (
                       <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={categoryData.slice(0, 8)} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#1e293b" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} tick={{fill: '#94a3b8', fontSize: 11}} />
                                <Tooltip cursor={{fill: '#1e293b', opacity: 0.4}} contentStyle={{backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff'}} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                                    {categoryData.slice(0, 8).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                       </ResponsiveContainer>
                   ) : (
                       <div className="h-full flex items-center justify-center text-slate-600">No outflow data</div>
                   )}
               </div>
          </div>
      </div>
    </div>
  );
};
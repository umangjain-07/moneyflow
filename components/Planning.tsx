
import React, { useState, useEffect, useMemo } from 'react';
import { db, subscribe } from '../services/storage';
import { Transaction, Category, Account, FinancialPlan, CategoryBudgetConfig } from '../types';
import { Calendar, Target, Edit2, Save, Trash2, Plus, ArrowRight, CheckCircle2, AlertTriangle, Shield, Wallet, DollarSign, X, Lock, ShoppingBag, PieChart, Sliders, TrendingUp, ChevronDown, Calculator, Briefcase, Zap, Sparkles, Repeat, Clock, Receipt, CreditCard, ChevronLeft, ChevronRight, History } from 'lucide-react';

export const Planning: React.FC = () => {
  const [settings, setSettings] = useState(db.getSettings());
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  // Plan State
  const [plan, setPlan] = useState<FinancialPlan | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // View State
  const [viewMode, setViewMode] = useState<'CURRENT' | 'HISTORY'>('CURRENT');
  const [historyType, setHistoryType] = useState<'MONTH' | 'YEAR' | 'ALL'>('MONTH');
  const [historyDate, setHistoryDate] = useState(new Date());

  // Form State
  const [salary, setSalary] = useState('');
  const [savingsGoal, setSavingsGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Salaried Specifics
  const [isSalaried, setIsSalaried] = useState(false);
  const [salaryCat, setSalaryCat] = useState('');
  const [pfCat, setPfCat] = useState('');

  // The Configuration Table
  const [catConfigs, setCatConfigs] = useState<CategoryBudgetConfig[]>([]);
  
  // Historical Data for Guidance
  const [historyStats, setHistoryStats] = useState<Record<string, number>>({});
  const [incomeStats, setIncomeStats] = useState<Record<string, number>>({});

  const DAYS_IN_MONTH = 30; 
  const MONTHS_IN_YEAR = 12;

  const loadData = () => {
    const currentSettings = db.getSettings();
    setSettings(currentSettings);
    const cats = db.getCategories();
    setCategories(cats);
    const txs = db.getTransactions();
    setTransactions(txs);
    setAccounts(db.getAccounts());
    
    // --- SMART AVERAGING LOGIC ---
    const catMonthMap: Record<string, Record<string, number>> = {};
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    
    const freshAccounts = db.getAccounts();

    txs.forEach(t => {
        const d = new Date(t.date);
        if (d >= oneYearAgo) {
             const monthKey = t.date.substring(0, 7); // YYYY-MM
             const acc = freshAccounts.find(a => a.id === t.accountId);
             const val = db.convertAmount(t.amount, acc?.currency || currentSettings.currency, currentSettings.currency);
             
             if (!catMonthMap[t.categoryId]) catMonthMap[t.categoryId] = {};
             catMonthMap[t.categoryId][monthKey] = (catMonthMap[t.categoryId][monthKey] || 0) + val;
        }
    });

    const stats: Record<string, number> = {};
    const incStats: Record<string, number> = {};

    Object.keys(catMonthMap).forEach(catId => {
        const months = Object.values(catMonthMap[catId]);
        const total = months.reduce((sum, val) => sum + val, 0);
        const activeMonthCount = months.length;
        const avg = activeMonthCount > 0 ? Math.round(total / activeMonthCount) : 0;
        const cat = cats.find(c => c.id === catId);
        
        if (cat?.type === 'INCOME') incStats[catId] = avg;
        else stats[catId] = avg;
    });
    setHistoryStats(stats);
    setIncomeStats(incStats);

    const existingPlan = db.getPlan();
    
    // Filter out INCOME categories from the budget list
    const validCats = cats.filter(c => c.type !== 'INCOME');

    if (existingPlan) {
        let workingPlan = { ...existingPlan };
        if (workingPlan.currency && workingPlan.currency !== currentSettings.currency) {
            workingPlan.salary = db.convertAmount(workingPlan.salary, workingPlan.currency, currentSettings.currency);
            workingPlan.savingsGoal = db.convertAmount(workingPlan.savingsGoal, workingPlan.currency, currentSettings.currency);
            workingPlan.categoryConfigs = workingPlan.categoryConfigs.map(c => ({
                ...c,
                allocatedAmount: db.convertAmount(c.allocatedAmount, workingPlan.currency!, currentSettings.currency)
            }));
            workingPlan.currency = currentSettings.currency; 
        }

        setPlan(workingPlan);
        setSalary(workingPlan.salary.toFixed(0));
        setSavingsGoal(workingPlan.savingsGoal.toFixed(0));
        setStartDate(workingPlan.startDate);
        setEndDate(workingPlan.endDate);
        setIsSalaried(!!workingPlan.isSalaried);
        setSalaryCat(workingPlan.salaryCategoryId || '');
        setPfCat(workingPlan.pfCategoryId || '');
        
        const mergedConfigs = validCats.map(c => {
            const existing = workingPlan.categoryConfigs ? workingPlan.categoryConfigs.find(conf => conf.categoryId === c.id) : null;
            if (existing) {
                if (!existing.period) existing.period = c.defaultFrequency || 'MONTHLY_NET'; 
                return existing;
            }
            return {
                categoryId: c.id,
                type: c.type === 'INVESTMENT' ? 'FIXED' : (c.necessity === 'NEED' ? 'FIXED' : 'VARIABLE'),
                allocatedAmount: stats[c.id] || 0,
                period: c.defaultFrequency || 'MONTHLY_NET'
            } as CategoryBudgetConfig;
        });
        setCatConfigs(mergedConfigs);
    } else {
        setIsEditing(true);
        const start = now.toISOString().split('T')[0];
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        setStartDate(start);
        setEndDate(end);
        
        const initialConfigs = validCats.map(c => ({
            categoryId: c.id,
            type: (c.type === 'INVESTMENT' ? 'FIXED' : (c.necessity === 'NEED' ? 'FIXED' : 'VARIABLE')) as 'FIXED'|'VARIABLE'|'IGNORE',
            allocatedAmount: stats[c.id] || 0,
            period: c.defaultFrequency || 'MONTHLY_NET'
        }));
        setCatConfigs(initialConfigs as CategoryBudgetConfig[]);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = subscribe(loadData);
    return () => unsubscribe();
  }, []);

  // --- ACTIONS ---

  const computeComputedIncome = () => {
      if (!isSalaried) return;
      if (!salaryCat) { alert("Please select a Salary Category first."); return; }
      const salaryAvg = incomeStats[salaryCat] || 0;
      setSalary(salaryAvg.toString());
  };

  const handleConfigChange = (catId: string, field: keyof CategoryBudgetConfig, value: any) => {
      setCatConfigs(prev => prev.map(c => {
          if (c.categoryId !== catId) return c;
          if (field === 'type' && value === 'VARIABLE') {
              const hist = historyStats[c.categoryId] || 0;
              return { ...c, [field]: value, allocatedAmount: c.allocatedAmount || hist };
          }
          return { ...c, [field]: value };
      }));
  };

  const handleAmountInput = (catId: string, inputValue: string, period: string) => {
      const val = parseFloat(inputValue) || 0;
      setCatConfigs(prev => prev.map(c => {
          if (c.categoryId !== catId) return c;
          let monthlyEquivalent = val;
          if (period === 'DAILY') monthlyEquivalent = val * DAYS_IN_MONTH;
          else if (period === 'YEARLY') monthlyEquivalent = val / MONTHS_IN_YEAR;
          return { ...c, allocatedAmount: monthlyEquivalent };
      }));
  };

  const handlePeriodToggle = (catId: string, newPeriod: 'DAILY' | 'MONTHLY_ONCE' | 'MONTHLY_NET' | 'YEARLY') => {
      setCatConfigs(prev => prev.map(c => {
          if (c.categoryId !== catId) return c;
          return { ...c, period: newPeriod };
      }));
  };

  const handleSavePlan = () => {
      const salaryNum = parseFloat(salary) || 0;
      const savingsNum = parseFloat(savingsGoal) || 0;
      if (salaryNum <= 0) return alert("Salary/Income is required");

      const newPlan: FinancialPlan = {
          currency: settings.currency, 
          salary: salaryNum,
          isSalaried,
          salaryCategoryId: salaryCat,
          pfCategoryId: pfCat,
          savingsGoal: savingsNum,
          startDate,
          endDate,
          categoryConfigs: catConfigs
      };

      db.savePlan(newPlan);
      setPlan(newPlan);
      setIsEditing(false);
  };

  const navigateHistory = (dir: -1 | 1) => {
      const newDate = new Date(historyDate);
      if (historyType === 'MONTH') newDate.setMonth(newDate.getMonth() + dir);
      else if (historyType === 'YEAR') newDate.setFullYear(newDate.getFullYear() + dir);
      setHistoryDate(newDate);
  };

  const formatMoney = (val: number) => `${settings.currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const formatMoneyPrecise = (val: number) => `${settings.currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // --- STATS & COMPUTATIONS ---
  
  const previewStats = useMemo(() => {
      const inc = parseFloat(salary) || 0;
      const sav = parseFloat(savingsGoal) || 0;
      const totalFixed = catConfigs.filter(c => c.type === 'FIXED').reduce((sum, c) => sum + c.allocatedAmount, 0);
      const totalVariable = catConfigs.filter(c => c.type === 'VARIABLE').reduce((sum, c) => sum + c.allocatedAmount, 0);
      return { totalFixed, totalVariable, buffer: inc - sav - totalFixed - totalVariable };
  }, [salary, savingsGoal, catConfigs]);

  const dashboardStats = useMemo(() => {
      if (!plan || viewMode !== 'CURRENT') return null;
      const now = new Date();
      const end = new Date(plan.endDate);
      const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const currentYear = now.getFullYear();
      
      const spentMap: Record<string, number> = {};
      const yearlySpentMap: Record<string, number> = {}; 
      
      let totalVariableSpent = 0;
      let totalFixedSpent = 0;
      const currentAccounts = db.getAccounts();

      transactions.forEach(t => {
          const tDate = new Date(t.date);
          const acc = currentAccounts.find(a => a.id === t.accountId);
          const val = db.convertAmount(t.amount, acc?.currency || settings.currency, settings.currency);
          const isExpenseOrInvest = t.type === 'EXPENSE' || t.type === 'INVESTMENT';

          if (t.date >= plan.startDate && t.date <= plan.endDate && isExpenseOrInvest) {
              spentMap[t.categoryId] = (spentMap[t.categoryId] || 0) + val;
              const conf = plan.categoryConfigs.find(c => c.categoryId === t.categoryId);
              if (conf?.type === 'VARIABLE') totalVariableSpent += val;
              if (conf?.type === 'FIXED' && conf.period !== 'YEARLY') totalFixedSpent += val; 
          }

          if (tDate.getFullYear() === currentYear && isExpenseOrInvest) {
              yearlySpentMap[t.categoryId] = (yearlySpentMap[t.categoryId] || 0) + val;
          }
      });

      const totalVariableAllocated = plan.categoryConfigs.filter(c => c.type === 'VARIABLE').reduce((s, c) => s + c.allocatedAmount, 0);
      const totalVariableRemaining = totalVariableAllocated - totalVariableSpent;
      const overallDailyLimit = Math.max(0, totalVariableRemaining / daysLeft);

      const categoriesDetails = plan.categoryConfigs.filter(c => c.type !== 'IGNORE').map(conf => {
          const cat = categories.find(c => c.id === conf.categoryId);
          const isYearly = conf.period === 'YEARLY';
          
          const allocated = conf.allocatedAmount; 
          
          let displayAllocated = allocated;
          let relevantSpent = spentMap[conf.categoryId] || 0;
          let remaining = allocated - relevantSpent;
          
          if (isYearly) {
              displayAllocated = allocated * 12;
              relevantSpent = yearlySpentMap[conf.categoryId] || 0; 
              remaining = Math.max(0, displayAllocated - relevantSpent);
          }

          const dailyLimit = conf.type === 'VARIABLE' ? Math.max(0, remaining / daysLeft) : 0;
          
          return {
              id: conf.categoryId,
              name: cat?.name || 'Unknown',
              icon: cat?.icon || '📦',
              color: cat?.color || '#64748b',
              type: conf.type,
              period: conf.period || 'MONTHLY_NET',
              allocated: displayAllocated,
              spent: relevantSpent,
              remaining,
              dailyLimit,
              isPaidYearly: isYearly && relevantSpent >= (displayAllocated * 0.9)
          };
      }).sort((a,b) => {
          if (a.type !== b.type) return a.type === 'VARIABLE' ? -1 : 1;
          return b.allocated - a.allocated;
      });

      return {
          daysLeft,
          totalVariableRemaining,
          overallDailyLimit,
          categoriesDetails,
          savingsGoal: plan.savingsGoal,
          totalVariableAllocated
      };
  }, [plan, transactions, accounts, categories, settings, viewMode]);

  const historicalStats = useMemo(() => {
    if (!plan || viewMode !== 'HISTORY') return null;

    let start: Date, end: Date, multiplier: number;
    const now = new Date();

    if (historyType === 'MONTH') {
        start = new Date(historyDate.getFullYear(), historyDate.getMonth(), 1);
        end = new Date(historyDate.getFullYear(), historyDate.getMonth() + 1, 0);
        multiplier = 1;
    } else if (historyType === 'YEAR') {
        start = new Date(historyDate.getFullYear(), 0, 1);
        if (historyDate.getFullYear() === now.getFullYear()) {
            // If current year, assume YTD view
            end = now;
            const monthsPassed = now.getMonth() + 1; // e.g. Feb = 2
            multiplier = monthsPassed;
        } else {
            end = new Date(historyDate.getFullYear(), 12, 0);
            multiplier = 12;
        }
    } else {
        // ALL TIME
        const dates = transactions.map(t => new Date(t.date).getTime());
        const minDate = dates.length ? new Date(Math.min(...dates)) : new Date();
        start = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        end = new Date(); 
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
        multiplier = Math.max(1, months);
    }
    
    // String Comparison for Date Range (Inclusive)
    const sStr = start.toISOString().split('T')[0];
    const eStr = end.toISOString().split('T')[0];

    const spentMap: Record<string, number> = {};
    let totalSpent = 0;
    
    transactions.forEach(t => {
         if (t.date >= sStr && t.date <= eStr) {
             const acc = accounts.find(a => a.id === t.accountId);
             const val = db.convertAmount(t.amount, acc?.currency || settings.currency, settings.currency);
             if (t.type === 'EXPENSE' || t.type === 'INVESTMENT') {
                 spentMap[t.categoryId] = (spentMap[t.categoryId] || 0) + val;
                 totalSpent += val;
             }
         }
    });

    const categoriesData = plan.categoryConfigs.filter(c => c.type !== 'IGNORE').map(conf => {
        const cat = categories.find(c => c.id === conf.categoryId);
        const baseAlloc = conf.allocatedAmount; 
        const targetAlloc = baseAlloc * multiplier;
        const spent = spentMap[conf.categoryId] || 0;
        
        return {
            ...conf,
            name: cat?.name,
            icon: cat?.icon,
            target: targetAlloc,
            spent: spent,
            pct: targetAlloc > 0 ? Math.min(100, (spent / targetAlloc) * 100) : (spent > 0 ? 100 : 0),
            status: spent > targetAlloc ? 'OVER' : 'UNDER'
        };
    }).sort((a,b) => b.spent - a.spent);

    const totalBudget = categoriesData.reduce((sum, c) => sum + c.target, 0);
    const totalVariance = totalBudget - totalSpent;
    
    return {
        start, end,
        totalSpent,
        totalBudget,
        totalVariance,
        categoriesData
    };
  }, [viewMode, historyType, historyDate, transactions, plan, accounts, categories, settings]);

  // --- RENDER ---

  if (isEditing || !plan) {
      // ... (Edit UI - same as before)
      const buffer = previewStats.buffer;
      const isNegative = buffer < 0;
      const groupedConfigs = {
          FIXED: catConfigs.filter(c => categories.find(cat => cat.id === c.categoryId)?.type === 'EXPENSE'),
          INVEST: catConfigs.filter(c => categories.find(cat => cat.id === c.categoryId)?.type === 'INVESTMENT')
      };

      const renderConfigRow = (conf: CategoryBudgetConfig, index: number) => {
          const cat = categories.find(c => c.id === conf.categoryId);
          const histAvg = historyStats[conf.categoryId] || 0;
          
          let displayValue = conf.allocatedAmount;
          if (conf.period === 'DAILY') displayValue = conf.allocatedAmount / DAYS_IN_MONTH;
          else if (conf.period === 'YEARLY') displayValue = conf.allocatedAmount * MONTHS_IN_YEAR;
          
          const togglePeriod = () => {
             const next = conf.period === 'DAILY' ? 'MONTHLY_NET' :
                          conf.period === 'MONTHLY_NET' ? 'MONTHLY_ONCE' :
                          conf.period === 'MONTHLY_ONCE' ? 'YEARLY' : 'DAILY';
             handlePeriodToggle(conf.categoryId, next);
          };

          const getPeriodLabel = (p: string) => {
              if (p === 'YEARLY') return '/ Yr';
              if (p === 'DAILY') return '/ Day';
              if (p === 'MONTHLY_ONCE') return '/ Mo Once';
              return '/ Mo Net';
          };

          return (
              <div 
                key={conf.categoryId} 
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-slate-950/50 border border-slate-800 rounded-xl hover:border-slate-700 transition-all duration-500 gap-3 animate-slide-up"
                style={{animationDelay: `${index * 50}ms`, opacity: 0}}
              >
                  <div className="flex items-center gap-3 w-full sm:w-1/3">
                      <span className="text-lg shadow-sm">{cat?.icon}</span>
                      <div className="min-w-0">
                          <p className="font-bold text-slate-200 text-sm truncate">{cat?.name}</p>
                          <div className="flex items-center gap-1.5">
                              <p className="text-[10px] text-slate-500">Avg: {formatMoney(histAvg)}</p>
                              {histAvg > 0 && <span className="text-[9px] text-slate-600 bg-slate-900 px-1 rounded border border-slate-800">Active</span>}
                          </div>
                      </div>
                  </div>
                  <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
                      {(['FIXED', 'VARIABLE', 'IGNORE'] as const).map(t => (
                          <button 
                            key={t}
                            onClick={() => handleConfigChange(conf.categoryId, 'type', t)}
                            className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all duration-300 ${conf.type === t ? (t==='FIXED'?'bg-rose-500 text-white shadow-lg shadow-rose-900/20':t==='VARIABLE'?'bg-blue-500 text-white shadow-lg shadow-blue-900/20':'bg-slate-700 text-slate-300') : 'text-slate-600 hover:text-slate-400'}`}
                          >
                              {t.slice(0,3)}
                          </button>
                      ))}
                  </div>
                  <div className="flex gap-2 items-center w-full sm:w-auto justify-end">
                      {conf.type !== 'IGNORE' ? (
                          <div className={`flex items-center bg-slate-900 border rounded-lg p-0.5 transition-colors ${conf.type === 'VARIABLE' ? 'border-blue-500/30' : 'border-slate-800'}`}>
                            <input 
                                type="number" 
                                value={displayValue ? parseFloat(displayValue.toFixed(2)) : ''}
                                onChange={(e) => handleAmountInput(conf.categoryId, e.target.value, conf.period)}
                                className="w-20 bg-transparent p-1.5 text-right text-xs text-white outline-none placeholder:text-slate-700"
                                placeholder="0"
                            />
                            <button 
                                onClick={togglePeriod} 
                                className={`w-14 py-1.5 text-[9px] font-bold uppercase tracking-wider border-l border-slate-800 rounded-r-md transition-colors ${conf.period === 'YEARLY' ? 'bg-amber-500/20 text-amber-500' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                                title="Toggle Frequency"
                            >
                                {getPeriodLabel(conf.period)}
                            </button>
                          </div>
                      ) : <span className="text-xs text-slate-600 w-32 text-center">-</span>}
                  </div>
              </div>
          );
      };

      return (
          <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
              <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Sparkles className="text-emerald-500" size={24}/> Planner Setup</h1>
                  {plan && <button onClick={() => setIsEditing(false)} className="text-slate-500 hover:text-white transition-colors bg-slate-800/50 px-4 py-2 rounded-xl">Cancel</button>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* ... Same Edit Form Layout ... */}
                  <div className="lg:col-span-1 space-y-6">
                      <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800 space-y-4 shadow-2xl">
                          <h3 className="font-bold text-white flex items-center gap-2"><Wallet size={16} className="text-emerald-400"/> Income & Goals</h3>
                          <div 
                            onClick={() => setIsSalaried(!isSalaried)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all duration-300 flex items-center gap-3 ${isSalaried ? 'bg-blue-500/10 border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'}`}
                          >
                             <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${isSalaried ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-600'}`}>{isSalaried && <CheckCircle2 size={12} />}</div>
                             <div><p className="text-xs font-bold text-white">Salaried Employee</p><p className="text-[10px] text-slate-500">Enable advanced mapping</p></div>
                          </div>
                          {isSalaried && (
                            <div className="space-y-3 bg-slate-900/50 p-3 rounded-xl border border-slate-800/50 animate-in slide-in-from-top-2 fade-in">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 pl-1">Salary Category</label>
                                    <div className="relative">
                                        <select value={salaryCat} onChange={(e) => setSalaryCat(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white outline-none focus:border-blue-500/30 appearance-none transition-colors">
                                            <option value="">-- Select --</option>
                                            {categories.filter(c => c.type === 'INCOME').map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                                        </select>
                                        <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"/>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 pl-1">Provident Fund (PF)</label>
                                    <div className="relative">
                                        <select value={pfCat} onChange={(e) => setPfCat(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white outline-none focus:border-blue-500/30 appearance-none transition-colors">
                                            <option value="">-- Optional --</option>
                                            {categories.filter(c => c.type === 'INVESTMENT').map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                                        </select>
                                        <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"/>
                                    </div>
                                </div>
                            </div>
                          )}
                          <div>
                              <div className="flex justify-between items-center mb-1.5">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Monthly Income</label>
                                {isSalaried && salaryCat && <button onClick={computeComputedIncome} className="text-[9px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-500/10 px-1.5 py-0.5 rounded transition-colors"><Zap size={8} /> Auto-Calc</button>}
                              </div>
                              <div className="relative group">
                                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold group-focus-within:text-emerald-500 transition-colors">{settings.currencySymbol}</span>
                                   <input type="number" value={salary} onChange={e => setSalary(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 pl-8 text-white font-mono outline-none focus:border-emerald-500/50 transition-all" />
                              </div>
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Savings Goal</label>
                              <div className="relative group">
                                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold group-focus-within:text-emerald-500 transition-colors">{settings.currencySymbol}</span>
                                   <input type="number" value={savingsGoal} onChange={e => setSavingsGoal(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 pl-8 text-emerald-400 font-bold font-mono outline-none focus:border-emerald-500/50 transition-all" />
                              </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white focus:border-emerald-500/50 outline-none transition-colors" /></div>
                              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">End</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white focus:border-emerald-500/50 outline-none transition-colors" /></div>
                          </div>
                      </div>
                      <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800 space-y-4 shadow-xl transition-all hover:border-slate-700">
                          <h3 className="font-bold text-white flex items-center gap-2"><Calculator size={16} className="text-blue-400"/> Balance Check</h3>
                          <div className="space-y-2 text-sm">
                              <div className="flex justify-between text-slate-400"><span>Income</span> <span className="text-white">{formatMoney(parseFloat(salary)||0)}</span></div>
                              <div className="flex justify-between text-slate-400"><span>- Savings</span> <span className="text-emerald-500">{formatMoney(parseFloat(savingsGoal)||0)}</span></div>
                              <div className="flex justify-between text-slate-400"><span>- Fixed Costs</span> <span className="text-rose-500">{formatMoney(previewStats.totalFixed)}</span></div>
                              <div className="flex justify-between text-slate-400"><span>- Variable Budget</span> <span className="text-blue-400">{formatMoney(previewStats.totalVariable)}</span></div>
                              <div className="border-t border-slate-800 pt-2 flex justify-between font-bold">
                                  <span className="text-slate-200">Unallocated Buffer</span>
                                  <span className={isNegative ? 'text-rose-500' : 'text-emerald-400'}>{formatMoney(buffer)}</span>
                              </div>
                          </div>
                          {isNegative && <div className="text-xs text-rose-500 bg-rose-500/10 p-2 rounded border border-rose-500/20 animate-pulse">Over Budget! Expenses exceed income.</div>}
                          <button onClick={handleSavePlan} disabled={isNegative} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95">Generate Plan</button>
                      </div>
                  </div>
                  <div className="lg:col-span-2 bg-[#0f172a] rounded-2xl border border-slate-800 flex flex-col h-[700px] shadow-2xl">
                      <div className="p-4 border-b border-slate-800 bg-slate-900/50 rounded-t-2xl flex justify-between items-center">
                          <h3 className="font-bold text-white text-sm">Allocations</h3>
                          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Frequency & Amount</span>
                      </div>
                      <div className="overflow-y-auto flex-1 p-2 custom-scrollbar space-y-6">
                          <div>
                              <h4 className="px-2 mb-2 text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-2"><ShoppingBag size={12}/> Expenses (Fixed & Variable)</h4>
                              <div className="space-y-1">{groupedConfigs.FIXED.map((c, i) => renderConfigRow(c, i))}</div>
                          </div>
                          {groupedConfigs.INVEST.length > 0 && (
                              <div>
                                <h4 className="px-2 mb-2 text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2"><TrendingUp size={12}/> Specific Investments</h4>
                                <div className="space-y-1">{groupedConfigs.INVEST.map((c, i) => renderConfigRow(c, i + groupedConfigs.FIXED.length))}</div>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  // --- DASHBOARD RENDER ---

  return (
      <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
          
          {/* Top Controls */}
          <div className="flex justify-center items-center gap-2 mb-4 bg-slate-900/50 p-1.5 rounded-2xl w-fit mx-auto border border-slate-800 shadow-xl">
             <button 
                onClick={() => setViewMode('CURRENT')}
                className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'CURRENT' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
             >
                Active Plan
             </button>
             <button 
                onClick={() => setViewMode('HISTORY')}
                className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'HISTORY' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
             >
                <History size={14} /> History & Analysis
             </button>
          </div>

          {viewMode === 'CURRENT' && dashboardStats && (
            <>
              {/* Top Card */}
              <div className="bg-gradient-to-br from-indigo-900/20 to-[#0f172a] p-8 rounded-[2rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8 group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-indigo-500/20 transition-all duration-1000"></div>
                  <div className="relative z-10 text-center md:text-left">
                      <p className="text-indigo-300 text-xs font-black uppercase tracking-widest mb-2">Safe Daily Spending</p>
                      <h1 className="text-6xl font-black text-white tracking-tighter drop-shadow-xl">{formatMoneyPrecise(dashboardStats.overallDailyLimit)}</h1>
                      <p className="text-slate-400 text-sm mt-2 font-medium"><span className="text-white font-bold">{dashboardStats.daysLeft} days</span> remaining</p>
                  </div>
                  <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5 backdrop-blur-sm w-full md:w-64 space-y-4 shadow-inner">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-bold uppercase">Variable Pool</span>
                            <span className="text-white font-mono">{formatMoney(dashboardStats.totalVariableRemaining)}</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-1000 ease-out" style={{width: `${Math.min(100, (dashboardStats.totalVariableRemaining / dashboardStats.totalVariableAllocated)*100)}%`}}></div>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-white/5">
                            <span className="text-slate-500 text-[10px] uppercase font-bold">Savings Secured</span>
                            <span className="text-emerald-400 font-bold text-sm">{formatMoney(dashboardStats.savingsGoal)}</span>
                        </div>
                  </div>
                  <button onClick={() => setIsEditing(true)} className="absolute top-4 right-4 p-2 text-slate-600 hover:text-white transition-colors bg-slate-950/50 rounded-full"><Edit2 size={16}/></button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* LEFT COLUMN: VARIABLE CONTINUOUS (Daily / Net) */}
                  <div className="space-y-6">
                    <div className="space-y-4">
                        <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest px-2 flex items-center gap-2"><ShoppingBag size={14} className="text-blue-500"/> Variable Budgets</h3>
                        {dashboardStats.categoriesDetails
                            .filter(c => c.type === 'VARIABLE' && c.period !== 'MONTHLY_ONCE')
                            .map((cat, idx) => {
                            const pctLeft = Math.max(0, Math.min(100, (cat.remaining / cat.allocated) * 100));

                            return (
                                <div 
                                    key={cat.id} 
                                    className="bg-[#0f172a] p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all duration-300 hover:translate-x-1 animate-slide-up"
                                    style={{animationDelay: `${idx * 100}ms`, opacity: 0}}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-xl border border-slate-800 shadow-sm">{cat.icon}</div>
                                            <div><h4 className="font-bold text-white text-sm">{cat.name}</h4><p className="text-[10px] text-slate-500">{formatMoney(cat.remaining)} left</p></div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-base font-bold text-white font-mono">{formatMoneyPrecise(cat.dailyLimit)}</p>
                                            <p className="text-[9px] text-slate-500 font-bold uppercase">/ Day</p>
                                        </div>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-1000 ease-out ${pctLeft < 20 ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: `${pctLeft}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                  </div>

                  {/* RIGHT COLUMN: FIXED COSTS & SINGLE PAYMENTS */}
                  <div className="space-y-6">
                      
                      {/* FIXED COSTS */}
                      <div className="space-y-4">
                          <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest px-2 flex items-center gap-2"><Lock size={14} className="text-rose-500"/> Fixed Costs</h3>
                          {dashboardStats.categoriesDetails.filter(c => c.type === 'FIXED').map((cat, idx) => {
                              if (cat.period === 'YEARLY') {
                                  return (
                                      <div 
                                        key={cat.id} 
                                        className="bg-[#0f172a] p-4 rounded-2xl border border-slate-800 flex justify-between items-center opacity-90 animate-slide-up relative overflow-hidden"
                                        style={{animationDelay: `${(idx + 5) * 100}ms`, opacity: 0}}
                                      >
                                          {cat.isPaidYearly && <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none"></div>}
                                          <div className="flex items-center gap-3 relative z-10">
                                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border ${cat.isPaidYearly ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50' : 'bg-slate-900 text-slate-500 border-slate-800'}`}>
                                                  {cat.isPaidYearly ? <CheckCircle2 size={16} /> : cat.icon}
                                              </div>
                                              <div>
                                                  <h4 className="font-bold text-slate-300 text-sm flex items-center gap-2">
                                                      {cat.name}
                                                      <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 font-black uppercase tracking-wider">Yearly</span>
                                                  </h4>
                                                  <div className="flex items-center gap-2 mt-0.5">
                                                      <span className={`text-[10px] font-bold ${cat.isPaidYearly ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                          {cat.isPaidYearly ? 'PAID FOR YEAR' : 'PENDING'}
                                                      </span>
                                                  </div>
                                              </div>
                                          </div>
                                          <div className="text-right relative z-10">
                                              <p className="text-sm font-bold text-slate-400 font-mono">{formatMoney(cat.allocated)}</p>
                                              <p className="text-[9px] text-slate-600 font-bold uppercase">/ Year</p>
                                          </div>
                                      </div>
                                  );
                              }

                              // Standard Monthly Fixed
                              const pctPaid = Math.min(100, (cat.spent / cat.allocated) * 100);
                              const isPaid = pctPaid >= 100;
                              return (
                                  <div 
                                    key={cat.id} 
                                    className="bg-[#0f172a] p-4 rounded-2xl border border-slate-800 flex justify-between items-center opacity-90 animate-slide-up"
                                    style={{animationDelay: `${(idx + 5) * 100}ms`, opacity: 0}}
                                  >
                                      <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-sm border border-slate-800 text-slate-500">{cat.icon}</div>
                                          <div>
                                              <h4 className="font-bold text-slate-300 text-sm">{cat.name}</h4>
                                              <div className="flex items-center gap-2 mt-0.5">
                                                  <div className="h-1.5 w-16 bg-slate-900 rounded-full overflow-hidden"><div className={`h-full transition-all duration-1000 ${isPaid ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{width: `${pctPaid}%`}}></div></div>
                                                  <span className="text-[10px] text-slate-500">{isPaid ? 'Paid' : 'Pending'}</span>
                                              </div>
                                          </div>
                                      </div>
                                      <div className="text-right"><p className="text-sm font-bold text-slate-400 font-mono">{formatMoney(cat.allocated)}</p><p className="text-[9px] text-slate-600 font-bold uppercase">/ Month</p></div>
                                  </div>
                              );
                          })}
                      </div>

                      {/* VARIABLE SINGLE PAYMENTS (Monthly Once) */}
                      <div className="space-y-4">
                          <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest px-2 flex items-center gap-2"><Receipt size={14} className="text-emerald-400"/> Single Payments</h3>
                          {dashboardStats.categoriesDetails
                              .filter(c => c.type === 'VARIABLE' && c.period === 'MONTHLY_ONCE')
                              .map((cat, idx) => {
                                  const pctPaid = Math.min(100, (cat.spent / cat.allocated) * 100);
                                  const isPaid = pctPaid >= 100;
                                  return (
                                      <div 
                                          key={cat.id} 
                                          className="bg-[#0f172a] p-4 rounded-2xl border border-slate-800 flex justify-between items-center opacity-90 animate-slide-up"
                                          style={{animationDelay: `${(idx + 3) * 100}ms`, opacity: 0}}
                                      >
                                          <div className="flex items-center gap-3">
                                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border ${isPaid ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-slate-900 text-slate-500 border-slate-800'}`}>
                                                  {isPaid ? <CheckCircle2 size={16}/> : cat.icon}
                                              </div>
                                              <div>
                                                  <h4 className="font-bold text-slate-300 text-sm">{cat.name}</h4>
                                                  <div className="flex items-center gap-2 mt-0.5">
                                                      <div className="h-1.5 w-16 bg-slate-900 rounded-full overflow-hidden">
                                                          <div className={`h-full transition-all duration-1000 ${isPaid ? 'bg-emerald-500' : 'bg-blue-400'}`} style={{width: `${pctPaid}%`}}></div>
                                                      </div>
                                                      <span className={`text-[10px] ${isPaid ? 'text-emerald-500 font-bold' : 'text-slate-500'}`}>{isPaid ? 'Paid' : 'Pending'}</span>
                                                  </div>
                                              </div>
                                          </div>
                                          <div className="text-right"><p className="text-sm font-bold text-slate-400 font-mono">{formatMoney(cat.allocated)}</p></div>
                                      </div>
                                  );
                          })}
                          {dashboardStats.categoriesDetails.filter(c => c.type === 'VARIABLE' && c.period === 'MONTHLY_ONCE').length === 0 && (
                              <div className="p-4 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-600">No one-time monthly payments configured.</div>
                          )}
                      </div>

                  </div>
              </div>
            </>
          )}

          {viewMode === 'HISTORY' && historicalStats && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                
                {/* 1. FILTERS & NAV */}
                <div className="bg-[#0f172a] p-3 rounded-2xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                        {(['MONTH', 'YEAR', 'ALL'] as const).map(t => (
                            <button 
                                key={t} 
                                onClick={() => setHistoryType(t)}
                                className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${historyType === t ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t} View
                            </button>
                        ))}
                    </div>

                    {historyType !== 'ALL' && (
                        <div className="flex items-center gap-4">
                            <button onClick={() => navigateHistory(-1)} className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"><ChevronLeft size={16}/></button>
                            <div className="text-center w-32">
                                <span className="block text-sm font-bold text-white">
                                    {historyType === 'MONTH' 
                                        ? historyDate.toLocaleDateString('en-US', {month: 'long', year: 'numeric'}) 
                                        : historyDate.getFullYear()
                                    }
                                </span>
                            </div>
                            <button onClick={() => navigateHistory(1)} className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"><ChevronRight size={16}/></button>
                        </div>
                    )}
                </div>

                {/* 2. SUMMARY CARD */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 bg-[#0f172a] border border-slate-800 rounded-2xl">
                        <p className="text-xs text-slate-500 uppercase font-bold mb-1">Total Spent</p>
                        <h3 className="text-2xl font-black text-rose-500">{formatMoney(historicalStats.totalSpent)}</h3>
                    </div>
                    <div className="p-6 bg-[#0f172a] border border-slate-800 rounded-2xl">
                        <p className="text-xs text-slate-500 uppercase font-bold mb-1">Budget Target</p>
                        <h3 className="text-2xl font-black text-blue-400">{formatMoney(historicalStats.totalBudget)}</h3>
                    </div>
                    <div className={`p-6 border rounded-2xl ${historicalStats.totalVariance >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                        <p className={`text-xs uppercase font-bold mb-1 ${historicalStats.totalVariance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>Net Variance</p>
                        <h3 className={`text-2xl font-black ${historicalStats.totalVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {historicalStats.totalVariance >= 0 ? '+' : ''}{formatMoney(historicalStats.totalVariance)}
                        </h3>
                    </div>
                </div>

                {/* 3. DETAILED LIST */}
                <div className="bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden">
                    <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                        <h3 className="font-bold text-white text-sm">Category Performance</h3>
                    </div>
                    <div className="p-4 space-y-3">
                        {historicalStats.categoriesData.map((cat, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-900/30">
                                <div className="flex items-center gap-3 w-1/3">
                                    <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center border border-slate-800 text-sm">{cat.icon}</div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-200 truncate">{cat.name}</p>
                                        <p className="text-[10px] text-slate-500">{cat.type}</p>
                                    </div>
                                </div>
                                <div className="flex-1 px-4">
                                    <div className="flex justify-between text-[10px] mb-1">
                                        <span className="text-slate-500">{formatMoney(cat.spent)} spent</span>
                                        <span className={cat.status === 'OVER' ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'}>{cat.pct.toFixed(0)}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full ${cat.status === 'OVER' ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                                            style={{width: `${cat.pct}%`}}
                                        ></div>
                                    </div>
                                </div>
                                <div className="text-right w-24">
                                    <p className="text-xs font-bold text-slate-400">{formatMoney(cat.target)}</p>
                                    <p className="text-[9px] text-slate-600 uppercase">Target</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
          )}
      </div>
  );
};
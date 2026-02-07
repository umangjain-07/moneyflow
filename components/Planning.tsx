
import React, { useState, useEffect, useMemo } from 'react';
import { db, subscribe } from '../services/storage';
import { Transaction, Category, Account, FinancialPlan, CategoryBudgetConfig } from '../types';
import { Calendar, Target, Edit2, Save, Trash2, Plus, ArrowRight, CheckCircle2, AlertTriangle, Shield, Wallet, DollarSign, X, Lock, ShoppingBag, PieChart, Sliders, TrendingUp, ChevronDown, Calculator } from 'lucide-react';

export const Planning: React.FC = () => {
  const [settings, setSettings] = useState(db.getSettings());
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  // Plan State
  const [plan, setPlan] = useState<FinancialPlan | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Form State
  const [salary, setSalary] = useState('');
  const [savingsGoal, setSavingsGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // The Configuration Table
  const [catConfigs, setCatConfigs] = useState<CategoryBudgetConfig[]>([]);
  
  // Historical Data for Guidance
  const [historyStats, setHistoryStats] = useState<Record<string, number>>({});

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
    // 1. Group transactions by (Category -> Month)
    const catMonthMap: Record<string, Record<string, number>> = {};
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    
    // Use fresh accounts fetch for reliable currency conversion
    const freshAccounts = db.getAccounts();

    txs.forEach(t => {
        const d = new Date(t.date);
        if (d >= oneYearAgo && (t.type === 'EXPENSE' || t.type === 'INVESTMENT')) {
             const monthKey = t.date.substring(0, 7); // YYYY-MM
             
             const acc = freshAccounts.find(a => a.id === t.accountId);
             const val = db.convertAmount(t.amount, acc?.currency || currentSettings.currency, currentSettings.currency);
             
             if (!catMonthMap[t.categoryId]) catMonthMap[t.categoryId] = {};
             catMonthMap[t.categoryId][monthKey] = (catMonthMap[t.categoryId][monthKey] || 0) + val;
        }
    });

    // 2. Calculate average based ONLY on active months
    const stats: Record<string, number> = {};
    Object.keys(catMonthMap).forEach(catId => {
        const months = Object.values(catMonthMap[catId]);
        const total = months.reduce((sum, val) => sum + val, 0);
        const activeMonthCount = months.length; // Only months that exist in the map had transactions
        
        if (activeMonthCount > 0) {
            stats[catId] = Math.round(total / activeMonthCount);
        } else {
            stats[catId] = 0;
        }
    });
    setHistoryStats(stats);

    const existingPlan = db.getPlan();
    
    // Filter out INCOME categories from the budget list (Income is the Input Source)
    const validCats = cats.filter(c => c.type !== 'INCOME');

    if (existingPlan) {
        setPlan(existingPlan);
        // Pre-fill form
        setSalary(existingPlan.salary.toString());
        setSavingsGoal(existingPlan.savingsGoal.toString());
        setStartDate(existingPlan.startDate);
        setEndDate(existingPlan.endDate);
        
        // Merge existing config with potential new categories
        const mergedConfigs = validCats.map(c => {
            const existing = existingPlan.categoryConfigs ? existingPlan.categoryConfigs.find(conf => conf.categoryId === c.id) : null;
            if (existing) {
                // Migration check: if old data lacks 'period', default to MONTHLY
                if (!existing.period) {
                     // @ts-ignore
                     if (existing.isDaily) existing.period = 'DAILY';
                     else existing.period = 'MONTHLY';
                }
                return existing;
            }
            
            // Default heuristics for new categories
            return {
                categoryId: c.id,
                type: c.type === 'INVESTMENT' ? 'FIXED' : (c.necessity === 'NEED' ? 'FIXED' : 'VARIABLE'),
                allocatedAmount: stats[c.id] || 0,
                period: 'MONTHLY'
            } as CategoryBudgetConfig;
        });
        setCatConfigs(mergedConfigs);
    } else {
        setIsEditing(true);
        // Defaults
        const start = now.toISOString().split('T')[0];
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        setStartDate(start);
        setEndDate(end);
        
        // Initial Config Generation
        const initialConfigs = validCats.map(c => {
            // When creating a new plan, we don't have an existing config to look up
            // Just rely on stats
            const initialAmount = stats[c.id] || 0;

            return {
                categoryId: c.id,
                type: (c.type === 'INVESTMENT' ? 'FIXED' : (c.necessity === 'NEED' ? 'FIXED' : 'VARIABLE')) as 'FIXED'|'VARIABLE'|'IGNORE',
                allocatedAmount: initialAmount,
                period: 'MONTHLY'
            };
        });
        setCatConfigs(initialConfigs as CategoryBudgetConfig[]);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = subscribe(loadData);
    return () => unsubscribe();
  }, []);

  // --- ACTIONS ---

  const handleConfigChange = (catId: string, field: keyof CategoryBudgetConfig, value: any) => {
      setCatConfigs(prev => prev.map(c => {
          if (c.categoryId !== catId) return c;
          
          if (field === 'type' && value === 'VARIABLE') {
              // Reset to historical average if switching to variable, respecting "what it actually is"
              const hist = historyStats[c.categoryId] || 0;
              return { ...c, [field]: value, allocatedAmount: c.allocatedAmount || hist };
          }

          return { ...c, [field]: value };
      }));
  };

  const handleAmountInput = (catId: string, inputValue: string) => {
      const val = parseFloat(inputValue) || 0;
      setCatConfigs(prev => prev.map(c => {
          if (c.categoryId !== catId) return c;
          
          // Store everything as Monthly equivalent for consistent math
          let monthlyEquivalent = val;
          if (c.period === 'DAILY') monthlyEquivalent = val * DAYS_IN_MONTH;
          else if (c.period === 'YEARLY') monthlyEquivalent = val / MONTHS_IN_YEAR;
          
          return { ...c, allocatedAmount: monthlyEquivalent };
      }));
  };

  const handlePeriodToggle = (catId: string, newPeriod: 'DAILY' | 'MONTHLY' | 'YEARLY') => {
      setCatConfigs(prev => prev.map(c => {
          if (c.categoryId !== catId) return c;
          return { ...c, period: newPeriod };
          // Note: allocatedAmount stays the same (Monthly), the input value displayed will change
      }));
  };

  const handleSavePlan = () => {
      const salaryNum = parseFloat(salary) || 0;
      const savingsNum = parseFloat(savingsGoal) || 0;
      
      if (salaryNum <= 0) return alert("Salary is required");

      const newPlan: FinancialPlan = {
          salary: salaryNum,
          savingsGoal: savingsNum,
          startDate,
          endDate,
          categoryConfigs: catConfigs
      };

      db.savePlan(newPlan);
      setPlan(newPlan);
      setIsEditing(false);
  };

  const formatMoney = (val: number) => `${settings.currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const formatMoneyPrecise = (val: number) => `${settings.currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // --- PREVIEW STATS FOR SETUP SCREEN ---
  const previewStats = useMemo(() => {
      const inc = parseFloat(salary) || 0;
      const sav = parseFloat(savingsGoal) || 0;
      
      const totalFixed = catConfigs.filter(c => c.type === 'FIXED').reduce((sum, c) => sum + c.allocatedAmount, 0);
      const totalVariable = catConfigs.filter(c => c.type === 'VARIABLE').reduce((sum, c) => sum + c.allocatedAmount, 0);
      
      // Buffer is what is left AFTER user-defined budgets
      const buffer = inc - sav - totalFixed - totalVariable;
      
      return { totalFixed, totalVariable, buffer };
  }, [salary, savingsGoal, catConfigs]);


  // --- DASHBOARD DATA DERIVATION ---
  const dashboardStats = useMemo(() => {
      if (!plan) return null;
      
      const now = new Date();
      const end = new Date(plan.endDate);
      const start = new Date(plan.startDate);
      
      const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      
      const spentMap: Record<string, number> = {};
      let totalVariableSpent = 0;
      let totalFixedSpent = 0;

      // We use direct DB fetch here to ensure we have the absolute latest account details 
      // (specifically currency) to avoid race conditions with React state updates.
      const currentAccounts = db.getAccounts();

      transactions.forEach(t => {
          if (t.date >= plan.startDate && t.date <= plan.endDate && (t.type === 'EXPENSE' || t.type === 'INVESTMENT')) {
              const acc = currentAccounts.find(a => a.id === t.accountId);
              const val = db.convertAmount(t.amount, acc?.currency || settings.currency, settings.currency);
              spentMap[t.categoryId] = (spentMap[t.categoryId] || 0) + val;
              
              const conf = plan.categoryConfigs.find(c => c.categoryId === t.categoryId);
              if (conf?.type === 'VARIABLE') totalVariableSpent += val;
              if (conf?.type === 'FIXED') totalFixedSpent += val;
          }
      });

      const totalVariableAllocated = plan.categoryConfigs.filter(c => c.type === 'VARIABLE').reduce((s, c) => s + c.allocatedAmount, 0);
      const totalVariableRemaining = totalVariableAllocated - totalVariableSpent;
      const overallDailyLimit = Math.max(0, totalVariableRemaining / daysLeft);

      const categoriesDetails = plan.categoryConfigs
        .filter(c => c.type !== 'IGNORE')
        .map(conf => {
          const cat = categories.find(c => c.id === conf.categoryId);
          const allocated = conf.allocatedAmount;
          const spent = spentMap[conf.categoryId] || 0;
          const remaining = allocated - spent;
          const dailyLimit = conf.type === 'VARIABLE' ? Math.max(0, remaining / daysLeft) : 0;
          
          return {
              id: conf.categoryId,
              name: cat?.name || 'Unknown',
              icon: cat?.icon || '📦',
              color: cat?.color || '#64748b',
              type: conf.type,
              allocated,
              spent,
              remaining,
              dailyLimit
          };
      }).sort((a,b) => {
          if (a.type !== b.type) return a.type === 'VARIABLE' ? -1 : 1;
          return b.allocated - a.allocated;
      });

      const totalFixedAllocated = plan.categoryConfigs.filter(c => c.type === 'FIXED').reduce((s, c) => s + c.allocatedAmount, 0);

      return {
          daysLeft,
          totalVariableRemaining,
          overallDailyLimit,
          categoriesDetails,
          totalFixedAllocated,
          totalFixedSpent,
          savingsGoal: plan.savingsGoal,
          totalVariableAllocated
      };

  }, [plan, transactions, accounts, categories, settings]);


  // --- RENDER: SETUP MODE ---

  if (isEditing || !plan) {
      const buffer = previewStats.buffer;
      const isNegative = buffer < 0;

      const groupedConfigs = {
          FIXED: catConfigs.filter(c => categories.find(cat => cat.id === c.categoryId)?.type === 'EXPENSE'),
          INVEST: catConfigs.filter(c => categories.find(cat => cat.id === c.categoryId)?.type === 'INVESTMENT')
      };

      const renderConfigRow = (conf: CategoryBudgetConfig) => {
          const cat = categories.find(c => c.id === conf.categoryId);
          const histAvg = historyStats[conf.categoryId] || 0;
          
          // Determine display value based on selected period
          let displayValue = conf.allocatedAmount;
          if (conf.period === 'DAILY') displayValue = conf.allocatedAmount / DAYS_IN_MONTH;
          else if (conf.period === 'YEARLY') displayValue = conf.allocatedAmount * MONTHS_IN_YEAR;
          
          return (
              <div key={conf.categoryId} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-slate-950/50 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors gap-3">
                  <div className="flex items-center gap-3 w-full sm:w-1/3">
                      <span className="text-lg">{cat?.icon}</span>
                      <div className="min-w-0">
                          <p className="font-bold text-slate-200 text-sm truncate">{cat?.name}</p>
                          <div className="flex items-center gap-1.5">
                              <p className="text-[10px] text-slate-500">Avg: {formatMoney(histAvg)}</p>
                              {histAvg > 0 && (
                                <span className="text-[9px] text-slate-600 bg-slate-900 px-1 rounded border border-slate-800" title="Average of months with spending">Active Mo. Only</span>
                              )}
                          </div>
                      </div>
                  </div>
                  
                  <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
                      {(['FIXED', 'VARIABLE', 'IGNORE'] as const).map(t => (
                          <button 
                            key={t}
                            onClick={() => handleConfigChange(conf.categoryId, 'type', t)}
                            className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${conf.type === t ? (t==='FIXED'?'bg-rose-500 text-white':t==='VARIABLE'?'bg-blue-500 text-white':'bg-slate-700 text-slate-300') : 'text-slate-600 hover:text-slate-400'}`}
                          >
                              {t.slice(0,3)}
                          </button>
                      ))}
                  </div>

                  <div className="flex gap-2 items-center w-full sm:w-auto justify-end">
                      {conf.type !== 'IGNORE' ? (
                          <>
                            <input 
                                type="number" 
                                value={displayValue ? parseFloat(displayValue.toFixed(2)) : ''}
                                onChange={(e) => handleAmountInput(conf.categoryId, e.target.value)}
                                className={`w-24 bg-slate-900 border rounded p-1.5 text-right text-xs text-white outline-none focus:border-emerald-500 ${conf.type === 'VARIABLE' ? 'border-blue-500/30' : 'border-slate-700'}`}
                                placeholder="0"
                            />
                            <div className="relative">
                                <select 
                                    className="appearance-none bg-slate-900 border border-slate-800 rounded-md py-1.5 pl-2 pr-6 text-[10px] font-bold text-slate-400 outline-none cursor-pointer w-20"
                                    value={conf.period || 'MONTHLY'}
                                    onChange={(e) => handlePeriodToggle(conf.categoryId, e.target.value as any)}
                                >
                                    <option value="DAILY">/ Day</option>
                                    <option value="MONTHLY">/ Mo</option>
                                    <option value="YEARLY">/ Yr</option>
                                </select>
                                <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"/>
                            </div>
                          </>
                      ) : (
                          <span className="text-xs text-slate-600 w-24 text-center">-</span>
                      )}
                  </div>
              </div>
          );
      };

      return (
          <div className="max-w-4xl mx-auto space-y-6 pb-20">
              <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-bold text-white">Create Deterministic Plan</h1>
                  {plan && <button onClick={() => setIsEditing(false)} className="text-slate-500 hover:text-white transition-colors">Cancel</button>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* LEFT: Inputs */}
                  <div className="lg:col-span-1 space-y-6">
                      <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800 space-y-4">
                          <h3 className="font-bold text-white flex items-center gap-2"><Wallet size={16} className="text-emerald-400"/> Income & Goals</h3>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Monthly Income</label>
                              <div className="relative">
                                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">{settings.currencySymbol}</span>
                                   <input type="number" value={salary} onChange={e => setSalary(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 pl-8 text-white font-mono outline-none focus:border-emerald-500/50" />
                              </div>
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Savings Goal</label>
                              <div className="relative">
                                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">{settings.currencySymbol}</span>
                                   <input type="number" value={savingsGoal} onChange={e => setSavingsGoal(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 pl-8 text-emerald-400 font-bold font-mono outline-none focus:border-emerald-500/50" />
                              </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white" /></div>
                              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">End</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white" /></div>
                          </div>
                      </div>

                      <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
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
                          {isNegative && <div className="text-xs text-rose-500 bg-rose-500/10 p-2 rounded border border-rose-500/20">Over Budget! Expenses exceed income.</div>}
                          <button onClick={handleSavePlan} disabled={isNegative} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition-all">Generate Plan</button>
                      </div>
                  </div>

                  {/* RIGHT: Category Configuration */}
                  <div className="lg:col-span-2 bg-[#0f172a] rounded-2xl border border-slate-800 flex flex-col h-[700px]">
                      <div className="p-4 border-b border-slate-800 bg-slate-900/50 rounded-t-2xl flex justify-between items-center">
                          <h3 className="font-bold text-white text-sm">Allocations</h3>
                      </div>
                      <div className="overflow-y-auto flex-1 p-2 custom-scrollbar space-y-6">
                          
                          {/* 1. EXPENSES */}
                          <div>
                              <h4 className="px-2 mb-2 text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-2">
                                  <ShoppingBag size={12}/> Expenses (Fixed & Variable)
                              </h4>
                              <div className="space-y-1">
                                  {groupedConfigs.FIXED.map(renderConfigRow)}
                              </div>
                          </div>

                          {/* 2. INVESTMENTS (Optional specific allocations) */}
                          {groupedConfigs.INVEST.length > 0 && (
                              <div>
                                <h4 className="px-2 mb-2 text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
                                    <TrendingUp size={12}/> Specific Investments
                                </h4>
                                <div className="space-y-1">
                                    {groupedConfigs.INVEST.map(renderConfigRow)}
                                </div>
                              </div>
                          )}

                      </div>
                  </div>
              </div>
          </div>
      );
  }

  // --- RENDER: VIEW MODE ---
  
  if (!dashboardStats) return null;

  return (
      <div className="max-w-4xl mx-auto space-y-6 pb-20">
          
          {/* Top Card: The Daily Driver */}
          <div className="bg-gradient-to-br from-indigo-900/20 to-[#0f172a] p-8 rounded-[2rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
               <div className="relative z-10 text-center md:text-left">
                   <p className="text-indigo-300 text-xs font-black uppercase tracking-widest mb-2">Safe Daily Spending</p>
                   <h1 className="text-6xl font-black text-white tracking-tighter drop-shadow-xl">
                       {formatMoneyPrecise(dashboardStats.overallDailyLimit)}
                   </h1>
                   <p className="text-slate-400 text-sm mt-2 font-medium">
                       <span className="text-white font-bold">{dashboardStats.daysLeft} days</span> remaining
                   </p>
               </div>
               
               <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5 backdrop-blur-sm w-full md:w-64 space-y-4">
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-bold uppercase">Variable Pool</span>
                        <span className="text-white font-mono">{formatMoney(dashboardStats.totalVariableRemaining)}</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{width: `${Math.min(100, (dashboardStats.totalVariableRemaining / dashboardStats.totalVariableAllocated)*100)}%`}}></div>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-white/5">
                        <span className="text-slate-500 text-[10px] uppercase font-bold">Savings Secured</span>
                        <span className="text-emerald-400 font-bold text-sm">{formatMoney(dashboardStats.savingsGoal)}</span>
                    </div>
               </div>
               
               <button onClick={() => setIsEditing(true)} className="absolute top-4 right-4 p-2 text-slate-600 hover:text-white transition-colors"><Edit2 size={16}/></button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* VARIABLE CATEGORIES */}
              <div className="space-y-4">
                  <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest px-2 flex items-center gap-2">
                      <ShoppingBag size={14} className="text-blue-500"/> Variable Budgets
                  </h3>
                  {dashboardStats.categoriesDetails.filter(c => c.type === 'VARIABLE').map(cat => {
                      const pctLeft = Math.max(0, Math.min(100, (cat.remaining / cat.allocated) * 100));
                      return (
                          <div key={cat.id} className="bg-[#0f172a] p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors">
                              <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-xl border border-slate-800">
                                          {cat.icon}
                                      </div>
                                      <div>
                                          <h4 className="font-bold text-white text-sm">{cat.name}</h4>
                                          <p className="text-[10px] text-slate-500">{formatMoney(cat.remaining)} left</p>
                                      </div>
                                  </div>
                                  <div className="text-right">
                                      <p className="text-base font-bold text-white font-mono">{formatMoneyPrecise(cat.dailyLimit)}</p>
                                      <p className="text-[9px] text-slate-500 font-bold uppercase">/ Day</p>
                                  </div>
                              </div>
                              <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${pctLeft < 20 ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: `${pctLeft}%` }}></div>
                              </div>
                          </div>
                      );
                  })}
              </div>

              {/* FIXED CATEGORIES */}
              <div className="space-y-4">
                  <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest px-2 flex items-center gap-2">
                      <Lock size={14} className="text-rose-500"/> Fixed Costs
                  </h3>
                  {dashboardStats.categoriesDetails.filter(c => c.type === 'FIXED').map(cat => {
                      const pctPaid = Math.min(100, (cat.spent / cat.allocated) * 100);
                      const isPaid = pctPaid >= 100;
                      return (
                          <div key={cat.id} className="bg-[#0f172a] p-4 rounded-2xl border border-slate-800 flex justify-between items-center opacity-90">
                              <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-sm border border-slate-800 text-slate-500">
                                      {cat.icon}
                                  </div>
                                  <div>
                                      <h4 className="font-bold text-slate-300 text-sm">{cat.name}</h4>
                                      <div className="flex items-center gap-2 mt-0.5">
                                          <div className="h-1.5 w-16 bg-slate-900 rounded-full overflow-hidden">
                                              <div className={`h-full ${isPaid ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{width: `${pctPaid}%`}}></div>
                                          </div>
                                          <span className="text-[10px] text-slate-500">{isPaid ? 'Paid' : 'Pending'}</span>
                                      </div>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <p className="text-sm font-bold text-slate-400 font-mono">{formatMoney(cat.allocated)}</p>
                                  <p className="text-[9px] text-slate-600 font-bold uppercase">/ Month</p>
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      </div>
  );
};

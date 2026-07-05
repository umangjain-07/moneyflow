
import React, { useEffect, useState, useMemo } from 'react';
import { db, subscribe, getEnv } from '../services/storage';
import { FinancialHealth, Category, Goal, Transaction, Account, AiInsight } from '../types';
import { TrendingUp, TrendingDown, Wallet, ShieldCheck, Lightbulb, Target, Plus, Trash2, Calendar, AlertTriangle, CheckCircle2, ArrowRight, Coffee, Activity, Zap, Info, Sparkles, BrainCircuit, Lock, Shield, Award, Edit2, PieChart as PieIcon } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, LineChart as RechartsLineChart, Line, ReferenceLine } from 'recharts';
import { GoogleGenAI, Type } from "@google/genai";

const CustomTooltip = ({ active, payload, label, currencySymbol }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-[#020617]/90 backdrop-blur-md border border-slate-800 p-3 rounded-xl shadow-xl animate-in zoom-in-95 duration-200">
                <p className="text-slate-400 text-xs font-bold mb-2 uppercase tracking-wider">{label}</p>
                {payload.map((p: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-xs mb-1 last:mb-0">
                        <div className="w-2 h-2 rounded-full shadow-[0_0_8px]" style={{backgroundColor: p.color, boxShadow: `0 0 8px ${p.color}`}}></div>
                        <span className="text-slate-300 capitalize">{p.name}:</span>
                        <span className="font-bold font-mono" style={{color: p.color}}>
                            {currencySymbol}{p.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export const Dashboard: React.FC = () => {
  const [health, setHealth] = useState<FinancialHealth>(db.getFinancialHealth());
  const [settings, setSettings] = useState(db.getSettings());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>(db.getGoals());
  
    type DashboardRangeKey = '1M' | '3M' | '6M' | '1Y' | 'ALL' | 'CUSTOM';
    const dashboardRangeOptions: DashboardRangeKey[] = ['1M', '3M', '6M', '1Y', 'ALL'];
    const [dashboardRange, setDashboardRange] = useState<DashboardRangeKey>(() => db.getSettings().dashboardRange || '1M');
    const [customRange, setCustomRange] = useState(() => ({
        start: db.getSettings().reportsCustomStart || '',
        end: db.getSettings().reportsCustomEnd || ''
    }));
    const [pickedMonth, setPickedMonth] = useState(() => db.getSettings().reportsPickedMonth || '');
    const historyRange = useMemo(() => {
        if (dashboardRange === 'ALL') return 'ALL';
        if (dashboardRange === '1M') return 1;
        if (dashboardRange === '3M') return 3;
        if (dashboardRange === '6M') return 6;
        if (dashboardRange === 'CUSTOM') return 'ALL';
        return 12;
    }, [dashboardRange]);
  const [history, setHistory] = useState<any[]>([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
    const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [newGoal, setNewGoal] = useState<Partial<Goal>>({ name: '', targetAmount: 0, currentAmount: 0, color: '#10B981' });

  // AI State
  const [aiInsights, setAiInsights] = useState<AiInsight[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
    const [cashFlowMode, setCashFlowMode] = useState<'FLOW' | 'SAVINGS' | 'NET_WORTH'>('FLOW');

  const loadData = () => {
    setHealth(db.getFinancialHealth());
    setSettings(db.getSettings());
    setTransactions(db.getTransactions());
    setAccounts(db.getAccounts());
    setCategories(db.getCategories());
    setGoals(db.getGoals());
    setHistory(db.getHistory(historyRange));
  };

  const generateAiInsights = async () => {
    if (transactions.length < 3 || isAiLoading) return;
    
    // Safely retrieve Gemini API Key from multiple potential sources
    let apiKey = getEnv('GEMINI_API_KEY');
    if (!apiKey) {
        try {
            if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
                apiKey = process.env.API_KEY;
            }
        } catch (e) {}
    }

    if (!apiKey) return;

    setIsAiLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const ai = new GoogleGenAI({ apiKey });
      const today = new Date();
      const dayOfMonth = today.getDate();
      
    const freeLiquid = health.freeLiquidAssets ?? health.liquidAssets;
    const goalLocked = health.goalLockedAssets || 0;

    const prompt = `Act as a world-class financial analyst. Analyze this financial snapshot and provide 3 high-impact, professional insights.
      User's Base Currency: ${settings.currency} (${settings.currencySymbol})
      
      CRITICAL CONTEXT:
      - Current Date: ${today.toLocaleDateString()} (Day ${dayOfMonth} of month).
      - If the day is < 7 and Income is 0 or low, assume salary is pending. Do NOT flag low income as a warning yet.
      - Your insights MUST use ${settings.currencySymbol} when mentioning monetary values.
      
      Snapshot (Values in ${settings.currency}):
      - Net Worth: ${health.netWorth}
      - This Month Income: ${currentMonthStats.income}
      - This Month Expenses: ${currentMonthStats.expense}
      - Invested: ${currentMonthStats.invested}
    - Liquid Cash (Free): ${freeLiquid}
    - Goal Locked Cash: ${goalLocked}
      - Goals: ${goals.map(g => `${g.name}: ${(g.currentAmount/g.targetAmount*100).toFixed(0)}%`).join(', ') || 'No active goals'}
      - Last 5 Activities: ${transactions.slice(0, 5).map(t => {
          const net = t.type === 'EXPENSE' ? Math.max(0, t.amount - (t.sponsoredAmount || 0)) : t.amount;
          const sponsorNote = t.type === 'EXPENSE' && t.sponsoredAmount ? ` (sponsored ${t.sponsoredAmount})` : '';
          return `${t.description}: ${net}${sponsorNote}`;
      }).join(', ')}
      
      Return a JSON object with a single key "insights" which is an array of 3 objects: { title: string, description: string, type: 'TIP' | 'WARNING' | 'OPPORTUNITY' }.`;

      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              insights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ['TIP', 'WARNING', 'OPPORTUNITY'] }
                  },
                  required: ["title", "description", "type"]
                }
              }
            },
            required: ["insights"]
          }
        }
      });

      const text = result.text;
      if (!text) throw new Error("Empty response from AI");
      
      const parsed = JSON.parse(text);
      setAiInsights(parsed.insights || []);
    } catch (error: any) {
      if (!error.message?.includes('Rpc failed')) {
         console.error("AI Insight Error:", error);
      }
      if (aiInsights.length === 0) {
          setAiInsights([{
            title: "Analysis Suspended",
            description: "Financial intelligence module is temporarily unavailable. Manual tracking remains fully operational.",
            type: "WARNING"
          }]);
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleDeleteGoal = (id: string) => {
    if (confirm('Delete this savings goal?')) {
      db.deleteGoal(id);
    }
  };

    const handleOpenNewGoal = () => {
        setEditingGoalId(null);
        setNewGoal({ name: '', targetAmount: 0, currentAmount: 0, color: '#10B981' });
        setShowGoalModal(true);
    };

    const handleOpenEditGoal = (goal: Goal) => {
        setEditingGoalId(goal.id);
        setNewGoal({ ...goal });
        setShowGoalModal(true);
    };

    const handleCustomGoalAdd = (goal: Goal) => {
        const raw = prompt(`Add amount to ${goal.name}`, '');
        if (!raw) return;
        const amount = parseFloat(raw);
        if (isNaN(amount) || amount <= 0) return;
        db.saveGoal({ ...goal, currentAmount: Math.min(goal.currentAmount + amount, goal.targetAmount) });
    };

  useEffect(() => {
    loadData();
    const unsubscribe = subscribe(loadData);
    return () => unsubscribe();
  }, [historyRange]);

        useEffect(() => {
            db.updateSettings({ dashboardRange });
        }, [dashboardRange]);

        useEffect(() => {
        db.updateSettings({ reportsCustomStart: customRange.start, reportsCustomEnd: customRange.end, reportsPickedMonth: pickedMonth });
        }, [customRange.start, customRange.end, pickedMonth]);

  useEffect(() => {
    if (transactions.length >= 3 && aiInsights.length === 0 && !isAiLoading) {
      generateAiInsights();
    }
  }, [transactions.length]);

  const currentMonthStats = useMemo(() => {
      const now = new Date();
      const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`;
      let income = 0, expense = 0, invested = 0;
      transactions.forEach(t => {
          const parts = t.date.split(/[^0-9]/);
          if (parts.length >= 2) {
              const txKey = `${parseInt(parts[0])}-${String(parseInt(parts[1])).padStart(2,'0')}`;
              if (txKey === currentKey) {
                  const acc = accounts.find(a => a.id === t.accountId);
                  const rawAmount = t.type === 'EXPENSE'
                      ? Math.max(0, t.amount - (t.sponsoredAmount || 0))
                      : t.amount;
                  const val = db.convertAmount(rawAmount, acc?.currency || settings.currency, settings.currency);
                  const isTransfer = t.categoryId === 'transfer_in' || t.categoryId === 'transfer_out';
                  if (!isTransfer) {
                     if (t.type === 'INCOME') income += val;
                     if (t.type === 'EXPENSE') expense += val;
                     if (t.type === 'INVESTMENT') invested += val;
                  }
              }
          }
      });
      return { income, expense, invested };
  }, [transactions, accounts, settings.currency]);

  const emergencyStats = useMemo(() => {
      const emergencyMonths = settings.emergencyFundTargetMonths || 6;
      const lookbackMonths = 12; 
      const now = new Date();
      const lookbackDate = new Date();
      lookbackDate.setMonth(lookbackDate.getMonth() - lookbackMonths);
      
      let totalNeeds = 0, totalWants = 0, totalInvest = 0;
      let oldestTxDate = now;
      if (transactions.length > 0) {
          const earliest = transactions.reduce((acc, t) => t.date < acc ? t.date : acc, transactions[0].date);
          oldestTxDate = new Date(earliest);
      }
      const monthsWithData = Math.max(1, (now.getFullYear() - oldestTxDate.getFullYear()) * 12 + (now.getMonth() - oldestTxDate.getMonth()) + 1);
      const effectiveDivisor = Math.min(monthsWithData, lookbackMonths);
      
      transactions.forEach(t => {
          const tDate = new Date(t.date);
          if (tDate >= lookbackDate) {
              const isTransfer = t.categoryId === 'transfer_out' || t.categoryId === 'transfer_in';
              if (isTransfer) return;
              const acc = accounts.find(a => a.id === t.accountId);
              const rawAmount = t.type === 'EXPENSE'
                  ? Math.max(0, t.amount - (t.sponsoredAmount || 0))
                  : t.amount;
              const val = db.convertAmount(rawAmount, acc?.currency || settings.currency, settings.currency);
              if (t.type === 'EXPENSE') {
                  const cat = categories.find(c => c.id === t.categoryId);
                  if (cat?.necessity === 'NEED') totalNeeds += val;
                  else totalWants += val;
              } else if (t.type === 'INVESTMENT') {
                  totalInvest += val;
              }
          }
      });
      
      const avgNeeds = totalNeeds / effectiveDivisor;
      const avgWants = totalWants / effectiveDivisor;
      const avgInvest = totalInvest / effectiveDivisor;
      
      // Calculate Buckets
      const targetBasic = avgNeeds * emergencyMonths;
      const targetComfort = (avgNeeds + avgWants) * emergencyMonths;
      const targetThriving = (avgNeeds + avgWants + avgInvest) * emergencyMonths;
      
      const cycleSize = Math.max(1, targetThriving);
    const totalLiquidCash = health.freeLiquidAssets ?? health.liquidAssets;
      
      // Cyclic Logic:
      // Level 0: 0 -> Thrive Target (filling first time)
      // Level 1: Thrive -> 2x Thrive (filling surplus)
      const level = Math.floor(totalLiquidCash / cycleSize); 
      const currentCycleAmount = totalLiquidCash % cycleSize;
      
      // If we are exactly at 100% or 200%, the modulo is 0. 
      // We want to show a full bar for "Level Complete".
      const isExactMultiple = totalLiquidCash > 0 && currentCycleAmount === 0;
      const visualAmount = isExactMultiple ? cycleSize : currentCycleAmount;
      const displayLevel = isExactMultiple ? level : level; 

      const filledBasic = Math.min(visualAmount, targetBasic);
      const filledComfort = Math.max(0, Math.min(visualAmount - targetBasic, targetComfort - targetBasic));
      const filledThriving = Math.max(0, Math.min(visualAmount - targetComfort, targetThriving - targetComfort));
      
      return { 
          liquidCash: totalLiquidCash, 
          targets: { basic: targetBasic, comfort: targetComfort, thriving: targetThriving }, 
          filled: { basic: filledBasic, comfort: filledComfort, thriving: filledThriving },
          level: displayLevel,
          isSurplus: displayLevel > 0
      };
    }, [transactions, categories, accounts, settings, health.liquidAssets, health.freeLiquidAssets]);

  const formatDateKey = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
  };

  const monthToRange = (monthValue: string) => {
      if (!monthValue) return null;
      const [y, m] = monthValue.split('-').map(Number);
      if (!y || !m) return null;
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { start, end };
  };

  const getAccountCurrency = (accountId: string) => accounts.find(a => a.id === accountId)?.currency || settings.currency;

  const dashboardRangeInfo = useMemo(() => {
      const today = new Date();
      let startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      let endDate = today;
      let label = dashboardRange === 'ALL' ? 'All' : dashboardRange;

      if (dashboardRange === 'CUSTOM') {
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
      } else if (dashboardRange === 'ALL') {
          if (transactions.length > 0) {
              const earliest = transactions.reduce((acc, t) => t.date < acc ? t.date : acc, transactions[0].date);
              const [y, m, d] = earliest.split('-').map(Number);
              startDate = new Date(y, m - 1, d);
          }
      } else {
          const monthsBack = dashboardRange === '1M' ? 1 : dashboardRange === '3M' ? 3 : dashboardRange === '6M' ? 6 : 12;
          startDate = new Date(today.getFullYear(), today.getMonth() - monthsBack, today.getDate());
      }

      const startKey = formatDateKey(startDate);
      const endKey = formatDateKey(endDate);
      const rangeDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      return { startKey, endKey, rangeDays, label };
  }, [dashboardRange, transactions, customRange.start, customRange.end, pickedMonth]);

  const dashboardRangeTxs = useMemo(
      () => transactions.filter(t => t.date >= dashboardRangeInfo.startKey && t.date <= dashboardRangeInfo.endKey),
      [transactions, dashboardRangeInfo.startKey, dashboardRangeInfo.endKey]
  );

  const dashboardRangeKpis = useMemo(() => {
      let income = 0;
      let expense = 0;
      let investment = 0;
      let goalFeed = 0;
      let sponsored = 0;

      dashboardRangeTxs.forEach(t => {
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
  }, [dashboardRangeTxs, settings.currency, accounts]);

  const dashboardAllocationStats = useMemo(() => {
      let needs = 0;
      let wants = 0;
      let investment = 0;
      let expense = 0;

      dashboardRangeTxs.forEach(t => {
          if (t.type !== 'EXPENSE' && t.type !== 'INVESTMENT') return;
          const acc = accounts.find(a => a.id === t.accountId);
          const rawAmount = t.type === 'EXPENSE'
              ? Math.max(0, t.amount - (t.sponsoredAmount || 0))
              : t.amount;
          const amount = db.convertAmount(rawAmount, acc?.currency || settings.currency, settings.currency);

          if (t.type === 'INVESTMENT') {
              investment += amount;
              return;
          }

          expense += amount;
          const cat = categories.find(c => c.id === t.categoryId);
          if (cat?.necessity === 'NEED') needs += amount;
          else wants += amount;
      });

      return { needs, wants, investment, expense };
  }, [dashboardRangeTxs, categories, accounts, settings.currency]);

  const dashboardAllocationData = useMemo(() => [
      { name: 'Needs', value: dashboardAllocationStats.needs, color: '#10b981' },
      { name: 'Wants', value: dashboardAllocationStats.wants, color: '#f59e0b' },
      { name: 'Investments', value: dashboardAllocationStats.investment, color: '#8b5cf6' }
  ].filter(item => item.value > 0), [dashboardAllocationStats]);

  const rangeHistory = useMemo(() => {
      if (history.length === 0) return [];
      const startMonth = dashboardRangeInfo.startKey.substring(0, 7);
      const endMonth = dashboardRangeInfo.endKey.substring(0, 7);
      return history.filter(entry => entry.date >= startMonth && entry.date <= endMonth);
  }, [history, dashboardRangeInfo.startKey, dashboardRangeInfo.endKey]);

  const cashFlowData = useMemo(() => {
      if (rangeHistory.length === 0) return [];

      const entries = rangeHistory.map(entry => ({
          date: entry.date,
          formattedDate: entry.formattedDate,
          income: 0,
          needs: 0,
          wants: 0,
          investment: 0,
          goals: 0,
          savings: 0,
          savingsTarget: 0,
          endNetWorth: 0
      }));
      const byMonth = new Map(entries.map(entry => [entry.date, entry]));
      const savingsGoalPercent = settings.savingsGoalPercent || 20;

      transactions.forEach(t => {
          const key = t.date.substring(0, 7);
          const entry = byMonth.get(key);
          if (!entry) return;
          if (t.categoryId === 'transfer_in' || t.categoryId === 'transfer_out') return;

          const acc = accounts.find(a => a.id === t.accountId);
          const rawAmount = t.type === 'EXPENSE'
              ? Math.max(0, t.amount - (t.sponsoredAmount || 0))
              : t.amount;
          const amount = db.convertAmount(rawAmount, acc?.currency || settings.currency, settings.currency);

          if (t.type === 'INCOME') {
              entry.income += amount;
          } else if (t.type === 'INVESTMENT') {
              entry.investment += amount;
          } else if (t.type === 'GOAL') {
              entry.goals += amount;
          } else if (t.type === 'EXPENSE') {
              const cat = categories.find(c => c.id === t.categoryId);
              if (cat?.necessity === 'NEED') entry.needs += amount;
              else entry.wants += amount;
          }
      });

      let cumulativeGoalFlow = 0;
      entries.forEach(entry => {
          const outflow = entry.needs + entry.wants + entry.investment + entry.goals;
          entry.savings = entry.income - outflow;
          entry.savingsTarget = entry.income * (savingsGoalPercent / 100);
          cumulativeGoalFlow += entry.goals;
          const baseNetWorth = rangeHistory.find(historyEntry => historyEntry.date === entry.date)?.endNetWorth || 0;
          entry.endNetWorth = Math.max(0, baseNetWorth - cumulativeGoalFlow);
      });

      return entries;
    }, [rangeHistory, transactions, accounts, categories, settings.currency]);

  const formatMoney = (val: number) => `${settings.currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const freeLiquid = health.freeLiquidAssets ?? health.liquidAssets;
    const goalLocked = health.goalLockedAssets || 0;
        const adjustedNetWorth = Math.max(0, health.netWorth - goalLocked);
    const liquidPct = health.netWorth > 0 ? (freeLiquid / health.netWorth) * 100 : 0;
    const goalPct = health.netWorth > 0 ? (goalLocked / health.netWorth) * 100 : 0;
  const investedPct = health.netWorth > 0 ? (health.investedAssets / health.netWorth) * 100 : 0;

  return (
    <div className="space-y-6 md:space-y-10 pb-4">
      
      {/* 1. RELOADED NET WORTH HEADER */}
      <div className="border-b border-slate-800/50 pb-10 relative overflow-hidden animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative z-10">
              <div className="w-full md:w-auto">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-slate-400 font-medium text-sm tracking-wide uppercase">Financial Net Worth</p>
                  </div>
                  <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-500">
                      {formatMoney(adjustedNetWorth)}
                  </h1>
                  
                  {/* ASSET BREAKDOWN PROGRESS BAR */}
                  <div className="mt-8 max-w-xl">
                      <div className="flex justify-between items-end mb-2.5">
                          <div className="flex gap-4">
                              <div className="flex flex-col">
                                  <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">Free Liquid</span>
                                  <span className="text-lg font-bold text-slate-100">{formatMoney(freeLiquid)}</span>
                              </div>
                              <div className="w-[1px] h-8 bg-slate-800 self-center"></div>
                              <div className="flex flex-col">
                                  <span className="text-[10px] text-amber-400 font-black uppercase tracking-widest">Goal Locked</span>
                                  <span className="text-lg font-bold text-slate-100">{formatMoney(goalLocked)}</span>
                              </div>
                              <div className="w-[1px] h-8 bg-slate-800 self-center"></div>
                              <div className="flex flex-col">
                                  <span className="text-[10px] text-purple-400 font-black uppercase tracking-widest">Invested</span>
                                  <span className="text-lg font-bold text-slate-100">{formatMoney(health.investedAssets)}</span>
                              </div>
                          </div>
                          <span className="text-xs font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                              {liquidPct.toFixed(0)}% Free / {goalPct.toFixed(0)}% Goals / {investedPct.toFixed(0)}% Inv
                          </span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-900 rounded-full flex overflow-hidden border border-slate-800 shadow-inner">
                          <div 
                            className="h-full bg-emerald-500 transition-all duration-1000 ease-out relative group" 
                            style={{ width: `${liquidPct}%` }}
                          >
                             <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          </div>
                          <div 
                            className="h-full bg-amber-500 transition-all duration-1000 ease-out relative group" 
                            style={{ width: `${goalPct}%` }}
                          >
                             <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          </div>
                          <div 
                            className="h-full bg-purple-500 transition-all duration-1000 ease-out relative group" 
                            style={{ width: `${investedPct}%` }}
                          >
                             <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          </div>
                      </div>
                  </div>
              </div>

              <div className="flex gap-4 md:gap-8 w-full md:w-auto justify-between md:justify-end bg-[#0f172a]/50 backdrop-blur-xl p-6 rounded-2xl border border-slate-800 shadow-2xl">
                 <div className="text-left md:text-right">
                     <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1.5">Dividends & Growth</p>
                      <p className={`text-xl md:text-2xl font-black ${dashboardRangeKpis.investment > 0 ? 'text-purple-400' : 'text-slate-700'}`}>
                        {formatMoney(dashboardRangeKpis.investment)}
                     </p>
                 </div>
                 <div className="text-right">
                     <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1.5">Monthly Income</p>
                     <p className="text-xl md:text-2xl font-black text-emerald-400">{formatMoney(dashboardRangeKpis.income)}</p>
                 </div>
              </div>
          </div>
      </div>

      {/* GLOBAL RANGE SELECTOR */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-in fade-in duration-700">
          <div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Global Range</p>
              <p className="text-xs text-slate-600">Used across dashboard charts</p>
          </div>
          <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-2">
                  {dashboardRangeOptions.map(key => (
                      <button
                          key={key}
                          onClick={() => setDashboardRange(key)}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                              dashboardRange === key ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                          }`}
                      >
                          {key === 'ALL' ? 'All' : key}
                      </button>
                  ))}
                  <button
                      onClick={() => setDashboardRange('CUSTOM')}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          dashboardRange === 'CUSTOM' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                      }`}
                  >
                      Custom
                  </button>
              </div>

              {dashboardRange === 'CUSTOM' && (
                  <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                          <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Start</span>
                          <input
                              type="date"
                              className="bg-transparent text-slate-200 text-xs font-bold outline-none"
                                  style={{ colorScheme: 'dark' }}
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
                                  style={{ colorScheme: 'dark' }}
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
                                  style={{ colorScheme: 'dark' }}
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
      </div>

      {/* AI WEALTH ADVISOR INSIGHTS */}
      {(aiInsights.length > 0 || isAiLoading) && (
        <div className="animate-in slide-in-from-bottom-6 fade-in duration-700 relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-purple-500/20 rounded-3xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative bg-[#0f172a]/90 backdrop-blur-xl border border-emerald-500/20 rounded-3xl p-6 md:p-8 shadow-2xl overflow-hidden">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20 animate-pulse">
                            <Sparkles size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white tracking-tight">AI Wealth Advisor</h3>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Gemini Intelligence Layer</p>
                        </div>
                    </div>
                    <button 
                        onClick={generateAiInsights}
                        disabled={isAiLoading}
                        className="text-[10px] font-black uppercase tracking-widest px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        {isAiLoading ? <Activity size={12} className="animate-spin" /> : <BrainCircuit size={12} />}
                        {isAiLoading ? 'Synthesizing...' : 'Refresh Insights'}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {isAiLoading ? (
                        [1,2,3].map(i => (
                            <div key={i} className="space-y-3 animate-pulse">
                                <div className="h-4 bg-slate-800 rounded w-1/3"></div>
                                <div className="h-20 bg-slate-900/50 rounded-2xl border border-slate-800"></div>
                            </div>
                        ))
                    ) : (
                        aiInsights.map((insight, idx) => (
                            <div key={idx} className="group/insight p-5 rounded-2xl bg-slate-950/50 border border-slate-800 hover:border-emerald-500/30 transition-all duration-500 animate-slide-up" style={{animationDelay: `${idx * 100}ms`}}>
                                <div className="flex items-center gap-2 mb-3">
                                    {insight.type === 'TIP' && <Lightbulb size={16} className="text-amber-400" />}
                                    {insight.type === 'WARNING' && <AlertTriangle size={16} className="text-rose-400" />}
                                    {insight.type === 'OPPORTUNITY' && <Zap size={16} className="text-emerald-400" />}
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{insight.type}</span>
                                </div>
                                <h4 className="font-bold text-slate-200 mb-2 group-hover/insight:text-white transition-colors">{insight.title}</h4>
                                <p className="text-xs text-slate-500 leading-relaxed group-hover/insight:text-slate-400 transition-colors">{insight.description}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      )}

      {/* 2. FINANCIAL VITALS DECK */}
      <div className="animate-in slide-in-from-bottom-6 fade-in duration-700 delay-100">
        <h3 className="text-white font-bold flex items-center gap-2 text-lg md:text-xl mb-6">
            <ShieldCheck size={20} className="text-emerald-400" /> Capital Resilience
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Card 1: Emergency Fund (Prestige Mode) */}
            <div className={`p-6 rounded-2xl border flex flex-col justify-between transition-all duration-300 group overflow-hidden relative ${emergencyStats.isSurplus ? 'bg-gradient-to-br from-[#0f172a] to-emerald-900/10 border-emerald-500/30' : 'bg-[#0f172a]/80 border-slate-800 hover:border-slate-700'} animate-slide-up`} style={{animationDelay: '100ms'}}>
                {emergencyStats.isSurplus && <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none"></div>}
                
                <div className="flex justify-between items-center mb-6 relative z-10">
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className={`font-bold transition-colors ${emergencyStats.isSurplus ? 'text-emerald-300' : 'text-slate-200'}`}>Emergency Fund</h4>
                            {emergencyStats.isSurplus && (
                                <span className="px-2 py-0.5 bg-emerald-500 text-slate-950 text-[9px] font-black uppercase rounded-md shadow-lg shadow-emerald-500/20 flex items-center gap-1 animate-pulse">
                                    <Award size={10} fill="currentColor" />
                                    Level {emergencyStats.level}
                                </span>
                            )}
                        </div>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-tighter mt-1">{emergencyStats.isSurplus ? 'Surplus Protection Mode' : 'Building Security Base'}</p>
                    </div>
                    <div className="text-right">
                         <span className={`text-xl font-bold ${emergencyStats.isSurplus ? 'text-emerald-400' : 'text-white'}`}>
                             {Math.floor((emergencyStats.liquidCash / emergencyStats.targets.thriving) * 100)}%
                         </span>
                         <span className="text-[10px] font-black text-slate-500 block">FUNDED</span>
                    </div>
                </div>
                
                <div className="mb-6 relative z-10">
                     <div className="h-10 flex rounded-xl overflow-hidden border border-slate-900 bg-slate-950 p-1 relative shadow-inner">
                         {/* BASIC BAR */}
                         <div className={`h-full relative rounded-l-lg ${emergencyStats.isSurplus ? 'bg-emerald-500/30' : 'bg-emerald-900/20'}`} style={{width: `${(emergencyStats.targets.basic / emergencyStats.targets.thriving) * 100}%`}}>
                             <div 
                                className={`absolute top-0 left-0 h-full rounded-l-lg transition-all duration-1000 ease-out bg-emerald-500 ${emergencyStats.isSurplus ? 'animate-[pulse_3s_infinite]' : ''}`} 
                                style={{width: `${(emergencyStats.filled.basic / emergencyStats.targets.basic) * 100}%`}}
                             >
                                 {emergencyStats.isSurplus && <div className="absolute inset-0 bg-white/20 animate-shimmer" style={{backgroundSize: '200% 100%'}}></div>}
                             </div>
                         </div>
                         {/* COMFORT BAR */}
                         <div className={`h-full relative mx-0.5 ${emergencyStats.isSurplus ? 'bg-amber-500/30' : 'bg-amber-900/20'}`} style={{width: `${((emergencyStats.targets.comfort - emergencyStats.targets.basic) / emergencyStats.targets.thriving) * 100}%`}}>
                             <div 
                                className={`absolute top-0 left-0 h-full rounded-sm transition-all duration-1000 ease-out bg-amber-500 ${emergencyStats.isSurplus ? 'animate-[pulse_3s_infinite_200ms]' : ''}`} 
                                style={{width: `${(emergencyStats.filled.comfort / Math.max(1, emergencyStats.targets.comfort - emergencyStats.targets.basic)) * 100}%`}}
                             >
                                 {emergencyStats.isSurplus && <div className="absolute inset-0 bg-white/20 animate-shimmer" style={{backgroundSize: '200% 100%'}}></div>}
                             </div>
                         </div>
                         {/* THRIVE BAR */}
                         <div className={`h-full relative rounded-r-lg ${emergencyStats.isSurplus ? 'bg-purple-500/30' : 'bg-purple-900/20'}`} style={{width: `${((emergencyStats.targets.thriving - emergencyStats.targets.comfort) / emergencyStats.targets.thriving) * 100}%`}}>
                             <div 
                                className={`absolute top-0 left-0 h-full rounded-r-lg transition-all duration-1000 ease-out bg-purple-500 ${emergencyStats.isSurplus ? 'animate-[pulse_3s_infinite_400ms]' : ''}`} 
                                style={{width: `${(emergencyStats.filled.thriving / Math.max(1, emergencyStats.targets.thriving - emergencyStats.targets.comfort)) * 100}%`}}
                             >
                                 {emergencyStats.isSurplus && <div className="absolute inset-0 bg-white/20 animate-shimmer" style={{backgroundSize: '200% 100%'}}></div>}
                             </div>
                         </div>
                     </div>
                     
                     <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-2">
                         <span>{emergencyStats.isSurplus ? `LEVEL ${emergencyStats.level} COMPLETE` : '$0 START'}</span>
                         <span>{emergencyStats.isSurplus ? `FILLING LEVEL ${emergencyStats.level + 1}` : `TARGET ${formatMoney(emergencyStats.targets.thriving)}`}</span>
                     </div>
                </div>

                <div className="grid grid-cols-3 gap-2 relative z-10">
                    <div className={`p-2.5 rounded-xl border text-center transition-all ${emergencyStats.isSurplus ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-slate-900/50 border-slate-800'}`}>
                        <div className="text-[9px] font-black uppercase text-emerald-500 mb-0.5">Basic</div>
                        <div className="text-sm font-black text-white">{Math.floor((emergencyStats.filled.basic / Math.max(1, emergencyStats.targets.basic)) * 100)}%</div>
                    </div>
                    <div className={`p-2.5 rounded-xl border text-center transition-all ${emergencyStats.isSurplus ? 'bg-amber-500/20 border-amber-500/40' : 'bg-slate-900/50 border-slate-800'}`}>
                        <div className="text-[9px] font-black uppercase text-amber-500 mb-0.5">Comfort</div>
                        <div className="text-sm font-black text-white">{Math.floor((emergencyStats.filled.comfort / Math.max(1, emergencyStats.targets.comfort - emergencyStats.targets.basic)) * 100)}%</div>
                    </div>
                    <div className={`p-2.5 rounded-xl border text-center transition-all ${emergencyStats.isSurplus ? 'bg-purple-500/20 border-purple-500/40' : 'bg-slate-900/50 border-slate-800'}`}>
                        <div className="text-[9px] font-black uppercase text-purple-400 mb-0.5">Thrive</div>
                        <div className="text-sm font-black text-white">{Math.floor((emergencyStats.filled.thriving / Math.max(1, emergencyStats.targets.thriving - emergencyStats.targets.comfort)) * 100)}%</div>
                    </div>
                </div>
                
                {/* Global shimmer style for reuse */}
                <style>{`
                    @keyframes shimmer {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                    .animate-shimmer {
                        background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%);
                        animation: shimmer 2s infinite linear;
                    }
                `}</style>
            </div>

            {/* Card 2: Capital Allocation */}
            <div className="bg-[#0f172a]/80 backdrop-blur-md p-6 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 hover:shadow-xl transition-all duration-300 group animate-slide-up" style={{animationDelay: '200ms'}}>
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-slate-200 group-hover:text-purple-400 transition-colors">Capital Allocation</h4>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800 shadow-inner">{dashboardRangeInfo.label}</span>
                </div>

                <div className="flex flex-col gap-4">
                    <div className="h-[150px] w-full">
                        {dashboardAllocationData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={dashboardAllocationData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={45}
                                        outerRadius={65}
                                        paddingAngle={4}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {dashboardAllocationData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip contentStyle={{backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff'}} itemStyle={{color: '#fff'}} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-700 text-xs font-bold italic">No data</div>
                        )}
                    </div>
                    <div className="space-y-3">
                        <div>
                            <div className="flex justify-between text-xs font-bold mb-1">
                                <span className="text-slate-500 uppercase text-[10px]">Needs</span>
                                <span className="text-emerald-400">{formatMoney(dashboardAllocationStats.needs)}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: (dashboardAllocationStats.expense + dashboardAllocationStats.investment) > 0 ? `${(dashboardAllocationStats.needs / (dashboardAllocationStats.expense + dashboardAllocationStats.investment)) * 100}%` : '0%' }}></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs font-bold mb-1">
                                <span className="text-slate-500 uppercase text-[10px]">Wants</span>
                                <span className="text-amber-400">{formatMoney(dashboardAllocationStats.wants)}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                                <div className="h-full bg-amber-500 rounded-full transition-all duration-1000" style={{ width: (dashboardAllocationStats.expense + dashboardAllocationStats.investment) > 0 ? `${(dashboardAllocationStats.wants / (dashboardAllocationStats.expense + dashboardAllocationStats.investment)) * 100}%` : '0%' }}></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs font-bold mb-1">
                                <span className="text-slate-500 uppercase text-[10px]">Invest</span>
                                <span className="text-purple-400">{formatMoney(dashboardAllocationStats.investment)}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                                <div className="h-full bg-purple-500 rounded-full transition-all duration-1000" style={{ width: (dashboardAllocationStats.expense + dashboardAllocationStats.investment) > 0 ? `${(dashboardAllocationStats.investment / (dashboardAllocationStats.expense + dashboardAllocationStats.investment)) * 100}%` : '0%' }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

             {/* Card 3: Wealth Velocity */}
             <div className="bg-[#0f172a]/80 backdrop-blur-md p-6 rounded-2xl border border-slate-800 flex flex-col relative overflow-hidden hover:border-purple-500/40 hover:shadow-xl transition-all duration-300 group animate-slide-up" style={{animationDelay: '300ms'}}>
                 <div className="flex justify-between items-start mb-6 relative z-10">
                    <div>
                        <h4 className="font-bold text-slate-200 group-hover:text-purple-400 transition-colors">Wealth Velocity</h4>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-tighter mt-1">Growth Contribution Rate</p>
                    </div>
                    <div className="p-2.5 bg-purple-500/10 rounded-xl text-purple-400 border border-purple-500/20"><TrendingUp size={20}/></div>
                 </div>

                 <div className="relative z-10 mb-8">
                     <h3 className="text-4xl font-black text-white mb-1">
                         {dashboardRangeKpis.income > 0 ? ((dashboardRangeKpis.investment / dashboardRangeKpis.income) * 100).toFixed(1) : 0}%
                     </h3>
                     <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Efficiency Multiplier</p>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4 relative z-10">
                     <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800 shadow-inner">
                         <p className="text-[9px] uppercase text-slate-500 font-black mb-1">Mo Target</p>
                         <p className="text-sm font-black text-slate-300">{(settings.savingsGoalPercent || 20)}%</p>
                     </div>
                     <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800 shadow-inner">
                         <p className="text-[9px] uppercase text-slate-500 font-black mb-1">Mo Actual</p>
                         <p className="text-sm font-black text-purple-400">{formatMoney(dashboardRangeKpis.investment)}</p>
                     </div>
                 </div>
                 
                 <div className="absolute bottom-0 right-0 w-32 h-32 bg-purple-500/5 blur-3xl pointer-events-none group-hover:bg-purple-500/10 transition-all duration-700"></div>
             </div>
        </div>
      </div>

      {/* 3. CASH FLOW JOURNAL (BAR CHART) */}
      <div className="grid grid-cols-1 gap-6 animate-in slide-in-from-bottom-8 fade-in duration-700 delay-200">
          <div className="bg-[#0f172a]/80 backdrop-blur-md p-6 rounded-3xl border border-slate-800 shadow-xl">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-white font-black uppercase text-xs tracking-widest flex items-center gap-2">
                    <Activity size={18} className="text-emerald-400" /> Cash Flow Momentum
                </h3>
                <div className="flex items-center gap-4">
                    <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800 text-[10px] font-black uppercase tracking-widest">
                        <button
                            onClick={() => setCashFlowMode('FLOW')}
                            className={`px-3 py-1.5 rounded-md transition-all ${cashFlowMode === 'FLOW' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Flow
                        </button>
                        <button
                            onClick={() => setCashFlowMode('SAVINGS')}
                            className={`px-3 py-1.5 rounded-md transition-all ${cashFlowMode === 'SAVINGS' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Savings
                        </button>
                        <button
                            onClick={() => setCashFlowMode('NET_WORTH')}
                            className={`px-3 py-1.5 rounded-md transition-all ${cashFlowMode === 'NET_WORTH' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Net Worth
                        </button>
                    </div>
                    {cashFlowMode === 'FLOW' ? (
                        <div className="flex flex-wrap gap-4 text-[9px] font-black uppercase tracking-tighter">
                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div> Income</div>
                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.4)]"></div> Needs</div>
                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]"></div> Wants</div>
                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-purple-500 shadow-[0_0_8px_rgba(139,92,246,0.4)]"></div> Invest</div>
                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.4)]"></div> Goals</div>
                        </div>
                    ) : cashFlowMode === 'SAVINGS' ? (
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-tighter">
                            <div className="w-2.5 h-2.5 rounded bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.4)]"></div> Savings
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-tighter">
                            <div className="w-2.5 h-2.5 rounded bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.4)]"></div> Net Worth
                        </div>
                    )}
                </div>
              </div>
              <div className="h-[280px] w-full">
                                    {cashFlowData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        {cashFlowMode === 'FLOW' ? (
                            <BarChart data={cashFlowData} barGap={6} barCategoryGap={12}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 11, fontWeight: 700}} padding={{ left: 10, right: 14 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 11, fontWeight: 700}} tickFormatter={(val) => `${val/1000}k`} />
                                <RechartsTooltip content={<CustomTooltip currencySymbol={settings.currencySymbol} />} cursor={{fill: '#1e293b', opacity: 0.2}} />
                                <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
                                <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} minPointSize={3} animationDuration={1000} />
                                <Bar dataKey="needs" name="Needs" stackId="out" fill="#38bdf8" minPointSize={3} animationDuration={1200} />
                                <Bar dataKey="wants" name="Wants" stackId="out" fill="#f59e0b" minPointSize={3} animationDuration={1300} />
                                <Bar dataKey="investment" name="Investment" stackId="out" fill="#8b5cf6" radius={[4, 4, 0, 0]} minPointSize={3} animationDuration={1400} />
                                <Bar dataKey="goals" name="Goals" stackId="out" fill="#f87171" minPointSize={3} animationDuration={1500} />
                            </BarChart>
                        ) : cashFlowMode === 'SAVINGS' ? (
                            <RechartsLineChart data={cashFlowData} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 11, fontWeight: 700}} padding={{ left: 10, right: 14 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 11, fontWeight: 700}} tickFormatter={(val) => `${val/1000}k`} />
                                <RechartsTooltip content={<CustomTooltip currencySymbol={settings.currencySymbol} />} />
                                <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
                                <Line type="monotone" dataKey="savingsTarget" name="Savings Target" stroke="#f59e0b" strokeWidth={1.75} dot={false} strokeDasharray="5 5" />
                                <Line type="monotone" dataKey="savings" name="Savings" stroke="#22d3ee" strokeWidth={2.5} dot={{ r: 3, fill: '#22d3ee' }} activeDot={{ r: 5 }} />
                            </RechartsLineChart>
                        ) : (
                            <AreaChart data={cashFlowData} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="cashFlowNetWorth" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 11, fontWeight: 700}} padding={{ left: 10, right: 14 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 11, fontWeight: 700}} tickFormatter={(val) => `${val/1000}k`} />
                                <RechartsTooltip content={<CustomTooltip currencySymbol={settings.currencySymbol} />} cursor={{stroke: '#3b82f6', strokeWidth: 1.5}} />
                                <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
                                <Area type="monotone" dataKey="endNetWorth" name="Net Worth" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#cashFlowNetWorth)" animationDuration={1600} dot={{ r: 2 }} />
                            </AreaChart>
                        )}
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-2">
                        <Activity size={32} className="opacity-20" />
                        <p className="text-sm font-bold italic">Gathering momentum...</p>
                    </div>
                  )}
              </div>
          </div>
      </div>

      {/* 4. GOALS SECTION */}
      <div className="animate-in slide-in-from-bottom-8 fade-in duration-700 delay-300">
          <div className="flex items-center justify-between mb-6">
              <h3 className="text-white font-bold flex items-center gap-2 text-lg md:text-xl">
                  <Target size={20} className="text-rose-400" /> Savings Goals
              </h3>
              <button onClick={handleOpenNewGoal} className="text-[10px] font-black uppercase tracking-widest bg-slate-900 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-xl border border-slate-800 transition-all flex items-center gap-2 shadow-lg">
                  <Plus size={14} /> New Objective
              </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {goals.map((goal, idx) => {
                  const percent = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
                  return (
                      <div key={goal.id} className="bg-[#0f172a]/80 backdrop-blur-md p-6 rounded-3xl border border-slate-800 group relative hover:border-slate-600 shadow-2xl transition-all duration-300 animate-slide-up" style={{animationDelay: `${idx * 100}ms`}}>
                          <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => handleOpenEditGoal(goal)} className="p-2 text-slate-600 hover:text-emerald-400 bg-slate-950/50 rounded-full border border-slate-800"><Edit2 size={14} /></button>
                              <button onClick={() => handleDeleteGoal(goal.id)} className="p-2 text-slate-600 hover:text-rose-500 bg-slate-950/50 rounded-full border border-slate-800"><Trash2 size={14} /></button>
                          </div>
                          
                          <div className="flex justify-between items-start mb-6">
                              <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-950 border border-slate-800 shadow-inner group-hover:scale-110 transition-transform" style={{color: goal.color, boxShadow: `0 0 15px ${goal.color}20`}}>
                                      <Target size={24} />
                                  </div>
                                  <div>
                                      <h4 className="font-bold text-slate-100 group-hover:text-white transition-colors">{goal.name}</h4>
                                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Target: {formatMoney(goal.targetAmount)}</p>
                                  </div>
                              </div>
                          </div>

                          <div className="mb-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-900 shadow-inner">
                              <div className="flex justify-between text-xs font-bold mb-2">
                                  <span className="text-slate-400 font-mono">{percent.toFixed(0)}%</span>
                                  <span className="text-slate-200 font-mono">{formatMoney(goal.currentAmount)}</span>
                              </div>
                              <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                  <div className="h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden" style={{width: `${percent}%`, backgroundColor: goal.color}}>
                                      <div className="absolute inset-0 bg-white/10 animate-[shimmer_2s_infinite]"></div>
                                  </div>
                              </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={() => db.saveGoal({ ...goal, currentAmount: Math.min(goal.currentAmount + 100, goal.targetAmount) })}
                                    className="py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                                >
                                    + {settings.currencySymbol}100
                                </button>
                                <button 
                                    onClick={() => handleCustomGoalAdd(goal)}
                                    className="py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                                >
                                    Custom
                                </button>
                          </div>
                      </div>
                  );
              })}
          </div>
      </div>

      {/* GOAL MODAL */}
      {showGoalModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
              <div className="bg-[#0f172a] w-full max-w-md rounded-3xl border border-slate-800 p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                  <h2 className="text-2xl font-black text-white mb-8 uppercase tracking-tight">{editingGoalId ? 'Edit Goal' : 'New Asset Objective'}</h2>
                  <div className="space-y-6">
                      <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Objective Name</label>
                          <input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:ring-2 ring-emerald-500/20 shadow-inner" placeholder="e.g. Dream Venture" value={newGoal.name} onChange={e => setNewGoal({...newGoal, name: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Target Amt</label>
                            <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:ring-2 ring-emerald-500/20 shadow-inner" placeholder="0.00" value={newGoal.targetAmount || ''} onChange={e => setNewGoal({...newGoal, targetAmount: parseFloat(e.target.value)})} />
                        </div>
                        <div>
                                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Current Amount</label>
                                                        <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:ring-2 ring-emerald-500/20 shadow-inner" placeholder="0.00" value={newGoal.currentAmount || ''} onChange={e => setNewGoal({...newGoal, currentAmount: parseFloat(e.target.value)})} />
                        </div>
                      </div>
                      <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Visual Indicator</label>
                          <div className="flex justify-between p-2 bg-slate-950 rounded-2xl border border-slate-800">
                              {['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'].map(c => (
                                  <button key={c} onClick={() => setNewGoal({...newGoal, color: c})} className={`w-10 h-10 rounded-xl transition-all hover:scale-110 active:scale-95 ${newGoal.color === c ? 'ring-4 ring-white/10 scale-105' : 'opacity-40'}`} style={{backgroundColor: c}} />
                              ))}
                          </div>
                      </div>
                      <div className="flex gap-4 mt-10">
                                                    <button onClick={() => { setShowGoalModal(false); setEditingGoalId(null); setNewGoal({ name: '', targetAmount: 0, currentAmount: 0, color: '#10B981' }); }} className="flex-1 py-4 text-slate-500 font-black uppercase text-xs tracking-widest hover:text-white transition-colors">Discard</button>
                          <button 
                                                        onClick={() => { 
                                                            if(!newGoal.name || !newGoal.targetAmount) return; 
                                                            const safeCurrent = Math.max(0, Math.min(newGoal.currentAmount || 0, newGoal.targetAmount || 0));
                                                            db.saveGoal({ ...(newGoal as Goal), id: editingGoalId || (newGoal as Goal).id, currentAmount: safeCurrent });
                                                            setShowGoalModal(false);
                                                            setEditingGoalId(null);
                                                            setNewGoal({ name: '', targetAmount: 0, currentAmount: 0, color: '#10B981' }); 
                                                        }} 
                            className="flex-1 py-4 bg-emerald-600 text-slate-950 font-black uppercase text-xs tracking-widest rounded-2xl hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-900/20"
                          >
                                                        {editingGoalId ? 'Save Changes' : 'Activate Goal'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
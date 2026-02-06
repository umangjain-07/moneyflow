
import React, { useEffect, useState, useMemo } from 'react';
import { db, subscribe } from '../services/storage';
import { FinancialHealth, Category, Goal, Transaction, Account, AiInsight } from '../types';
import { TrendingUp, TrendingDown, Wallet, ShieldCheck, Lightbulb, LineChart, Target, Plus, Trash2, Calendar, AlertTriangle, CheckCircle2, ArrowRight, Coffee, Activity, Layers, Zap, Info, Sparkles, BrainCircuit, Lock } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts';
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
  
  const [historyRange, setHistoryRange] = useState<number | 'ALL'>(6);
  const [history, setHistory] = useState<any[]>([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [newGoal, setNewGoal] = useState<Partial<Goal>>({ name: '', targetAmount: 0, currentAmount: 0, color: '#10B981' });

  // AI State
  const [aiInsights, setAiInsights] = useState<AiInsight[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);

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
    
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      // Silently skip if no API key is configured to avoid errors
      return;
    }

    setIsAiLoading(true);
    try {
      // Small delay to ensure network is ready
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const ai = new GoogleGenAI({ apiKey });
      const today = new Date();
      const dayOfMonth = today.getDate();
      
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
      - Liquid Cash: ${health.liquidAssets}
      - Goals: ${goals.map(g => `${g.name}: ${(g.currentAmount/g.targetAmount*100).toFixed(0)}%`).join(', ') || 'No active goals'}
      - Last 5 Activities: ${transactions.slice(0, 5).map(t => `${t.description}: ${t.amount}`).join(', ')}
      
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
      // Only log strictly necessary errors, avoid flooding console for network interruptions
      if (!error.message?.includes('Rpc failed')) {
         console.error("AI Insight Error:", error);
      }
      
      // provide meaningful fallback for user
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

  useEffect(() => {
    loadData();
    const unsubscribe = subscribe(loadData);
    return () => unsubscribe();
  }, [historyRange]);

  // Generate AI insights once on load if data exists
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
                  const val = db.convertAmount(t.amount, acc?.currency || settings.currency, settings.currency);
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
      const lookbackMonths = 12; // Standard 1 year lookback for burn average
      const now = new Date();
      const lookbackDate = new Date();
      lookbackDate.setMonth(lookbackDate.getMonth() - lookbackMonths);
      
      let oldestTxDate = now;
      if (transactions.length > 0) {
          const earliest = transactions.reduce((acc, t) => t.date < acc ? t.date : acc, transactions[0].date);
          oldestTxDate = new Date(earliest);
      }
      const monthsWithData = (now.getFullYear() - oldestTxDate.getFullYear()) * 12 + (now.getMonth() - oldestTxDate.getMonth()) + 1;
      const effectiveDivisor = Math.max(1, Math.min(monthsWithData, lookbackMonths));
      
      let totalNeeds = 0, totalWants = 0, totalInvest = 0;
      transactions.forEach(t => {
          const tDate = new Date(t.date);
          if (tDate >= lookbackDate) {
              const isTransfer = t.categoryId === 'transfer_out' || t.categoryId === 'transfer_in';
              if (isTransfer) return;
              const acc = accounts.find(a => a.id === t.accountId);
              const val = db.convertAmount(t.amount, acc?.currency || settings.currency, settings.currency);
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
      
      const targetBasic = avgNeeds * emergencyMonths;
      const targetComfort = (avgNeeds + avgWants) * emergencyMonths;
      const targetThriving = (avgNeeds + avgWants + avgInvest) * emergencyMonths;
      
      let liquidCash = health.liquidAssets;
      
      const filledBasic = Math.min(liquidCash, targetBasic);
      const filledComfort = Math.max(0, Math.min(liquidCash - targetBasic, targetComfort - targetBasic));
      const filledThriving = Math.max(0, Math.min(liquidCash - targetComfort, targetThriving - targetComfort));
      
      return { 
          liquidCash, 
          targets: { basic: targetBasic, comfort: targetComfort, thriving: targetThriving }, 
          filled: { basic: filledBasic, comfort: filledComfort, thriving: filledThriving } 
      };
  }, [transactions, categories, accounts, settings, health.liquidAssets]);

  const rule503020 = useMemo(() => {
      const { income, expense, invested } = currentMonthStats;
      if (income === 0) return null;
      let needs = 0, wants = 0;
      const now = new Date();
      const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`;
      transactions.forEach(t => {
        const parts = t.date.split(/[^0-9]/);
        if(parts.length >= 2) {
             const txKey = `${parseInt(parts[0])}-${String(parseInt(parts[1])).padStart(2,'0')}`;
             if (txKey === currentKey && t.type === 'EXPENSE') {
                 const cat = categories.find(c => c.id === t.categoryId);
                 const acc = accounts.find(a => a.id === t.accountId);
                 const val = db.convertAmount(t.amount, acc?.currency || settings.currency, settings.currency);
                 if (cat?.necessity === 'NEED') needs += val;
                 else wants += val;
             }
        }
      });
      return { needsPct: (needs / income) * 100, wantsPct: (wants / income) * 100, savingsPct: (invested / income) * 100, needsAmt: needs, wantsAmt: wants };
  }, [currentMonthStats, transactions, categories, accounts, settings.currency]);

  const formatMoney = (val: number) => `${settings.currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const liquidPct = health.netWorth > 0 ? (health.liquidAssets / health.netWorth) * 100 : 0;
  const investedPct = health.netWorth > 0 ? (health.investedAssets / health.netWorth) * 100 : 0;

  return (
    <div className="space-y-6 md:space-y-10 pb-4">
      
      {/* 1. RELOADED NET WORTH HEADER */}
      <div className="border-b border-slate-800/50 pb-10 relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative z-10">
              <div className="w-full md:w-auto">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-slate-400 font-medium text-sm tracking-wide uppercase">Financial Net Worth</p>
                  </div>
                  <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-500">
                      {formatMoney(health.netWorth)}
                  </h1>
                  
                  {/* ASSET BREAKDOWN PROGRESS BAR */}
                  <div className="mt-8 max-w-xl">
                      <div className="flex justify-between items-end mb-2.5">
                          <div className="flex gap-4">
                              <div className="flex flex-col">
                                  <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">Liquid</span>
                                  <span className="text-lg font-bold text-slate-100">{formatMoney(health.liquidAssets)}</span>
                              </div>
                              <div className="w-[1px] h-8 bg-slate-800 self-center"></div>
                              <div className="flex flex-col">
                                  <span className="text-[10px] text-purple-400 font-black uppercase tracking-widest">Invested</span>
                                  <span className="text-lg font-bold text-slate-100">{formatMoney(health.investedAssets)}</span>
                              </div>
                          </div>
                          <span className="text-xs font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                              {liquidPct.toFixed(0)}% Liq / {investedPct.toFixed(0)}% Inv
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
                     <p className={`text-xl md:text-2xl font-black ${currentMonthStats.invested > 0 ? 'text-purple-400' : 'text-slate-700'}`}>
                        {formatMoney(currentMonthStats.invested)}
                     </p>
                 </div>
                 <div className="text-right">
                     <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1.5">Monthly Income</p>
                     <p className="text-xl md:text-2xl font-black text-emerald-400">{formatMoney(currentMonthStats.income)}</p>
                 </div>
              </div>
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
                            <div key={idx} className="group/insight p-5 rounded-2xl bg-slate-950/50 border border-slate-800 hover:border-emerald-500/30 transition-all duration-500">
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
            
            {/* Card 1: Emergency Fund */}
            <div className="bg-[#0f172a]/80 backdrop-blur-md p-6 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 hover:shadow-xl transition-all duration-300 group">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h4 className="font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">Emergency Fund</h4>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-tighter mt-1">Months of Resilience</p>
                    </div>
                    <div className="px-3 py-1 bg-slate-900 rounded-full border border-slate-800 shadow-inner">
                        <span className="text-[10px] font-black text-slate-400">TARGET: {settings.emergencyFundTargetMonths || 6}M</span>
                    </div>
                </div>
                
                <div className="mb-6">
                     <div className="h-10 flex rounded-xl overflow-hidden border border-slate-900 bg-slate-950 p-1 relative shadow-inner">
                         <div className="h-full bg-emerald-900/20 relative rounded-l-lg" style={{width: `${(emergencyStats.targets.basic / emergencyStats.targets.thriving) * 100}%`}}>
                             <div className="absolute top-0 left-0 h-full bg-emerald-500 rounded-l-lg transition-all duration-1000 ease-out" style={{width: `${(emergencyStats.filled.basic / emergencyStats.targets.basic) * 100}%`}}></div>
                         </div>
                         <div className="h-full bg-amber-900/20 relative mx-0.5" style={{width: `${((emergencyStats.targets.comfort - emergencyStats.targets.basic) / emergencyStats.targets.thriving) * 100}%`}}>
                             <div className="absolute top-0 left-0 h-full bg-amber-500 transition-all duration-1000 ease-out" style={{width: `${(emergencyStats.filled.comfort / Math.max(1, emergencyStats.targets.comfort - emergencyStats.targets.basic)) * 100}%`}}></div>
                         </div>
                         <div className="h-full bg-purple-900/20 relative rounded-r-lg" style={{width: `${((emergencyStats.targets.thriving - emergencyStats.targets.comfort) / emergencyStats.targets.thriving) * 100}%`}}>
                             <div className="absolute top-0 left-0 h-full bg-purple-500 rounded-r-lg transition-all duration-1000 ease-out" style={{width: `${(emergencyStats.filled.thriving / Math.max(1, emergencyStats.targets.thriving - emergencyStats.targets.comfort)) * 100}%`}}></div>
                         </div>
                     </div>
                     <div className="flex justify-between text-[10px] font-mono text-slate-600 mt-2">
                         <span>$0 BASE</span>
                         <span>THRIVE {formatMoney(emergencyStats.targets.thriving)}</span>
                     </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800 text-center">
                        <div className="text-[9px] font-black uppercase text-emerald-500 mb-0.5">Basic</div>
                        <div className="text-sm font-black text-white">{Math.floor((emergencyStats.filled.basic / Math.max(1, emergencyStats.targets.basic)) * 100)}%</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800 text-center">
                        <div className="text-[9px] font-black uppercase text-amber-500 mb-0.5">Comf</div>
                        <div className="text-sm font-black text-white">{Math.floor((emergencyStats.filled.comfort / Math.max(1, emergencyStats.targets.comfort - emergencyStats.targets.basic)) * 100)}%</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800 text-center">
                        <div className="text-[9px] font-black uppercase text-purple-400 mb-0.5">Thrive</div>
                        <div className="text-sm font-black text-white">{Math.floor((emergencyStats.filled.thriving / Math.max(1, emergencyStats.targets.thriving - emergencyStats.targets.comfort)) * 100)}%</div>
                    </div>
                </div>
            </div>

            {/* Card 2: 50/30/20 Rule */}
            <div className="bg-[#0f172a]/80 backdrop-blur-md p-6 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 hover:shadow-xl transition-all duration-300 group">
                <div className="flex justify-between items-center mb-6">
                    <h4 className="font-bold text-slate-200 group-hover:text-blue-400 transition-colors">Burn Allocation</h4>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800 shadow-inner">Monthly Flow</span>
                </div>

                {rule503020 ? (
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-xs font-bold mb-1.5">
                                <span className="text-slate-500 uppercase text-[10px]">Needs (50%)</span>
                                <span className={rule503020.needsPct > 55 ? 'text-rose-400' : 'text-emerald-400'}>{rule503020.needsPct.toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                                <div className={`h-full rounded-full transition-all duration-1000 ease-out ${rule503020.needsPct > 55 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{width: `${Math.min(100, rule503020.needsPct)}%`}} />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs font-bold mb-1.5">
                                <span className="text-slate-500 uppercase text-[10px]">Wants (30%)</span>
                                <span className={rule503020.wantsPct > 35 ? 'text-rose-400' : 'text-amber-400'}>{rule503020.wantsPct.toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                                <div className={`h-full rounded-full transition-all duration-1000 ease-out ${rule503020.wantsPct > 35 ? 'bg-rose-500' : 'bg-amber-500'}`} style={{width: `${Math.min(100, rule503020.wantsPct)}%`}} />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs font-bold mb-1.5">
                                <span className="text-slate-500 uppercase text-[10px]">Invest ({(settings.savingsGoalPercent || 20)}%)</span>
                                <span className={rule503020.savingsPct < (settings.savingsGoalPercent || 20) ? 'text-rose-400' : 'text-purple-400'}>{rule503020.savingsPct.toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                                <div className={`h-full rounded-full transition-all duration-1000 ease-out ${rule503020.savingsPct < (settings.savingsGoalPercent || 20) ? 'bg-rose-500' : 'bg-purple-500'}`} style={{width: `${Math.min(100, rule503020.savingsPct)}%`}} />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-700 text-xs font-bold italic">
                        Input income to unlock breakdown
                    </div>
                )}
            </div>

             {/* Card 3: Wealth Velocity */}
             <div className="bg-[#0f172a]/80 backdrop-blur-md p-6 rounded-2xl border border-slate-800 flex flex-col relative overflow-hidden hover:border-purple-500/40 hover:shadow-xl transition-all duration-300 group">
                 <div className="flex justify-between items-start mb-6 relative z-10">
                    <div>
                        <h4 className="font-bold text-slate-200 group-hover:text-purple-400 transition-colors">Wealth Velocity</h4>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-tighter mt-1">Growth Contribution Rate</p>
                    </div>
                    <div className="p-2.5 bg-purple-500/10 rounded-xl text-purple-400 border border-purple-500/20"><TrendingUp size={20}/></div>
                 </div>

                 <div className="relative z-10 mb-8">
                     <h3 className="text-4xl font-black text-white mb-1">
                         {currentMonthStats.income > 0 ? ((currentMonthStats.invested / currentMonthStats.income) * 100).toFixed(1) : 0}%
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
                         <p className="text-sm font-black text-purple-400">{formatMoney(currentMonthStats.invested)}</p>
                     </div>
                 </div>
                 
                 <div className="absolute bottom-0 right-0 w-32 h-32 bg-purple-500/5 blur-3xl pointer-events-none group-hover:bg-purple-500/10 transition-all duration-700"></div>
             </div>
        </div>
      </div>

      {/* 3. CASH FLOW JOURNAL (BAR CHART) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-8 fade-in duration-700 delay-200">
          <div className="lg:col-span-2 bg-[#0f172a]/80 backdrop-blur-md p-6 rounded-3xl border border-slate-800 shadow-xl">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-white font-black uppercase text-xs tracking-widest flex items-center gap-2">
                    <Activity size={18} className="text-emerald-400" /> Cash Flow Momentum
                </h3>
                <div className="flex gap-4 text-[9px] font-black uppercase tracking-tighter">
                     <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div> Income</div>
                     <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"></div> Burn</div>
                     <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-purple-500 shadow-[0_0_8px_rgba(139,92,246,0.4)]"></div> Growth</div>
                </div>
              </div>
              <div className="h-[280px] w-full">
                  {history.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={history} barGap={6}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 11, fontWeight: 700}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 11, fontWeight: 700}} tickFormatter={(val) => `${val/1000}k`} />
                            <RechartsTooltip content={<CustomTooltip currencySymbol={settings.currencySymbol} />} cursor={{fill: '#1e293b', opacity: 0.2}} />
                            <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={1000} />
                            <Bar dataKey="expense" name="Expense" stackId="out" fill="#f43f5e" animationDuration={1200} />
                            <Bar dataKey="investment" name="Investment" stackId="out" fill="#8b5cf6" radius={[4, 4, 0, 0]} animationDuration={1400} />
                        </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-2">
                        <Activity size={32} className="opacity-20" />
                        <p className="text-sm font-bold italic">Gathering momentum...</p>
                    </div>
                  )}
              </div>
          </div>
          
          <div className="lg:col-span-1 bg-[#0f172a]/80 backdrop-blur-md p-6 rounded-3xl border border-slate-800 flex flex-col shadow-xl">
              <div className="flex justify-between items-center mb-8">
                  <h3 className="text-white font-black uppercase text-xs tracking-widest flex items-center gap-2">
                      <LineChart size={18} className="text-blue-400" /> NW Trajectory
                  </h3>
                   <select 
                    className="bg-slate-900 border border-slate-800 text-[10px] font-black uppercase tracking-widest rounded-lg px-3 py-1.5 text-slate-400 outline-none hover:border-slate-700 transition-all cursor-pointer shadow-inner appearance-none"
                    value={historyRange}
                    onChange={(e) => setHistoryRange(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value))}
                  >
                      <option value="6">Last 6M</option>
                      <option value="12">Last 1Y</option>
                      <option value="ALL">Total View</option>
                  </select>
              </div>
              <div className="flex-1 min-h-[220px]">
                 {history.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={history}>
                            <defs>
                                <linearGradient id="colorNw" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} horizontal={false} />
                            <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 10, fontWeight: 700}} interval="preserveStartEnd" minTickGap={20} />
                            <YAxis hide domain={['auto', 'auto']} />
                            <RechartsTooltip content={<CustomTooltip currencySymbol={settings.currencySymbol} />} cursor={{stroke: '#3b82f6', strokeWidth: 1.5}} />
                            <Area type="monotone" dataKey="endNetWorth" name="Net Worth" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorNw)" animationDuration={2000} />
                        </AreaChart>
                    </ResponsiveContainer>
                 ) : (
                    <div className="h-full flex items-center justify-center text-slate-800 text-xs font-black italic">Awaiting data points</div>
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
              <button onClick={() => setShowGoalModal(true)} className="text-[10px] font-black uppercase tracking-widest bg-slate-900 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-xl border border-slate-800 transition-all flex items-center gap-2 shadow-lg">
                  <Plus size={14} /> New Objective
              </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {goals.map(goal => {
                  const percent = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
                  return (
                      <div key={goal.id} className="bg-[#0f172a]/80 backdrop-blur-md p-6 rounded-3xl border border-slate-800 group relative hover:border-slate-600 shadow-2xl transition-all duration-300">
                          <button onClick={() => handleDeleteGoal(goal.id)} className="absolute top-4 right-4 p-2 text-slate-600 hover:text-rose-500 bg-slate-950/50 rounded-full border border-slate-800 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14} /></button>
                          
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
                                    onClick={() => db.saveGoal({ ...goal, currentAmount: Math.min(goal.currentAmount + 1000, goal.targetAmount) })}
                                    className="py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                                >
                                    + {settings.currencySymbol}1k
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
                  <h2 className="text-2xl font-black text-white mb-8 uppercase tracking-tight">New Asset Objective</h2>
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
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Initial Base</label>
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
                          <button onClick={() => setShowGoalModal(false)} className="flex-1 py-4 text-slate-500 font-black uppercase text-xs tracking-widest hover:text-white transition-colors">Discard</button>
                          <button 
                            onClick={() => { if(!newGoal.name || !newGoal.targetAmount) return; db.saveGoal(newGoal as Goal); setShowGoalModal(false); setNewGoal({ name: '', targetAmount: 0, currentAmount: 0, color: '#10B981' }); }} 
                            className="flex-1 py-4 bg-emerald-600 text-slate-950 font-black uppercase text-xs tracking-widest rounded-2xl hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-900/20"
                          >
                            Activate Goal
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

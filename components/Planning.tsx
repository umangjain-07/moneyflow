
import React, { useState, useEffect, useMemo } from 'react';
import { db, subscribe } from '../services/storage';
import { Transaction, Category, Account, FinancialPlan, CategoryBudgetConfig, BudgetTemplate } from '../types';
import { Calendar, Target, Edit2, Save, Trash2, Plus, ArrowRight, CheckCircle2, AlertTriangle, Shield, Wallet, DollarSign, X, Lock, ShoppingBag, PieChart, Sliders, TrendingUp, ChevronDown, Calculator, Briefcase, Zap, Sparkles, Repeat, Clock, Receipt, CreditCard, ChevronLeft, ChevronRight, History, Globe, RotateCcw, Settings2, Copy, BookTemplate, SaveAll, LayoutTemplate, MousePointerClick, Check, CalendarRange, PenTool, LayoutDashboard, ArrowDown, Power, Filter, Infinity, Gem, ToggleLeft, ToggleRight } from 'lucide-react';

export const Planning: React.FC = () => {
  const [settings, setSettings] = useState(db.getSettings());
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  // Plan State
  const [plan, setPlan] = useState<FinancialPlan | null>(null);

  // View State
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'STRATEGY'>('DASHBOARD');
  const [historyDate, setHistoryDate] = useState(new Date());
  const [dashboardView, setDashboardView] = useState<'MONTH' | 'YEAR' | 'ALL'>('MONTH');

  // --- STRATEGY EDITOR STATE ---
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [draftTemplate, setDraftTemplate] = useState<BudgetTemplate | null>(null);
  const [draftName, setDraftName] = useState('');
  const [historyStats, setHistoryStats] = useState<Record<string, number>>({}); // Avg spending per cat
  const [saveSuccess, setSaveSuccess] = useState(false);

  // --- CREATE MODAL STATE ---
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPlanData, setNewPlanData] = useState({ name: '', salary: 0, savingsGoal: 0 });
  const [createAsGlobal, setCreateAsGlobal] = useState(false);

  const DAYS_IN_MONTH = 30; 
  const MONTHS_IN_YEAR = 12;

  // 1. Data Loading (Pure Data Fetching, No UI State Side Effects)
  const loadData = () => {
    setSettings(db.getSettings());
    const cats = db.getCategories();
    setCategories(cats);
    setTransactions(db.getTransactions());
    setAccounts(db.getAccounts());
    
    // Calculate Historical Averages
    const txs = db.getTransactions();
    const catMonthMap: Record<string, Record<string, number>> = {};
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    txs.forEach(t => {
        const d = new Date(t.date);
        if (d >= oneYearAgo && (t.type === 'EXPENSE' || t.type === 'INVESTMENT')) {
             const monthKey = t.date.substring(0, 7);
             if (!catMonthMap[t.categoryId]) catMonthMap[t.categoryId] = {};
             catMonthMap[t.categoryId][monthKey] = (catMonthMap[t.categoryId][monthKey] || 0) + t.amount;
        }
    });

    const stats: Record<string, number> = {};
    Object.keys(catMonthMap).forEach(catId => {
        const months = Object.values(catMonthMap[catId]);
        const total = months.reduce((sum, val) => sum + val, 0);
        stats[catId] = months.length > 0 ? Math.round(total / months.length) : 0;
    });
    setHistoryStats(stats);

    const existingPlan = db.getPlan();
    if (existingPlan) {
        setPlan(existingPlan);
        // Note: Auto-selection logic moved to useEffect to prevent stale-closure resets
    } else {
        // Init minimal plan if none exists
        const initialPlan: FinancialPlan = {
            salary: 0, savingsGoal: 0, startDate: new Date().toISOString(), endDate: new Date().toISOString(),
            categoryConfigs: [], monthlyOverrides: {}, budgetTemplates: []
        };
        db.savePlan(initialPlan);
        setPlan(initialPlan);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = subscribe(loadData);
    return () => unsubscribe();
  }, []);

  // 2. Selection Logic (Runs only when plan changes and selection is empty)
  useEffect(() => {
      if (plan && !selectedTemplateId) {
          if (plan.activeTemplateId) {
              setSelectedTemplateId(plan.activeTemplateId);
          } else if (plan.budgetTemplates && plan.budgetTemplates.length > 0) {
              setSelectedTemplateId(plan.budgetTemplates[0].id);
          }
      }
  }, [plan, selectedTemplateId]);

  // Sync Draft when Selection Changes
  useEffect(() => {
      if (!plan || !selectedTemplateId) {
          setDraftTemplate(null);
          return;
      }

      const found = plan.budgetTemplates?.find(t => t.id === selectedTemplateId);
      if (found) {
          // Deep copy to allow editing without immediate save
          // Merge with current categories to ensure all cats are present
          const validCats = categories.filter(c => c.type !== 'INCOME');
          const mergedConfigs = validCats.map(c => {
              const existing = found.configs.find(conf => conf.categoryId === c.id);
              if (existing) return { ...existing };
              return {
                  categoryId: c.id,
                  type: c.type === 'INVESTMENT' ? 'FIXED' : (c.necessity === 'NEED' ? 'FIXED' : 'VARIABLE'),
                  allocatedAmount: historyStats[c.id] || 0,
                  period: c.defaultFrequency || 'MONTHLY_NET'
              } as CategoryBudgetConfig;
          });

          setDraftTemplate({ ...found, configs: mergedConfigs });
          setDraftName(found.name);
      }
  }, [selectedTemplateId, plan, categories.length]); 

  const calculateProjection = (template: BudgetTemplate | null) => {
      if (!template) return { income: 0, fixed: 0, variable: 0, oneTime: 0, savings: 0, balance: 0 };
      
      const income = template.salary;
      const savings = template.savingsGoal;
      
      let fixed = 0, variable = 0, oneTime = 0;
      
      template.configs.forEach(c => {
          if (c.type === 'IGNORE') return;

          // Normalize to monthly for projection
          const monthlyAmount = c.period === 'DAILY' ? c.allocatedAmount * 30 :
                                c.period === 'YEARLY' ? c.allocatedAmount / 12 :
                                c.allocatedAmount;

          if (c.type === 'FIXED') {
              // ALL Fixed items go here, regardless of frequency
              fixed += monthlyAmount;
          } else if (c.type === 'VARIABLE') {
              // Variable items split based on frequency
              if (c.period === 'MONTHLY_ONCE' || c.period === 'YEARLY') {
                  oneTime += monthlyAmount;
              } else {
                  variable += monthlyAmount;
              }
          }
      });
      
      return {
          income,
          fixed,
          variable,
          oneTime,
          savings,
          balance: income - savings - fixed - variable - oneTime
      };
  };

  const projection = useMemo(() => calculateProjection(draftTemplate), [draftTemplate]);

  // --- LOGIC HELPERS ---

  const getActiveConfigs = (targetDate: Date) => {
      if (!plan) return [];
      const monthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
      
      const override = plan.monthlyOverrides?.[monthKey];
      
      // 1. Check Linked Template
      if (override?.linkedTemplateId && plan.budgetTemplates) {
          const linkedTemplate = plan.budgetTemplates.find(t => t.id === override.linkedTemplateId);
          if (linkedTemplate) return linkedTemplate.configs;
      }

      // 2. Check Manual Override
      if (override && override.configs.length > 0) return override.configs;

      // 3. Fallback to Active Global Template
      if (plan.activeTemplateId && plan.budgetTemplates) {
          const globalTemplate = plan.budgetTemplates.find(t => t.id === plan.activeTemplateId);
          if (globalTemplate) return globalTemplate.configs;
      }

      return plan.categoryConfigs;
  };

  const getActivePlanMeta = (targetDate: Date) => {
      if (!plan) return { label: 'No Plan', type: 'NONE' };
      const monthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
      const override = plan.monthlyOverrides?.[monthKey];

      if (override?.linkedTemplateId) {
          const t = plan.budgetTemplates?.find(x => x.id === override.linkedTemplateId);
          return { label: t?.name || 'Unknown Linked', type: 'LINKED', id: override.linkedTemplateId };
      }
      if (override) return { label: override.label || 'Custom Override', type: 'MANUAL', id: null };
      
      if (plan.activeTemplateId) {
          const t = plan.budgetTemplates?.find(x => x.id === plan.activeTemplateId);
          return { label: t?.name || 'Global Default', type: 'GLOBAL', id: plan.activeTemplateId };
      }

      return { label: 'Baseline', type: 'BASE' };
  };

  // --- ACTIONS ---

  const handleCreateTemplate = () => {
      setNewPlanData({ name: '', salary: 0, savingsGoal: 0 });
      setCreateAsGlobal(false);
      setIsCreateModalOpen(true);
  };

  const handleConfirmCreate = () => {
      if (!newPlanData.name) {
          alert("Please enter a name for your strategy.");
          return;
      }
      
      const newId = Date.now().toString();
      const currentPlan = plan || db.getPlan() || {
        salary: 0, savingsGoal: 0, startDate: new Date().toISOString(), endDate: new Date().toISOString(),
        categoryConfigs: [], monthlyOverrides: {}, budgetTemplates: []
      };

      const currentCats = categories.length > 0 ? categories : db.getCategories();
      const validCats = currentCats.filter(c => c.type !== 'INCOME');

      const initialConfigs = validCats.map(c => ({
          categoryId: c.id,
          type: c.type === 'INVESTMENT' ? 'FIXED' : (c.necessity === 'NEED' ? 'FIXED' : 'VARIABLE'),
          allocatedAmount: historyStats[c.id] || 0,
          period: c.defaultFrequency || 'MONTHLY_NET'
      } as CategoryBudgetConfig));

      const newTemplate: BudgetTemplate = {
          id: newId,
          name: newPlanData.name,
          salary: newPlanData.salary,
          savingsGoal: newPlanData.savingsGoal,
          configs: initialConfigs
      };

      const updatedPlan = {
          ...currentPlan,
          budgetTemplates: [...(currentPlan.budgetTemplates || []), newTemplate],
          activeTemplateId: createAsGlobal ? newId : currentPlan.activeTemplateId
      };
      
      db.savePlan(updatedPlan);
      setPlan(updatedPlan);
      setSelectedTemplateId(newId);
      setIsCreateModalOpen(false);
  };

  const handleSaveDraft = () => {
      if (!plan || !draftTemplate) return;
      
      const updatedTemplates = plan.budgetTemplates?.map(t => 
          t.id === draftTemplate.id ? { ...draftTemplate, name: draftName } : t
      ) || [];

      const updatedPlan = { ...plan, budgetTemplates: updatedTemplates };
      db.savePlan(updatedPlan);
      setPlan(updatedPlan);
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleDeleteTemplate = () => {
      if (!plan || !selectedTemplateId) return;
      if (!confirm("Delete this plan? Months linked to it will revert to the Global Default.")) return;

      const updatedTemplates = plan.budgetTemplates?.filter(t => t.id !== selectedTemplateId) || [];
      const newOverrides = { ...plan.monthlyOverrides };
      Object.keys(newOverrides).forEach(k => {
          if (newOverrides[k].linkedTemplateId === selectedTemplateId) {
              delete newOverrides[k]; 
          }
      });

      const updatedPlan = { 
          ...plan, 
          budgetTemplates: updatedTemplates, 
          monthlyOverrides: newOverrides,
          activeTemplateId: plan.activeTemplateId === selectedTemplateId ? (updatedTemplates[0]?.id || '') : plan.activeTemplateId
      };
      
      db.savePlan(updatedPlan);
      setPlan(updatedPlan);
      setSelectedTemplateId(updatedTemplates[0]?.id || null);
  };

  const handleConfigChange = (catId: string, field: keyof CategoryBudgetConfig, value: any) => {
      if (!draftTemplate) return;
      setDraftTemplate({
          ...draftTemplate,
          configs: draftTemplate.configs.map(c => c.categoryId === catId ? { ...c, [field]: value } : c)
      });
  };

  const handlePeriodToggle = (catId: string) => {
    if (!draftTemplate) return;
    const conf = draftTemplate.configs.find(c => c.categoryId === catId);
    if(!conf) return;
    
    const next = conf.period === 'DAILY' ? 'MONTHLY_NET' :
                 conf.period === 'MONTHLY_NET' ? 'MONTHLY_ONCE' :
                 conf.period === 'MONTHLY_ONCE' ? 'YEARLY' : 'DAILY';
    
    handleConfigChange(catId, 'period', next);
  };

  // --- BULK ASSIGNMENT LOGIC ---
  const handleAssignMonth = (monthKey: string) => {
      if (!plan || !selectedTemplateId) return;
      
      const newOverrides = { ...(plan.monthlyOverrides || {}) };
      
      // Force Assign - "Paint" logic
      newOverrides[monthKey] = {
          configs: [], 
          label: draftName,
          linkedTemplateId: selectedTemplateId
      };

      const updatedPlan = { ...plan, monthlyOverrides: newOverrides };
      db.savePlan(updatedPlan);
      // NOTE: We update local state immediately. 
      // The subsequent 'loadData' from subscription will effectively be a no-op 
      // regarding selection because we removed the selection reset logic.
      setPlan(updatedPlan);
  };

  const handleRevertMonth = (monthKey: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!plan) return;
      const newOverrides = { ...(plan.monthlyOverrides || {}) };
      delete newOverrides[monthKey];
      const updatedPlan = { ...plan, monthlyOverrides: newOverrides };
      db.savePlan(updatedPlan);
      setPlan(updatedPlan);
  };

  const handleSetGlobal = () => {
      if (!plan || !selectedTemplateId) return;
      const updatedPlan = { ...plan, activeTemplateId: selectedTemplateId };
      db.savePlan(updatedPlan);
      setPlan(updatedPlan);
  };

  // --- RENDER HELPERS ---
  const formatMoney = (val: number) => `${settings.currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const renderConfigRow = (conf: CategoryBudgetConfig) => {
      const cat = categories.find(c => c.id === conf.categoryId);
      if (!cat) return null;
      
      const displayValue = conf.period === 'DAILY' ? conf.allocatedAmount / DAYS_IN_MONTH :
                           conf.period === 'YEARLY' ? conf.allocatedAmount * MONTHS_IN_YEAR : conf.allocatedAmount;

      const isIgnored = conf.type === 'IGNORE';

      return (
          <div key={conf.categoryId} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${isIgnored ? 'bg-slate-950/30 border-slate-800/50 opacity-60' : 'bg-slate-900/50 border-slate-800 hover:border-slate-600'}`}>
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-lg">{cat.icon}</div>
              <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm truncate ${isIgnored ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{cat.name}</p>
                  <p className="text-[10px] text-slate-500">{conf.period.replace(/_/g, ' ')}</p>
              </div>
              
              <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-800">
                  {(['FIXED', 'VARIABLE', 'IGNORE'] as const).map(t => (
                      <button 
                        key={t}
                        onClick={() => handleConfigChange(conf.categoryId, 'type', t)}
                        className={`px-2 py-1 rounded-md text-[9px] font-bold ${
                            conf.type === t 
                            ? (t==='FIXED' ? 'bg-rose-500 text-white' : t==='VARIABLE' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300') 
                            : 'text-slate-600'
                        }`}
                      >
                          {t === 'IGNORE' ? 'SKIP' : t[0]}
                      </button>
                  ))}
              </div>

              <div className={`flex items-center w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 ${isIgnored ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input 
                    type="number" 
                    value={displayValue} 
                    onChange={(e) => {
                        const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                        const final = conf.period === 'DAILY' ? val * DAYS_IN_MONTH : 
                                      conf.period === 'YEARLY' ? val / MONTHS_IN_YEAR : val;
                        handleConfigChange(conf.categoryId, 'allocatedAmount', final);
                    }}
                    className="w-full bg-transparent text-xs text-right text-white outline-none py-1.5"
                    placeholder="0"
                  />
              </div>

              <button onClick={() => handlePeriodToggle(conf.categoryId)} className="p-1.5 bg-slate-800 rounded-lg text-slate-400 hover:text-white">
                  <Repeat size={14} />
              </button>
          </div>
      );
  };

  const renderDashboardConfigSection = (configs: CategoryBudgetConfig[], relevantTxs: Transaction[], multiplier: number) => {
      if (configs.length === 0) return null;

      return (
          <div className="space-y-3">
                 {configs.map(conf => {
                    const cat = categories.find(c => c.id === conf.categoryId);
                    const spent = relevantTxs.filter(t => t.categoryId === conf.categoryId).reduce((s,t) => s + db.convertAmount(t.amount, accounts.find(a=>a.id===t.accountId)?.currency||settings.currency, settings.currency), 0);
                    
                    const target = conf.allocatedAmount * multiplier;
                    const pct = target > 0 ? Math.min(100, (spent / target) * 100) : (spent > 0 ? 100 : 0);
                    const isOver = spent > target;
                    // Tolerance for floating point exact match (within 1 unit)
                    const isExact = Math.abs(spent - target) < 1; 

                    const colorClass = isExact ? 'bg-yellow-500' : isOver ? 'bg-rose-500' : 'bg-emerald-500';
                    const textClass = isExact ? 'text-yellow-500' : isOver ? 'text-rose-500' : 'text-emerald-500';

                    return (
                        <div key={conf.categoryId} className="flex items-center gap-4 p-3 rounded-xl border border-slate-800 bg-slate-900/20 hover:bg-slate-900/40 transition-colors">
                            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center text-lg shadow-sm border border-slate-800">{cat?.icon}</div>
                            <div className="flex-1">
                                <div className="flex justify-between mb-1">
                                    <span className="text-sm font-bold text-slate-200">{cat?.name}</span>
                                    <span className={`text-xs font-mono font-bold ${textClass}`}>
                                        {formatMoney(spent)} <span className="text-slate-600">/ {formatMoney(target)}</span>
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${colorClass}`} style={{width: `${pct}%`}}></div>
                                </div>
                            </div>
                        </div>
                    );
                 })}
          </div>
      );
  };

  const renderDashboard = () => {
      if (!plan) return <div className="p-10 text-center text-slate-500">Initializing...</div>;

      const activeConfigs = getActiveConfigs(historyDate);
      const planMeta = getActivePlanMeta(historyDate);

      let startOfPeriod = '', endOfPeriod = '';
      let budgetMultiplier = 1;

      if (dashboardView === 'MONTH') {
          startOfPeriod = new Date(historyDate.getFullYear(), historyDate.getMonth(), 1).toISOString().split('T')[0];
          endOfPeriod = new Date(historyDate.getFullYear(), historyDate.getMonth() + 1, 0).toISOString().split('T')[0];
          budgetMultiplier = 1;
      } else if (dashboardView === 'YEAR') {
          startOfPeriod = new Date(historyDate.getFullYear(), 0, 1).toISOString().split('T')[0];
          endOfPeriod = new Date(historyDate.getFullYear(), 11, 31).toISOString().split('T')[0];
          budgetMultiplier = 12;
      } else {
          // ALL TIME
          if (transactions.length > 0) {
              const earliest = transactions.reduce((acc, t) => t.date < acc ? t.date : acc, transactions[0].date);
              startOfPeriod = earliest;
          } else {
              startOfPeriod = new Date().toISOString().split('T')[0];
          }
          endOfPeriod = new Date().toISOString().split('T')[0];
          
          const startD = new Date(startOfPeriod);
          const endD = new Date(endOfPeriod);
          const months = (endD.getFullYear() - startD.getFullYear()) * 12 + (endD.getMonth() - startD.getMonth()) + 1;
          budgetMultiplier = Math.max(1, months);
      }

      const monthlyIncome = plan.budgetTemplates?.find(t => t.id === planMeta.id)?.salary || plan.salary;
      const monthlySavings = plan.budgetTemplates?.find(t => t.id === planMeta.id)?.savingsGoal || plan.savingsGoal;
      
      const totalIncome = monthlyIncome * budgetMultiplier;
      const totalSavings = monthlySavings * budgetMultiplier;
      
      const activeDisplayConfigs = activeConfigs.filter(c => c.type !== 'IGNORE');
      
      // STRICT GROUPING RULES:
      // Fixed: Type FIXED (Any period).
      // Variable: Type VARIABLE and NOT (Monthly Once OR Yearly).
      // OneTime: Type VARIABLE and (Monthly Once OR Yearly).
      const fixedGroup = activeDisplayConfigs.filter(c => c.type === 'FIXED');
      const variableGroup = activeDisplayConfigs.filter(c => c.type === 'VARIABLE' && c.period !== 'MONTHLY_ONCE' && c.period !== 'YEARLY');
      const oneTimeGroup = activeDisplayConfigs.filter(c => c.type === 'VARIABLE' && (c.period === 'MONTHLY_ONCE' || c.period === 'YEARLY'));

      const totalFixedBudget = fixedGroup.reduce((s, c) => s + c.allocatedAmount, 0) * budgetMultiplier;
      const totalVariableBudget = variableGroup.reduce((s, c) => s + c.allocatedAmount, 0) * budgetMultiplier;
      const totalOneTimeBudget = oneTimeGroup.reduce((s, c) => s + c.allocatedAmount, 0) * budgetMultiplier;
      
      const totalAllocated = totalFixedBudget + totalVariableBudget + totalOneTimeBudget;
      const unallocated = totalIncome - totalSavings - totalAllocated;

      const relevantTxs = transactions.filter(t => t.date >= startOfPeriod && t.date <= endOfPeriod && (t.type === 'EXPENSE' || t.type === 'INVESTMENT'));
      const totalSpent = relevantTxs.reduce((s, t) => s + db.convertAmount(t.amount, accounts.find(a=>a.id===t.accountId)?.currency || settings.currency, settings.currency), 0);

      return (
          <div className="space-y-6 animate-in fade-in">
               <div className="flex flex-col md:flex-row justify-between items-center bg-[#0f172a] p-4 rounded-2xl border border-slate-800 gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                        <button onClick={() => setHistoryDate(new Date(historyDate.setMonth(historyDate.getMonth() - 1)))} disabled={dashboardView === 'ALL'} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 disabled:opacity-30"><ChevronLeft size={20}/></button>
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-white">
                                {dashboardView === 'MONTH' 
                                    ? historyDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) 
                                    : dashboardView === 'YEAR' ? historyDate.getFullYear() : 'All Time History'}
                            </h2>
                            {dashboardView !== 'ALL' && (
                                <div className="flex items-center justify-center gap-2 mt-1">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${
                                        planMeta.type === 'LINKED' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' :
                                        planMeta.type === 'GLOBAL' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                        'bg-slate-800 text-slate-400 border-slate-700'
                                    }`}>
                                        {planMeta.label}
                                    </span>
                                    {planMeta.type === 'LINKED' && <Globe size={10} className="text-indigo-400"/>}
                                </div>
                            )}
                        </div>
                        <button onClick={() => setHistoryDate(new Date(historyDate.setMonth(historyDate.getMonth() + 1)))} disabled={dashboardView === 'ALL'} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 disabled:opacity-30"><ChevronRight size={20}/></button>
                    </div>

                    <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                        <button 
                            onClick={() => setDashboardView('MONTH')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${dashboardView === 'MONTH' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Monthly
                        </button>
                        <button 
                            onClick={() => setDashboardView('YEAR')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${dashboardView === 'YEAR' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Yearly
                        </button>
                        <button 
                            onClick={() => setDashboardView('ALL')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${dashboardView === 'ALL' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Infinity size={12} /> All Time
                        </button>
                    </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800">
                        <p className="text-xs text-slate-500 font-bold uppercase mb-1">{dashboardView === 'ALL' ? 'Lifetime' : dashboardView === 'YEAR' ? 'Annual' : 'Monthly'} Budget</p>
                        <h3 className="text-3xl font-black text-white">{formatMoney(totalAllocated)}</h3>
                    </div>
                    <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800">
                        <p className="text-xs text-slate-500 font-bold uppercase mb-1">Actual Spent</p>
                        <h3 className={`text-3xl font-black ${totalSpent > totalAllocated ? 'text-rose-500' : 'text-emerald-400'}`}>{formatMoney(totalSpent)}</h3>
                    </div>
                    <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800">
                        <p className="text-xs text-slate-500 font-bold uppercase mb-1">Unallocated Buffer</p>
                        <h3 className={`text-3xl font-black ${unallocated < 0 ? 'text-rose-500' : 'text-blue-400'}`}>{formatMoney(unallocated)}</h3>
                    </div>
               </div>

               {/* GRID LAYOUT: Variable (Left), Stacked Fixed & One-Time (Right) */}
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    
                    {/* COL 1: VARIABLE (Full Height) */}
                    <div className="bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden h-full">
                         <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2">
                                 <div className="w-2 h-2 rounded-full bg-blue-500"></div> Variable / Lifestyle
                            </h3>
                         </div>
                         <div className="p-6">
                            {renderDashboardConfigSection(variableGroup, relevantTxs, budgetMultiplier)}
                            {variableGroup.length === 0 && <div className="text-slate-500 text-xs italic text-center py-4">No variable rules set.</div>}
                         </div>
                    </div>

                    {/* COL 2: FIXED + ONE-TIME */}
                    <div className="space-y-6">
                        <div className="bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden">
                            <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-rose-500"></div> Fixed Obligations
                                </h3>
                            </div>
                            <div className="p-6">
                                {renderDashboardConfigSection(fixedGroup, relevantTxs, budgetMultiplier)}
                                {fixedGroup.length === 0 && <div className="text-slate-500 text-xs italic text-center py-4">No fixed rules set.</div>}
                            </div>
                        </div>
                        
                        <div className="bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden">
                            <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-purple-500"></div> One-Time Payments
                                </h3>
                            </div>
                            <div className="p-6">
                                {renderDashboardConfigSection(oneTimeGroup, relevantTxs, budgetMultiplier)}
                                {oneTimeGroup.length === 0 && <div className="text-slate-500 text-xs italic text-center py-4">No one-time rules set.</div>}
                            </div>
                        </div>
                    </div>
               </div>
          </div>
      );
  };

  const renderStrategyHub = () => {
      const allConfigs = draftTemplate ? draftTemplate.configs : [];
      // Keep edit order simple for better UX
      const fixedConfigs = allConfigs.filter(c => c.type === 'FIXED');
      const varConfigs = allConfigs.filter(c => c.type === 'VARIABLE');
      const ignoredConfigs = allConfigs.filter(c => c.type === 'IGNORE');

      // DYNAMIC TIMELINE GENERATION
      const now = new Date();
      let startYear = now.getFullYear();
      let startMonth = now.getMonth();
      
      if (transactions.length > 0) {
          const earliest = transactions.reduce((min, t) => t.date < min ? t.date : min, transactions[0].date);
          const eDate = new Date(earliest);
          startYear = eDate.getFullYear();
          startMonth = eDate.getMonth();
      } else {
          startYear = now.getFullYear();
          startMonth = 0;
      }

      const endYear = now.getFullYear() + 1;
      const endMonth = now.getMonth();
      
      const timelineData: { year: number, months: any[] }[] = [];
      let currentIterDate = new Date(startYear, startMonth, 1);
      const stopDate = new Date(endYear, endMonth + 1, 0); 

      while (currentIterDate <= stopDate) {
          const y = currentIterDate.getFullYear();
          const m = currentIterDate.getMonth();
          const monthKey = `${y}-${String(m+1).padStart(2,'0')}`;
          
          let yearGroup = timelineData.find(g => g.year === y);
          if (!yearGroup) {
              yearGroup = { year: y, months: [] };
              timelineData.push(yearGroup);
          }

          const override = plan?.monthlyOverrides?.[monthKey];
          const isLinked = selectedTemplateId ? override?.linkedTemplateId === selectedTemplateId : false;
          const hasOverride = !!override;
          const isCurrent = y === now.getFullYear() && m === now.getMonth();
          const isPast = currentIterDate < new Date(now.getFullYear(), now.getMonth(), 1);

          yearGroup.months.push({
              date: new Date(currentIterDate),
              key: monthKey,
              isLinked,
              hasOverride,
              isCurrent,
              isPast,
              planName: override?.label || (plan?.activeTemplateId ? (plan.budgetTemplates?.find(t=>t.id===plan.activeTemplateId)?.name) : 'Default')
          });

          currentIterDate.setMonth(currentIterDate.getMonth() + 1);
      }
      
      timelineData.sort((a,b) => b.year - a.year);

      const isActiveGlobal = plan?.activeTemplateId === selectedTemplateId;

      return (
          <div className="flex flex-col lg:flex-row gap-6 animate-in slide-in-from-right duration-500 lg:h-[calc(100vh-140px)]">
               
               {/* COL 1: LIBRARY */}
               <div className="w-full lg:w-64 flex flex-col gap-4 flex-shrink-0 lg:h-full">
                    <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-4 flex flex-col lg:h-full shadow-xl max-h-60 lg:max-h-none">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Plan Library</h3>
                            <button onClick={handleCreateTemplate} className="p-1.5 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-all"><Plus size={14}/></button>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                            {(!plan?.budgetTemplates || plan.budgetTemplates.length === 0) && (
                                <div className="text-center p-4 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                                    No plans found. Create one to get started.
                                </div>
                            )}
                            {plan?.budgetTemplates?.map(t => (
                                <button 
                                    key={t.id}
                                    onClick={() => setSelectedTemplateId(t.id)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all relative group ${selectedTemplateId === t.id ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600'}`}
                                >
                                    <span className="font-bold text-sm block truncate">{t.name}</span>
                                    {plan?.activeTemplateId === t.id && <span className="absolute top-3 right-3 w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>}
                                </button>
                            ))}
                        </div>
                        {selectedTemplateId && (
                            <div className="pt-4 border-t border-slate-800 mt-2 space-y-2">
                                <button onClick={handleDeleteTemplate} className="w-full py-2 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all">
                                    Delete Plan
                                </button>
                            </div>
                        )}
                    </div>
               </div>

               {/* COL 2: EDITOR */}
               <div className="flex-1 flex flex-col min-w-0 bg-[#0f172a] rounded-2xl border border-slate-800 shadow-xl overflow-hidden min-h-[600px] lg:min-h-0 lg:h-full">
                    {(!selectedTemplateId || !draftTemplate) ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                            <div className="bg-slate-900 p-6 rounded-full mb-6 animate-pulse">
                                <BookTemplate size={48} className="text-slate-700" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">No Plan Selected</h3>
                            <p className="text-sm text-slate-400 max-w-xs mb-8">Select a plan from the library on the left, or create a new strategy to begin.</p>
                            <button 
                                onClick={handleCreateTemplate}
                                className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2"
                            >
                                <Plus size={18} /> Create New Strategy
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="text" 
                                        value={draftName}
                                        onChange={e => setDraftName(e.target.value)}
                                        className="bg-transparent text-lg font-bold text-white outline-none border-b border-transparent focus:border-slate-600 transition-all placeholder:text-slate-600 min-w-0"
                                        placeholder="Plan Name"
                                    />
                                    <button 
                                        onClick={handleSetGlobal}
                                        className={`ml-4 flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-all border ${isActiveGlobal ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'}`}
                                    >
                                        <div className={`relative w-8 h-4 rounded-full transition-colors ${isActiveGlobal ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                                            <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${isActiveGlobal ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider">
                                            {isActiveGlobal ? 'Active Strategy' : 'Set as Active'}
                                        </span>
                                    </button>
                                </div>
                                <button 
                                    onClick={handleSaveDraft} 
                                    className={`px-4 py-2 font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg ${saveSuccess ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-900/20'}`}
                                >
                                    {saveSuccess ? <Check size={16} /> : <Save size={16} />} 
                                    {saveSuccess ? 'Saved' : 'Save Changes'}
                                </button>
                            </div>

                            <div className="p-6 border-b border-slate-800 grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Monthly Income</label>
                                    <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">{settings.currencySymbol}</span><input type="number" value={draftTemplate.salary} onChange={e => setDraftTemplate({...draftTemplate, salary: parseFloat(e.target.value)||0})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 pl-7 text-white font-mono text-sm outline-none focus:border-blue-500/50" /></div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Savings Target</label>
                                    <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">{settings.currencySymbol}</span><input type="number" value={draftTemplate.savingsGoal} onChange={e => setDraftTemplate({...draftTemplate, savingsGoal: parseFloat(e.target.value)||0})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 pl-7 text-emerald-400 font-mono text-sm outline-none focus:border-emerald-500/50" /></div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                <div className="space-y-6">
                                    <div>
                                        <h4 className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Lock size={12}/> Fixed Costs</h4>
                                        <div className="space-y-2">{fixedConfigs.map(renderConfigRow)}</div>
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3 flex items-center gap-2"><ShoppingBag size={12}/> Variable Budgets</h4>
                                        <div className="space-y-2">{varConfigs.map(renderConfigRow)}</div>
                                    </div>
                                    {ignoredConfigs.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><Filter size={12}/> Ignored</h4>
                                            <div className="space-y-2">{ignoredConfigs.map(renderConfigRow)}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
               </div>

               {/* COL 3: DEPLOYMENT (Dynamic Timeline) */}
               <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-6 h-[calc(100vh-140px)]">
                    {/* NEW: PROJECTION CARD */}
                    <div className="bg-[#0f172a] rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex-shrink-0">
                        <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Calculator size={14} className="text-emerald-400"/> Monthly Projection
                            </h3>
                        </div>
                        <div className="p-4 space-y-3">
                            {/* Income */}
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Total Income</span>
                                <span className="font-bold text-emerald-400">{formatMoney(projection.income)}</span>
                            </div>
                            
                            <div className="h-px bg-slate-800 my-1"></div>

                            {/* Outflows */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Fixed Costs</span>
                                    <span className="font-mono text-rose-400">{formatMoney(projection.fixed)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Variable Est.</span>
                                    <span className="font-mono text-blue-400">{formatMoney(projection.variable)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">One-Time (Avg)</span>
                                    <span className="font-mono text-purple-400">{formatMoney(projection.oneTime)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs font-bold">
                                    <span className="text-slate-400">Target Savings</span>
                                    <span className="font-mono text-emerald-500">{formatMoney(projection.savings)}</span>
                                </div>
                            </div>

                            <div className="h-px bg-slate-800 my-1"></div>

                            {/* Net */}
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Net Balance</span>
                                <span className={`text-lg font-black ${projection.balance >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                                    {formatMoney(projection.balance)}
                                </span>
                            </div>
                            
                            {/* Status Bar */}
                            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden flex">
                                <div className="bg-rose-500" style={{width: `${Math.min(100, (projection.fixed/Math.max(1, projection.income))*100)}%`}} title="Fixed"></div>
                                <div className="bg-purple-500" style={{width: `${Math.min(100, (projection.oneTime/Math.max(1, projection.income))*100)}%`}} title="OneTime"></div>
                                <div className="bg-blue-500" style={{width: `${Math.min(100, (projection.variable/Math.max(1, projection.income))*100)}%`}} title="Variable"></div>
                                <div className="bg-emerald-500" style={{width: `${Math.min(100, (projection.savings/Math.max(1, projection.income))*100)}%`}} title="Savings"></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 bg-[#0f172a] rounded-2xl border border-slate-800 flex flex-col shadow-xl overflow-hidden min-h-0">
                        <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                                <CalendarRange size={14} className="text-indigo-400"/> Timeline Assignment
                            </h3>
                            <p className="text-[10px] text-slate-500">
                                Apply this plan to past or future months.
                            </p>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                            {timelineData.map(group => (
                                <div key={group.year}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-xs font-black text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">{group.year}</span>
                                        <div className="h-[1px] flex-1 bg-slate-800"></div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {group.months.map((m: any) => (
                                            <div 
                                                key={m.key}
                                                className={`
                                                    relative p-2 rounded-xl border text-left transition-all overflow-hidden flex flex-col justify-between h-20 group
                                                    ${!selectedTemplateId 
                                                        ? 'opacity-30 cursor-not-allowed bg-slate-900 border-slate-800' 
                                                        : m.isLinked 
                                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                                                            : m.isCurrent 
                                                                ? 'bg-slate-800 border-emerald-500/50 text-slate-300 ring-1 ring-emerald-500/30' 
                                                                : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600'
                                                    }
                                                `}
                                            >
                                                <button 
                                                    onClick={() => handleAssignMonth(m.key)}
                                                    disabled={!selectedTemplateId}
                                                    title="Click to assign current strategy"
                                                    className="absolute inset-0 w-full h-full z-0"
                                                />
                                                
                                                <div className="flex justify-between items-start w-full relative z-10 pointer-events-none">
                                                    <span className={`text-[10px] font-bold uppercase ${m.isCurrent ? 'text-emerald-400' : ''}`}>
                                                        {m.date.toLocaleDateString('en-US', {month:'short'})}
                                                    </span>
                                                    {m.isLinked && <Check size={10} className="text-indigo-300" />}
                                                </div>
                                                
                                                <span className="text-[9px] font-medium truncate w-full opacity-70 relative z-10 pointer-events-none">
                                                    {m.isLinked ? draftName : m.planName}
                                                </span>

                                                {/* Revert Button - Only visible if overridden */}
                                                {m.hasOverride && (
                                                    <button 
                                                        onClick={(e) => handleRevertMonth(m.key, e)}
                                                        className="absolute top-1 right-1 z-20 p-1 bg-black/20 hover:bg-black/40 rounded-full text-white/70 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                                        title="Revert to Global Default"
                                                    >
                                                        <X size={10} />
                                                    </button>
                                                )}

                                                {/* Status Indicators */}
                                                {m.isCurrent && <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 pointer-events-none"></div>}
                                                {!m.isCurrent && m.isLinked && <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-400 pointer-events-none"></div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            
                            {timelineData.length === 0 && (
                                <div className="text-center p-8 text-slate-600 italic text-xs">
                                    No history found.
                                </div>
                            )}
                        </div>
                    </div>
               </div>
          </div>
      );
  };

  return (
    <div className="space-y-6 pb-20">
        {/* TOP NAV */}
        <div className="flex gap-4">
            <button 
                onClick={() => setActiveTab('DASHBOARD')}
                className={`flex-1 py-4 rounded-2xl border flex items-center justify-center gap-3 transition-all ${activeTab === 'DASHBOARD' ? 'bg-[#0f172a] border-slate-700 text-white shadow-xl' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'}`}
            >
                <LayoutDashboard size={20} className={activeTab === 'DASHBOARD' ? 'text-emerald-500' : ''} />
                <span className="font-bold tracking-wide">Dashboard & Analysis</span>
            </button>
            <button 
                onClick={() => setActiveTab('STRATEGY')}
                className={`flex-1 py-4 rounded-2xl border flex items-center justify-center gap-3 transition-all ${activeTab === 'STRATEGY' ? 'bg-[#0f172a] border-slate-700 text-white shadow-xl' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'}`}
            >
                <PenTool size={20} className={activeTab === 'STRATEGY' ? 'text-indigo-500' : ''} />
                <span className="font-bold tracking-wide">Strategy Hub & Editor</span>
            </button>
        </div>

        {activeTab === 'DASHBOARD' ? renderDashboard() : renderStrategyHub()}

        {/* CREATE PLAN MODAL */}
        {isCreateModalOpen && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsCreateModalOpen(false)} />
                <div className="relative bg-[#0f172a] border border-slate-800 rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-300">
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-xl font-bold text-white uppercase tracking-tight">Design New Strategy</h2>
                        <button onClick={() => setIsCreateModalOpen(false)} className="p-2 bg-slate-800 rounded-full text-slate-500 hover:text-white transition-all"><X size={16}/></button>
                    </div>
                    
                    <div className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Strategy Name</label>
                            <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner"
                                placeholder="e.g. Aggressive Savings"
                                value={newPlanData.name}
                                onChange={e => setNewPlanData({...newPlanData, name: e.target.value})}
                                autoFocus
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Monthly Income</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">{settings.currencySymbol}</span>
                                    <input 
                                        type="number" 
                                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-10 text-white outline-none focus:border-emerald-500/50 shadow-inner"
                                        placeholder="0"
                                        value={newPlanData.salary || ''}
                                        onChange={e => setNewPlanData({...newPlanData, salary: parseFloat(e.target.value) || 0})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Savings Goal</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">{settings.currencySymbol}</span>
                                    <input 
                                        type="number" 
                                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-10 text-emerald-400 outline-none focus:border-emerald-500/50 shadow-inner"
                                        placeholder="0"
                                        value={newPlanData.savingsGoal || ''}
                                        onChange={e => setNewPlanData({...newPlanData, savingsGoal: parseFloat(e.target.value) || 0})}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* GLOBAL SELECTION */}
                        <div className="flex items-center gap-3 p-4 bg-slate-900/50 rounded-2xl border border-slate-800 cursor-pointer hover:bg-slate-900 transition-colors" onClick={() => setCreateAsGlobal(!createAsGlobal)}>
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${createAsGlobal ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600 bg-slate-950'}`}>
                                {createAsGlobal && <Check size={14} className="text-white" />}
                            </div>
                            <div>
                                <p className="text-xs font-bold text-white">Set as Active Strategy</p>
                                <p className="text-[10px] text-slate-500">This will immediately apply to all months not manually overridden.</p>
                            </div>
                        </div>

                        <div className="flex gap-4 mt-8 pt-4 border-t border-slate-800">
                            <button 
                                onClick={() => setIsCreateModalOpen(false)}
                                className="flex-1 px-4 py-4 text-slate-500 font-bold uppercase text-xs tracking-widest hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleConfirmCreate}
                                className="flex-1 px-4 py-4 bg-emerald-600 text-slate-950 font-black uppercase text-xs tracking-widest rounded-2xl hover:bg-emerald-500 shadow-xl shadow-emerald-900/20 transition-all active:scale-95"
                            >
                                Create Plan
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
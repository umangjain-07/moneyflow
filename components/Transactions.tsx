
import React, { useState, useEffect, useMemo } from 'react';
import { db, subscribe } from '../services/storage';
import { Transaction, Category, Account, TransactionType, Goal } from '../types';
import { Plus, Trash2, ArrowUpRight, ArrowDownLeft, Search, Filter, Tag, Heart, Coffee, Calendar, CreditCard, TrendingUp, X, Edit2, Check, ChevronDown, Target } from 'lucide-react';

// Extracted Component to prevent re-mounting flicker
const TransactionItem: React.FC<{ 
    tx: Transaction, 
    isMobile: boolean, 
    index: number,
    categories: Category[],
    accounts: Account[],
    settings: any,
    handleOpenEdit: (tx: Transaction) => void,
    handleDelete: (id: string) => void 
}> = ({ tx, isMobile, index, categories, accounts, settings, handleOpenEdit, handleDelete }) => {
    const category = categories.find(c => c.id === tx.categoryId);
    const account = accounts.find(a => a.id === tx.accountId);
  const sponsoredAmount = tx.type === 'EXPENSE' ? (tx.sponsoredAmount || 0) : 0;
  const netAmount = tx.type === 'EXPENSE' ? Math.max(0, tx.amount - sponsoredAmount) : tx.amount;
  const displayAmount = db.convertAmount(netAmount, account?.currency || settings.currency, settings.currency);
  const displaySponsored = sponsoredAmount > 0
    ? db.convertAmount(sponsoredAmount, account?.currency || settings.currency, settings.currency)
    : 0;
    const displaySymbol = settings.currencySymbol;

    const getIcon = () => {
      if (tx.type === 'GOAL') return <Target size={16} />;
        if (tx.type === 'INCOME') return <ArrowDownLeft size={16} />;
        if (tx.type === 'INVESTMENT') return <TrendingUp size={16} />;
        return <ArrowUpRight size={16} />;
    };

    const getColorClass = () => {
      if (tx.type === 'GOAL') return 'bg-amber-500/10 text-amber-400';
        if (tx.type === 'INCOME') return 'bg-emerald-500/10 text-emerald-500';
        if (tx.type === 'INVESTMENT') return 'bg-purple-500/10 text-purple-500';
        return 'bg-rose-500/10 text-rose-500';
    };
    
    const getAmountColor = () => {
      if (tx.type === 'GOAL') return 'text-amber-400';
        if (tx.type === 'INCOME') return 'text-emerald-400';
        if (tx.type === 'INVESTMENT') return 'text-purple-400';
        return 'text-rose-400';
    };

    if (isMobile) {
        return (
          <div 
              onClick={() => handleOpenEdit(tx)} 
              className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 flex justify-between items-center mb-2 active:bg-slate-800 transition-all cursor-pointer animate-slide-up"
              style={{animationDelay: `${Math.min(index * 30, 500)}ms`, opacity: 0}}
          >
              <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg flex items-center justify-center text-base ${getColorClass()}`}>
                      {category?.icon ? category.icon : getIcon()}
                  </div>
                  <div className="flex flex-col">
                      <p className="font-bold text-slate-200 text-sm truncate max-w-[140px] leading-tight">{tx.description}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-slate-500">{tx.date.substring(5)}</span>
                            {tx.type === 'GOAL' ? (
                              <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1 rounded-sm">GOALS</span>
                            ) : (
                              category && <span className="text-[9px] bg-slate-800 text-slate-400 px-1 rounded-sm">{category.name}</span>
                            )}
                          {displaySponsored > 0 && (
                            <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1 rounded-sm">Sponsored {displaySymbol}{displaySponsored.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          )}
                      </div>
                  </div>
              </div>
              <div className="text-right">
                  <p className={`font-mono font-bold text-sm ${getAmountColor()}`}>
                      {tx.type === 'INCOME' ? '+' : '-'}{displaySymbol}{displayAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                  <p className="text-[9px] text-slate-600">{account?.name}</p>
              </div>
          </div>
        );
    }

    return (
      <tr 
          onClick={() => handleOpenEdit(tx)} 
          className="hover:bg-slate-800/50 transition-colors group cursor-pointer border-b border-slate-800/50 last:border-0 animate-slide-up"
          style={{animationDelay: `${Math.min(index * 20, 500)}ms`, opacity: 0}}
      >
          <td className="px-6 py-4 text-slate-400 whitespace-nowrap font-mono text-xs">{tx.date}</td>
          <td className="px-6 py-4 font-medium text-slate-200">
              {tx.description}
              {category?.necessity && tx.type === 'EXPENSE' && (
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide border border-opacity-20 ${category.necessity === 'NEED' ? 'text-emerald-500 border-emerald-500 bg-emerald-500/10' : 'text-amber-500 border-amber-500 bg-amber-500/10'}`}>
                      {category.necessity}
                      </span>
              )}
          </td>
            <td className="px-6 py-4">
                <span 
                  className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border border-opacity-20 gap-1.5" 
                  style={{ 
                    backgroundColor: `${tx.type === 'GOAL' ? '#f59e0b' : (category?.color || '#64748b')}10`, 
                    color: tx.type === 'GOAL' ? '#f59e0b' : (category?.color || '#64748b'),
                    borderColor: tx.type === 'GOAL' ? '#f59e0b' : (category?.color || '#64748b')
                  }}
                >
                <span>{tx.type === 'GOAL' ? '🎯' : (category?.icon || '🏷️')}</span>
                {tx.type === 'GOAL' ? 'GOALS' : (category?.name || 'General')}
              </span>
          </td>
          <td className="px-6 py-4 text-slate-400 text-xs">{account?.name || 'Unknown'}</td>
          <td className={`px-6 py-4 text-right font-bold font-mono ${getAmountColor()}`}>
              {tx.type === 'INCOME' ? '+' : '-'}{displaySymbol}{displayAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              {displaySponsored > 0 && (
                <div className="text-[10px] text-amber-400 font-bold mt-1">Sponsored {displaySymbol}{displaySponsored.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
              )}
          </td>
          <td className="px-6 py-4 text-right">
              <button onClick={(e) => { e.stopPropagation(); handleDelete(tx.id); }} className="text-slate-600 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100">
              <Trash2 size={16} />
              </button>
          </td>
      </tr>
    );
};

export const Transactions: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [settings, setSettings] = useState(db.getSettings());
  const [search, setSearch] = useState('');
  
  // Filters
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<TransactionType>('EXPENSE');

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryGroup, setNewCategoryGroup] = useState('General');

  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    categoryId: '',
    accountId: '',
    toAccountId: '', 
    tags: '',
    investmentSubtype: 'SELF' as 'SELF' | 'SPONSORED',
    goalId: '',
    goalContribution: '',
    sponsoredAmount: ''
  });

  const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹'
  };

  const getSymbol = (currencyCode: string) => CURRENCY_SYMBOLS[currencyCode] || currencyCode;

  const loadData = () => {
    setTransactions(db.getTransactions());
    setCategories(db.getCategories());
    setAccounts(db.getAccounts());
    setSettings(db.getSettings());
    setGoals(db.getGoals());
  };

  useEffect(() => {
    loadData();
    const unsubscribe = subscribe(loadData);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isModalOpen && !editingId && accounts.length > 0 && !formData.accountId) {
      setFormData(prev => ({ 
        ...prev, 
        accountId: accounts[0].id,
        toAccountId: accounts.length > 1 ? accounts[1].id : accounts[0].id
      }));
    }
  }, [accounts, isModalOpen, editingId]);

    useEffect(() => {
      if (mode === 'TRANSFER' || mode === 'GOAL') return;
      if (editingId) return; 

      const validCats = categories.filter(c => c.type === mode);
      const currentCat = categories.find(c => c.id === formData.categoryId);
      if (!currentCat || currentCat.type !== mode) {
          const newCatId = validCats[0]?.id || '';
          const newCat = categories.find(c => c.id === newCatId);
          setFormData(prev => ({ 
            ...prev, 
            categoryId: newCatId,
            investmentSubtype: mode === 'INVESTMENT' ? (newCat?.defaultInvestmentSubtype || 'SELF') : prev.investmentSubtype
          }));
      } else if (mode === 'INVESTMENT' && currentCat.defaultInvestmentSubtype) {
          setFormData(prev => ({ ...prev, investmentSubtype: currentCat.defaultInvestmentSubtype || 'SELF' }));
      }
  }, [mode, categories, editingId]);

    useEffect(() => {
      if (!isModalOpen || editingId || mode !== 'GOAL') return;
      if (!formData.goalId && goals.length > 0) {
        setFormData(prev => ({ ...prev, goalId: goals[0].id }));
      }
    }, [goals, isModalOpen, editingId, mode, formData.goalId]);

  const handleOpenAdd = () => {
      setEditingId(null);
      setMode('EXPENSE');
      setFormData({
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        categoryId: '',
        accountId: accounts[0]?.id || '',
        toAccountId: '',
        tags: '',
        investmentSubtype: 'SELF',
        goalId: '',
        goalContribution: '',
        sponsoredAmount: ''
      });
      setIsModalOpen(true);
  };

  const handleOpenEdit = (tx: Transaction) => {
      setEditingId(tx.id);
      setMode(tx.type);
      
      const relatedTx = tx.relatedTransactionId ? transactions.find(t => t.id === tx.relatedTransactionId) : null;
      let toAcc = '';
      
      if (tx.type === 'EXPENSE' && tx.categoryId === 'transfer_out' && relatedTx) {
          setMode('TRANSFER');
          toAcc = relatedTx.accountId;
      } else if (tx.type === 'INCOME' && tx.categoryId === 'transfer_in' && relatedTx) {
          setMode('TRANSFER');
          toAcc = tx.accountId; 
          tx = relatedTx; 
      }

      setFormData({
          amount: String(tx.amount),
          description: tx.description,
          date: tx.date,
          categoryId: tx.categoryId,
          accountId: tx.accountId,
          toAccountId: toAcc,
          tags: tx.tags?.join(', ') || '',
          investmentSubtype: tx.investmentSubtype || 'SELF',
          goalId: tx.goalId || '',
            goalContribution: tx.goalContribution ? String(tx.goalContribution) : '',
            sponsoredAmount: tx.sponsoredAmount ? String(tx.sponsoredAmount) : ''
      });
      setIsModalOpen(true);
  };

  const applyGoalDelta = (goalId: string, delta: number) => {
    if (!goalId || !delta) return;
    const currentGoals = db.getGoals();
    const goal = currentGoals.find(g => g.id === goalId);
    if (!goal) return;
    const nextAmount = Math.max(0, Math.min(goal.targetAmount, goal.currentAmount + delta));
    db.saveGoal({ ...goal, currentAmount: nextAmount });
  };

  const handleCreateCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const type = mode === 'TRANSFER' ? 'EXPENSE' : mode;
    const group = newCategoryGroup.trim() || 'General';
    const result = db.ensureCategory(trimmed, type as 'INCOME' | 'EXPENSE' | 'INVESTMENT', group);
    setFormData(prev => ({ ...prev, categoryId: result.id }));
    setIsCategoryModalOpen(false);
    setNewCategoryName('');
    setNewCategoryGroup('General');
  };

  const handleSubmit = () => {
    const rawAmount = parseFloat(formData.amount);
    if (isNaN(rawAmount) || !formData.accountId) return;
    
    const amount = Math.abs(rawAmount);

    const parsedSponsored = parseFloat(formData.sponsoredAmount);
    const sponsoredAmount = mode === 'EXPENSE' && !isNaN(parsedSponsored)
      ? Math.min(amount, Math.max(0, parsedSponsored))
      : 0;

    let parsedGoalContribution = parseFloat(formData.goalContribution);
    let hasGoalContribution = !!formData.goalId && !isNaN(parsedGoalContribution) && parsedGoalContribution > 0;

    if (editingId) {
        const previous = transactions.find(t => t.id === editingId);
        if (previous?.goalId && previous.goalContribution) {
            applyGoalDelta(previous.goalId, -previous.goalContribution);
        }
        db.deleteTransaction(editingId);
    }

    if (mode === 'TRANSFER') {
      db.addTransfer(formData.accountId, formData.toAccountId, amount, formData.date, formData.description || 'Transfer');
    } else {
      if (mode === 'GOAL') {
          if (!formData.goalId) return;
          parsedGoalContribution = amount;
          hasGoalContribution = true;
      }

      let catId = formData.categoryId;
      if (!catId) {
          if (mode === 'GOAL') catId = 'goal_feed';
          else {
              const defaults = categories.filter(c => c.type === mode);
              catId = defaults[0]?.id;
          }
      }

      const tagsArray = formData.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);

      db.addTransaction({
        date: formData.date,
        amount: amount,
        description: formData.description || (mode === 'GOAL' ? 'GOALS' : ''),
        categoryId: catId,
        accountId: formData.accountId,
        type: mode,
        tags: tagsArray,
        investmentSubtype: mode === 'INVESTMENT' ? formData.investmentSubtype : undefined,
        sponsoredAmount: mode === 'EXPENSE' && sponsoredAmount > 0 ? sponsoredAmount : undefined,
        goalId: hasGoalContribution ? formData.goalId : undefined,
        goalContribution: hasGoalContribution ? parsedGoalContribution : undefined
      });

      if (hasGoalContribution) {
        applyGoalDelta(formData.goalId, parsedGoalContribution);
      }
    }

    setIsModalOpen(false);
    setFormData({ amount: '', description: '', date: new Date().toISOString().split('T')[0], categoryId: '', accountId: '', toAccountId: '', tags: '', investmentSubtype: 'SELF', goalId: '', goalContribution: '', sponsoredAmount: '' });
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this transaction?')) {
      const existing = transactions.find(t => t.id === id);
      if (existing?.goalId && existing.goalContribution) {
        applyGoalDelta(existing.goalId, -existing.goalContribution);
      }
      db.deleteTransaction(id);
      if(isModalOpen) setIsModalOpen(false);
    }
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = t.description.toLowerCase().includes(search.toLowerCase()) ||
                          t.amount.toString().includes(search) ||
                          t.tags?.some(tag => tag.toLowerCase().includes(search.toLowerCase()));
    
    const matchesType = filterType === 'ALL' || t.type === filterType;
    const matchesCategory = filterCategory === 'ALL' || t.categoryId === filterCategory;
    const matchesDate = (!filterStartDate || t.date >= filterStartDate) && (!filterEndDate || t.date <= filterEndDate);

    return matchesSearch && matchesType && matchesCategory && matchesDate;
  });

  const currentFormAccount = accounts.find(a => a.id === formData.accountId);
  const currentFormSymbol = currentFormAccount ? getSymbol(currentFormAccount.currency) : settings.currencySymbol;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-100">Transactions</h1>
        <button onClick={handleOpenAdd} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-900/20 active:scale-95 w-full md:w-auto justify-center">
            <Plus size={18} />
            <span className="font-medium">New</span>
        </button>
      </div>

      {/* FILTER BAR */}
      <div className="flex flex-col md:flex-row gap-3 bg-slate-900/50 p-3 rounded-2xl border border-slate-800">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors" size={16} />
            <input 
              type="text" 
              placeholder="Search history..." 
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 text-slate-200 rounded-xl outline-none focus:border-emerald-500/50 transition-all text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 custom-scrollbar">
              <div className="relative min-w-[120px]">
                  <select 
                    value={filterType} 
                    onChange={e => setFilterType(e.target.value)}
                    className="w-full appearance-none bg-slate-950 border border-slate-800 text-slate-300 rounded-xl py-2 pl-3 pr-8 outline-none focus:border-emerald-500/50 text-xs font-bold uppercase tracking-wide cursor-pointer"
                  >
                      <option value="ALL">All Types</option>
                      <option value="INCOME">Income</option>
                      <option value="EXPENSE">Expense</option>
                      <option value="INVESTMENT">Investment</option>
                      <option value="GOAL">GOALS</option>
                      <option value="TRANSFER">Transfer</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"/>
              </div>

              <div className="relative min-w-[140px]">
                  <select 
                    value={filterCategory} 
                    onChange={e => setFilterCategory(e.target.value)}
                    className="w-full appearance-none bg-slate-950 border border-slate-800 text-slate-300 rounded-xl py-2 pl-3 pr-8 outline-none focus:border-emerald-500/50 text-xs font-bold uppercase tracking-wide cursor-pointer"
                  >
                      <option value="ALL">All Categories</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"/>
              </div>

              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-2">
                  <input 
                    type="date" 
                    className="bg-transparent text-slate-300 outline-none text-xs font-bold uppercase w-24 p-1"
                    value={filterStartDate}
                    onChange={e => setFilterStartDate(e.target.value)}
                  />
                  <span className="text-slate-600">-</span>
                  <input 
                    type="date" 
                    className="bg-transparent text-slate-300 outline-none text-xs font-bold uppercase w-24 p-1"
                    value={filterEndDate}
                    onChange={e => setFilterEndDate(e.target.value)}
                  />
              </div>
              
              {(filterType !== 'ALL' || filterCategory !== 'ALL' || filterStartDate || filterEndDate) && (
                  <button 
                    onClick={() => { setFilterType('ALL'); setFilterCategory('ALL'); setFilterStartDate(''); setFilterEndDate(''); setSearch(''); }}
                    className="p-2 bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
                    title="Clear Filters"
                  >
                      <X size={14} />
                  </button>
              )}
          </div>
      </div>

      <div className="hidden md:block bg-slate-900/50 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Account</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((tx, idx) => (
                <TransactionItem 
                    key={tx.id} 
                    tx={tx} 
                    isMobile={false} 
                    index={idx}
                    categories={categories}
                    accounts={accounts}
                    settings={settings}
                    handleOpenEdit={handleOpenEdit}
                    handleDelete={handleDelete}
                />
              ))}
              {filteredTransactions.length === 0 && (
                  <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-bold">No transactions found matching your criteria.</td>
                  </tr>
              )}
            </tbody>
        </table>
      </div>

      <div className="md:hidden">
          {filteredTransactions.map((tx, idx) => (
                <TransactionItem 
                    key={tx.id} 
                    tx={tx} 
                    isMobile={true} 
                    index={idx}
                    categories={categories}
                    accounts={accounts}
                    settings={settings}
                    handleOpenEdit={handleOpenEdit}
                    handleDelete={handleDelete}
                />
          ))}
          {filteredTransactions.length === 0 && (
              <div className="py-12 text-center text-slate-500 font-bold border border-dashed border-slate-800 rounded-xl">No transactions found.</div>
          )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-8">
                 <h2 className="text-xl font-bold text-slate-100 uppercase tracking-tight">{editingId ? 'Edit Entry' : 'New Entry'}</h2>
                 {!editingId && (
                     <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 shadow-inner">
                        <button onClick={() => setMode('EXPENSE')} className={`flex-1 px-3 py-1.5 text-[10px] font-black rounded-xl transition-all ${mode === 'EXPENSE' ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>EXP</button>
                        <button onClick={() => setMode('INCOME')} className={`flex-1 px-3 py-1.5 text-[10px] font-black rounded-xl transition-all ${mode === 'INCOME' ? 'bg-emerald-500 text-slate-950 shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>INC</button>
                        <button onClick={() => setMode('INVESTMENT')} className={`flex-1 px-3 py-1.5 text-[10px] font-black rounded-xl transition-all ${mode === 'INVESTMENT' ? 'bg-purple-500 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>INV</button>
                    <button onClick={() => setMode('GOAL')} className={`flex-1 px-3 py-1.5 text-[10px] font-black rounded-xl transition-all ${mode === 'GOAL' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>GOAL</button>
                        <button onClick={() => setMode('TRANSFER')} className={`flex-1 px-3 py-1.5 text-[10px] font-black rounded-xl transition-all ${mode === 'TRANSFER' ? 'bg-blue-500 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>TRF</button>
                     </div>
                 )}
                 {editingId && <button onClick={() => setIsModalOpen(false)} className="p-2 bg-slate-800 rounded-full text-slate-500 hover:text-white transition-all"><X size={18}/></button>}
            </div>
            
            <div className="space-y-6">
              <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Volume</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">{currentFormSymbol}</span>
                        <input type="number" step="0.01" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-10 font-mono text-2xl text-white outline-none focus:border-emerald-500/50 shadow-inner" placeholder="0.00" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} autoFocus={!editingId} />
                    </div>
                  </div>
                  <div className="w-1/3">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Execution</label>
                    <input type="date" className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-2xl p-4 outline-none shadow-inner text-xs font-bold" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                  </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Annotation</label>
                <input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:border-emerald-500/50 shadow-inner" placeholder="Source/Destination..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>

              {mode === 'TRANSFER' ? (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Source Account</label>
                        <div className="relative">
                            <select className="w-full appearance-none bg-slate-950 border border-slate-800 text-white rounded-2xl p-4 outline-none pr-10 shadow-inner cursor-pointer" value={formData.accountId} onChange={e => setFormData({...formData, accountId: e.target.value})}>
                                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Target Account</label>
                        <div className="relative">
                            <select className="w-full appearance-none bg-slate-950 border border-slate-800 text-white rounded-2xl p-4 outline-none pr-10 shadow-inner cursor-pointer" value={formData.toAccountId} onChange={e => setFormData({...formData, toAccountId: e.target.value})}>
                                {accounts.filter(a => a.id !== formData.accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                        </div>
                    </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {mode === 'GOAL' ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Vessel</label>
                          <div className="relative">
                            <select className="w-full appearance-none bg-slate-950 border border-slate-800 text-white rounded-2xl p-4 outline-none pr-10 shadow-inner cursor-pointer" value={formData.accountId} onChange={e => setFormData({...formData, accountId: e.target.value})}>
                              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Goal</label>
                          <div className="relative">
                            <select
                              className="w-full appearance-none bg-slate-950 border border-slate-800 text-white rounded-2xl p-4 outline-none pr-10 shadow-inner cursor-pointer"
                              value={formData.goalId}
                              onChange={e => setFormData({ ...formData, goalId: e.target.value })}
                            >
                              {goals.map(goal => (
                                <option key={goal.id} value={goal.id}>{goal.name}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                          </div>
                        </div>
                      </div>
                      {goals.length === 0 && (
                        <p className="text-[9px] text-slate-600 mt-2 ml-1">
                          Create a goal in the Dashboard to feed it here.
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      {mode === 'INVESTMENT' && (
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Investment Type</label>
                          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 shadow-inner">
                            <button 
                              onClick={() => setFormData({...formData, investmentSubtype: 'SELF'})}
                              className={`flex-1 px-3 py-2.5 text-[10px] font-black rounded-xl transition-all ${formData.investmentSubtype === 'SELF' ? 'bg-purple-500 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}
                            >
                              SELF
                            </button>
                            <button 
                              onClick={() => setFormData({...formData, investmentSubtype: 'SPONSORED'})}
                              className={`flex-1 px-3 py-2.5 text-[10px] font-black rounded-xl transition-all ${formData.investmentSubtype === 'SPONSORED' ? 'bg-purple-500 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}
                            >
                              SPONSORED
                            </button>
                          </div>
                          <p className="text-[9px] text-slate-600 mt-1 ml-1">
                            {formData.investmentSubtype === 'SELF' ? 'Money deducted from account' : 'No money deducted, investment added directly'}
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Vessel</label>
                          <div className="relative">
                            <select className="w-full appearance-none bg-slate-950 border border-slate-800 text-white rounded-2xl p-4 outline-none pr-10 shadow-inner cursor-pointer" value={formData.accountId} onChange={e => setFormData({...formData, accountId: e.target.value})}>
                              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2 ml-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Classification</label>
                            <button
                              onClick={() => setIsCategoryModalOpen(true)}
                              className="text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300"
                            >
                              Add
                            </button>
                          </div>
                          <div className="relative">
                            <select className="w-full appearance-none bg-slate-950 border border-slate-800 text-white rounded-2xl p-4 outline-none pr-10 shadow-inner cursor-pointer" value={formData.categoryId} onChange={e => {
                              const selectedCat = categories.find(c => c.id === e.target.value);
                              setFormData({
                                ...formData, 
                                categoryId: e.target.value,
                                investmentSubtype: mode === 'INVESTMENT' ? (selectedCat?.defaultInvestmentSubtype || 'SELF') : formData.investmentSubtype
                              });
                            }}>
                              {categories.filter(c => c.type === mode).map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Savings Goal (Optional)</label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="relative">
                            <select
                              className="w-full appearance-none bg-slate-950 border border-slate-800 text-white rounded-2xl p-4 outline-none pr-10 shadow-inner cursor-pointer"
                              value={formData.goalId}
                              onChange={e => setFormData({ ...formData, goalId: e.target.value })}
                            >
                              <option value="">No goal</option>
                              {goals.map(goal => (
                                <option key={goal.id} value={goal.id}>{goal.name}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                          </div>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.01"
                              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:border-emerald-500/50 shadow-inner"
                              placeholder="0.00"
                              value={formData.goalContribution}
                              onChange={e => setFormData({ ...formData, goalContribution: e.target.value })}
                              disabled={!formData.goalId}
                            />
                          </div>
                        </div>
                        {goals.length === 0 && (
                          <p className="text-[9px] text-slate-600 mt-2 ml-1">
                            Create a goal in the Dashboard to link contributions here.
                          </p>
                        )}
                      </div>

                      {mode === 'EXPENSE' && (
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Sponsored Amount (Optional)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:border-emerald-500/50 shadow-inner"
                            placeholder="0.00"
                            value={formData.sponsoredAmount}
                            onChange={e => setFormData({ ...formData, sponsoredAmount: e.target.value })}
                          />
                          <p className="text-[9px] text-slate-600 mt-2 ml-1">This reduces your out-of-pocket expense, not the total cost.</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-4 mt-8 pt-4 border-t border-slate-800">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-slate-500 font-bold uppercase text-xs tracking-widest hover:text-white transition-colors">Discard</button>
                <button onClick={handleSubmit} className={`flex-1 py-4 text-slate-950 rounded-2xl shadow-xl font-black uppercase text-xs tracking-widest transition-all active:scale-95 ${mode === 'INCOME' ? 'bg-emerald-600 shadow-emerald-900/20' : mode === 'INVESTMENT' ? 'bg-purple-600 text-white shadow-purple-900/20' : 'bg-rose-600 text-white shadow-rose-900/20'}`}>
                  {editingId ? 'Update' : 'Execute'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">New Category</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 bg-slate-800 rounded-full text-slate-500 hover:text-white transition-all"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Category Name</label>
                <input
                  type="text"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:border-emerald-500/50 shadow-inner"
                  placeholder="e.g. Commute"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Group</label>
                <input
                  type="text"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:border-emerald-500/50 shadow-inner"
                  placeholder="General"
                  value={newCategoryGroup}
                  onChange={e => setNewCategoryGroup(e.target.value)}
                />
              </div>
              <div className="flex gap-4 pt-2">
                <button onClick={() => setIsCategoryModalOpen(false)} className="flex-1 py-3 text-slate-500 font-bold uppercase text-xs tracking-widest hover:text-white transition-colors">Cancel</button>
                <button onClick={handleCreateCategory} className="flex-1 py-3 bg-emerald-600 text-slate-950 font-black uppercase text-xs tracking-widest rounded-2xl hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-900/20">Add Category</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
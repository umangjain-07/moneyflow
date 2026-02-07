
import React, { useState, useEffect, useMemo } from 'react';
import { db, subscribe } from '../services/storage';
import { Transaction, Category, Account, TransactionType } from '../types';
import { Plus, Trash2, ArrowUpRight, ArrowDownLeft, Search, Filter, Tag, Heart, Coffee, Calendar, CreditCard, TrendingUp, X, Edit2, Check, ChevronDown } from 'lucide-react';

export const Transactions: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState(db.getSettings());
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<TransactionType>('EXPENSE');

  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    categoryId: '',
    accountId: '',
    toAccountId: '', 
    tags: '' 
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
      if (mode === 'TRANSFER') return;
      if (editingId) return; 

      const validCats = categories.filter(c => c.type === mode);
      const currentCat = categories.find(c => c.id === formData.categoryId);
      if (!currentCat || currentCat.type !== mode) {
          setFormData(prev => ({ ...prev, categoryId: validCats[0]?.id || '' }));
      }
  }, [mode, categories, editingId]);

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
        tags: ''
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
          tags: tx.tags?.join(', ') || ''
      });
      setIsModalOpen(true);
  };

  const handleSubmit = () => {
    const rawAmount = parseFloat(formData.amount);
    if (isNaN(rawAmount) || !formData.accountId) return;
    
    const amount = Math.abs(rawAmount);

    if (editingId) {
        db.deleteTransaction(editingId);
    }

    if (mode === 'TRANSFER') {
      db.addTransfer(formData.accountId, formData.toAccountId, amount, formData.date, formData.description || 'Transfer');
    } else {
      let catId = formData.categoryId;
      if (!catId) {
          const defaults = categories.filter(c => c.type === mode);
          catId = defaults[0]?.id;
      }

      const tagsArray = formData.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);

      db.addTransaction({
        date: formData.date,
        amount: amount,
        description: formData.description,
        categoryId: catId,
        accountId: formData.accountId,
        type: mode,
        tags: tagsArray
      });
    }

    setIsModalOpen(false);
    setFormData({ amount: '', description: '', date: new Date().toISOString().split('T')[0], categoryId: '', accountId: '', toAccountId: '', tags: '' });
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this transaction?')) {
      db.deleteTransaction(id);
      if(isModalOpen) setIsModalOpen(false);
    }
  };

  const filteredTransactions = transactions.filter(t => 
    t.description.toLowerCase().includes(search.toLowerCase()) ||
    t.amount.toString().includes(search) ||
    t.tags?.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
  );

  const currentFormAccount = accounts.find(a => a.id === formData.accountId);
  const currentFormSymbol = currentFormAccount ? getSymbol(currentFormAccount.currency) : settings.currencySymbol;

  const TransactionItem: React.FC<{ tx: Transaction, isMobile: boolean, index: number }> = ({ tx, isMobile, index }) => {
      const category = categories.find(c => c.id === tx.categoryId);
      const account = accounts.find(a => a.id === tx.accountId);
      const displayAmount = db.convertAmount(tx.amount, account?.currency || settings.currency, settings.currency);
      const displaySymbol = settings.currencySymbol;

      const getIcon = () => {
          if (tx.type === 'INCOME') return <ArrowDownLeft size={16} />;
          if (tx.type === 'INVESTMENT') return <TrendingUp size={16} />;
          return <ArrowUpRight size={16} />;
      };

      const getColorClass = () => {
          if (tx.type === 'INCOME') return 'bg-emerald-500/10 text-emerald-500';
          if (tx.type === 'INVESTMENT') return 'bg-purple-500/10 text-purple-500';
          return 'bg-rose-500/10 text-rose-500';
      };
      
      const getAmountColor = () => {
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
                            {category && <span className="text-[9px] bg-slate-800 text-slate-400 px-1 rounded-sm">{category.name}</span>}
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
                        backgroundColor: `${category?.color || '#64748b'}10`, 
                        color: category?.color || '#64748b',
                        borderColor: category?.color || '#64748b'
                    }}
                >
                    <span>{category?.icon || '🏷️'}</span>
                    {category?.name || 'General'}
                </span>
            </td>
            <td className="px-6 py-4 text-slate-400 text-xs">{account?.name || 'Unknown'}</td>
            <td className={`px-6 py-4 text-right font-bold font-mono ${getAmountColor()}`}>
                {tx.type === 'INCOME' ? '+' : '-'}{displaySymbol}{displayAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </td>
            <td className="px-6 py-4 text-right">
                <button onClick={(e) => { e.stopPropagation(); handleDelete(tx.id); }} className="text-slate-600 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100">
                <Trash2 size={16} />
                </button>
            </td>
        </tr>
      );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-100">Transactions</h1>
        
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search history..." 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 text-slate-200 rounded-xl outline-none focus:border-emerald-500/50 transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button onClick={handleOpenAdd} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-900/20 active:scale-95">
            <Plus size={18} />
            <span className="font-medium">New</span>
          </button>
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
              {filteredTransactions.map((tx, idx) => <TransactionItem key={tx.id} tx={tx} isMobile={false} index={idx} />)}
            </tbody>
        </table>
      </div>

      <div className="md:hidden">
          {filteredTransactions.map((tx, idx) => <TransactionItem key={tx.id} tx={tx} isMobile={true} index={idx} />)}
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
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Classification</label>
                        <div className="relative">
                            <select className="w-full appearance-none bg-slate-950 border border-slate-800 text-white rounded-2xl p-4 outline-none pr-10 shadow-inner cursor-pointer" value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})}>
                                {categories.filter(c => c.type === mode).map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                        </div>
                    </div>
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
    </div>
  );
};
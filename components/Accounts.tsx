import React, { useState, useEffect, useMemo } from 'react';
import { db, subscribe } from '../services/storage';
import { Account } from '../types';
import { Plus, Wallet, CreditCard, MoreVertical, TrendingUp, Globe, ChevronDown, X } from 'lucide-react';

export const Accounts: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState(db.getSettings());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAccount, setNewAccount] = useState<Partial<Account>>({
    name: '',
    type: 'BANK',
    currency: 'USD',
    initialBalance: 0
  });

  const loadAccounts = () => {
      setAccounts(db.getAccounts());
      setSettings(db.getSettings());
  };
  
  useEffect(() => {
    loadAccounts();
    const unsubscribe = subscribe(loadAccounts);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
      if (isModalOpen && !newAccount.currency) {
          setNewAccount(prev => ({ ...prev, currency: settings.currency }));
      }
  }, [isModalOpen, settings.currency]);

  const handleSave = () => {
    if (!newAccount.name) return;
    db.saveAccount(newAccount as Account);
    setIsModalOpen(false);
    setNewAccount({ name: '', type: 'BANK', currency: settings.currency, initialBalance: 0 });
  };

  const getIcon = (type: string) => {
      if (type === 'INVESTMENT') return <TrendingUp size={24} />;
      if (type === 'CASH') return <Wallet size={24} />;
      return <CreditCard size={24} />;
  };

  const getGradient = (type: string) => {
      if (type === 'INVESTMENT') return 'from-purple-500 via-indigo-500 to-indigo-600';
      if (type === 'CASH') return 'from-emerald-500 via-teal-500 to-teal-600';
      return 'from-blue-500 via-cyan-500 to-cyan-600';
  };

  const totalConverted = useMemo(() => {
      return accounts.reduce((sum, acc) => {
          return sum + db.convertAmount(acc.balance, acc.currency, settings.currency);
      }, 0);
  }, [accounts, settings.currency]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-100">Accounts</h1>
            <p className="text-slate-400 text-sm flex items-center gap-2">
                <Globe size={12} /> Total: {settings.currencySymbol}{totalConverted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
        </div>
        <button 
          onClick={() => {
              setNewAccount(prev => ({ ...prev, currency: settings.currency }));
              setIsModalOpen(true);
          }}
          className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-sm hover:shadow-md hover:shadow-slate-900/50"
        >
          <Plus size={18} />
          <span>Add Account</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {accounts.map((acc, idx) => {
            const convertedBalance = db.convertAmount(acc.balance, acc.currency, settings.currency);
            
            return (
              <div 
                key={acc.id} 
                className="relative overflow-hidden bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl border border-slate-800 group hover:border-slate-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                style={{animationDelay: `${idx * 100}ms`}}
              >
                 <div className={`absolute top-0 right-0 w-48 h-48 bg-gradient-to-br ${getGradient(acc.type)} opacity-10 rounded-bl-full -mr-10 -mt-10 transition-opacity duration-500 group-hover:opacity-20`} />
                 
                 <div className="flex justify-between items-start mb-6 relative z-10">
                    <div className={`p-3 rounded-xl border border-white/5 bg-slate-800 text-slate-300 shadow-inner group-hover:scale-110 transition-transform duration-300`}>
                        {getIcon(acc.type)}
                    </div>
                    <button className="text-slate-600 hover:text-slate-300 transition-colors bg-slate-800/50 p-1.5 rounded-lg opacity-0 group-hover:opacity-100">
                        <MoreVertical size={16} />
                    </button>
                 </div>

                 <div className="relative z-10">
                     <div className="flex justify-between items-center">
                        <p className="text-slate-400 text-sm font-medium">{acc.name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide border border-white/5 ${
                            acc.type === 'INVESTMENT' ? 'bg-purple-500/10 text-purple-400' :
                            acc.type === 'CASH' ? 'bg-emerald-500/10 text-emerald-400' :
                            'bg-blue-500/10 text-blue-400'
                        }`}>
                            {acc.type}
                        </span>
                     </div>
                     
                     <h3 className="text-3xl font-bold text-slate-100 mt-2 tracking-tight group-hover:scale-[1.02] origin-left transition-transform">
                        <span className="text-lg text-slate-500 mr-1 align-top">{settings.currencySymbol}</span>
                        {convertedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                     </h3>
                     
                     {acc.currency !== settings.currency && (
                         <p className="text-xs text-slate-500 mt-1 font-mono">
                             Original: {acc.currency} {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                         </p>
                     )}

                     <div className="mt-4 pt-4 border-t border-slate-800/50 flex justify-between items-center group-hover:border-slate-700/50 transition-colors">
                         <p className="text-xs text-slate-600">Initial Deposit</p>
                         <p className="text-xs text-slate-400 font-mono">{acc.currency} {acc.initialBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                     </div>
                 </div>
              </div>
            );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Add Account</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-slate-800 rounded-full text-slate-500 hover:text-white transition-all active:scale-90"><X size={18}/></button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Account Label</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner"
                  placeholder="e.g. HDFC Salary"
                  value={newAccount.name}
                  onChange={e => setNewAccount({...newAccount, name: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Vessel Type</label>
                    <div className="relative">
                        <select 
                            className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:border-emerald-500/50 cursor-pointer shadow-inner pr-10"
                            value={newAccount.type}
                            onChange={e => setNewAccount({...newAccount, type: e.target.value as any})}
                        >
                            <option value="BANK">Bank Vault</option>
                            <option value="CASH">Cash / Wallet</option>
                            <option value="INVESTMENT">Portfolio Account</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Denomination</label>
                    <input 
                        type="text" 
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white uppercase outline-none focus:border-emerald-500/50 shadow-inner"
                        value={newAccount.currency}
                        onChange={e => setNewAccount({...newAccount, currency: e.target.value})}
                    />
                  </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Starting Liquidity</label>
                <input 
                  type="number" 
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:border-emerald-500/50 shadow-inner font-mono text-xl"
                  value={newAccount.initialBalance}
                  onChange={e => setNewAccount({...newAccount, initialBalance: parseFloat(e.target.value) || 0})}
                />
              </div>

              <div className="flex gap-4 mt-8 pt-4 border-t border-slate-800">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-4 text-slate-500 font-bold uppercase text-xs tracking-widest hover:text-white transition-colors"
                >
                  Discard
                </button>
                <button 
                  onClick={handleSave}
                  className="flex-1 px-4 py-4 bg-emerald-600 text-slate-950 font-black uppercase text-xs tracking-widest rounded-2xl hover:bg-emerald-500 shadow-xl shadow-emerald-900/20 transition-all active:scale-95"
                >
                  Create Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

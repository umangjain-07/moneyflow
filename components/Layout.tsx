
import React, { ReactNode, useState, useEffect } from 'react';
import { LayoutDashboard, Wallet, CreditCard, ArrowRightLeft, Upload, Tags, Settings, LogOut, Check, Database, PieChart, Cloud, RefreshCw, Smartphone, Laptop, Zap, Trash2, Flame, User as UserIcon, RotateCcw, X, Sliders, ChevronRight, Compass } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { db, subscribe } from '../services/storage';
import { SyncConfig } from '../types';

interface LayoutProps {
  children: ReactNode;
}

const NavItem = ({ to, icon: Icon, label, active, onClick }: any) => (
  <Link
    to={to}
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group relative overflow-hidden ${
      active 
        ? 'text-emerald-400 font-semibold bg-emerald-500/10' 
        : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
    }`}
  >
    {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-r-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>}
    <Icon size={20} className={`transition-transform duration-300 ${active ? 'scale-110 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'group-hover:scale-110'}`} />
    <span className="relative z-10">{label}</span>
  </Link>
);

const MobileNavItem = ({ to, icon: Icon, label, active }: any) => (
  <Link
    to={to}
    className={`flex flex-col items-center justify-center w-full h-full transition-all duration-300 ${
      active 
        ? 'text-emerald-400' 
        : 'text-slate-500 hover:text-slate-300'
    }`}
  >
    <div className={`p-1.5 rounded-xl mb-1 transition-all duration-300 ${active ? 'bg-emerald-500/10 -translate-y-2 scale-110 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : ''}`}>
        <Icon size={22} className={active ? 'fill-emerald-500/20' : ''} strokeWidth={active ? 2.5 : 2} />
    </div>
    {active && <span className="text-[10px] font-bold animate-in fade-in slide-in-from-bottom-2 duration-300">{label}</span>}
  </Link>
);

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [settings, setSettings] = useState(db.getSettings());
  const [user, setUser] = useState(db.getCurrentUser());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(db.getSyncConfig());

  useEffect(() => {
    const unsubscribe = subscribe(() => {
        setSettings(db.getSettings());
        setUser(db.getCurrentUser());
        setSyncConfig(db.getSyncConfig());
    });
    return () => unsubscribe();
  }, []);

  const handleCurrencySelect = (c: string) => { db.updateSettings({ currency: c as any }); };
  const handleEmergencyFundChange = (months: number) => { db.updateSettings({ emergencyFundTargetMonths: months }); };
  const handleSavingsGoalChange = (val: number) => { db.updateSettings({ savingsGoalPercent: val }); };

  const navLinks = [
    { to: '/', icon: LayoutDashboard, label: 'Home' },
    { to: '/plan', icon: Compass, label: 'Plan' },
    { to: '/transactions', icon: ArrowRightLeft, label: 'Trans' },
    { to: '/accounts', icon: Wallet, label: 'Accts' },
    { to: '/reports', icon: PieChart, label: 'Report' },
    { to: '/categories', icon: Tags, label: 'Cats' },
    { to: '/import', icon: Upload, label: 'Import' },
  ];

  return (
    <div className="min-h-screen bg-[#020617] flex font-sans text-slate-200 selection:bg-emerald-500/30 overflow-hidden relative">
      
      {/* --- AMBIENT BACKGROUND --- */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/5 rounded-full blur-[120px] animate-pulse duration-[5000ms]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/5 rounded-full blur-[120px] animate-pulse duration-[7000ms] delay-1000" />
      </div>

      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="hidden lg:flex flex-col w-64 bg-[#0B0E14]/80 backdrop-blur-xl border-r border-slate-800/50 h-screen fixed left-0 top-0 z-40">
        <Link to="/" className="h-20 flex items-center px-6 border-b border-slate-800/50 justify-between group hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-3 text-emerald-400 font-bold text-xl tracking-tight group-hover:scale-105 transition-transform duration-300">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg p-1.5 text-slate-950 shadow-lg shadow-emerald-500/20">
                <CreditCard size={20} fill="currentColor" />
            </div>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-200">MoneyFlow</span>
          </div>
        </Link>

        <nav className="p-4 space-y-1 flex-1 overflow-y-auto custom-scrollbar">
          {navLinks.map((link) => <NavItem key={link.to} {...link} label={link.label === 'Home' ? 'Dashboard' : link.label === 'Trans' ? 'Transactions' : link.label === 'Accts' ? 'Accounts' : link.label === 'Report' ? 'Reports' : link.label === 'Cats' ? 'Categories' : link.label} active={location.pathname === link.to} />)}
        </nav>

        <div className="p-4 border-t border-slate-800/50 space-y-3 bg-[#0B0E14]/50">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 rounded-xl border border-slate-800/50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 p-[1px]">
                         <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center overflow-hidden">
                            {user?.photoURL ? <img src={user.photoURL} alt="u" className="w-full h-full object-cover"/> : <span className="font-bold text-xs">{user?.username.charAt(0).toUpperCase()}</span>}
                         </div>
                    </div>
                    <span className="text-sm text-slate-300 font-medium truncate max-w-[80px]">{user?.username}</span>
                </div>
                <button onClick={() => db.logout()} className="text-slate-500 hover:text-rose-500 transition-colors p-1.5 hover:bg-rose-500/10 rounded-lg" title="Logout"><LogOut size={16} /></button>
            </div>

            <button 
                onClick={() => setIsSettingsOpen(true)} 
                className="flex items-center justify-center gap-2 w-full px-2 py-3 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/5 rounded-xl transition-all text-xs font-bold uppercase tracking-wider border border-transparent hover:border-emerald-500/20 relative group"
            >
                <Settings size={14} className="group-hover:rotate-90 transition-transform duration-500" /> Settings
                {syncConfig.type === 'FIREBASE' && <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>}
            </button>
        </div>
      </aside>

      {/* --- MOBILE TOP HEADER --- */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#0B0E14]/80 backdrop-blur-xl border-b border-slate-800 z-50 px-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-emerald-400 font-bold text-lg tracking-tight active:scale-95 transition-transform">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg p-1.5 text-slate-950 shadow-lg shadow-emerald-500/20">
                <CreditCard size={18} fill="currentColor" />
            </div>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-200">MoneyFlow</span>
          </Link>
          
          <div className="flex items-center gap-3">
             {syncConfig.type === 'FIREBASE' && (
                 <div className="flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20 animate-pulse">
                    <Cloud size={12} className="text-emerald-500" />
                    <span className="text-[10px] font-bold text-emerald-500">Sync</span>
                 </div>
             )}
             <button onClick={() => setIsSettingsOpen(true)} className="relative group cursor-pointer active:scale-95">
                 <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 overflow-hidden group-active:scale-95 transition-transform">
                    {user?.photoURL ? <img src={user.photoURL} alt="u" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-400"><UserIcon size={16} /></div>}
                 </div>
             </button>
          </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden lg:ml-64 relative z-10">
        <div 
            key={location.pathname} 
            className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 scroll-smooth pt-20 pb-24 lg:pt-8 lg:pb-0 animate-in fade-in slide-in-from-bottom-4 duration-500"
        >
          <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 pb-10">
            {children}
          </div>
        </div>
      </main>

      {/* --- MOBILE BOTTOM NAV --- */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0B0E14]/90 backdrop-blur-xl border-t border-slate-800 z-50 pb-safe">
        <div className="flex justify-around items-center h-[68px] px-2">
          {navLinks.map((link) => <MobileNavItem key={link.to} {...link} active={location.pathname === link.to} />)}
        </div>
      </nav>

      {/* --- SETTINGS MODAL --- */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto relative z-10 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                        <Settings size={20} />
                    </div>
                    <h2 className="text-xl font-bold text-white">Settings</h2>
                </div>
                <button 
                    onClick={() => setIsSettingsOpen(false)} 
                    className="text-slate-500 hover:text-white transition-all bg-slate-800 hover:bg-slate-700 p-2 rounded-full active:scale-90"
                >
                    <X size={18} />
                </button>
            </div>
            
            <div className="space-y-8">
                
                {/* 1. FINANCIAL SLIDERS */}
                <div className="space-y-4">
                     <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Sliders size={14} className="text-emerald-500" />
                        Financial Targets
                     </h3>
                     <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-5 space-y-8">
                         
                         {/* Emergency Fund */}
                         <div>
                             <div className="flex justify-between items-center mb-4">
                                 <label className="text-sm font-semibold text-slate-300">Emergency Fund</label>
                                 <span className="px-3 py-1 bg-emerald-500 text-slate-950 text-xs font-bold rounded-full shadow-lg shadow-emerald-500/20">
                                    {settings.emergencyFundTargetMonths || 6} Months
                                 </span>
                             </div>
                             <div className="relative pt-1">
                                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-300 ease-out" 
                                        style={{width: `${((settings.emergencyFundTargetMonths || 6) / 12) * 100}%`}}
                                    />
                                </div>
                                <input 
                                    type="range" min="1" max="12" step="1"
                                    value={settings.emergencyFundTargetMonths || 6}
                                    onChange={(e) => handleEmergencyFundChange(parseInt(e.target.value))}
                                    className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
                                />
                             </div>
                             <div className="flex justify-between text-[10px] text-slate-600 mt-2 font-mono uppercase tracking-tighter">
                                 <span>Survivor</span>
                                 <span>Standard (6M)</span>
                                 <span>Invincible</span>
                             </div>
                         </div>

                         {/* Savings Rate */}
                         <div>
                             <div className="flex justify-between items-center mb-4">
                                 <label className="text-sm font-semibold text-slate-300">Savings Target</label>
                                 <span className="px-3 py-1 bg-purple-500 text-white text-xs font-bold rounded-full shadow-lg shadow-purple-500/20">
                                    {settings.savingsGoalPercent || 20}% Rate
                                 </span>
                             </div>
                             <div className="relative pt-1">
                                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-300 ease-out" 
                                        style={{width: `${((settings.savingsGoalPercent || 20) / 80) * 100}%`}}
                                    />
                                </div>
                                <input 
                                    type="range" min="0" max="80" step="5"
                                    value={settings.savingsGoalPercent || 20}
                                    onChange={(e) => handleSavingsGoalChange(parseInt(e.target.value))}
                                    className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
                                />
                             </div>
                             <div className="flex justify-between text-[10px] text-slate-600 mt-2 font-mono uppercase tracking-tighter">
                                 <span>Low</span>
                                 <span>Aggressive</span>
                                 <span>FIRE Mode</span>
                             </div>
                         </div>
                     </div>
                </div>

                {/* 2. CURRENCY SELECTOR (PILL STYLE) */}
                <div className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Base Currency</h3>
                    <div className="flex bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800">
                        {['USD', 'INR', 'EUR', 'GBP'].map(c => (
                            <button 
                                key={c} 
                                onClick={() => handleCurrencySelect(c)} 
                                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
                                    settings.currency === c 
                                    ? 'bg-slate-700 text-white shadow-xl scale-[1.02] ring-1 ring-white/10' 
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 3. DATA & ACCOUNT ACTIONS */}
                <div className="space-y-3 pt-4 border-t border-slate-800/50">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Account & Connectivity</h3>
                    
                    {/* Cloud Sync Toggle Mockup-style */}
                    <div className="group flex items-center justify-between p-4 bg-slate-900/50 hover:bg-slate-900 rounded-2xl border border-slate-800 transition-all">
                        <div className="flex items-center gap-4">
                            <div className={`p-2.5 rounded-xl transition-colors ${syncConfig.type === 'FIREBASE' ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                                <Cloud size={18} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-200">Cloud Real-time Sync</p>
                                <p className="text-[10px] text-slate-500 uppercase font-bold mt-0.5">
                                    {syncConfig.type === 'FIREBASE' ? 'Connected to Google' : 'Local Sandbox'}
                                </p>
                            </div>
                        </div>
                        <div className={`w-12 h-6 rounded-full p-1 transition-all duration-500 cursor-pointer ${syncConfig.type === 'FIREBASE' ? 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'bg-slate-700'}`}>
                            <div className={`w-4 h-4 bg-white rounded-full shadow-lg transition-transform duration-300 transform ${syncConfig.type === 'FIREBASE' ? 'translate-x-6' : 'translate-x-0'}`}></div>
                        </div>
                    </div>

                    <button onClick={() => db.logout()} className="w-full flex items-center justify-between p-4 bg-slate-900/50 hover:bg-slate-900 rounded-2xl border border-slate-800 transition-all group">
                         <div className="flex items-center gap-4">
                            <div className="p-2.5 rounded-xl bg-slate-800 text-slate-400 group-hover:text-slate-200 transition-colors">
                                <LogOut size={18} />
                            </div>
                            <span className="text-sm font-bold text-slate-400 group-hover:text-white transition-colors">Sign Out</span>
                         </div>
                         <ChevronRight size={16} className="text-slate-600 group-hover:translate-x-1 transition-all" />
                    </button>

                    <button 
                        onClick={() => { 
                            if(confirm('Are you absolutely sure? This will wipe ALL your data and cannot be undone.')) {
                                db.resetEverything(); 
                                window.location.reload();
                            }
                        }}
                        className="w-full flex items-center justify-between p-4 bg-rose-500/5 hover:bg-rose-500/10 rounded-2xl border border-rose-500/10 transition-all group"
                    >
                         <div className="flex items-center gap-4">
                            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
                                <Trash2 size={18} />
                            </div>
                            <span className="text-sm font-bold text-rose-500">Hard Reset</span>
                         </div>
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
        
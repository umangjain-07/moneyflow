
import React, { useState } from 'react';
import { db } from '../services/storage';
import { CreditCard, Lock, User, ArrowRight, Chrome, Cloud, AlertTriangle } from 'lucide-react';

export const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ username: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [isCloudLoading, setIsCloudLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.username || !formData.password) { setError('Please fill in all fields'); return; }
    if (formData.password.length < 4) { setError('Password must be at least 4 characters'); return; }

    if (!isLogin && formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        return;
    }

    if (isLogin) {
      if(!db.login(formData.username, formData.password)) setError('Invalid credentials or user does not exist.');
    } else {
      if(!db.register(formData.username, formData.password)) setError('Username already taken');
    }
  };

  const handleGoogleAuth = async () => {
      setIsCloudLoading(true);
      setError('');
      try {
          await db.authenticateWithGoogle();
      } catch (e: any) {
          setError(e.message || "Google Auth Failed.");
      } finally {
          setIsCloudLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-4 bg-emerald-500/10 rounded-2xl mb-4 ring-1 ring-emerald-500/20 shadow-lg shadow-emerald-500/10 animate-in zoom-in duration-500">
            <CreditCard className="w-10 h-10 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">MoneyFlow</h1>
          <p className="text-slate-400">Your personal wealth operating system</p>
        </div>

        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-8 shadow-2xl animate-in slide-in-from-bottom-5 duration-500">
          <div className="flex gap-4 mb-8">
            <button onClick={() => { setIsLogin(true); setError(''); setFormData({username: '', password: '', confirmPassword: ''}); }} className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${isLogin ? 'border-emerald-500 text-emerald-500' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>Sign In</button>
            <button onClick={() => { setIsLogin(false); setError(''); setFormData({username: '', password: '', confirmPassword: ''}); }} className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${!isLogin ? 'border-emerald-500 text-emerald-500' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>Create Account</button>
          </div>

          <div className="space-y-5">
             <button 
                type="button"
                onClick={handleGoogleAuth}
                disabled={isCloudLoading}
                className="w-full bg-white text-slate-900 font-semibold py-3 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-100 transition-colors disabled:opacity-70 disabled:cursor-wait"
             >
                {isCloudLoading ? <Cloud className="animate-bounce" size={20} /> : <Chrome size={20} className="text-blue-500" />}
                {isCloudLoading ? 'Connecting...' : 'Sign in with Google'}
             </button>
             
             <div className="relative flex items-center py-2">
                 <div className="flex-grow border-t border-slate-800"></div>
                 <span className="flex-shrink-0 mx-4 text-slate-600 text-xs uppercase">Or with local account</span>
                 <div className="flex-grow border-t border-slate-800"></div>
             </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Username</label>
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={18} />
                  <input type="text" className="w-full bg-[#020617] border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-700 focus:outline-none focus:border-emerald-500 transition-colors" placeholder="Enter username" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={18} />
                  <input type="password" className="w-full bg-[#020617] border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-700 focus:outline-none focus:border-emerald-500 transition-colors" placeholder="Enter password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                </div>
              </div>

              {!isLogin && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Confirm Password</label>
                      <div className="relative group">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={18} />
                          <input type="password" className="w-full bg-[#020617] border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-700 focus:outline-none focus:border-emerald-500 transition-colors" placeholder="Confirm password" value={formData.confirmPassword} onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })} />
                      </div>
                  </div>
              )}

              {error && <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm text-center animate-in shake">{error}</div>}

              <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 group">
                {isLogin ? 'Sign In' : 'Create Account'}
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

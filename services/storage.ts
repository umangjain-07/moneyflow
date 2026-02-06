
import { Account, Category, Transaction, AppSettings, User, ImportRule, SyncConfig, FinancialHealth, Goal, FinancialPlan } from '../types';
// @ts-ignore
import { initializeApp } from 'firebase/app';
// @ts-ignore
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
// @ts-ignore
import { getFirestore, doc, setDoc, getDoc, collection } from 'firebase/firestore';

const getEnv = (key: string): string => {
    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[`VITE_${key}`]) return import.meta.env[`VITE_${key}`];
        if (typeof process !== 'undefined' && process.env && process.env[`REACT_APP_${key}`]) return process.env[`REACT_APP_${key}`];
    } catch (e) {}
    return '';
};

const FIREBASE_CONFIG = {
  apiKey: getEnv('FIREBASE_API_KEY'),
  authDomain: getEnv('FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('FIREBASE_APP_ID')
};

const TAG_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#14b8a6'];
export const getColorForName = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return TAG_COLORS[Math.abs(hash % TAG_COLORS.length)];
};

type Listener = () => void;
const listeners: Set<Listener> = new Set();
const notify = () => listeners.forEach(l => l());
export const subscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };

const DEFAULT_SETTINGS: AppSettings = { currency: 'INR', currencySymbol: '₹', emergencyFundTargetMonths: 6, savingsGoalPercent: 20 };

// Updated Static Rates (Approximate Market Values)
// Base: 1 USD
const RATES: Record<string, number> = { 
    USD: 1, 
    EUR: 0.95, // 1 USD ~ 0.95 EUR
    GBP: 0.82, // 1 USD ~ 0.82 GBP
    INR: 87.50, // 1 USD ~ 87.50 INR
    JPY: 155,
    CAD: 1.42,
    AUD: 1.58,
    CNY: 7.25
};

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥', CAD: 'C$', AUD: 'A$', CNY: '¥' };

export const getAutoEmoji = (name: string): string => {
    const n = name.toLowerCase();
    const map: Record<string, string> = {
        'salary': '💰', 'income': '💵', 'rent': '🏠', 'utility': '💡', 'food': '🍔', 'grocery': '🛒', 'coffee': '☕',
        'transport': '🚌', 'fuel': '⛽', 'uber': '🚖', 'health': '⚕️', 'gym': '💪', 'shopping': '🛍️', 'invest': '📈',
        'crypto': '₿', 'bank': '🏦', 'subscription': '📅', 'game': '🎮', 'movie': '🎬'
    };
    for (const key in map) if (n.includes(key)) return map[key];
    return '🏷️';
};

const generateId = () => Math.random().toString(36).substr(2, 9);

let firestore: any = null, firebaseAuth: any = null;

class StorageService {
  private pushTimer: any = null;

  constructor() { this.initFirebase(); }
  initFirebase() {
      if (!FIREBASE_CONFIG.apiKey) return;
      try {
          const app = initializeApp(FIREBASE_CONFIG);
          firebaseAuth = getAuth(app);
          firestore = getFirestore(app);
          onAuthStateChanged(firebaseAuth, async (u: any) => {
              if (u) {
                  this.setSession(u.uid);
                  await this.pullFromCloud();
              }
          });
      } catch (e) {
          console.error("Firebase Init Failed:", e);
      }
  }
  private setSession(id: string) { localStorage.setItem('moneyflow_session', id); notify(); }
  private getSession() { return localStorage.getItem('moneyflow_session'); }
  private k(key: string) { const id = this.getSession(); if (!id) throw new Error("Unauthorized"); return `user_${id}_${key}`; }
  private get<T>(key: string, def: T): T { try { const s = localStorage.getItem(this.k(key)); return s ? JSON.parse(s) : def; } catch (e) { return def; } }
  private set<T>(key: string, v: T, skipSync = false) { localStorage.setItem(this.k(key), JSON.stringify(v)); notify(); if (!skipSync) this.scheduleCloudPush(); }
  
  private getFullState() {
      return {
          settings: this.getSettings(),
          accounts: this.getAccounts(),
          categories: this.getCategories(),
          transactions: this.getTransactions(),
          goals: this.getGoals(),
          importRules: this.getImportRules(),
          plan: this.getPlan()
      };
  }

  private restoreFullState(data: any) {
      if(data.settings) this.set('settings', data.settings, true);
      if(data.accounts) this.set('accounts', data.accounts, true);
      if(data.categories) this.set('categories', data.categories, true);
      if(data.transactions) this.set('transactions', data.transactions, true);
      if(data.goals) this.set('goals', data.goals, true);
      if(data.importRules) this.set('importRules', data.importRules, true);
      if(data.plan) this.set('plan', data.plan, true);
      notify();
  }

  private scheduleCloudPush() { 
      if (firestore && this.getSession()) {
          // Debounce writes to avoid spamming Firestore on every keystroke
          if (this.pushTimer) clearTimeout(this.pushTimer);
          this.pushTimer = setTimeout(() => this.pushToCloud(), 3000); 
      }
  }

  async pushToCloud() { 
      const id = this.getSession(); 
      if (id && firestore) {
          try {
            await setDoc(doc(firestore, 'users', id), { ...this.getFullState(), updatedAt: new Date().toISOString() }, { merge: true }); 
          } catch(e) { console.error("Cloud Push Failed", e); }
      }
  }

  async pullFromCloud() { 
      const id = this.getSession(); 
      if (id && firestore) { 
          try {
            const s = await getDoc(doc(firestore, 'users', id)); 
            if (s.exists()) this.restoreFullState(s.data()); 
          } catch(e) { console.error("Cloud Pull Failed", e); }
      } 
  }

  async authenticateWithGoogle() { 
      if (!firebaseAuth) throw new Error("Database not configured");
      const p = new GoogleAuthProvider(); 
      const r = await signInWithPopup(firebaseAuth, p); 
      this.setSession(r.user.uid); 
      await this.pullFromCloud(); 
      return true; 
  }

  async logout() { 
      if (firebaseAuth) await signOut(firebaseAuth); 
      localStorage.removeItem('moneyflow_session'); 
      notify(); 
  }

  async login(u: string, p: string): Promise<{success: boolean, error?: string}> { 
      if (firebaseAuth) {
          try {
             // Heuristic: If it doesn't look like an email, treat as username@moneyflow.app
             // This keeps the MVP simple while using robust Email/Pass auth
             let email = u;
             if (!email.includes('@')) email = `${u}@moneyflow.app`;

             const cred = await signInWithEmailAndPassword(firebaseAuth, email, p);
             this.setSession(cred.user.uid);
             await this.pullFromCloud();
             return { success: true };
          } catch(e: any) {
             let msg = "Login failed.";
             if(e.code === 'auth/invalid-credential') msg = "Incorrect password or user not found.";
             if(e.code === 'auth/invalid-email') msg = "Invalid username format.";
             return { success: false, error: msg };
          }
      } else {
          // Local Fallback
          this.setSession(u); 
          return { success: true }; 
      }
  }

  async register(u: string, p: string): Promise<{success: boolean, error?: string}> { 
      if (firebaseAuth) {
          try {
             let email = u;
             if (!email.includes('@')) email = `${u}@moneyflow.app`;

             const cred = await createUserWithEmailAndPassword(firebaseAuth, email, p);
             this.setSession(cred.user.uid);
             // Initialize default data for new user in cloud
             this.set('settings', DEFAULT_SETTINGS, true); 
             await this.pushToCloud();
             return { success: true };
          } catch(e: any) {
             let msg = "Registration failed.";
             if(e.code === 'auth/email-already-in-use') msg = "Username already taken.";
             if(e.code === 'auth/weak-password') msg = "Password is too weak.";
             return { success: false, error: msg };
          }
      } else {
          // Local Fallback
          this.setSession(u); 
          this.set('settings', DEFAULT_SETTINGS); 
          return { success: true };
      }
  }

  isLoggedIn() { return !!this.getSession(); }
  getCurrentUser() { return { username: this.getSession() || 'User', id: this.getSession() || '', photoURL: undefined as string | undefined }; }
  getSettings() { return this.get<AppSettings>('settings', DEFAULT_SETTINGS); }
  updateSettings(s: Partial<AppSettings>) { 
      const cur = this.getSettings(); 
      const upd = { ...cur, ...s };
      if (upd.currency) upd.currencySymbol = SYMBOLS[upd.currency] || '$';
      this.set('settings', upd); 
  }
  
  convertAmount(a: number, f: string, t: string) { 
      // If currency is not found in rates, fallback to 1 (treat as USD) but log warning in dev
      const rateF = RATES[f] || 1;
      const rateT = RATES[t] || 1;
      return f === t ? a : (a / rateF) * rateT; 
  }
  
  private calculateAccountBalanceAt(account: Account, transactions: Transaction[], endDate: string): number {
      let b = account.initialBalance;
      transactions.filter(t => t.accountId === account.id && t.date <= endDate).forEach(t => {
          if (t.type === 'INCOME') b += t.amount;
          else if (t.type === 'EXPENSE' || t.type === 'INVESTMENT') b -= t.amount;
      });
      return b;
  }

  getAccounts() { 
      const accs = this.get<Account[]>('accounts', []); 
      const txs = this.getTransactions(); 
      const nowStr = new Date().toISOString().split('T')[0];
      return accs.map(a => ({
          ...a,
          balance: this.calculateAccountBalanceAt(a, txs, nowStr)
      }));
  }

  saveAccount(a: Account) { const accs = this.getAccounts(); if (a.id) this.set('accounts', accs.map(ex => ex.id === a.id ? a : ex)); else this.set('accounts', [...accs, { ...a, id: generateId() }]); }
  getCategories() { return this.get<Category[]>('categories', []); }
  
  saveCategory(c: Category) { 
      const cats = this.getCategories(); 
      if (!c.icon) c.icon = getAutoEmoji(c.name); 
      
      const existingIndex = cats.findIndex(ex => ex.id === c.id);
      
      if (existingIndex > -1) {
          const oldCat = cats[existingIndex];
          if (oldCat.type !== c.type) {
              const txs = this.getTransactions();
              const updatedTxs = txs.map(t => 
                  t.categoryId === c.id ? { ...t, type: c.type } : t
              );
              this.set('transactions', updatedTxs);
          }
          cats[existingIndex] = c;
          this.set('categories', cats);
      } else {
          this.set('categories', [...cats, { ...c, id: c.id || generateId() }]);
      }
  }

  deleteCategory(id: string) { this.set('categories', this.getCategories().filter(c => c.id !== id)); }
  resetCategories() { this.set('categories', [], true); }
  guessNecessity(name: string): 'NEED' | 'WANT' {
      const n = name.toLowerCase();
      const needs = ['rent', 'mortgage', 'bill', 'utility', 'fuel', 'grocery', 'medical', 'tax', 'loan', 'wifi'];
      return needs.some(k => n.includes(k)) ? 'NEED' : 'WANT';
  }
  ensureCategory(name: string, type: 'INCOME' | 'EXPENSE' | 'INVESTMENT', group: string = 'General'): { id: string, isNew: boolean } {
      const cats = this.getCategories();
      let ex = cats.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (ex) {
          const guessed = this.guessNecessity(name);
          if (ex.necessity !== guessed && !ex.necessity) { ex.necessity = guessed; this.saveCategory(ex); }
          return { id: ex.id, isNew: false };
      }
      const cat = { id: generateId(), name, group, type, necessity: this.guessNecessity(name), color: getColorForName(name), icon: getAutoEmoji(name) };
      this.saveCategory(cat);
      return { id: cat.id, isNew: true };
  }
  mergeCategory(s: string, t: string) { if(s===t) return; const txs = this.getTransactions().map(tx=>tx.categoryId===s?{...tx, categoryId:t}:tx); this.set('transactions', txs); this.deleteCategory(s); }
  getTransactions() { return this.get<Transaction[]>('transactions', []).sort((a,b)=>b.date.localeCompare(a.date)); }
  addTransaction(t: Omit<Transaction, 'id'>) { this.set('transactions', [{ ...t, id: generateId() }, ...this.getTransactions()]); }
  updateTransaction(t: Transaction) { this.set('transactions', this.getTransactions().map(ex=>ex.id===t.id?t:ex)); }
  bulkAddTransactions(txs: Omit<Transaction, 'id'>[]) { this.set('transactions', [...txs.map(t=>({...t, id:generateId()})), ...this.getTransactions()]); }
  deleteTransaction(id: string) { this.set('transactions', this.getTransactions().filter(t=>t.id!==id)); }
  getGoals() { return this.get<Goal[]>('goals', []); }
  saveGoal(g: Goal) { const goals = this.getGoals(); if(g.id) this.set('goals', goals.map(ex=>ex.id===g.id?g:ex)); else this.set('goals', [...goals, {...g, id:generateId()}]); }
  deleteGoal(id: string) { this.set('goals', this.getGoals().filter(g => g.id !== id)); }
  
  addTransfer(fromId: string, toId: string, amount: number, date: string, description: string) {
      const fromTxId = generateId();
      const toTxId = generateId();
      const txs = this.getTransactions();
      const outTx: Transaction = { id: fromTxId, date, amount, description: description, categoryId: 'transfer_out', accountId: fromId, type: 'EXPENSE', relatedTransactionId: toTxId };
      const inTx: Transaction = { id: toTxId, date, amount, description: description, categoryId: 'transfer_in', accountId: toId, type: 'INCOME', relatedTransactionId: fromTxId };
      this.set('transactions', [outTx, inTx, ...txs]);
  }

  getImportRules() { return this.get<ImportRule[]>('importRules', []); }
  saveImportRule(r: ImportRule) { const rs = this.getImportRules(); const ex = rs.findIndex(x => x.keyword === r.keyword); if (ex > -1) rs[ex] = r; else rs.push(r); this.set('importRules', rs); }
  getSyncConfig(): SyncConfig { return { type: firestore ? 'FIREBASE' : 'LOCAL', lastSyncedAt: new Date().toISOString() }; }
  
  // Plan
  getPlan() { return this.get<FinancialPlan | null>('plan', null); }
  savePlan(p: FinancialPlan) { this.set('plan', p); }

  resetEverything() { 
      localStorage.removeItem(this.k('settings')); 
      localStorage.removeItem(this.k('accounts')); 
      localStorage.removeItem(this.k('categories')); 
      localStorage.removeItem(this.k('transactions')); 
      localStorage.removeItem(this.k('goals'));
      localStorage.removeItem(this.k('importRules'));
      localStorage.removeItem(this.k('plan'));
      notify(); 
  }

  getHistory(months: number | 'ALL'): any[] {
      const txs = this.getTransactions();
      const settings = this.getSettings();
      const now = new Date();
      const dataMap = new Map<string, { income: number, expense: number, investment: number, date: string }>();
      
      let startYear = now.getFullYear();
      let startMonth = now.getMonth();
      let monthCount = 0;

      if (months === 'ALL') {
          if (txs.length > 0) {
            const earliest = new Date(txs[txs.length - 1].date);
            startYear = earliest.getFullYear();
            startMonth = earliest.getMonth();
            monthCount = (now.getFullYear() - startYear) * 12 + (now.getMonth() - startMonth) + 1;
          } else {
            monthCount = 6;
          }
      } else {
          monthCount = months;
          const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
          startYear = startDate.getFullYear();
          startMonth = startDate.getMonth();
      }

      for (let i = 0; i < monthCount; i++) {
          const d = new Date(startYear, startMonth + i, 1);
          const year = d.getFullYear();
          const month = d.getMonth() + 1;
          const key = `${year}-${String(month).padStart(2, '0')}`;
          
          dataMap.set(key, { income: 0, expense: 0, investment: 0, date: key });
      }

      const accounts = this.getAccounts();
      txs.forEach(t => {
          const key = t.date.substring(0, 7);
          
          if (dataMap.has(key)) {
              const acc = accounts.find(a => a.id === t.accountId);
              const val = this.convertAmount(t.amount, acc?.currency || settings.currency, settings.currency);
              const entry = dataMap.get(key)!;
              
              if (t.categoryId === 'transfer_in' || t.categoryId === 'transfer_out') return;
              
              if (t.type === 'INCOME') entry.income += val;
              else if (t.type === 'EXPENSE') entry.expense += val;
              else if (t.type === 'INVESTMENT') entry.investment += val;
          }
      });

      const result = Array.from(dataMap.values()).map(d => {
          const [y, m] = d.date.split('-').map(Number);
          const dateObj = new Date(y, m - 1, 1);
          return {
              ...d,
              formattedDate: dateObj.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
              endNetWorth: 0 
          };
      });

      let runningBalance = accounts.reduce((sum, a) => sum + this.convertAmount(a.initialBalance, a.currency, settings.currency), 0);
      const startKey = result[0]?.date || '0000-00';
      let preGraphDelta = 0;
      txs.forEach(t => {
          if (t.date.substring(0, 7) < startKey) {
             const acc = accounts.find(a => a.id === t.accountId);
             const val = this.convertAmount(t.amount, acc?.currency || settings.currency, settings.currency);
             if (t.categoryId === 'transfer_in' || t.categoryId === 'transfer_out') return;
             if (t.type === 'INCOME') preGraphDelta += val;
             if (t.type === 'EXPENSE') preGraphDelta -= val;
          }
      });

      const initialTotalBalance = accounts.reduce((sum, a) => sum + this.convertAmount(a.initialBalance, a.currency, settings.currency), 0);
      let currentNetWorth = initialTotalBalance + preGraphDelta;

      return result.map(d => {
          const delta = d.income - d.expense; 
          currentNetWorth += delta;
          return { ...d, endNetWorth: currentNetWorth };
      });
  }

  getFinancialHealth(): FinancialHealth {
      const accounts = this.getAccounts();
      const settings = this.getSettings();
      const transactions = this.getTransactions();
      
      let liquid = 0;
      let investedInAccounts = 0;
      
      accounts.forEach(a => {
          const val = this.convertAmount(a.balance, a.currency, settings.currency);
          if (a.type === 'INVESTMENT') investedInAccounts += val;
          else liquid += val;
      });

      let investedFlow = 0;
      transactions.forEach(t => {
          if (t.type === 'INVESTMENT') {
              const acc = accounts.find(a => a.id === t.accountId);
              const val = this.convertAmount(t.amount, acc?.currency || settings.currency, settings.currency);
              investedFlow += val;
          }
      });

      const totalInvested = investedInAccounts + investedFlow;
      const totalAssets = liquid + totalInvested;
      const history = this.getHistory(3);
      const avgBurn = history.reduce((sum, m) => sum + m.expense, 0) / (history.length || 1);

      return {
          netWorth: totalAssets,
          totalAssets,
          totalInvestments: totalInvested,
          liquidAssets: liquid,
          investedAssets: totalInvested,
          monthlyBurnRate: avgBurn,
          runwayMonths: avgBurn > 0 ? liquid / avgBurn : 0,
          savingsRate: 0,
          recommendations: []
      };
  }
}

export const db = new StorageService();

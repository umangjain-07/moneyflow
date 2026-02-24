
import { Account, Category, Transaction, AppSettings, User, ImportRule, SyncConfig, FinancialHealth, Goal, FinancialPlan } from '../types';
import { openDB, IDBPDatabase } from 'idb';
// @ts-ignore
import { initializeApp } from 'firebase/app';
// @ts-ignore
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
// @ts-ignore
import { getDatabase, ref, set, onValue, get, child, update, off } from 'firebase/database';

// Helper to safely access environment variables in various environments (Vite, CRA, Node)
export const getEnv = (key: string): string => {
    let value = '';
    
    // 1. Explicit checks for specific keys to ensure Vite static replacement works
    // @ts-ignore
    const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
    
    if (metaEnv) {
        if (key === 'GEMINI_API_KEY') value = metaEnv.VITE_GEMINI_API_KEY;
        else if (key === 'FIREBASE_API_KEY') value = metaEnv.VITE_FIREBASE_API_KEY;
        else if (key === 'FIREBASE_AUTH_DOMAIN') value = metaEnv.VITE_FIREBASE_AUTH_DOMAIN;
        else if (key === 'FIREBASE_PROJECT_ID') value = metaEnv.VITE_FIREBASE_PROJECT_ID;
        else if (key === 'FIREBASE_STORAGE_BUCKET') value = metaEnv.VITE_FIREBASE_STORAGE_BUCKET;
        else if (key === 'FIREBASE_MESSAGING_SENDER_ID') value = metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID;
        else if (key === 'FIREBASE_APP_ID') value = metaEnv.VITE_FIREBASE_APP_ID;
        else if (key === 'FIREBASE_DATABASE_URL') value = metaEnv.VITE_FIREBASE_DATABASE_URL;
        
        // Fallback for dynamic access if not explicitly listed above
        if (!value) {
             value = metaEnv[`VITE_${key}`] || metaEnv[key];
        }
    }

    // 2. Fallback to process.env
    if (!value && typeof process !== 'undefined' && process.env) {
        value = process.env[`VITE_${key}`] || process.env[`REACT_APP_${key}`] || process.env[key] || '';
    }

    return value || '';
};

// Explicit configuration object for Firebase to ensure bundlers pick up the keys
const FIREBASE_CONFIG = {
  apiKey: getEnv('FIREBASE_API_KEY'),
  authDomain: getEnv('FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('FIREBASE_APP_ID'),
  databaseURL: getEnv('FIREBASE_DATABASE_URL')
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

let rtdb: any = null, firebaseAuth: any = null;

class StorageService {
  private pushTimer: any = null;
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private memoryCache: Record<string, any> = {};
  public initPromise: Promise<void>;

  constructor() { 
      this.initPromise = this.initLocalDB();
      // Wait for local DB to be ready before initializing Firebase to prevent race conditions
      this.initPromise.then(() => this.initFirebase());
  }
  
  async initLocalDB() {
      try {
        this.dbPromise = openDB('moneyflow_db', 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('store')) {
                    db.createObjectStore('store');
                }
            },
        });
        const db = await this.dbPromise;
        const keys = await db.getAllKeys('store');
        for (const key of keys) {
            const val = await db.get('store', key);
            this.memoryCache[key as string] = val;
        }
        
        await this.syncWithLocalStorage();
        notify();
      } catch (e) {
          console.error("IDB Init Failed", e);
      }
  }

  private async syncWithLocalStorage() {
      const session = this.getSession();
      if (!session) return;
      
      const db = await this.dbPromise;
      if (!db) return;

      const keysToCheck = ['settings', 'accounts', 'categories', 'transactions', 'goals', 'importRules', 'plan'];
      for (const key of keysToCheck) {
          const fullKey = `user_${session}_${key}`;
          const lsValue = localStorage.getItem(fullKey);
          const idbValue = this.memoryCache[fullKey];

          if (lsValue) {
              try {
                  const parsed = JSON.parse(lsValue);
                  if (!idbValue) {
                      this.memoryCache[fullKey] = parsed;
                      await db.put('store', parsed, fullKey);
                  } else if (key === 'transactions' && Array.isArray(parsed) && Array.isArray(idbValue)) {
                      // Merge transactions
                      const idbIds = new Set(idbValue.map((t: any) => t.id));
                      const newItems = parsed.filter((t: any) => !idbIds.has(t.id));
                      if (newItems.length > 0) {
                          const merged = [...idbValue, ...newItems];
                          this.memoryCache[fullKey] = merged;
                          await db.put('store', merged, fullKey);
                      }
                  }
              } catch(e) { console.error("Sync Error", e); }
          }
      }
  }
  
  initFirebase() {
      // 1. Strict Validation of Configuration
      const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
      const invalidKeys = requiredKeys.filter(key => {
          const val = FIREBASE_CONFIG[key as keyof typeof FIREBASE_CONFIG];
          return !val || val.includes('your_') || val.includes('undefined') || val.length < 5;
      });

      if (invalidKeys.length > 0) {
        console.warn(`[MoneyFlow] Firebase Config Incomplete. Missing: ${invalidKeys.join(', ')}. Switching to LOCAL OFFLINE MODE.`);
        this.downgradeToLocal();
        return;
      }

      // 2. Attempt Initialization
      try {
          // Sanitize databaseURL if user pasted the console URL
          if (FIREBASE_CONFIG.databaseURL && FIREBASE_CONFIG.databaseURL.includes('console.firebase.google.com')) {
             console.warn("[MoneyFlow] Invalid databaseURL detected (looks like console URL). Attempting to infer correct URL...");
             // Try to construct standard URL from projectId if available
             if (FIREBASE_CONFIG.projectId) {
                 FIREBASE_CONFIG.databaseURL = `https://${FIREBASE_CONFIG.projectId}-default-rtdb.firebaseio.com`;
                 console.log(`[MoneyFlow] Inferred databaseURL: ${FIREBASE_CONFIG.databaseURL}`);
             }
          }

          const app = initializeApp(FIREBASE_CONFIG);
          firebaseAuth = getAuth(app);
          rtdb = getDatabase(app);
          
          onAuthStateChanged(firebaseAuth, async (u: any) => {
              if (u) {
                  this.setSession(u.uid);
                  this.setupRealtimeSync(u.uid);
              } else {
                  this.cleanupRealtimeSync();
              }
          });
          console.log("[MoneyFlow] Firebase Initialized. Realtime Sync Active.");
      } catch (e) {
          console.error("[MoneyFlow] Firebase Init Crashed. Falling back to LOCAL MODE.", e);
          this.downgradeToLocal();
      }
  }

  private syncUnsubscribe: any = null;
  private syncInterval: any = null;

  private setupRealtimeSync(uid: string) {
      if (!rtdb) return;
      const userRef = ref(rtdb, `users/${uid}`);
      
      // 1. Realtime Listener (Push-based)
      this.syncUnsubscribe = onValue(userRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
              console.log("[MoneyFlow] Realtime Update Received");
              this.restoreFullState(data);
          }
      });

      // 2. Polling Fallback (Pull-based) - Every 5 seconds
      // This ensures that even if the realtime listener disconnects or misses an event,
      // we force a sync periodically.
      this.syncInterval = setInterval(async () => {
          try {
              const snapshot = await get(userRef);
              if (snapshot.exists()) {
                   // We don't log here to avoid spamming console
                   this.restoreFullState(snapshot.val());
              }
          } catch (e) {
              console.warn("[MoneyFlow] Polling Sync Failed", e);
          }
      }, 5000);
  }

  private cleanupRealtimeSync() {
      if (this.syncUnsubscribe) {
          this.syncUnsubscribe();
          this.syncUnsubscribe = null;
      }
      if (this.syncInterval) {
          clearInterval(this.syncInterval);
          this.syncInterval = null;
      }
  }

  private downgradeToLocal() {
      firebaseAuth = null;
      rtdb = null;
      notify();
  }

  private setSession(id: string) { 
      localStorage.setItem('moneyflow_session', id); 
      this.syncWithLocalStorage();
      notify(); 
  }
  private getSession() { return localStorage.getItem('moneyflow_session'); }
  private k(key: string) { const id = this.getSession(); if (!id) throw new Error("Unauthorized"); return `user_${id}_${key}`; }
  
  private get<T>(key: string, def: T): T { 
      const k = this.k(key); 
      if (k in this.memoryCache) return this.memoryCache[k];
      try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : def; } catch (e) { return def; } 
  }

  private set<T>(key: string, v: T, skipSync = false) { 
      const k = this.k(key); 
      this.memoryCache[k] = v;
      localStorage.setItem(k, JSON.stringify(v));
      if (this.dbPromise) this.dbPromise.then(db => db.put('store', v, k));
      notify(); 
      if (!skipSync) this.scheduleCloudPush(key); 
  }
  
  private getFullState() {
      return {
          settings: this.getSettings(),
          accounts: this.getAccounts(),
          categories: this.getCategories(),
          transactions: this.getTransactions(),
          goals: this.getGoals(),
          importRules: this.getImportRules(),
          plan: this.getPlan(),
          profile: this.get('profile', null)
      };
  }

  // Smart Merge Strategy: "Git-like" checkout
  // Instead of overwriting, we merge lists by ID to preserve local offline changes if possible,
  // but generally treat Server as Source of Truth for conflicts.
  private restoreFullState(data: any) {
      const mergeList = (key: string, remoteList: any[]) => {
          if (!Array.isArray(remoteList)) return;
          const localList = this.get<any[]>(key, []);
          
          // Create a map of remote items
          const remoteMap = new Map(remoteList.map(i => [i.id, i]));
          
          // Start with remote items (Server Truth)
          const merged = [...remoteList];
          
          // Add local items that are NOT in remote (Offline creations)
          // Note: This assumes deletions are handled by the server. 
          // If a user deleted an item on another device, it won't be in remoteList.
          // If we keep local items not in remote, we might resurrect deleted items.
          // However, for a simple sync, "Server Wins" usually means "Take Server State".
          // BUT, if we have offline unsynced items, we want to keep them.
          // A true sync requires "lastSyncedAt" timestamps per item.
          // For this MVP, we will assume:
          // 1. If it's in Remote, use Remote.
          // 2. If it's in Local but NOT Remote, keep it ONLY if it was created recently (naive) or just keep it.
          // Let's go with: Server State is the Checkout. 
          // BUT, to support "add on offline device", we should ideally merge.
          // Given the user asked for "checkout... so that always stays in sync", 
          // strict server-truth is safer to avoid drift.
          
          // However, to be "git-like" and support offline additions:
          // We'll trust the server state 100% for now to ensure "immediate reflection".
          // Any local offline changes should have been pushed. 
          // If they weren't, they might be lost if we strictly overwrite.
          // Let's do a safe merge: Use Remote, but check for Local IDs that don't exist in Remote.
          
          localList.forEach(localItem => {
              if (!remoteMap.has(localItem.id)) {
                  merged.push(localItem);
              }
          });
          
          this.set(key, merged, true);
      };

      if(data.settings) this.set('settings', data.settings, true);
      if(data.profile) this.set('profile', data.profile, true);
      if(data.accounts) mergeList('accounts', data.accounts);
      if(data.categories) mergeList('categories', data.categories);
      if(data.transactions) mergeList('transactions', data.transactions);
      if(data.goals) mergeList('goals', data.goals);
      if(data.importRules) mergeList('importRules', data.importRules);
      if(data.plan) this.set('plan', data.plan, true);
      notify();
  }

  private pendingSyncKeys: Set<string> = new Set();

  private scheduleCloudPush(key?: string) { 
      if (key) this.pendingSyncKeys.add(key);
      
      if (rtdb && this.getSession()) {
          // Debounce writes
          if (this.pushTimer) clearTimeout(this.pushTimer);
          this.pushTimer = setTimeout(() => this.pushToCloud(), 2000); 
      }
  }

  async pushToCloud() { 
      const id = this.getSession(); 
      if (id && rtdb) {
          try {
             const userRef = ref(rtdb, `users/${id}`);
             const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
             
             // If we have specific keys, only update those
             if (this.pendingSyncKeys.size > 0) {
                 this.pendingSyncKeys.forEach(k => {
                     updates[k] = this.get(k, null);
                 });
                 this.pendingSyncKeys.clear();
                 await update(userRef, updates);
             } else {
                 // Fallback to full push if no keys tracked (shouldn't happen often)
                 await update(userRef, { ...this.getFullState(), updatedAt: new Date().toISOString() }); 
             }
          } catch(e) { console.error("Cloud Push Failed", e); }
      }
  }

  async pullFromCloud() { 
      const id = this.getSession(); 
      if (id && rtdb) { 
          try {
            const userRef = ref(rtdb, `users/${id}`);
            const s = await get(userRef); 
            if (s.exists()) this.restoreFullState(s.val()); 
          } catch(e) { console.error("Cloud Pull Failed", e); }
      } 
  }

  async authenticateWithGoogle() { 
      if (!firebaseAuth) {
          console.warn("Firebase Auth not available. Switching to local mode.");
          return false;
      }
      try {
        const p = new GoogleAuthProvider(); 
        const r = await signInWithPopup(firebaseAuth, p); 
        this.setSession(r.user.uid); 
        
        // Pull data first
        await this.pullFromCloud(); 
        
        // Update Profile from Google Data
        // Use full email as username fallback if display name is missing
        const profile = { 
            username: r.user.displayName || r.user.email || 'User', 
            email: r.user.email, 
            photoURL: r.user.photoURL 
        };
        this.set('profile', profile);
        
        return true; 
      } catch (e: any) {
          if (e.code === 'auth/invalid-api-key' || e.code === 'auth/configuration-not-found' || e.code === 'auth/project-not-found') {
              console.error("Critical Firebase Config Error. Downgrading to local.");
              this.downgradeToLocal();
              return false;
          }
          throw e;
      }
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
             
             // Ensure profile exists
             const currentProfile = this.get('profile', null);
             if (!currentProfile) {
                 // Use full email (or original username input) as username
                 this.set('profile', { username: u, email: email });
             }
             
             return { success: true };
          } catch(e: any) {
             // Auto-downgrade on configuration errors to allow local usage
             if (e.code === 'auth/invalid-api-key' || e.code === 'auth/internal-error' || e.code === 'auth/project-not-found' || e.code === 'auth/operation-not-allowed') {
                 console.warn(`Firebase Config Error (${e.code}) detected during login. Downgrading to Local Mode.`);
                 this.downgradeToLocal();
                 return this.login(u, p); // Retry as local
             }
             
             let msg = "Login failed.";
             if(e.code === 'auth/invalid-credential') msg = "Incorrect password or user not found.";
             if(e.code === 'auth/invalid-email') msg = "Invalid username format.";
             return { success: false, error: msg };
          }
      } else {
          // Local Fallback
          // Normalize ID to lowercase to prevent duplicates, but keep display name
          const id = u.toLowerCase();
          this.setSession(id); 
          
          // Update profile if not exists or if we want to update it
          const currentProfile = this.get('profile', null);
          if (!currentProfile) {
              this.set('profile', { username: u });
          }
          
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
             // Use full email/username
             this.set('profile', { username: u, email: email }, true);
             
             await this.pushToCloud();
             return { success: true };
          } catch(e: any) {
             // Auto-downgrade on configuration errors
             if (e.code === 'auth/invalid-api-key' || e.code === 'auth/internal-error' || e.code === 'auth/project-not-found' || e.code === 'auth/operation-not-allowed') {
                 console.warn(`Firebase Config Error (${e.code}) detected during register. Downgrading to Local Mode.`);
                 this.downgradeToLocal();
                 return this.register(u, p); // Retry as local
             }

             let msg = "Registration failed.";
             if(e.code === 'auth/email-already-in-use') msg = "Username already taken.";
             if(e.code === 'auth/weak-password') msg = "Password is too weak.";
             return { success: false, error: msg };
          }
      } else {
          // Local Fallback
          const id = u.toLowerCase();
          this.setSession(id); 
          this.set('settings', DEFAULT_SETTINGS); 
          this.set('profile', { username: u });
          return { success: true };
      }
  }

  isLoggedIn() { return !!this.getSession(); }
  
  getCurrentUser() { 
      const session = this.getSession();
      if (!session) return { username: 'Guest', id: '', photoURL: undefined, email: undefined };
      
      const profile = this.get('profile', { username: session, photoURL: undefined, email: undefined });
      // Fallback to session ID if username is missing in profile (legacy data)
      return { 
          username: profile.username || session, 
          id: session, 
          photoURL: profile.photoURL as string | undefined,
          email: profile.email as string | undefined
      }; 
  }
  getSettings() { return this.get<AppSettings>('settings', DEFAULT_SETTINGS); }
  updateSettings(s: Partial<AppSettings>) { 
      const cur = this.getSettings(); 
      const upd = { ...cur, ...s };
      if (upd.currency) upd.currencySymbol = SYMBOLS[upd.currency] || '$';
      this.set('settings', upd); 
  }
  
  convertAmount(a: number, f: string, t: string) { 
      // Safe conversion with normalization
      const F = (f || 'USD').toUpperCase();
      const T = (t || 'USD').toUpperCase();
      const rateF = RATES[F] || 1;
      const rateT = RATES[T] || 1;
      return F === T ? a : (a / rateF) * rateT; 
  }
  
  private calculateAccountBalanceAt(account: Account, transactions: Transaction[], endDate: string): number {
      let b = account.initialBalance;
      if (!Array.isArray(transactions)) return b; // Safety check
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
  getSyncConfig(): SyncConfig { return { type: rtdb ? 'FIREBASE' : 'LOCAL', lastSyncedAt: new Date().toISOString() }; }
  
  // Plan
  getPlan() { return this.get<FinancialPlan | null>('plan', null); }
  savePlan(p: FinancialPlan) { this.set('plan', p); }

  async resetEverything() { 
      const session = this.getSession();
      const keys = ['settings', 'accounts', 'categories', 'transactions', 'goals', 'importRules', 'plan'];
      
      keys.forEach(k => {
          try { localStorage.removeItem(this.k(k)); } catch(e){}
      });
      
      if (session && this.dbPromise) {
          const db = await this.dbPromise;
          const tx = db.transaction('store', 'readwrite');
          keys.forEach(k => {
             try { tx.store.delete(`user_${session}_${k}`); } catch(e){}
          });
          await tx.done;
      }
      this.memoryCache = {};
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

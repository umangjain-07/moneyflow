
import { Account, Category, Transaction, AppSettings, User, ImportRule, SyncConfig, FinancialHealth, Goal, FinancialPlan } from '../types';
import { openDB, IDBPDatabase } from 'idb';
// @ts-ignore
import { initializeApp } from 'firebase/app';
// @ts-ignore
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { FirebaseCrudModule } from './firebase/FirebaseCrudModule';
import { FirebaseRealtimeAdapter } from './firebase/FirebaseRealtimeAdapter';
import { FirebaseUserStateRepository } from './firebase/FirebaseUserStateRepository';

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

let firebaseAuth: any = null;

class StorageService {
  private pushTimer: any = null;
  private syncTimeoutTimer: any = null;
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private memoryCache: Record<string, any> = {};
    private cloudRepository: FirebaseUserStateRepository | null = null;
    private pendingLocalChanges: Record<string, { value: any; version: number }> = {};
    private syncInProgress = false;
    private syncQueued = false;
  private editingKeys: Set<string> = new Set(); // Track keys currently being edited
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
        this.goOffline();
        return;
      }

      // 2. Sanitize and validate databaseURL
      if (FIREBASE_CONFIG.databaseURL) {
          // Remove quotes, whitespace, and trailing slashes
          FIREBASE_CONFIG.databaseURL = FIREBASE_CONFIG.databaseURL.trim()
              .replace(/^["']|["']$/g, '') // Remove surrounding quotes
              .replace(/\/$/, ''); // Remove trailing slash
          
          // Check if it looks like a console URL
          if (FIREBASE_CONFIG.databaseURL.includes('console.firebase.google.com')) {
             console.warn("[MoneyFlow] Invalid databaseURL detected (looks like console URL). Attempting to infer correct URL...");
             // Try to construct standard URL from projectId if available
             if (FIREBASE_CONFIG.projectId) {
                 FIREBASE_CONFIG.databaseURL = `https://${FIREBASE_CONFIG.projectId}-default-rtdb.firebaseio.com`;
                 console.log(`[MoneyFlow] Inferred databaseURL: ${FIREBASE_CONFIG.databaseURL}`);
             } else {
                 FIREBASE_CONFIG.databaseURL = '';
             }
          }
          
          // Validate URL format
          if (FIREBASE_CONFIG.databaseURL && !FIREBASE_CONFIG.databaseURL.match(/^https?:\/\/.+/)) {
              console.warn("[MoneyFlow] Invalid databaseURL format. Attempting to construct from projectId...");
              if (FIREBASE_CONFIG.projectId) {
                  FIREBASE_CONFIG.databaseURL = `https://${FIREBASE_CONFIG.projectId}-default-rtdb.firebaseio.com`;
              } else {
                  FIREBASE_CONFIG.databaseURL = '';
              }
          }
      } else if (FIREBASE_CONFIG.projectId) {
          // If no databaseURL provided, try to construct it from projectId
          FIREBASE_CONFIG.databaseURL = `https://${FIREBASE_CONFIG.projectId}-default-rtdb.firebaseio.com`;
          console.log(`[MoneyFlow] Constructed databaseURL from projectId: ${FIREBASE_CONFIG.databaseURL}`);
      }

      // 3. Attempt Initialization
      try {
          const app = initializeApp(FIREBASE_CONFIG);
          firebaseAuth = getAuth(app);
          
          // Only initialize database if URL is valid
          if (FIREBASE_CONFIG.databaseURL && FIREBASE_CONFIG.databaseURL.length > 0) {
              try {
                  const firebaseAdapter = new FirebaseRealtimeAdapter(app);
                  const firebaseCrud = new FirebaseCrudModule(firebaseAdapter);
                  this.cloudRepository = new FirebaseUserStateRepository(firebaseCrud);
                  console.log(`[MoneyFlow] Database initialized with URL: ${FIREBASE_CONFIG.databaseURL}`);
              } catch (dbError: any) {
                  console.error("[MoneyFlow] Database initialization failed:", dbError);
                  // Continue without database - auth will still work
                  this.cloudRepository = null;
              }
          } else {
              console.warn("[MoneyFlow] No database URL configured. Running in auth-only mode.");
              this.cloudRepository = null;
          }
          
          onAuthStateChanged(firebaseAuth, async (u: any) => {
              if (u) {
                  this.setSession(u.uid);
                  
                  // Only setup sync if database is available
                  if (this.cloudRepository) {
                      this.setupRealtimeSync(u.uid);

                      // Pull first, then apply local changes and push back.
                      console.log("[MoneyFlow] Syncing resolved state back to Cloud...");
                      await this.pushToCloud();
                  } else {
                      console.log("[MoneyFlow] Database not available. Running in local-only mode.");
                  }
                  
              } else {
                  this.cleanupRealtimeSync();
              }
          }, (error: any) => {
              // Handle auth state change errors gracefully
              console.warn("[MoneyFlow] Auth state change error, continuing in local mode:", error);
              this.goOffline();
          });
          console.log(`[MoneyFlow] Firebase Initialized. Auth: ${!!firebaseAuth}, Database: ${!!this.cloudRepository}, DB URL: ${FIREBASE_CONFIG.databaseURL || 'Not configured'}`);
      } catch (e) {
          console.error("[MoneyFlow] Firebase Init Crashed. Falling back to LOCAL MODE.", e);
          this.goOffline();
      }
  }

  private syncUnsubscribe: any = null;
  private syncInterval: any = null;
  private syncStatus: 'IDLE' | 'SYNCING' | 'ERROR' = 'IDLE';

  private setupRealtimeSync(uid: string) {
      if (!this.cloudRepository) return;
      
      try {
          console.log(`[MoneyFlow] Setting up realtime sync for ${uid}`);
          this.syncStatus = 'SYNCING';
          notify();

          // 1. Realtime Listener (Push-based)
          this.syncUnsubscribe = this.cloudRepository.subscribe(
              uid,
              (data) => {
                  if (data) {
                      console.log("[MoneyFlow] Realtime Update Received", Object.keys(data));
                      this.restoreFullState(data);
                      this.syncStatus = 'IDLE';
                      notify();
                  } else {
                      console.log("[MoneyFlow] Realtime Update: No Data (New User?)");
                      this.syncStatus = 'IDLE';
                      notify();
                  }
              },
              (error: any) => {
                  console.error("[MoneyFlow] Realtime Sync Error", error);
                  
                  // Check if error indicates Firebase is broken/unavailable
                  const errorCode = error?.code || error?.message || '';
                  const errorMessage = String(errorCode).toLowerCase();
                  const isFirebaseError = typeof errorCode === 'string' && (
                      errorMessage.includes('permission-denied') ||
                      errorMessage.includes('permission_denied') ||
                      errorMessage.includes('unavailable') ||
                      errorMessage.includes('network') ||
                      errorMessage.includes('name_not_resolved') ||
                      errorMessage.includes('err_name_not_resolved') ||
                      errorMessage.includes('auth') ||
                      errorMessage.includes('invalid-api-key') ||
                      errorMessage.includes('project-not-found') ||
                      errorMessage.includes('failed to fetch')
                  );
                  
                  if (isFirebaseError) {
                      console.warn("[MoneyFlow] Firebase error in realtime sync. Switching to offline mode.");
                      this.goOffline();
                  } else {
                      // Temporary error - just set to IDLE
                      this.syncStatus = 'IDLE';
                      notify();
                  }
              }
          );
      } catch (e: any) {
          console.error("[MoneyFlow] Failed to setup realtime sync:", e);
          const errorMessage = String(e?.message || e).toLowerCase();
          if (errorMessage.includes('name_not_resolved') || errorMessage.includes('network')) {
              console.warn("[MoneyFlow] Database connection failed. Switching to offline mode.");
              this.goOffline();
          } else {
              this.syncStatus = 'IDLE';
              notify();
          }
      }

      // 2. Polling Fallback (Pull-based) - Every 10 seconds
      this.syncInterval = setInterval(async () => {
          if (!this.cloudRepository) {
              // Cloud repository became unavailable, cleanup
              this.cleanupRealtimeSync();
              return;
          }
          
          try {
              const cloudState = await this.cloudRepository.pullState(uid);
              if (cloudState) {
                   this.restoreFullState(cloudState);
              }
          } catch (e: any) {
              console.warn("[MoneyFlow] Polling Sync Failed", e);
              
              // Check if error indicates Firebase is broken/unavailable
              const errorCode = e?.code || e?.message || '';
              const isFirebaseError = typeof errorCode === 'string' && (
                  errorCode.includes('permission-denied') ||
                  errorCode.includes('PERMISSION_DENIED') ||
                  errorCode.includes('unavailable') ||
                  errorCode.includes('network') ||
                  errorCode.includes('auth') ||
                  errorCode.includes('invalid-api-key') ||
                  errorCode.includes('project-not-found')
              );
              
              if (isFirebaseError) {
                  console.warn("[MoneyFlow] Firebase error in polling sync. Switching to offline mode.");
                  this.cleanupRealtimeSync();
                  this.goOffline();
              }
          }
      }, 10000);
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

  public goOffline() {
      firebaseAuth = null;
      this.cloudRepository = null;
      this.syncStatus = 'IDLE';
      notify();
      console.log("[MoneyFlow] Switched to Offline Mode");
  }

  getSyncStatus() { return this.syncStatus; }
  
  private setSession(id: string) { 
      localStorage.setItem('moneyflow_session', id); 
      this.syncWithLocalStorage();
      notify(); 
  }
  private getSession() { return localStorage.getItem('moneyflow_session'); }
  private k(key: string) { const id = this.getSession(); if (!id) throw new Error("Unauthorized"); return `user_${id}_${key}`; }
  
  private get<T>(key: string, def: T): T { 
      const k = this.k(key); 
      if (k in this.memoryCache) {
          const val = this.memoryCache[k];
          return val === undefined || val === null ? def : val;
      }
      try { 
          const s = localStorage.getItem(k); 
          if (!s || s === 'undefined' || s === 'null') return def;
          const parsed = JSON.parse(s);
          return parsed === undefined || parsed === null ? def : parsed;
      } catch (e) { return def; } 
  }

  private set<T>(key: string, v: T, skipSync = false, silent = false) { 
      const k = this.k(key); 
      this.memoryCache[k] = v;
      localStorage.setItem(k, JSON.stringify(v));
      if (this.dbPromise) this.dbPromise.then(db => db.put('store', v, k));
      if (!silent) notify(); 
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

  // Mark a key as being edited (prevents sync from overwriting it)
  public startEditing(key: string) {
      this.editingKeys.add(key);
  }

  // Mark a key as no longer being edited (allows sync again)
  public stopEditing(key: string) {
      this.editingKeys.delete(key);
  }

  // Check if a key is currently being edited
  public isEditing(key: string): boolean {
      return this.editingKeys.has(key);
  }

  private recordPendingChange(key: string) {
      const existing = this.pendingLocalChanges[key];
      const version = existing ? existing.version + 1 : 1;
      this.pendingLocalChanges[key] = { value: this.get(key, null), version };
  }

  private snapshotPendingChanges() {
      return Object.entries(this.pendingLocalChanges).map(([key, entry]) => ({
          key,
          value: entry.value,
          version: entry.version,
      }));
  }

  private clearPendingChanges(snapshot: Array<{ key: string; version: number }>) {
      snapshot.forEach(({ key, version }) => {
          const current = this.pendingLocalChanges[key];
          if (current && current.version === version) {
              delete this.pendingLocalChanges[key];
          }
      });
  }

  private mergeListByUpdatedAt(
      localList: any[] | null | undefined,
      remoteList: any[] | null | undefined,
      preferLocalOnTie: boolean
  ): any[] {
      const safeLocal = Array.isArray(localList) ? localList : [];
      const safeRemote = Array.isArray(remoteList) ? remoteList : [];
      const localMap = new Map(safeLocal.map(item => [item.id, item]));
      const remoteMap = new Map(safeRemote.map(item => [item.id, item]));

      const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
      const merged: any[] = [];

      allIds.forEach(id => {
          const local = localMap.get(id);
          const remote = remoteMap.get(id);

          if (local && remote) {
              const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
              const remoteTime = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;

              if (localTime > remoteTime) merged.push(local);
              else if (remoteTime > localTime) merged.push(remote);
              else merged.push(preferLocalOnTie ? local : remote);
          } else if (local) {
              merged.push(local);
          } else if (remote) {
              merged.push(remote);
          }
      });

      return merged;
  }

  private mergeObjectByUpdatedAt(
      localObj: any,
      remoteObj: any,
      preferLocalOnTie: boolean
  ): any {
      if (!localObj && !remoteObj) return null;
      if (!remoteObj) return localObj;
      if (!localObj) return remoteObj;

      const localTime = localObj.updatedAt ? new Date(localObj.updatedAt).getTime() : 0;
      const remoteTime = remoteObj.updatedAt ? new Date(remoteObj.updatedAt).getTime() : 0;

      if (localTime > remoteTime) return localObj;
      if (remoteTime > localTime) return remoteObj;
      return preferLocalOnTie ? localObj : remoteObj;
  }

  private applyPendingLocalChanges(snapshot: Array<{ key: string; value: any }>) {
      if (!snapshot.length) return;

      const updates: Record<string, any> = {};

      snapshot.forEach(({ key, value }) => {
          if (Array.isArray(value)) {
              const current = this.get<any[]>(key, []);
              updates[key] = this.mergeListByUpdatedAt(value, current, true);
          } else if (value && typeof value === 'object') {
              const current = this.get<any>(key, null);
              updates[key] = this.mergeObjectByUpdatedAt(value, current, true);
          } else {
              updates[key] = value;
          }
      });

      Object.entries(updates).forEach(([key, val]) => {
          this.set(key, val, true, true);
      });
  }

  private normalizeList<T>(value: unknown): T[] {
      if (Array.isArray(value)) {
          return value as T[];
      }
      if (value && typeof value === 'object') {
          return Object.values(value as Record<string, T>);
      }
      return [];
  }

  private collectLocalOverrides(remoteState: any): Record<string, any> {
      const updates: Record<string, any> = {};
      if (!remoteState) return updates;

      const checkList = (key: string) => {
          if (this.editingKeys.has(key)) return;

          const localList = this.normalizeList<any>(this.get<any[]>(key, []));
          const remoteList = this.normalizeList<any>(remoteState[key]);
          const hasRemote = remoteState && remoteState[key] !== undefined && remoteState[key] !== null;

          if (!hasRemote) {
              if (localList.length > 0) updates[key] = localList;
              return;
          }

          const remoteMap = new Map(remoteList.map((item: any) => [item.id, item]));
          let hasOverride = false;

          for (const localItem of localList) {
              const remoteItem = remoteMap.get(localItem.id);
              if (!remoteItem) {
                  hasOverride = true;
                  break;
              }
              const localTime = localItem?.updatedAt ? new Date(localItem.updatedAt).getTime() : 0;
              const remoteTime = remoteItem?.updatedAt ? new Date(remoteItem.updatedAt).getTime() : 0;
              if (localTime > remoteTime) {
                  hasOverride = true;
                  break;
              }
              if (localTime === remoteTime && localItem?.isDeleted && !remoteItem?.isDeleted) {
                  hasOverride = true;
                  break;
              }
          }

          if (hasOverride) updates[key] = localList;
      };

      const checkObject = (key: string) => {
          if (this.editingKeys.has(key)) return;

          const localObj = this.get<any>(key, null);
          const remoteObj = remoteState[key] ?? null;

          if (!remoteObj) {
              if (localObj) updates[key] = localObj;
              return;
          }
          if (!localObj) return;

          const localTime = localObj.updatedAt ? new Date(localObj.updatedAt).getTime() : 0;
          const remoteTime = remoteObj.updatedAt ? new Date(remoteObj.updatedAt).getTime() : 0;
          if (localTime > remoteTime) updates[key] = localObj;
      };

      checkObject('settings');
      checkObject('profile');
      checkObject('plan');

      checkList('accounts');
      checkList('categories');
      checkList('transactions');
      checkList('goals');
      checkList('importRules');

      return updates;
  }

  // Smart Merge Strategy: Last-Write-Wins based on updatedAt
  // This ensures that if we edit offline, our newer timestamp wins against an older server timestamp.
  // Also skips keys that are currently being edited to prevent overwriting in-progress edits.
  private restoreFullState(data: any) {
      if (!data) return;

      const updates: Record<string, any> = {};

      const mergeList = (key: string, remoteList: any[]) => {
          // Skip if this key is currently being edited
          if (this.editingKeys.has(key)) {
              console.log(`[MoneyFlow] Skipping sync for '${key}' - currently being edited`);
              return;
          }
          
          const normalizedRemote = this.normalizeList<any>(remoteList);
          const localList = this.normalizeList<any>(this.get<any[]>(key, []));
          if (!normalizedRemote.length && !localList.length) return;
          updates[key] = this.mergeListByUpdatedAt(localList, normalizedRemote, false);
      };

      const mergeObject = (key: string, remoteObj: any) => {
          // Skip if this key is currently being edited
          if (this.editingKeys.has(key)) {
              console.log(`[MoneyFlow] Skipping sync for '${key}' - currently being edited`);
              return;
          }
          
          if (!remoteObj) return;
          const localObj = this.get<any>(key, null);
          updates[key] = this.mergeObjectByUpdatedAt(localObj, remoteObj, false);
      };

      if(data.settings) mergeObject('settings', data.settings);
      if(data.profile) mergeObject('profile', data.profile);
      
      // Special handling for Plan
      if(data.plan) {
          mergeObject('plan', data.plan);
      }

      if(data.accounts) mergeList('accounts', data.accounts);
      if(data.categories) mergeList('categories', data.categories);
      if(data.transactions) mergeList('transactions', data.transactions);
      if(data.goals) mergeList('goals', data.goals);
      if(data.importRules) mergeList('importRules', data.importRules);
      
      // Apply all updates atomically (silent updates)
      Object.entries(updates).forEach(([key, val]) => {
          this.set(key, val, true, true);
      });

      // Single notify to update UI consistently
      notify();
  }

  private async migrateLocalData(oldId: string, newId: string) {
      if (!oldId || !newId || oldId === newId) return;
      const keys = ['settings', 'accounts', 'categories', 'transactions', 'goals', 'importRules', 'plan', 'profile'];
      
      console.log(`[MoneyFlow] Attempting migration from '${oldId}' to '${newId}'`);

      for (const key of keys) {
          const oldKey = `user_${oldId.toLowerCase()}_${key}`;
          const newKey = `user_${newId}_${key}`;
          
          // Try Memory -> LocalStorage -> IDB
          let oldVal = this.memoryCache[oldKey];
          if (!oldVal) {
              const s = localStorage.getItem(oldKey);
              if (s) try { oldVal = JSON.parse(s); } catch(e){}
          }
          
          if (!oldVal && this.dbPromise) {
              const db = await this.dbPromise;
              oldVal = await db.get('store', oldKey);
          }

          if (!oldVal) continue;
          
          try {
              // Get existing new value (from Memory/LS) to merge
              let newVal = this.memoryCache[newKey];
              if (!newVal) {
                   const s = localStorage.getItem(newKey);
                   if (s) try { newVal = JSON.parse(s); } catch(e){}
              }

              let finalVal = oldVal;
              
              if (newVal) {
                  // Merge logic
                  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
                      // Merge arrays by ID
                      const newMap = new Map(newVal.map((i: any) => [i.id, i]));
                      const merged = [...newVal];
                      oldVal.forEach((item: any) => {
                          if (!newMap.has(item.id)) {
                              merged.push(item);
                          }
                      });
                      finalVal = merged;
                  } else {
                      // For objects, if New exists, keep New (Cloud wins)
                      finalVal = newVal; 
                  }
              }
              
              // Update ALL layers
              this.memoryCache[newKey] = finalVal;
              localStorage.setItem(newKey, JSON.stringify(finalVal));
              if (this.dbPromise) {
                  const db = await this.dbPromise;
                  await db.put('store', finalVal, newKey);
              }
              console.log(`[MoneyFlow] Migrated ${key}`);
          } catch (e) { console.error("Migration Error", e); }
      }
  }

  private scheduleCloudPush(key?: string) { 
      // Don't sync if this key is being edited
      if (key && this.editingKeys.has(key)) {
          console.log(`[MoneyFlow] Skipping cloud push for '${key}' - currently being edited`);
          return;
      }
      
      if (key) this.recordPendingChange(key);
      
      if (this.cloudRepository && this.getSession()) {
          // Debounce writes
          if (this.pushTimer) clearTimeout(this.pushTimer);
          this.pushTimer = setTimeout(() => this.pushToCloud(), 1000); // Reduced to 1s
      } else if (this.syncStatus !== 'IDLE') {
          this.syncStatus = 'IDLE';
          notify();
      }
  }

  async pushToCloud() { 
      if (this.syncInProgress) {
          this.syncQueued = true;
          return;
      }

      this.syncInProgress = true;

      const id = this.getSession();
      
      // Early return if no session or cloud repository is unavailable
      if (!id || !this.cloudRepository) {
          if (this.syncStatus !== 'IDLE') {
              this.syncStatus = 'IDLE';
              notify();
          }
          this.syncInProgress = false;
          return;
      }
      
      this.syncStatus = 'SYNCING';
      notify();
      
      // Safety timeout: if sync takes more than 30 seconds, reset to IDLE
      if (this.syncTimeoutTimer) clearTimeout(this.syncTimeoutTimer);
      this.syncTimeoutTimer = setTimeout(() => {
          if (this.syncStatus === 'SYNCING') {
              console.warn("[MoneyFlow] Sync timeout - resetting to IDLE");
              this.syncStatus = 'IDLE';
              notify();
          }
      }, 30000);

      const pendingSnapshot = this.snapshotPendingChanges();
      let hasCloudState = false;
      let pulledState: any = null;
      
      try {
         const cloudState = await this.cloudRepository.pullState(id);
         pulledState = cloudState;
         if (cloudState) {
             hasCloudState = true;
             this.restoreFullState(cloudState);
         }

         this.applyPendingLocalChanges(pendingSnapshot);

         const updates: Record<string, any> = hasCloudState ? this.collectLocalOverrides(pulledState) : {};
         pendingSnapshot.forEach(({ key }) => {
             if (this.editingKeys.has(key)) return;
             updates[key] = this.get(key, null);
         });

         if (Object.keys(updates).length > 0) {
             await this.cloudRepository.patchState(id, updates);
         } else if (!hasCloudState) {
             await this.cloudRepository.uploadState(id, this.getFullState());
         }
         console.log("[MoneyFlow] Cloud Push Success");
         this.clearPendingChanges(pendingSnapshot);
         if (this.syncTimeoutTimer) {
             clearTimeout(this.syncTimeoutTimer);
             this.syncTimeoutTimer = null;
         }
         this.syncStatus = 'IDLE';
      } catch(e: any) {
          if (this.syncTimeoutTimer) {
              clearTimeout(this.syncTimeoutTimer);
              this.syncTimeoutTimer = null;
          } 
          console.error("Cloud Push Failed", e);
          
          // Check if error indicates Firebase is broken/unavailable
          const errorCode = e?.code || e?.message || '';
          const errorMessage = String(errorCode).toLowerCase();
          const isFirebaseError = typeof errorCode === 'string' && (
              errorMessage.includes('permission-denied') ||
              errorMessage.includes('permission_denied') ||
              errorMessage.includes('unavailable') ||
              errorMessage.includes('network') ||
              errorMessage.includes('name_not_resolved') ||
              errorMessage.includes('err_name_not_resolved') ||
              errorMessage.includes('auth') ||
              errorMessage.includes('invalid-api-key') ||
              errorMessage.includes('project-not-found') ||
              errorMessage.includes('failed to fetch')
          );
          
          if (isFirebaseError) {
              console.warn("[MoneyFlow] Firebase error detected during push. Switching to offline mode.");
              this.goOffline();
          } else {
              // Temporary network error or other issue - stay in IDLE, don't go offline
              this.syncStatus = 'IDLE';
          }
      } finally {
          this.syncInProgress = false;
          notify();

          if (this.syncQueued) {
              this.syncQueued = false;
              this.pushToCloud();
          }
      }
  }

  async pullFromCloud(): Promise<boolean> { 
      const id = this.getSession(); 
      
      if (!id) {
          if (this.syncStatus !== 'IDLE') {
              this.syncStatus = 'IDLE';
              notify();
          }
          return false;
      }
      
      if (!this.cloudRepository) {
          if (this.syncStatus !== 'IDLE') {
              this.syncStatus = 'IDLE';
              notify();
          }
          return false;
      }
      
      console.log(`[MoneyFlow] Force Pulling from Cloud for ${id}...`);
      this.syncStatus = 'SYNCING';
      notify();
      
      // Safety timeout: if sync takes more than 30 seconds, reset to IDLE
      if (this.syncTimeoutTimer) clearTimeout(this.syncTimeoutTimer);
      this.syncTimeoutTimer = setTimeout(() => {
          if (this.syncStatus === 'SYNCING') {
              console.warn("[MoneyFlow] Pull timeout - resetting to IDLE");
              this.syncStatus = 'IDLE';
              notify();
          }
      }, 30000);
      
      try {
        const cloudState = await this.cloudRepository.pullState(id);
        if (cloudState) {
            console.log("[MoneyFlow] Cloud Pull Success", Object.keys(cloudState));
            this.restoreFullState(cloudState); 
            if (this.syncTimeoutTimer) {
                clearTimeout(this.syncTimeoutTimer);
                this.syncTimeoutTimer = null;
            }
            this.syncStatus = 'IDLE';
            notify();
            return true;
        } else {
            console.log("[MoneyFlow] Cloud Pull: No Data Found");
            if (this.syncTimeoutTimer) {
                clearTimeout(this.syncTimeoutTimer);
                this.syncTimeoutTimer = null;
            }
            this.syncStatus = 'IDLE';
            notify();
            return false;
        }
      } catch(e: any) {
          if (this.syncTimeoutTimer) {
              clearTimeout(this.syncTimeoutTimer);
              this.syncTimeoutTimer = null;
          } 
          console.error("Cloud Pull Failed", e);
          
          // Check if error indicates Firebase is broken/unavailable
          const errorCode = e?.code || e?.message || '';
          const errorMessage = String(errorCode).toLowerCase();
          const isFirebaseError = typeof errorCode === 'string' && (
              errorMessage.includes('permission-denied') ||
              errorMessage.includes('permission_denied') ||
              errorMessage.includes('unavailable') ||
              errorMessage.includes('network') ||
              errorMessage.includes('name_not_resolved') ||
              errorMessage.includes('err_name_not_resolved') ||
              errorMessage.includes('auth') ||
              errorMessage.includes('invalid-api-key') ||
              errorMessage.includes('project-not-found') ||
              errorMessage.includes('failed to fetch')
          );
          
          if (isFirebaseError) {
              console.warn("[MoneyFlow] Firebase error detected during pull. Switching to offline mode.");
              this.goOffline();
          } else {
              this.syncStatus = 'IDLE';
          }
          notify();
          return false;
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
        
        // Attempt Migration from Email or Username
        if (r.user.email) {
            await this.migrateLocalData(r.user.email, r.user.uid);
            await this.migrateLocalData(r.user.email.split('@')[0], r.user.uid);
        }

        this.setSession(r.user.uid); 
        await this.pushToCloud();
        
        // Update Profile from Google Data
        // Use full email as username fallback if display name is missing
        const profile = { 
            username: r.user.displayName || r.user.email || 'User', 
            email: r.user.email, 
            photoURL: r.user.photoURL,
            updatedAt: new Date().toISOString()
        };
        this.set('profile', profile);
        
        return true; 
      } catch (e: any) {
          if (e.code === 'auth/invalid-api-key' || e.code === 'auth/configuration-not-found' || e.code === 'auth/project-not-found' || e.code === 'auth/network-request-failed' || e.code === 'auth/api-key-not-valid' || e.code === 'auth/popup-closed-by-user') {
              console.error("Critical Firebase Config Error. Downgrading to local.");
              this.goOffline();
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
             
             // Attempt Migration
             await this.migrateLocalData(u, cred.user.uid);
             if (email !== u) await this.migrateLocalData(email, cred.user.uid);

             this.setSession(cred.user.uid);
             await this.pushToCloud();
             
             // Ensure profile exists
             const currentProfile = this.get('profile', null);
             if (!currentProfile) {
                 // Use full email (or original username input) as username
                 this.set('profile', { username: u, email: email, updatedAt: new Date().toISOString() });
             }
             
             return { success: true };
          } catch(e: any) {
             // Auto-downgrade on configuration errors to allow local usage
             const isConfigError = e.code === 'auth/invalid-api-key' || e.code === 'auth/internal-error' || e.code === 'auth/project-not-found' || e.code === 'auth/operation-not-allowed' || e.code === 'auth/network-request-failed' || e.code === 'auth/api-key-not-valid';
             
             if (isConfigError) {
                 console.warn(`Firebase Config Error (${e.code}) detected during login. Downgrading to Local Mode.`);
                 this.goOffline();
                 // Fall through to local mode below
             } else {
                 // If Firebase is still available but login failed, return error
                 if (firebaseAuth) {
                     let msg = "Login failed.";
                     if(e.code === 'auth/invalid-credential') msg = "Incorrect password or user not found.";
                     if(e.code === 'auth/invalid-email') msg = "Invalid username format.";
                     return { success: false, error: msg };
                 }
             }
          }
      }
      
      // Local Fallback - Always allow access (reached if firebaseAuth is null or Firebase failed)
      // Normalize ID to lowercase to prevent duplicates, but keep display name
      const id = u.toLowerCase();
      this.setSession(id); 
      
      // Update profile if not exists or if we want to update it
      const currentProfile = this.get('profile', null);
      if (!currentProfile) {
          this.set('profile', { username: u, updatedAt: new Date().toISOString() });
      }
      
      return { success: true };
  }

  async register(u: string, p: string): Promise<{success: boolean, error?: string}> { 
      if (firebaseAuth) {
          try {
             let email = u;
             if (!email.includes('@')) email = `${u}@moneyflow.app`;

             const cred = await createUserWithEmailAndPassword(firebaseAuth, email, p);
             
             // Attempt Migration (in case they used local mode with this username before registering)
             await this.migrateLocalData(u, cred.user.uid);

             this.setSession(cred.user.uid);
             
             // Initialize default data for new user in cloud
             this.set('settings', { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() }, true); 
             // Use full email/username
             this.set('profile', { username: u, email: email, updatedAt: new Date().toISOString() }, true);
             
             await this.pushToCloud();
             return { success: true };
          } catch(e: any) {
             // Auto-downgrade on configuration errors to allow local usage
             const isConfigError = e.code === 'auth/invalid-api-key' || e.code === 'auth/internal-error' || e.code === 'auth/project-not-found' || e.code === 'auth/operation-not-allowed' || e.code === 'auth/network-request-failed' || e.code === 'auth/api-key-not-valid';
             
             if (isConfigError) {
                 console.warn(`Firebase Config Error (${e.code}) detected during register. Downgrading to Local Mode.`);
                 this.goOffline();
                 // Fall through to local mode below
             } else {
                 // If Firebase is still available but registration failed, return error
                 if (firebaseAuth) {
                     let msg = "Registration failed.";
                     if(e.code === 'auth/email-already-in-use') msg = "Username already taken.";
                     if(e.code === 'auth/weak-password') msg = "Password is too weak.";
                     return { success: false, error: msg };
                 }
             }
          }
      }
      
      // Local Fallback - Always allow access (reached if firebaseAuth is null)
      const id = u.toLowerCase();
      this.setSession(id); 
      this.set('settings', DEFAULT_SETTINGS); 
      this.set('profile', { username: u, updatedAt: new Date().toISOString() });
      return { success: true };
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
      const upd = { ...cur, ...s, updatedAt: new Date().toISOString() };
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
          else if (t.type === 'EXPENSE') b -= t.amount;
          else if (t.type === 'INVESTMENT') {
              // Only subtract for self investments, sponsored investments don't affect balance
              if (t.investmentSubtype !== 'SPONSORED') {
                  b -= t.amount;
              }
          }
      });
      return b;
  }

  getAccounts() { 
      let accs = this.get<Account[]>('accounts', []); 
      if (!Array.isArray(accs)) accs = [];
      const txs = this.getTransactions(); 
      // Use local date instead of UTC to ensure today's transactions are included regardless of timezone
      const now = new Date();
      const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      return accs.filter(a => a && !a.isDeleted).map(a => ({
          ...a,
          balance: this.calculateAccountBalanceAt(a, txs, nowStr)
      }));
  }

  async forceSync() {
      await this.pushToCloud();
      notify();
  }

  saveAccount(a: Account) { 
      const accs = this.get<Account[]>('accounts', []); 
      const now = new Date().toISOString();
      if (a.id) this.set('accounts', accs.map(ex => ex.id === a.id ? { ...a, updatedAt: now } : ex)); 
      else this.set('accounts', [...accs, { ...a, id: generateId(), updatedAt: now }]); 
  }
  getCategories() { 
      let cats = this.get<Category[]>('categories', []);
      if (!Array.isArray(cats)) cats = [];
      return cats.filter(c => c && !c.isDeleted); 
  }
  
  saveCategory(c: Category) { 
      const cats = this.get<Category[]>('categories', []); 
      if (!c.icon) c.icon = getAutoEmoji(c.name); 
      const now = new Date().toISOString();
      
      const existingIndex = cats.findIndex(ex => ex.id === c.id);
      
      if (existingIndex > -1) {
          const oldCat = cats[existingIndex];
          if (oldCat.type !== c.type) {
              const txs = this.get<Transaction[]>('transactions', []);
              const updatedTxs = txs.map(t => 
                  t.categoryId === c.id ? { ...t, type: c.type, updatedAt: now } : t
              );
              this.set('transactions', updatedTxs);
          }
          cats[existingIndex] = { ...c, updatedAt: now };
          this.set('categories', cats);
      } else {
          this.set('categories', [...cats, { ...c, id: c.id || generateId(), updatedAt: now }]);
      }
  }

  deleteCategory(id: string) { 
      const cats = this.get<Category[]>('categories', []);
      const now = new Date().toISOString();
      this.set('categories', cats.map(c => c.id === id ? { ...c, isDeleted: true, updatedAt: now } : c)); 
  }
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
  getTransactions() { 
      const txs = this.normalizeList<Transaction>(this.get<Transaction[]>('transactions', []));
      return txs.filter(t => t && !t.isDeleted).sort((a,b)=>b.date.localeCompare(a.date)); 
  }
  addTransaction(t: Omit<Transaction, 'id'>) { 
      const txs = this.normalizeList<Transaction>(this.get<Transaction[]>('transactions', []));
      this.set('transactions', [{ ...t, id: generateId(), updatedAt: new Date().toISOString() }, ...txs]); 
  }
  updateTransaction(t: Transaction) { 
      const txs = this.normalizeList<Transaction>(this.get<Transaction[]>('transactions', []));
      this.set('transactions', txs.map(ex=>ex.id===t.id?{ ...t, updatedAt: new Date().toISOString() }:ex)); 
  }
  bulkAddTransactions(txs: Omit<Transaction, 'id'>[]) { 
      const now = new Date().toISOString();
      const existing = this.normalizeList<Transaction>(this.get<Transaction[]>('transactions', []));
      this.set('transactions', [...txs.map(t=>({...t, id:generateId(), updatedAt: now})), ...existing]); 
  }
  deleteTransaction(id: string) { 
      const txs = this.normalizeList<Transaction>(this.get<Transaction[]>('transactions', []));
      const now = new Date().toISOString();
      this.set('transactions', txs.map(t => t.id === id ? { ...t, isDeleted: true, updatedAt: now } : t)); 
  }
  getGoals() { 
      let goals = this.get<Goal[]>('goals', []);
      if (!Array.isArray(goals)) goals = [];
      return goals.filter(g => g && !g.isDeleted); 
  }
  saveGoal(g: Goal) { 
      const goals = this.get<Goal[]>('goals', []); 
      const now = new Date().toISOString();
      if(g.id) this.set('goals', goals.map(ex=>ex.id===g.id?{ ...g, updatedAt: now }:ex)); 
      else this.set('goals', [...goals, {...g, id:generateId(), updatedAt: now}]); 
  }
  deleteGoal(id: string) { 
      const goals = this.get<Goal[]>('goals', []);
      const now = new Date().toISOString();
      this.set('goals', goals.map(g => g.id === id ? { ...g, isDeleted: true, updatedAt: now } : g)); 
  }
  
  addTransfer(fromId: string, toId: string, amount: number, date: string, description: string) {
      const fromTxId = generateId();
      const toTxId = generateId();
      const now = new Date().toISOString();
      const txs = this.normalizeList<Transaction>(this.get<Transaction[]>('transactions', []));
      const outTx: Transaction = { id: fromTxId, date, amount, description: description, categoryId: 'transfer_out', accountId: fromId, type: 'EXPENSE', relatedTransactionId: toTxId, updatedAt: now };
      const inTx: Transaction = { id: toTxId, date, amount, description: description, categoryId: 'transfer_in', accountId: toId, type: 'INCOME', relatedTransactionId: fromTxId, updatedAt: now };
      this.set('transactions', [outTx, inTx, ...txs]);
  }

  getImportRules() { 
      let rules = this.get<ImportRule[]>('importRules', []);
      if (!Array.isArray(rules)) rules = [];
      return rules.filter(r => r && !r.isDeleted); 
  }
  saveImportRule(r: ImportRule) { 
      const rs = this.get<ImportRule[]>('importRules', []); 
      const ex = rs.findIndex(x => x.keyword === r.keyword); 
      const now = new Date().toISOString();
      if (ex > -1) rs[ex] = { ...r, updatedAt: now }; 
      else rs.push({ ...r, updatedAt: now }); 
      this.set('importRules', rs); 
  }
  getSyncConfig(): SyncConfig & { status: string } { 
      return { 
          type: this.cloudRepository ? 'FIREBASE' : 'LOCAL', 
          lastSyncedAt: new Date().toISOString(),
          status: this.syncStatus
      }; 
  }
  
  // Plan
  getPlan() { 
      const p = this.get<FinancialPlan | null>('plan', null); 
      if (!p) {
          // Return a safe default plan structure to prevent crashes
          return {
              salary: 0,
              savingsGoal: 0,
              startDate: new Date().toISOString(),
              endDate: new Date().toISOString(),
              categoryConfigs: [],
              updatedAt: new Date().toISOString()
          };
      }
      return p;
  }
  savePlan(p: FinancialPlan) { 
      // Note: stopEditing should be called by the component before calling savePlan
      // This allows the component to control when editing stops
      this.set('plan', { ...p, updatedAt: new Date().toISOString() }); 
  }

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

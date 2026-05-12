
import React, { useEffect, useState, ErrorInfo, ReactNode, Component } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Transactions } from './components/Transactions';
import { Accounts } from './components/Accounts';
import { ImportExport } from './components/ImportExport';
import { Categories } from './components/Categories';
import { Reports } from './components/Reports';
import { Planning } from './components/Planning';
import { BetaLab } from './components/BetaLab';
import { Auth } from './components/Auth';
import { db, subscribe } from './services/storage';
import { AlertTriangle, RefreshCw, Loader2, Cloud } from 'lucide-react';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Simple Error Boundary Component
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Explicitly declare props to avoid TS error "Property 'props' does not exist on type 'ErrorBoundary'"
  public readonly props: Readonly<ErrorBoundaryProps>;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  handleReset = () => {
    // Hard reset
    localStorage.clear();
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-center text-slate-200">
           <div className="bg-rose-500/10 p-6 rounded-full mb-6 border border-rose-500/20">
              <AlertTriangle size={64} className="text-rose-500" />
           </div>
           <h1 className="text-3xl font-bold mb-2">Something went wrong</h1>
           <p className="text-slate-400 mb-8 max-w-md">
             The application encountered a critical error. This usually happens due to corrupted data.
           </p>
           <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 mb-8 w-full max-w-md overflow-hidden">
               <code className="text-xs text-rose-400 font-mono break-all block">
                   {this.state.error?.message}
               </code>
           </div>
           <button 
             onClick={this.handleReset}
             className="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-rose-900/20"
           >
             <RefreshCw size={20} />
             Reset Everything & Fix
           </button>
           <p className="text-xs text-slate-600 mt-4">This will clear all local data and reload.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(db.isLoggedIn());
  const [isReady, setIsReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(db.getSyncStatus());
  const [settings, setSettings] = useState(db.getSettings());

  useEffect(() => {
    // Wait for DB init
    db.initPromise.then(() => setIsReady(true));

    // Listen for login/logout events and sync status
    const unsubscribe = subscribe(() => {
      setIsAuthenticated(db.isLoggedIn());
      setSyncStatus(db.getSyncStatus());
      setSettings(db.getSettings());
    });
    return () => unsubscribe();
  }, []);

  if (!isReady) {
    return (
        <div className="min-h-screen bg-[#020617] flex items-center justify-center text-slate-400">
            <Loader2 className="animate-spin mr-2" />
            Loading Database...
        </div>
    );
  }

  if (!isAuthenticated) {
    return <Auth />;
  }

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/plan" element={<Planning />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/import" element={<ImportExport />} />
          {settings.betaLabEnabled && <Route path="/beta" element={<BetaLab />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        
        {/* Global Sync Indicator */}
        {syncStatus === 'SYNCING' && (
            <div className="fixed bottom-4 right-4 bg-slate-900/90 backdrop-blur border border-slate-800 text-slate-300 px-3 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg z-50 animate-in slide-in-from-bottom-2">
                <RefreshCw size={12} className="animate-spin text-emerald-500" />
                Syncing...
            </div>
        )}
        {syncStatus === 'ERROR' && (
            <div className="fixed bottom-4 right-4 flex flex-col items-end gap-2 z-50 animate-in slide-in-from-bottom-2">
                <div className="bg-rose-900/90 backdrop-blur border border-rose-800 text-rose-200 px-3 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg">
                    <Cloud size={12} className="text-rose-400" />
                    Sync Error
                </div>
                <button 
                    onClick={() => db.goOffline()}
                    className="bg-slate-800/90 backdrop-blur border border-slate-700 text-slate-300 px-3 py-2 rounded-full text-xs font-bold hover:bg-slate-700 transition-colors shadow-lg flex items-center gap-2"
                >
                    <RefreshCw size={12} className="text-slate-500" />
                    Switch to Offline Mode
                </button>
            </div>
        )}
      </Layout>
    </HashRouter>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
};

export default App;

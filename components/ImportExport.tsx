
import React, { useState, useEffect, useMemo } from 'react';
import { db, subscribe, getAutoEmoji, getEnv } from '../services/storage';
import { Upload, FileSpreadsheet, CheckCircle, MoveRight, HelpCircle, Save, ArrowRight, ArrowDownLeft, ArrowUpRight, Search, Settings, Download, Heart, Coffee, FileText, Type, Copy, Check, Sparkles, Zap, ChevronDown, Layers, X, BrainCircuit, Activity, Plus, CreditCard, Wallet, TrendingUp, CheckCircle2, PieChart } from 'lucide-react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Account, Category, ImportRule, Transaction, TransactionType } from '../types';
import { GoogleGenAI, Type as GenAiType } from "@google/genai";

type Stage = 'UPLOAD' | 'MAPPING' | 'CLASSIFY' | 'SUCCESS';
type AmountMode = 'SIGNED' | 'UNSIGNED_TYPE';
type ImportSource = 'FILE' | 'TEXT';

interface ClassificationItem {
    keyword: string; 
    originalSample: string; 
    sampleDate: string;
    sampleAmount: number;
    count: number;
    targetCategoryId: string; 
    newType: 'INCOME' | 'EXPENSE' | 'INVESTMENT';
    newNecessity: 'NEED' | 'WANT';
    newGroup: string;
    newIcon: string;
}

const getHeuristicCategory = (keyword: string): { type: 'INCOME' | 'EXPENSE' | 'INVESTMENT', necessity: 'NEED'|'WANT', group: string } | null => {
    const k = keyword.toUpperCase();
    if (['SIP', 'MUTUAL', 'MF', 'FUND', 'ZERODHA', 'GROWW', 'STOCK', 'GOLD', 'BOND', 'DEPOSIT', 'RD', 'FD', 'LIC', 'PREMIUM', 'INVEST'].some(w => k.includes(w))) return { type: 'INVESTMENT', necessity: 'NEED', group: 'Investments' };
    if (['RENT', 'MORTGAGE', 'ELECTRICITY', 'WATER', 'GAS', 'WIFI', 'PHONE', 'MOBILE', 'BILL', 'TAX', 'EMI', 'LOAN'].some(w => k.includes(w))) return { type: 'EXPENSE', necessity: 'NEED', group: 'Housing' };
    if (['GROCERY', 'BIGBASKET', 'BLINKIT', 'DMART', 'SUPERMARKET', 'MART', 'MILK', 'DAIRY', 'VEGETABLE'].some(w => k.includes(w))) return { type: 'EXPENSE', necessity: 'NEED', group: 'Food' };
    if (['SWIGGY', 'ZOMATO', 'EATS', 'DOMINO', 'STARBUCKS', 'CAFE', 'RESTAURANT', 'BAR', 'BEER', 'DINING'].some(w => k.includes(w))) return { type: 'EXPENSE', necessity: 'WANT', group: 'Food' };
    if (['FUEL', 'PETROL', 'DIESEL', 'SHELL', 'HP', 'IOCL', 'SERVICE'].some(w => k.includes(w))) return { type: 'EXPENSE', necessity: 'NEED', group: 'Transportation' };
    if (['UBER', 'OLA', 'TAXI', 'CAB', 'AUTO', 'RIDE'].some(w => k.includes(w))) return { type: 'EXPENSE', necessity: 'WANT', group: 'Transportation' };
    if (['PHARMACY', 'MEDICAL', 'DOCTOR', 'HOSPITAL', 'CLINIC', 'LAB'].some(w => k.includes(w))) return { type: 'EXPENSE', necessity: 'NEED', group: 'Health' };
    if (['AMAZON', 'FLIPKART', 'SHOP', 'RETAIL', 'CLOTH', 'ELECTRONIC', 'APPLE', 'ZARA', 'H&M'].some(w => k.includes(w))) return { type: 'EXPENSE', necessity: 'WANT', group: 'Personal' };
    if (['SALARY', 'PAYROLL', 'DIRECT DEP', 'CREDIT', 'INTEREST', 'DIVIDEND', 'BONUS'].some(w => k.includes(w))) return { type: 'INCOME', necessity: 'NEED', group: 'Income' };
    return null;
}

export const ImportExport: React.FC = () => {
  const [stage, setStage] = useState<Stage>('UPLOAD');
  const [importSource, setImportSource] = useState<ImportSource>('FILE');
  const [targetAccount, setTargetAccount] = useState<string>('');
  const [pastedText, setPastedText] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<ImportRule[]>([]);
  const [settings, setSettings] = useState(db.getSettings());
  
  const [fullData, setFullData] = useState<any[][]>([]);
  const [previewData, setPreviewData] = useState<any[][]>([]);
  const [map, setMap] = useState({ date: -1, desc: -1, amount: -1, cat: -1, type: -1 });
  const [amountMode, setAmountMode] = useState<AmountMode>('SIGNED');
  const [classifications, setClassifications] = useState<ClassificationItem[]>([]);
  const [stats, setStats] = useState({ count: 0 });

  // New Account Modal State
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountBalance, setNewAccountBalance] = useState('');

  // AI State
  const [isAiClassifying, setIsAiClassifying] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
      const load = () => {
        setAccounts(db.getAccounts());
        setCategories(db.getCategories());
        setRules(db.getImportRules());
        setSettings(db.getSettings());
      };
      load();
      const last = localStorage.getItem('last_import_account');
      if (last) {
          setTargetAccount(last);
          loadMapping(last);
      }
      return subscribe(load);
  }, []);

  const guessColumns = (headers: any[]) => {
    const h = headers.map(x => String(x || '').toLowerCase());
    const newMap = { date: -1, desc: -1, amount: -1, cat: -1, type: -1 };
    
    newMap.date = h.findIndex(x => x.includes('date') || x.includes('time') || x.includes('when') || x.includes('txn date'));
    newMap.desc = h.findIndex(x => x.includes('desc') || x.includes('narrat') || x.includes('partic') || x.includes('info') || x.includes('remark') || x.includes('trans') || x.includes('details') || x.includes('payee') || x.includes('to') || x.includes('from') || x.includes('narration'));
    newMap.amount = h.findIndex(x => x.includes('amt') || x.includes('amount') || x.includes('value') || x.includes('sum') || x.includes('debit') || x.includes('credit') || x.includes('inr') || x.includes('usd') || x.includes('price') || x.includes('total') || x.includes('transaction amount'));
    newMap.cat = h.findIndex(x => x.includes('cat') || x.includes('group') || x.includes('label') || x.includes('category'));
    newMap.type = h.findIndex(x => x.includes('type') || x.includes('dr/cr') || x.includes('mode') || x.includes('d/c'));

    setMap(newMap);
    return newMap;
  };

  const loadMapping = (accId: string) => {
      const saved = localStorage.getItem(`mapping_${accId}`);
      if (saved) {
          const d = JSON.parse(saved);
          setMap(d.map || { date: -1, desc: -1, amount: -1, cat: -1, type: -1 });
          setAmountMode(d.amountMode || 'SIGNED');
      } else {
          setMap({ date: -1, desc: -1, amount: -1, cat: -1, type: -1 });
          setAmountMode('SIGNED');
      }
  };

  const handleAccountChange = (id: string) => {
      setTargetAccount(id);
      localStorage.setItem('last_import_account', id);
      loadMapping(id);
  };

  const createNewAccount = () => {
      if(!newAccountName) return;
      const initial = parseFloat(newAccountBalance) || 0;
      const newAcc: Account = {
          id: '', // Generated by saveAccount
          name: newAccountName,
          type: 'BANK',
          currency: settings.currency,
          initialBalance: initial,
          balance: initial
      };
      db.saveAccount(newAcc);
      
      // We need to wait slightly for the account to be saved and state to update
      setTimeout(() => {
          const updatedAccounts = db.getAccounts();
          const created = updatedAccounts.find(a => a.name === newAccountName);
          if (created) {
              setTargetAccount(created.id);
              localStorage.setItem('last_import_account', created.id);
          }
      }, 100);

      setShowAccountModal(false);
      setNewAccountName('');
      setNewAccountBalance('');
  };

  const saveMappingState = (newMap: any, newMode: AmountMode) => {
      if (targetAccount) localStorage.setItem(`mapping_${targetAccount}`, JSON.stringify({ map: newMap, amountMode: newMode }));
  };

  const handleExport = () => {
      const exportData = db.getTransactions().map(t => ({
          Date: t.date, Amount: t.amount, Type: t.type, Description: t.description,
          Category: categories.find(c => c.id === t.categoryId)?.name || 'Uncategorized',
          Account: accounts.find(a => a.id === t.accountId)?.name || 'Unknown'
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transactions");
      XLSX.writeFile(wb, `MoneyFlow_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleTextImport = () => {
      if (!pastedText.trim()) return;
      const lines = pastedText.trim().split('\n');
      if (lines.length === 0) return;
      
      const data = lines.map(line => {
          if (line.includes('\t')) return line.split('\t');
          if (line.includes(',')) return line.split(',');
          return line.split(/\s{2,}/); 
      });

      setFullData(data);
      setPreviewData(data.slice(0, 10));
      guessColumns(data[0] || []);
      setStage('MAPPING');
  };

  const handleFileClick = (e: React.MouseEvent<HTMLInputElement>) => {
      if (!targetAccount) {
          e.preventDefault();
          const panel = document.getElementById('account-panel');
          if (panel) {
              panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
              panel.classList.add('ring-2', 'ring-emerald-500', 'shadow-[0_0_30px_rgba(16,185,129,0.3)]');
              setTimeout(() => panel.classList.remove('ring-2', 'ring-emerald-500', 'shadow-[0_0_30px_rgba(16,185,129,0.3)]'), 1000);
          }
      }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const wb = XLSX.read(evt.target?.result, { type: 'array' });
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];
            if (data.length > 1) {
                setFullData(data);
                setPreviewData(data.slice(0, 8)); 
                guessColumns(data[0] || []);
                setStage('MAPPING');
            }
        } catch (err) { alert('Invalid file format.'); }
    };
    reader.readAsArrayBuffer(file);
  };

  const parseRowAmount = (row: any[]) => {
      const rawAmt = row[map.amount];
      let val = typeof rawAmt === 'number' ? rawAmt : parseFloat(String(rawAmt).replace(/[^0-9.-]/g, ''));
      if (isNaN(val)) val = 0;
      if (amountMode === 'SIGNED') return val;
      val = Math.abs(val);
      if (map.type > -1) {
         const t = String(row[map.type] || '').toLowerCase();
         if (t.includes('dr') || t.includes('debit') || t.includes('out') || t.includes('wdr')) return -val;
         if (t.includes('cr') || t.includes('credit') || t.includes('in') || t.includes('dep')) return val;
      }
      return -val;
  };

  const cleanKeyword = (str: string) => {
      if(!str) return 'Unknown';
      let s = str.toUpperCase().replace(/[0-9]+/g, '').replace(/[*#@:/]/g, ' ').replace(/\s+/g, ' ').trim(); 
      return s.split(' ').slice(0, 4).join(' ') || 'Unknown';
  };

  const analyzeAndClassify = () => {
    if (map.amount === -1 || map.date === -1) { alert("Map Date and Amount columns."); return; }
    const uniqueMap = new Map<string, { amounts: number[], sampleDate: string, original: string }>();
    fullData.slice(1).forEach(row => {
        const rawSource = map.cat > -1 && row[map.cat] ? String(row[map.cat]) : String(row[map.desc] || '');
        const keyword = cleanKeyword(rawSource);
        if(!keyword || keyword === 'UNKNOWN') return;
        const signedAmount = parseRowAmount(row);
        if (!uniqueMap.has(keyword)) uniqueMap.set(keyword, { amounts: [], sampleDate: String(row[map.date]), original: rawSource });
        uniqueMap.get(keyword)?.amounts.push(signedAmount);
    });

    const newClassifications: ClassificationItem[] = [];
    uniqueMap.forEach((val, keyword) => {
        const existingRule = rules.find(r => r.keyword === keyword);
        let heuristic = getHeuristicCategory(keyword);
        
        const kwUpper = keyword.toUpperCase();
        let matchingCat = categories.find(c => {
            const cName = c.name.toUpperCase();
            return cName === kwUpper || kwUpper.includes(cName) || cName.includes(kwUpper);
        });

        const targetId = existingRule?.targetCategoryId || matchingCat?.id || 'NEW';
        const avgAmt = val.amounts.reduce((a, b) => a + b, 0) / val.amounts.length;
        
        const defaultType = heuristic?.type || (avgAmt > 0 ? 'INCOME' : 'EXPENSE');

        newClassifications.push({
            keyword, originalSample: val.original, sampleDate: val.sampleDate, sampleAmount: avgAmt, count: val.amounts.length,
            targetCategoryId: targetId,
            newType: defaultType,
            newNecessity: matchingCat?.necessity || heuristic?.necessity || db.guessNecessity(keyword),
            newGroup: matchingCat?.group || heuristic?.group || 'General',
            newIcon: matchingCat?.icon || getAutoEmoji(keyword)
        });
    });
    setClassifications(newClassifications.sort((a, b) => b.count - a.count));
    setStage('CLASSIFY');
  };

  const handleAiCategorize = async () => {
    setIsAiClassifying(true);
    setAiError('');

    // Retrieve Gemini API Key from .env or fallback to system process.env
    const apiKey = getEnv('GEMINI_API_KEY') || process.env.API_KEY;
    if (!apiKey) {
        setAiError("API Configuration Missing. Please set API_KEY.");
        setIsAiClassifying(false);
        return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const entriesToCategorize = classifications.slice(0, 50).map(c => ({ 
          keyword: c.keyword, 
          sample: c.originalSample,
          amount: c.sampleAmount // Pass amount for logic checking
      }));
      
      const prompt = `Classify these bank transaction keywords into smart finance categories. 
      Available Categories: ${categories.map(c => c.name).join(', ')}.
      
      CRITICAL RULES:
      1. If the 'amount' is NEGATIVE (e.g., -50.00), the type MUST be 'EXPENSE' or 'INVESTMENT'. It CANNOT be 'INCOME'.
      2. If the 'amount' is POSITIVE (e.g., 5000.00), the type is usually 'INCOME', unless it's a refund.
      3. Classify as 'INVESTMENT' if keyword suggests investing (SIP, Stocks, Gold) AND amount is negative.
      
      For each transaction, return: { keyword: string, suggestedCategoryName: string, necessity: 'NEED'|'WANT', group: string, type: 'INCOME'|'EXPENSE'|'INVESTMENT' }.
      Transactions to classify: ${JSON.stringify(entriesToCategorize)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: GenAiType.OBJECT,
            properties: {
              suggestions: {
                type: GenAiType.ARRAY,
                items: {
                  type: GenAiType.OBJECT,
                  properties: {
                    keyword: { type: GenAiType.STRING },
                    suggestedCategoryName: { type: GenAiType.STRING },
                    necessity: { type: GenAiType.STRING, enum: ['NEED', 'WANT'] },
                    group: { type: GenAiType.STRING },
                    type: { type: GenAiType.STRING, enum: ['INCOME', 'EXPENSE', 'INVESTMENT'] }
                  },
                  required: ["keyword", "suggestedCategoryName", "necessity", "group", "type"]
                }
              }
            },
            required: ["suggestions"]
          }
        }
      });

      const data = JSON.parse(response.text || '{}');
      const suggestions = data.suggestions || [];
      
      const updated = classifications.map(c => {
        const suggestion = suggestions.find((s: any) => s.keyword === c.keyword);
        if (suggestion) {
          const matchingCat = categories.find(cat => cat.name.toLowerCase() === suggestion.suggestedCategoryName.toLowerCase());
          
          // STRICT RULE ENFORCEMENT: 
          // If amount is negative, forbid INCOME.
          // If suggestion says INCOME but amount is negative, default to EXPENSE.
          let safeType = suggestion.type;
          if (c.sampleAmount < 0 && safeType === 'INCOME') {
              safeType = 'EXPENSE';
          }
          // If amount is positive and suggested EXPENSE, it might be a refund, but usually INCOME.
          // We will respect AI for positive expenses (refunds), but strictly block negative income.

          return {
            ...c,
            targetCategoryId: matchingCat?.id || 'NEW',
            newType: safeType,
            newNecessity: suggestion.necessity,
            newGroup: suggestion.group,
            newIcon: matchingCat?.icon || getAutoEmoji(c.keyword)
          };
        }
        return c;
      });
      setClassifications(updated);
    } catch (err: any) {
      console.error("AI Classification Error:", err);
      if (err.message?.includes('Rpc failed')) {
          setAiError("Network Error: Could not connect to AI service.");
      } else {
          setAiError("AI Intelligence unavailable. Please check your connection or key.");
      }
    } finally {
      setIsAiClassifying(false);
    }
  };

  const finishImport = () => {
      const catMap = new Map<string, string>(); 
      classifications.forEach(item => {
          let realId = item.targetCategoryId;
          if (item.targetCategoryId === 'NEW') {
              const res = db.ensureCategory(item.keyword, item.newType, item.newGroup);
              realId = res.id;
              const cat = db.getCategories().find(c => c.id === realId);
              if (cat) db.saveCategory({ ...cat, necessity: item.newNecessity, icon: item.newIcon, type: item.newType });
          }
          catMap.set(item.keyword, realId);
          db.saveImportRule({ id: item.keyword, keyword: item.keyword, type: item.newType, targetCategoryId: realId });
      });

      const newTransactions: Omit<Transaction, 'id'>[] = fullData.slice(1).map(row => {
          const rawSource = map.cat > -1 && row[map.cat] ? String(row[map.cat]) : String(row[map.desc] || '');
          const keyword = cleanKeyword(rawSource);
          const matchedCatId = catMap.get(keyword);
          if (!matchedCatId) return null;
          
          const signedAmt = parseRowAmount(row);
          const targetCat = db.getCategories().find(c => c.id === matchedCatId);
          
          let dateStr = '';
          try {
              const d = new Date(row[map.date]);
              dateStr = isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
          } catch(e) { dateStr = new Date().toISOString().split('T')[0]; }

          return {
              accountId: targetAccount, amount: Math.abs(signedAmt),
              date: dateStr,
              description: String(row[map.desc] || rawSource),
              categoryId: matchedCatId, type: targetCat?.type || (signedAmt >= 0 ? 'INCOME' : 'EXPENSE')
          };
      }).filter(Boolean) as any;

      db.bulkAddTransactions(newTransactions);
      setStats({ count: newTransactions.length });
      setStage('SUCCESS');
  };

  const groupNames = useMemo(() => Array.from(new Set(categories.map(c => c.group))).sort(), [categories]);

  const getAccountIcon = (type: string) => {
      if (type === 'INVESTMENT') return <TrendingUp size={18} />;
      if (type === 'CASH') return <Wallet size={18} />;
      return <CreditCard size={18} />;
  };

  if (stage === 'SUCCESS') return (
    <div className="flex flex-col items-center justify-center h-[70vh] animate-in zoom-in p-4 text-center">
        <div className="bg-emerald-500/10 p-8 rounded-full mb-6 ring-1 ring-emerald-500/20 shadow-2xl shadow-emerald-500/10">
            <CheckCircle size={80} className="text-emerald-500" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">Import Complete</h2>
        <p className="text-slate-400 mb-10 max-w-md">Processed <b>{stats.count}</b> entries flawlessly. Your financial data is now up to date.</p>
        <div className="flex gap-4">
            <Link to="/transactions" className="px-8 py-4 bg-slate-800 rounded-2xl text-slate-200 font-bold hover:bg-slate-700 transition-all flex items-center gap-2">
                <FileText size={18} /> View Journal
            </Link>
            <Link to="/reports" className="px-8 py-4 bg-emerald-600 rounded-2xl text-white font-bold hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-900/40 flex items-center gap-2">
                <PieChart size={18} /> Analyze Trends
            </Link>
        </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 px-4 md:px-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><FileSpreadsheet className="text-emerald-500" /> Statement Import</h1>
          <p className="text-slate-500 text-sm">Convert bank statements into organized data</p>
        </div>
        {stage === 'UPLOAD' && (
            <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 hover:text-white transition-colors">
                <Download size={18} /> Export CSV
            </button>
        )}
      </div>

      {stage === 'UPLOAD' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            <div className="md:col-span-1 space-y-6">
                <div id="account-panel" className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800 space-y-4 shadow-xl flex flex-col h-full transition-all duration-300">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                        <ArrowRight size={12} className="text-emerald-500" /> Select Bank / Account
                    </h3>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 max-h-[400px]">
                        {accounts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/50 text-center h-full">
                                <p className="text-slate-400 text-sm font-bold mb-3">No Accounts Found</p>
                                <button 
                                    onClick={() => setShowAccountModal(true)}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg"
                                >
                                    Create First Account
                                </button>
                            </div>
                        ) : (
                            <>
                                {accounts.map(a => (
                                    <div 
                                        key={a.id}
                                        onClick={() => handleAccountChange(a.id)}
                                        className={`relative p-4 rounded-xl border cursor-pointer transition-all active:scale-[0.98] group flex items-center justify-between ${targetAccount === a.id ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${targetAccount === a.id ? 'bg-emerald-500 text-slate-900' : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'}`}>
                                                {getAccountIcon(a.type)}
                                            </div>
                                            <div>
                                                <p className={`text-xs font-bold ${targetAccount === a.id ? 'text-emerald-400' : 'text-slate-300'}`}>{a.name}</p>
                                                <p className="text-[10px] text-slate-500 uppercase">{a.currency}</p>
                                            </div>
                                        </div>
                                        {targetAccount === a.id && <CheckCircle2 size={18} className="text-emerald-500" />}
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                    
                    {accounts.length > 0 && (
                        <button 
                            onClick={() => setShowAccountModal(true)}
                            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-widest transition-all mt-4"
                        >
                            + Add New Account
                        </button>
                    )}
                </div>
            </div>

            <div className="md:col-span-2 space-y-6">
                <div className="bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden flex flex-col h-full shadow-2xl">
                    <div className="flex border-b border-slate-800">
                        <button onClick={() => setImportSource('FILE')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${importSource === 'FILE' ? 'bg-slate-900/80 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Upload File (XLS/CSV)</button>
                        <button onClick={() => setImportSource('TEXT')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${importSource === 'TEXT' ? 'bg-slate-900/80 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Paste Text</button>
                    </div>

                    <div className="p-8 flex-1 flex flex-col justify-center items-center">
                        {importSource === 'FILE' ? (
                            <div className="w-full h-full min-h-[300px] border-2 border-dashed border-slate-700 rounded-2xl flex flex-col items-center justify-center relative group hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all">
                                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} onClick={handleFileClick} className="absolute inset-0 opacity-0 cursor-pointer" />
                                <div className="p-4 bg-slate-800 rounded-full mb-4 group-hover:scale-110 transition-transform shadow-lg">
                                    <Upload size={32} className="text-emerald-500" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Drop statement here</h3>
                                <p className="text-slate-500 text-sm max-w-xs text-center">Supports Excel (.xlsx) and CSV formats. Max file size 5MB.</p>
                                {!targetAccount && <p className="mt-4 text-rose-500 text-xs font-bold uppercase animate-pulse">Select an account first</p>}
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col gap-4">
                                <textarea 
                                    className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm font-mono text-slate-300 outline-none focus:border-emerald-500/50 min-h-[300px]" 
                                    placeholder="Paste rows from Excel or Google Sheets here..."
                                    value={pastedText}
                                    onChange={e => setPastedText(e.target.value)}
                                />
                                <button onClick={handleTextImport} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-900/20">Process Text Data</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}

      {stage === 'MAPPING' && (
        <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 shadow-2xl animate-in slide-in-from-right-8 duration-500">
             <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-6">
                 <div>
                    <h2 className="text-xl font-bold text-white mb-1">Map Columns</h2>
                    <p className="text-slate-500 text-sm">Match your file columns to our data structure</p>
                 </div>
                 <button onClick={() => setStage('UPLOAD')} className="text-sm font-bold text-slate-500 hover:text-white">Cancel</button>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
                 {([
                     { label: 'Date', key: 'date', req: true, icon: <Coffee size={14}/> },
                     { label: 'Description', key: 'desc', req: true, icon: <FileText size={14}/> },
                     { label: 'Amount', key: 'amount', req: true, icon: <Type size={14}/> },
                     { label: 'Category (Opt)', key: 'cat', req: false, icon: <Layers size={14}/> },
                     { label: 'Type (Opt)', key: 'type', req: false, icon: <Settings size={14}/> }
                 ] as const).map(f => (
                     <div key={f.key} className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                         <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                             {f.icon} {f.label} {f.req && <span className="text-rose-500">*</span>}
                         </label>
                         <div className="relative">
                            <select 
                                value={map[f.key]} 
                                onChange={(e) => { const newMap = { ...map, [f.key]: parseInt(e.target.value) }; setMap(newMap); saveMappingState(newMap, amountMode); }}
                                className={`w-full appearance-none bg-slate-950 border border-slate-800 rounded-xl py-3 pl-3 pr-8 text-xs font-bold outline-none cursor-pointer ${map[f.key] > -1 ? 'text-emerald-400 border-emerald-500/30' : 'text-slate-400'}`}
                            >
                                <option value={-1}>Select Column...</option>
                                {fullData[0]?.map((h: any, i: number) => <option key={i} value={i}>{h || `Col ${i+1}`}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={14} />
                         </div>
                     </div>
                 ))}
             </div>

             <div className="flex items-center gap-4 mb-8 bg-slate-900/30 p-4 rounded-xl border border-slate-800">
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Amount Format:</span>
                 <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                     <button onClick={() => { setAmountMode('SIGNED'); saveMappingState(map, 'SIGNED'); }} className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${amountMode === 'SIGNED' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Signed (-Expense / +Income)</button>
                     <button onClick={() => { setAmountMode('UNSIGNED_TYPE'); saveMappingState(map, 'UNSIGNED_TYPE'); }} className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${amountMode === 'UNSIGNED_TYPE' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Unsigned (Requires Type Col)</button>
                 </div>
             </div>
             
             <div className="border border-slate-800 rounded-xl overflow-hidden mb-8">
                 <table className="w-full text-left text-xs text-slate-400">
                     <thead className="bg-slate-900 border-b border-slate-800 text-slate-500 font-bold uppercase">
                         <tr>{fullData[0]?.map((h: any, i: number) => <th key={i} className={`p-3 whitespace-nowrap ${Object.values(map).includes(i) ? 'text-emerald-500 bg-emerald-500/5' : ''}`}>{h}</th>)}</tr>
                     </thead>
                     <tbody>
                         {previewData.slice(1).map((row, i) => (
                             <tr key={i} className="border-b border-slate-800 last:border-0 hover:bg-slate-900/30">
                                 {row.map((c: any, j: number) => (
                                     <td key={j} className={`p-3 truncate max-w-[150px] ${Object.values(map).includes(j) ? 'text-slate-200 font-medium' : ''}`}>{c}</td>
                                 ))}
                             </tr>
                         ))}
                     </tbody>
                 </table>
             </div>

             <div className="flex justify-end">
                 <button onClick={analyzeAndClassify} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-emerald-900/20 flex items-center gap-2">
                     Analyze & Classify <ArrowRight size={18} />
                 </button>
             </div>
        </div>
      )}

      {stage === 'CLASSIFY' && (
          <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
              <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
                  <div>
                      <h2 className="text-xl font-bold text-white mb-1">Verify Classifications</h2>
                      <p className="text-slate-500 text-sm">Review identified transactions before importing.</p>
                  </div>
                  <div className="flex items-center gap-3">
                      {aiError && <span className="text-rose-500 text-xs font-bold px-3 py-1 bg-rose-500/10 rounded-lg border border-rose-500/20">{aiError}</span>}
                      <button 
                        onClick={handleAiCategorize} 
                        disabled={isAiClassifying}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-indigo-900/20 disabled:opacity-50"
                      >
                          {isAiClassifying ? <Activity className="animate-spin" size={16} /> : <BrainCircuit size={16} />}
                          {isAiClassifying ? 'AI Processing...' : 'Auto-Classify with AI'}
                      </button>
                      <button onClick={finishImport} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/20">
                          Confirm Import <Check size={18} />
                      </button>
                  </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                  {classifications.map((item, idx) => (
                      <div key={idx} className="bg-[#0f172a] p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center gap-4 hover:border-slate-700 transition-colors group">
                          <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-bold text-white truncate">{item.keyword}</span>
                                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">{item.count}x</span>
                              </div>
                              <p className="text-xs text-slate-500 truncate italic">"{item.originalSample}"</p>
                              <p className="text-[10px] text-slate-600 font-mono mt-1">Avg: {settings.currencySymbol}{Math.abs(item.sampleAmount).toFixed(2)}</p>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                                <div className="relative min-w-[140px]">
                                    <select 
                                        value={item.targetCategoryId}
                                        onChange={(e) => {
                                            const newItem = { ...item };
                                            if (e.target.value === 'NEW') {
                                                newItem.targetCategoryId = 'NEW';
                                            } else {
                                                const cat = categories.find(c => c.id === e.target.value);
                                                if(cat) {
                                                    newItem.targetCategoryId = cat.id;
                                                    newItem.newType = cat.type;
                                                    newItem.newNecessity = cat.necessity || 'WANT';
                                                    newItem.newIcon = cat.icon || '🏷️';
                                                }
                                            }
                                            const newClass = [...classifications];
                                            newClass[idx] = newItem;
                                            setClassifications(newClass);
                                        }}
                                        className="w-full appearance-none bg-slate-900 border border-slate-800 text-slate-200 text-xs font-bold rounded-lg py-2 pl-3 pr-8 outline-none focus:border-emerald-500/50"
                                    >
                                        <option value="NEW">+ Create New</option>
                                        <optgroup label="Existing Categories">
                                            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                                        </optgroup>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={12} />
                                </div>
                                
                                <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
                                    {(['INCOME', 'EXPENSE', 'INVESTMENT'] as const).map(t => (
                                        <button 
                                            key={t}
                                            onClick={() => {
                                                const newClass = [...classifications];
                                                newClass[idx].newType = t;
                                                setClassifications(newClass);
                                            }}
                                            className={`px-2 py-1.5 rounded text-[9px] font-bold uppercase transition-all ${item.newType === t ? (t === 'INCOME' ? 'bg-emerald-500 text-slate-950' : t === 'INVESTMENT' ? 'bg-purple-500 text-white' : 'bg-rose-500 text-white') : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            {t.substring(0,3)}
                                        </button>
                                    ))}
                                </div>

                                {item.newType === 'EXPENSE' && (
                                    <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
                                        <button onClick={() => { const nc = [...classifications]; nc[idx].newNecessity = 'NEED'; setClassifications(nc); }} className={`px-2 py-1.5 rounded text-[9px] font-bold uppercase transition-all ${item.newNecessity === 'NEED' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>Need</button>
                                        <button onClick={() => { const nc = [...classifications]; nc[idx].newNecessity = 'WANT'; setClassifications(nc); }} className={`px-2 py-1.5 rounded text-[9px] font-bold uppercase transition-all ${item.newNecessity === 'WANT' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>Want</button>
                                    </div>
                                )}
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* ACCOUNT CREATION MODAL */}
      {showAccountModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowAccountModal(false)} />
            <div className="relative bg-[#0f172a] border border-slate-800 rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-white">New Account</h3>
                    <button onClick={() => setShowAccountModal(false)}><X size={18} className="text-slate-500 hover:text-white"/></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Account Name</label>
                        <input autoFocus type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-emerald-500/50" placeholder="e.g. Chase Checking" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Initial Balance</label>
                        <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-emerald-500/50" placeholder="0.00" value={newAccountBalance} onChange={e => setNewAccountBalance(e.target.value)} />
                    </div>
                    <button onClick={createNewAccount} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/20 transition-all mt-2">Create Account</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
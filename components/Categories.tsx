
import React, { useState, useEffect, useMemo } from 'react';
import { db, subscribe, getAutoEmoji, getColorForName } from '../services/storage';
import { Category, Transaction, TransactionType } from '../types';
import { Plus, Trash2, Layers, Heart, Coffee, Pencil, Sparkles, Check, GitMerge, BarChart3, TrendingUp, Tag, X, Calendar, GripHorizontal, ArrowRight, Smile, PieChart as PieIcon, ArrowDownToLine, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, CartesianGrid, Legend } from 'recharts';

const COMMON_EMOJIS = [
    // Finance & Work
    '💰', '💵', '💳', '🏦', '💸', '🧾', '🏷️', '📈', '📉', '📊', '₿', '🥇', '🛡️', '💼', '📎', '📌', '📅',
    // Home & Utilities
    '🏠', '💡', '💧', '🔥', '⚡', '🌐', '🛠️', '🛋️', '🛏️', '🚪', '🔑', '🧼', '🧺', '🪴', '🚽', '📦',
    // Food & Drink
    '🛒', '🍔', '🍽️', '☕', '🍺', '🍿', '🍕', '🥗', '🥩', '🍗', '🍞', '🧀', '🍎', '🍌', '🍇', '🍉', '🍣', '🍱', '🍜', '🍝', '🍩', '🍪', '🍫', '🍷', '🍸', '🍹',
    // Transport & Travel
    '🚗', '⛽', '🚌', '✈️', '🚖', '🔧', '🚂', '🚇', '🚲', '🛴', '🛵', '⛵', '🗺️', '🧭', '🏖️', '⛰️', '🏨', '🎫',
    // Health & Self
    '⚕️', '💊', '💪', '🏥', '🧘', '💇', '💅', '🧖', '🦷', '👓', '🚑', '🩸', '🦠', '🧼',
    // Shopping & Fun
    '🛍️', '🎁', '🎬', '🎮', '🎵', '📚', '🎨', '🎲', '🎳', '🎯', '🎪', '🎟️', '🧶', '📷', '📱', '💻', '⌚', '🎧',
    // Family & Pets
    '👶', '🐾', '🐶', '🐱', '🎓', '🏫', '🧸', '🪁', '👨‍👩‍👧', '💍', '💐',
    // Nature & Misc
    '☀️', '🌧️', '❄️', '🌈', '🔥', '💧', '⭐', '❤️', '⚠️', '🚫', '✅', '🆘'
];

interface AnalysisTarget {
    type: 'CATEGORY' | 'GROUP';
    id: string; // Used for stable re-fetching
    name?: string; // Used for groups
}

export const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState(db.getSettings());
  
  const [analysisTarget, setAnalysisTarget] = useState<AnalysisTarget | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'ANALYTICS' | 'TRANSACTIONS'>('ANALYTICS');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const [formData, setFormData] = useState<Partial<Category>>({
    name: '', group: 'General', type: 'EXPENSE', necessity: 'WANT', color: '#3B82F6', icon: '🏷️', defaultFrequency: 'MONTHLY_NET'
  });

  // Merge State
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

  const loadData = () => {
      setCategories(db.getCategories());
      setTransactions(db.getTransactions());
      setSettings(db.getSettings());
  };
  
  useEffect(() => {
    loadData();
    const unsubscribe = subscribe(loadData);
    return () => unsubscribe();
  }, []);

  const handleOpenEdit = (category?: Category) => {
    if (category) setFormData({ ...category });
    else setFormData({ name: '', group: 'General', type: 'EXPENSE', necessity: 'WANT', color: '#3B82F6', icon: '🏷️', defaultFrequency: 'MONTHLY_NET' });
    setIsEditModalOpen(true);
    setShowEmojiPicker(false);
  };

  const handleSave = () => {
    if (!formData.name || !formData.group) return;
    const catToSave = { ...formData, id: analysisTarget?.type === 'CATEGORY' ? analysisTarget.id : formData.id };
    if (!catToSave.icon) catToSave.icon = getAutoEmoji(catToSave.name || '');
    db.saveCategory(catToSave as Category);
    setIsEditModalOpen(false);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
      e.dataTransfer.setData('text/plain', id);
      setDragSourceId(id);
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
      e.preventDefault();
      if (dragSourceId !== id) {
          setDragTargetId(id);
      }
  };

  const handleDragLeave = () => {
      setDragTargetId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData('text/plain');
      if (sourceId && sourceId !== targetId) {
          setDragSourceId(sourceId);
          setDragTargetId(targetId);
          setIsMergeModalOpen(true);
      } else {
          setDragSourceId(null);
          setDragTargetId(null);
      }
  };

  const confirmMerge = () => {
      if (dragSourceId && dragTargetId) {
          db.mergeCategory(dragSourceId, dragTargetId);
          setDragSourceId(null);
          setDragTargetId(null);
          setIsMergeModalOpen(false);
      }
  };

  const currentAnalysisData = useMemo(() => {
    if (!analysisTarget) return null;
    let dataTxs: Transaction[] = [];
    let name = '', color = '#3b82f6', icon = '📊';

    if (analysisTarget.type === 'CATEGORY') {
        const cat = categories.find(c => c.id === analysisTarget.id);
        if (!cat) return null;
        dataTxs = transactions.filter(t => t.categoryId === cat.id);
        name = cat.name; color = cat.color || '#3b82f6'; icon = cat.icon || '🏷️';
    } else {
        const groupCats = categories.filter(c => c.group === analysisTarget.name);
        const ids = groupCats.map(c => c.id);
        dataTxs = transactions.filter(t => ids.includes(t.categoryId));
        name = analysisTarget.name + " (Group)"; color = '#6366f1'; icon = '📂';
    }

    dataTxs.sort((a,b) => b.date.localeCompare(a.date));
    const totalAmount = dataTxs.reduce((s, t) => s + t.amount, 0);
    
    // BUILD STACKED TREND DATA
    const trendMap: Record<string, any> = {};
    const subElementKeys = new Set<string>();

    dataTxs.forEach(t => { 
        const monthKey = t.date.substring(0, 7); // YYYY-MM
        if (!trendMap[monthKey]) {
            trendMap[monthKey] = { 
                date: new Date(monthKey + '-15').toLocaleDateString('en-US', {month:'short', year:'2-digit'}), 
                rawDate: monthKey,
                total: 0
            };
        }
        
        let subKey = 'Base';
        if (analysisTarget.type === 'GROUP') {
            subKey = categories.find(c => c.id === t.categoryId)?.name || 'Unknown';
        } else {
            subKey = t.tags && t.tags.length > 0 ? t.tags[0] : 'Standard';
        }
        
        subElementKeys.add(subKey);
        trendMap[monthKey][subKey] = (trendMap[monthKey][subKey] || 0) + t.amount;
        trendMap[monthKey].total += t.amount;
    });

    const trendData = Object.values(trendMap).sort((a: any, b: any) => a.rawDate.localeCompare(b.rawDate)).slice(-12);
    const stackKeys = Array.from(subElementKeys);

    let breakdownData: any[] = [];
    if (analysisTarget.type === 'GROUP') {
        const catMap: Record<string, number> = {};
        dataTxs.forEach(t => { const c = categories.find(c=>c.id===t.categoryId)?.name || 'Unknown'; catMap[c] = (catMap[c]||0)+t.amount; });
        breakdownData = Object.entries(catMap).map(([n,v])=>({name:n, value:v})).sort((a,b)=>b.value-a.value).slice(0, 8);
    } else {
        const tagMap: Record<string, number> = {};
        dataTxs.forEach(t => { if(t.tags?.length) t.tags.forEach(tg => tagMap[tg] = (tagMap[tg]||0)+(t.amount/t.tags!.length)); else tagMap['No Tag'] = (tagMap['No Tag']||0)+t.amount; });
        breakdownData = Object.entries(tagMap).map(([n,v])=>({name:n, value:v})).sort((a,b)=>b.value-a.value).slice(0,8);
    }

    return { 
        totalAmount, 
        avgAmount: dataTxs.length ? totalAmount/dataTxs.length : 0, 
        count: dataTxs.length, 
        trendData, 
        stackKeys,
        breakdownData, 
        transactions: dataTxs, 
        name, 
        color, 
        icon 
    };
  }, [analysisTarget, transactions, categories]);

  const groupedCategories = useMemo(() => categories.reduce((acc, c) => {
    const g = c.group || 'Uncategorized';
    if (!acc[g]) acc[g] = [];
    acc[g].push(c);
    return acc;
  }, {} as Record<string, Category[]>), [categories]);

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold text-white">Spending Categories</h1>
            <p className="text-slate-400 text-sm">Drag categories to merge duplicates</p>
        </div>
        <div className="flex gap-2">
            <button onClick={() => { setAnalysisTarget(null); handleOpenEdit(); }} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-900/20 active:scale-95 transition-all"><Plus size={18}/> New</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(Object.entries(groupedCategories) as [string, Category[]][]).sort().map(([groupName, groupCats], idx) => (
              <div 
                key={groupName} 
                className="bg-[#0f172a] border border-slate-800 rounded-2xl overflow-hidden flex flex-col hover:border-slate-700 transition-colors animate-slide-up"
                style={{animationDelay: `${idx * 100}ms`, opacity: 0}}
              >
                  <div 
                    onClick={() => { setAnalysisTarget({ type: 'GROUP', id: groupName, name: groupName }); setActiveTab('ANALYTICS'); }}
                    className="p-4 bg-slate-900/50 border-b border-slate-800 flex justify-between items-center cursor-pointer hover:bg-slate-900 transition-colors"
                  >
                      <h3 className="font-bold text-slate-200 flex items-center gap-2"><Layers size={16} className="text-slate-500"/> {groupName}</h3>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{groupCats.length} Types</span>
                  </div>
                  <div className="p-2 space-y-1">
                      {groupCats.map(cat => (
                          <div 
                            key={cat.id} 
                            draggable
                            onDragStart={(e) => handleDragStart(e, cat.id)}
                            onDragOver={(e) => handleDragOver(e, cat.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, cat.id)}
                            onClick={() => { setAnalysisTarget({ type: 'CATEGORY', id: cat.id }); setActiveTab('ANALYTICS'); }}
                            className={`flex items-center justify-between p-3 rounded-xl cursor-pointer group transition-all duration-200 border border-transparent ${
                                dragTargetId === cat.id 
                                ? 'bg-indigo-500/20 border-indigo-500 scale-[1.02] shadow-[0_0_15px_rgba(99,102,241,0.3)]' 
                                : 'hover:bg-slate-900/80 hover:border-slate-800'
                            } ${dragSourceId === cat.id ? 'opacity-50 grayscale' : ''}`}
                          >
                              <div className="flex items-center gap-3 pointer-events-none">
                                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg bg-slate-950 border border-slate-800" style={{color: cat.color}}>{cat.icon}</div>
                                  <div>
                                      <p className="text-sm font-semibold text-slate-300 group-hover:text-white">{cat.name}</p>
                                      {cat.necessity && <span className={`text-[10px] font-bold uppercase tracking-tighter mr-2 ${cat.necessity === 'NEED' ? 'text-emerald-500' : 'text-amber-500'}`}>{cat.necessity}</span>}
                                      {cat.defaultFrequency && <span className="text-[9px] bg-slate-800 text-slate-400 px-1 rounded uppercase">{cat.defaultFrequency.replace('_', ' ')}</span>}
                                  </div>
                              </div>
                              <GripHorizontal size={14} className="text-slate-800 group-hover:text-slate-600 cursor-grab active:cursor-grabbing" />
                          </div>
                      ))}
                  </div>
              </div>
          ))}
      </div>

      {/* MERGE CONFIRMATION MODAL */}
      {isMergeModalOpen && dragSourceId && dragTargetId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsMergeModalOpen(false)} />
             <div className="relative bg-[#0f172a] border border-slate-800 rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95">
                <div className="flex items-center justify-center mb-4 text-indigo-400">
                    <ArrowDownToLine size={40} />
                </div>
                <h3 className="text-lg font-bold text-center text-white mb-2">Merge Categories?</h3>
                <p className="text-center text-slate-400 text-sm mb-6">
                    This will move all transactions from <strong className="text-white">{categories.find(c=>c.id===dragSourceId)?.name}</strong> into <strong className="text-white">{categories.find(c=>c.id===dragTargetId)?.name}</strong> and delete the source category.
                </p>
                <div className="flex gap-3">
                    <button onClick={() => setIsMergeModalOpen(false)} className="flex-1 py-3 text-slate-500 font-bold hover:text-white">Cancel</button>
                    <button onClick={confirmMerge} className="flex-1 py-3 bg-indigo-600 rounded-xl text-white font-bold hover:bg-indigo-500 shadow-lg">Confirm Merge</button>
                </div>
             </div>
        </div>
      )}

      {analysisTarget && !isEditModalOpen && currentAnalysisData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => setAnalysisTarget(null)} />
           <div className="relative w-full max-w-5xl bg-[#0f172a] border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/20">
                  <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-slate-900 border border-slate-800 shadow-xl" style={{color: currentAnalysisData.color}}>{currentAnalysisData.icon}</div>
                      <div>
                          <h2 className="text-xl font-bold text-white">{currentAnalysisData.name}</h2>
                          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Deep Performance Analysis</p>
                      </div>
                  </div>
                  <div className="flex gap-2">
                       {analysisTarget.type === 'CATEGORY' && (
                           <button onClick={() => handleOpenEdit(categories.find(c=>c.id===analysisTarget.id))} className="p-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-xl text-slate-300 transition-all"><Pencil size={18}/></button>
                       )}
                       <button onClick={() => setAnalysisTarget(null)} className="p-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-xl text-slate-500 transition-all"><X size={18}/></button>
                  </div>
              </div>

              <div className="flex border-b border-slate-800 px-6">
                  <button onClick={()=>setActiveTab('ANALYTICS')} className={`px-6 py-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab==='ANALYTICS'?'border-emerald-500 text-emerald-400':'border-transparent text-slate-500 hover:text-slate-300'}`}>Visuals</button>
                  <button onClick={()=>setActiveTab('TRANSACTIONS')} className={`px-6 py-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab==='TRANSACTIONS'?'border-emerald-500 text-emerald-400':'border-transparent text-slate-500 hover:text-slate-300'}`}>Journal</button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {activeTab === 'ANALYTICS' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* STACKED BAR CHART */}
                        <div className="bg-slate-900/30 p-6 rounded-3xl border border-slate-800 space-y-6">
                            <div className="flex justify-between items-end">
                                <div><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Output</p><h3 className="text-3xl font-bold text-white font-mono">{currentAnalysisData.totalAmount.toLocaleString()}</h3></div>
                                <div className="text-right"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Entries</p><h3 className="text-xl font-bold text-emerald-500">{currentAnalysisData.count}</h3></div>
                            </div>
                            <div className="h-[250px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={currentAnalysisData.trendData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:'#475569',fontSize:10}} />
                                        <Tooltip 
                                            cursor={{fill:'#1e293b',opacity:0.4}} 
                                            contentStyle={{backgroundColor:'#020617',borderColor:'#1e293b',borderRadius:'12px', color:'#fff'}} 
                                        />
                                        <Legend wrapperStyle={{fontSize:'10px', paddingTop:'10px'}} />
                                        
                                        {/* Dynamic Stacks */}
                                        {currentAnalysisData.stackKeys.map((key, index) => (
                                            <Bar 
                                                key={key} 
                                                dataKey={key} 
                                                stackId="a" 
                                                fill={getColorForName(key)} 
                                                radius={index === currentAnalysisData.stackKeys.length - 1 ? [4,4,0,0] : [0,0,0,0]}
                                                barSize={24}
                                                animationDuration={1000}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* PIE CHART */}
                        <div className="bg-slate-900/30 p-6 rounded-3xl border border-slate-800 flex flex-col items-center justify-center">
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Allocation Breakdown</h3>
                            <div className="h-[200px] w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={currentAnalysisData.breakdownData} innerRadius={50} outerRadius={80} dataKey="value" stroke="none">{currentAnalysisData.breakdownData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={getColorForName(entry.name)} />)}</Pie><Tooltip contentStyle={{backgroundColor:'#020617',borderColor:'#1e293b',borderRadius:'12px'}}/></PieChart></ResponsiveContainer></div>
                            <div className="grid grid-cols-2 gap-2 mt-4 w-full">
                                {currentAnalysisData.breakdownData.slice(0,4).map((d:any)=>(<div key={d.name} className="flex justify-between text-[10px] bg-slate-900/50 p-2 rounded-lg border border-slate-800"><span className="text-slate-400 truncate max-w-[80px]">{d.name}</span><span className="text-slate-200 font-bold">{d.value.toLocaleString()}</span></div>))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {currentAnalysisData.transactions.map(tx=>(
                            <div key={tx.id} className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl flex justify-between items-center hover:border-slate-600 transition-colors">
                                <div><p className="text-sm font-bold text-slate-200">{tx.description}</p><p className="text-[10px] text-slate-500 font-mono mt-0.5">{tx.date}</p></div>
                                <div className="text-right"><p className="text-sm font-bold text-white font-mono">{tx.amount.toLocaleString()}</p></div>
                            </div>
                        ))}
                    </div>
                )}
              </div>
           </div>
        </div>
      )}

      {isEditModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsEditModalOpen(false)} />
              <div className="relative bg-[#0f172a] border border-slate-800 rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-8">
                      <h2 className="text-xl font-bold text-white">{analysisTarget?.type === 'CATEGORY' ? 'Update Category' : 'Fresh Category'}</h2>
                      <button onClick={() => setIsEditModalOpen(false)} className="p-2 bg-slate-800 rounded-full text-slate-500 hover:text-white transition-all"><X size={16}/></button>
                  </div>
                  <div className="space-y-6">
                      {/* Name & Icon Row */}
                      <div className="flex gap-4 items-end">
                            <button onClick={()=>setShowEmojiPicker(!showEmojiPicker)} className="w-16 h-16 bg-slate-950 border border-slate-800 rounded-2xl text-3xl flex items-center justify-center hover:border-emerald-500/50 transition-colors relative">{formData.icon}{showEmojiPicker && (<div className="absolute top-20 left-0 w-[280px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 p-3 grid grid-cols-6 gap-2 max-h-[300px] overflow-y-auto">{COMMON_EMOJIS.map(e=>(<button key={e} onClick={(ev)=>{ev.stopPropagation(); setFormData({...formData, icon:e}); setShowEmojiPicker(false);}} className="text-xl hover:scale-125 transition-transform p-1 rounded hover:bg-slate-800">{e}</button>))}</div>)}</button>
                            <div className="flex-1"><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Display Name</label><input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:ring-2 ring-emerald-500/20" value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} /></div>
                      </div>

                      {/* NEW: PILL-STYLE TYPE SELECTOR */}
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Category Role</label>
                          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 shadow-inner">
                              {(['INCOME', 'EXPENSE', 'INVESTMENT'] as const).map(t => (
                                  <button 
                                      key={t}
                                      onClick={() => setFormData({...formData, type: t})}
                                      className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase transition-all ${formData.type === t 
                                          ? (t === 'INCOME' ? 'bg-emerald-500 text-slate-950 shadow-lg' : t === 'INVESTMENT' ? 'bg-purple-500 text-white shadow-lg' : 'bg-rose-500 text-white shadow-lg')
                                          : 'text-slate-600 hover:text-slate-400'}`}
                                  >
                                      {t}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Group</label><input type="text" list="groups_list" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white outline-none" value={formData.group} onChange={e=>setFormData({...formData, group:e.target.value})} /><datalist id="groups_list">{Object.keys(groupedCategories).map(g=><option key={g} value={g}/>)}</datalist></div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Necessity</label>
                            <div className={`flex bg-slate-950 p-1 rounded-2xl border border-slate-800 transition-opacity ${formData.type !== 'EXPENSE' ? 'opacity-30 pointer-events-none' : ''}`}>
                                {(['NEED', 'WANT'] as const).map(n => (
                                    <button 
                                        key={n}
                                        onClick={() => setFormData({...formData, necessity: n})}
                                        className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase transition-all ${formData.necessity === n ? 'bg-slate-700 text-white shadow-md' : 'text-slate-600'}`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                          </div>
                      </div>

                      {/* NEW: FREQUENCY SELECTOR */}
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Clock size={10} /> Default Frequency</label>
                          <div className="flex flex-wrap bg-slate-950 p-1 rounded-2xl border border-slate-800">
                              {(['DAILY', 'MONTHLY_ONCE', 'MONTHLY_NET', 'YEARLY'] as const).map(f => (
                                  <button 
                                      key={f}
                                      onClick={() => setFormData({...formData, defaultFrequency: f})}
                                      className={`flex-1 py-2.5 px-2 m-0.5 rounded-xl text-[9px] font-bold uppercase transition-all whitespace-nowrap ${formData.defaultFrequency === f ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 hover:text-slate-400'}`}
                                  >
                                      {f.replace('MONTHLY_', 'MO. ').replace('_', ' ')}
                                  </button>
                              ))}
                          </div>
                          <p className="text-[10px] text-slate-600 mt-2 italic">* Used as default setting in Planning mode</p>
                      </div>
                      
                      <div className="pt-4 border-t border-slate-800 flex gap-4">
                          {analysisTarget?.type === 'CATEGORY' && (<button onClick={()=>db.deleteCategory(analysisTarget.id)} className="p-4 bg-rose-500/10 text-rose-500 rounded-2xl hover:bg-rose-500/20 transition-all"><Trash2 size={20}/></button>)}
                          <button onClick={handleSave} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl shadow-xl shadow-emerald-900/20 active:scale-[0.98] transition-all">Synchronize Changes</button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
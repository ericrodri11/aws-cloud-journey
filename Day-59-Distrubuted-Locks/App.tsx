import React, { useState, useEffect } from 'react';
// --- AWS AMPLIFY ---
import { Amplify } from 'aws-amplify';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import '@aws-amplify/ui-react/styles.css';

import { 
  Terminal, CloudLightning, Database, Wifi, RefreshCw, PieChart as PieIcon, 
  Plane, Utensils, ShoppingBag, Car, Home, Coffee, 
  Dumbbell, Landmark, MonitorPlay, Calendar, TrendingUp, TrendingDown,
  Cpu, CreditCard, Activity, CheckCircle2, Search, Target, Send, Flame, ExternalLink, Zap, LogOut, Settings, X
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer
} from 'recharts';

// --- CONFIGURACIÓN DE AWS COGNITO ---
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID || 'eu-north-1_F7AiUXQ5n',
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || '3031dnoutcfcrvi4g0gs18pbu6',
    }
  }
});

const API_URL = "https://vdwaba4uy35hpeohz77buz6p640yvslf.lambda-url.eu-north-1.on.aws/"; 
const CACHE_KEY = "finai_dashboard_data";

const COLORS = {
  food: '#f59e0b', coffee: '#06b6d4', transport: '#f97316', travel: '#3b82f6',
  shop: '#ec4899', tech: '#8b5cf6', leisure: '#10b981', financial: '#ef4444',
  general: '#64748b'
};

interface Transaction { 
  description: string; 
  amount: string | number; 
  currency: string; 
  transaction_date: string; 
  category: string; 
}

interface ChartDataPoint { 
  name: string; 
  value: number; 
  color: string; 
  icon: any; 
}

interface FinancialOffer { 
  id: string; 
  type: string; 
  title: string; 
  description: string; 
  cta_text: string; 
  color: string; 
}

const getCategoryDetails = (catName: string) => {
  switch(catName) {
    case 'Coffee': return { icon: Coffee, color: COLORS.coffee };
    case 'Food': return { icon: Utensils, color: COLORS.food };
    case 'Transport': return { icon: Car, color: COLORS.transport };
    case 'Travel': return { icon: Plane, color: COLORS.travel };
    case 'Shopping': return { icon: ShoppingBag, color: COLORS.shop };
    case 'Leisure': return { icon: Dumbbell, color: COLORS.leisure };
    case 'Electronics': return { icon: Cpu, color: COLORS.tech };
    case 'Tech': return { icon: MonitorPlay, color: COLORS.tech };
    case 'Financial': return { icon: Landmark, color: COLORS.financial };
    default: return { icon: CreditCard, color: COLORS.general };
  }
};

const getMonthOptions = () => {
  const options = [];
  const start = new Date(2025, 11);
  const end = new Date(); 
  let current = new Date(start);
  while (current <= end) {
    options.push({ 
      month: current.getMonth(), 
      year: current.getFullYear(), 
      label: current.toLocaleString('default', { month: 'long', year: 'numeric' }) 
    });
    current.setMonth(current.getMonth() + 1);
  }
  return options.reverse(); 
};

// ==========================================
// COMPONENTE PRINCIPAL DEL DASHBOARD
// ==========================================
const Dashboard = () => {
  const { signOut } = useAuthenticator((context) => [context.user]); 

  const [typedText, setTypedText] = useState('');
  const [fullText, setFullText] = useState("> SYSTEM_INIT: Connecting to Neural Core...");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [pieData, setPieData] = useState<ChartDataPoint[]>([]);
  
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [financialScore, setFinancialScore] = useState(0);
  const [scoreShortReasons, setScoreShortReasons] = useState<string[]>([]); 
  const [scoreAuditLog, setScoreAuditLog] = useState<string[]>([]);       
  const [scoreFeedback, setScoreFeedback] = useState(""); 
  const [projectedSpend, setProjectedSpend] = useState(0); 
  const [currentStreak, setCurrentStreak] = useState(0); 
  const [financialOffers, setFinancialOffers] = useState<FinancialOffer[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const [userQuery, setUserQuery] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);

  // --- SETTINGS STATE ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [prefName, setPrefName] = useState("");
  const [prefSavingsGoal, setPrefSavingsGoal] = useState("5");
  const [prefTone, setPrefTone] = useState("brutal");
  const [prefWantsEmail, setPrefWantsEmail] = useState(true); // <-- NUEVO ESTADO PARA FINOPS
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  useEffect(() => {
    setTypedText(''); 
    let index = 0;
    const timer = setInterval(() => {
      setTypedText((prev) => fullText.substring(0, index + 1));
      index++;
      if (index > fullText.length) clearInterval(timer);
    }, 20); 
    return () => clearInterval(timer);
  }, [fullText]);

  useEffect(() => {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        setAllTransactions(parsed.transactions || []);
        setFinancialScore(parsed.financial_score || 0);
        setScoreShortReasons(parsed.score_short_reasons || []);
        setScoreAuditLog(parsed.score_audit_log || []);
        setScoreFeedback(parsed.score_feedback || "Analysis loaded from memory.");
        setProjectedSpend(parsed.projected_spend || 0);
        setCurrentStreak(parsed.current_streak || 0);
        setFinancialOffers(parsed.financial_offers || []); 
        setFullText(`> SYSTEM_RESTORE: ${parsed.dashboard_message || 'Memory loaded.'}`);
        setLoading(false); 
      } catch (e) { console.error("Cache parsing error", e); }
    }
    fetchData();
  }, []);

  const fetchData = async (query?: string, forceSync: boolean = false) => {
      try {
        if (!query && !localStorage.getItem(CACHE_KEY) && !forceSync) setLoading(true);
        setIsSyncing(true); 
        if (query) setIsQuerying(true);

        // FIX ARQUITECTÓNICO: Añadimos el parámetro sync=true a la URL
        let url = API_URL;
        const params = new URLSearchParams();
        if (query) params.append('query', query);
        if (forceSync) params.append('sync', 'true');
        
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        
        // 🔒 MAGIA DE SEGURIDAD: Obtener el Token JWT de la sesión actual
        const { tokens } = await fetchAuthSession();
        const jwtToken = tokens?.idToken?.toString();

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${jwtToken}` 
          }
        });

        if (!response.ok) throw new Error("Server Error");
        const result = await response.json();
        
        if (result.data) {
            setAllTransactions(result.data.transactions || []);
            setFinancialScore(result.data.financial_score || 0);
            setScoreShortReasons(result.data.score_short_reasons || []);
            
            const fallbackAuditLog = [
              "Base: 50 Points (Default start).",
              "Savings Rate: Ratio of (Income - Expenses) / Income.",
              "Penalty: Applied only if absolute expense volume exceeds 3000€ (excluding transfers)."
            ];
            
            const auditLogToSet = Array.isArray(result.data.score_audit_log) && result.data.score_audit_log.length > 0 
                ? result.data.score_audit_log 
                : fallbackAuditLog;
                
            setScoreAuditLog(auditLogToSet);
            setScoreFeedback(result.data.score_feedback || "Solid habits.");
            setProjectedSpend(result.data.projected_spend || 0); 
            setCurrentStreak(result.data.current_streak || 0); 
            setFinancialOffers(result.data.financial_offers || []); 
            
            const aiMsg = result.data.dashboard_message || "Analysis Complete.";
            setFullText(`> ${query ? 'AI_RESPONSE:' : 'SYSTEM_ANALYSIS_COMPLETE:'} ${aiMsg}`);

            if (!query && !forceSync) {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    transactions: result.data.transactions, 
                    financial_score: result.data.financial_score,
                    score_short_reasons: result.data.score_short_reasons, 
                    score_audit_log: auditLogToSet,
                    score_feedback: result.data.score_feedback, 
                    projected_spend: result.data.projected_spend,
                    current_streak: result.data.current_streak, 
                    financial_offers: result.data.financial_offers, 
                    dashboard_message: aiMsg
                }));
            }
        }
      } catch (error) {
        if (!localStorage.getItem(CACHE_KEY)) setFullText("> ERROR: Connection Failed. Retrying...");
      } finally { 
        setLoading(false); 
        setIsSyncing(false); 
        setIsQuerying(false); 
      }
  };

  const handleQuerySubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!userQuery.trim()) return;
      fetchData(userQuery);
      setUserQuery(""); 
  };

  useEffect(() => {
    if (allTransactions.length === 0) return;
    
    const filteredTxs = allTransactions.filter((tx: any) => {
        const txDate = new Date(tx.transaction_date);
        return txDate.getMonth() === selectedMonth && txDate.getFullYear() === selectedYear;
    }).sort((a: any, b: any) => {
        // FIX FRONTEND: Ordenamos estrictamente de más nuevo a más antiguo
        return new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime();
    });
    
    setTransactions(filteredTxs);

    const categoryMap: Record<string, number> = {};
    let calcIncome = 0; 
    let calcExpenses = 0;

    filteredTxs.forEach((tx: any) => {
        const amount = parseFloat(tx.amount); 
        const desc = tx.description.toLowerCase();
        const absAmount = Math.abs(amount);

        const isIncomeKeyword = desc.includes('deposit') || desc.includes('credit') || desc.includes('payroll') || desc.includes('gusto') || desc.includes('refund');
        let isExpense = true;
        
        if (isIncomeKeyword || amount < 0) {
            isExpense = false;
        }
        
        if (isExpense) {
            calcExpenses += absAmount;
            let cat = "General";
            if (desc.includes('starbucks') || desc.includes('coffee')) cat = "Coffee";
            else if (desc.includes('mcdonald') || desc.includes('burger') || desc.includes('kfc')) cat = "Food";
            else if (desc.includes('uber') || desc.includes('lyft')) cat = "Transport";
            else if (desc.includes('united') || desc.includes('airline')) cat = "Travel";
            else if (desc.includes('amazon') || desc.includes('shop')) cat = "Shopping";
            else if (desc.includes('sparkfun') || desc.includes('apple')) cat = "Electronics";
            else if (desc.includes('climb') || desc.includes('gym')) cat = "Leisure";
            else if (desc.includes('netflix') || desc.includes('spotify')) cat = "Tech";
            
            categoryMap[cat] = (categoryMap[cat] || 0) + absAmount;
        } else {
            calcIncome += absAmount;
        }
    });
    
    setTotalIncome(calcIncome); 
    setTotalExpenses(calcExpenses);

    const processedPie = Object.keys(categoryMap).map((key) => {
        const details = getCategoryDetails(key);
        return { name: key, value: categoryMap[key], color: details.color, icon: details.icon };
    }).sort((a, b) => b.value - a.value);
    
    setPieData(processedPie);
  }, [allTransactions, selectedMonth, selectedYear]);

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const [m, y] = e.target.value.split('-');
      setSelectedMonth(parseInt(m));
      setSelectedYear(parseInt(y));
  };

  const fetchPreferences = async () => {
    try {
      const { tokens } = await fetchAuthSession();
      const response = await fetch(`${API_URL}?action=get_preferences`, { headers: { 'Authorization': `Bearer ${tokens?.idToken?.toString()}` }});
      const res = await response.json();
      if (res.data) {
        setPrefName(res.data.display_name || "");
        setPrefSavingsGoal(res.data.daily_savings_goal?.toString() || "5");
        setPrefTone(res.data.ai_tone || "brutal");
        // NUEVO: Recuperar preferencia de email, por defecto a true (Opt-out)
        setPrefWantsEmail(res.data.wants_daily_email !== false);
      }
    } catch (e) { console.error("Error fetching preferences", e); }
  };

  const openSettings = () => {
    setIsSettingsOpen(true);
    fetchPreferences();
  };

  const savePreferences = async () => {
    setIsSavingPrefs(true);
    try {
      const { tokens } = await fetchAuthSession();
      const safeSavingsGoal = Math.max(0, parseFloat(prefSavingsGoal));
      
      await fetch(`${API_URL}?action=save_preferences`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokens?.idToken?.toString()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: prefName, 
          daily_savings_goal: safeSavingsGoal, 
          ai_tone: prefTone,
          wants_daily_email: prefWantsEmail // <-- NUEVO: Enviamos la preferencia al backend
        })
      });
      setIsSettingsOpen(false);
      fetchData(undefined);
    } catch (e) { console.error("Error saving preferences", e); }
    setIsSavingPrefs(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30 pb-20">
      
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-emerald-400 to-blue-600 p-2 rounded-lg">
                <CloudLightning className="h-6 w-6 text-white" />
              </div>
              <span className="font-bold text-xl tracking-tight text-white">
                FinAI<span className="text-emerald-400">.Agent</span>
              </span>
            </div>
            
            <div className="flex items-center space-x-4">
               <div className="relative hidden sm:block">
                 <select 
                    value={`${selectedMonth}-${selectedYear}`} 
                    onChange={handleMonthChange} 
                    className="appearance-none bg-slate-900 border border-slate-700 text-white py-1 px-3 pr-8 rounded-lg text-sm focus:outline-none focus:border-indigo-500 cursor-pointer"
                 >
                    {getMonthOptions().map((opt) => (
                        <option key={`${opt.month}-${opt.year}`} value={`${opt.month}-${opt.year}`}>
                            {opt.label}
                        </option>
                    ))}
                 </select>
                 <Calendar className="absolute right-2 top-1.5 h-4 w-4 text-slate-500 pointer-events-none"/>
               </div>
               
               <span className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-2 ${isSyncing ? 'bg-amber-900/30 text-amber-400 border-amber-500/30 animate-pulse' : 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30'}`}>
                 <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'System Online'}</span> <Wifi className="h-3 w-3"/>
              </span>
              
              <button 
                onClick={openSettings} 
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 p-2 rounded-lg transition-colors" 
                title="Settings"
              >
                <Settings size={16} />
              </button>

              <button 
                onClick={signOut} 
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 p-2 rounded-lg transition-colors" 
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </div>
            
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">

        {/* Settings Modal */}
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Preferences</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-400 block mb-1">Display Name</label>
                  <input 
                    type="text" 
                    value={prefName} 
                    onChange={(e) => setPrefName(e.target.value)} 
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-400 block mb-1">Daily Savings Goal (€)</label>
                  <input 
                    type="number" 
                    min="0"
                    step="1"
                    value={prefSavingsGoal} 
                    onChange={(e) => setPrefSavingsGoal(e.target.value)} 
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">To keep your streak alive, you must save this amount daily.</p>
                </div>
                <div>
                  <label className="text-sm text-slate-400 block mb-1">AI Tone</label>
                  <select 
                    value={prefTone} 
                    onChange={(e) => setPrefTone(e.target.value)} 
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="brutal">Brutal</option>
                    <option value="supportive">Supportive</option>
                    <option value="professional">Professional</option>
                    <option value="polite">Polite</option>
                  </select>
                </div>
                
                {/* NUEVO UI: Checkbox de Opt-Out para FinOps */}
                <div className="flex items-center mt-4 border-t border-slate-800 pt-4">
                  <input
                    type="checkbox"
                    id="wantsEmail"
                    checked={prefWantsEmail}
                    onChange={(e) => setPrefWantsEmail(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer"
                  />
                  <label htmlFor="wantsEmail" className="ml-3 block text-sm text-slate-300 cursor-pointer">
                    Receive Daily "Tough Love" Email
                  </label>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button 
                  onClick={() => setIsSettingsOpen(false)} 
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={savePreferences} 
                  disabled={isSavingPrefs}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded transition disabled:opacity-50"
                >
                  {isSavingPrefs ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Terminal Chat */}
        <section className="relative group">
           <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 to-blue-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
          <div className="relative bg-slate-900 ring-1 ring-slate-800 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center space-x-2 mb-4 border-b border-slate-800 pb-4">
              <Terminal className="h-5 w-5 text-emerald-500" />
              <span className="text-sm font-mono text-slate-400">console -- AWS Lambda Brain</span>
            </div>
            <div className="font-mono text-lg text-emerald-400 min-h-[40px] mb-4">
                {typedText}<span className="animate-pulse">_</span>
            </div>
            <form onSubmit={handleQuerySubmit} className="flex gap-2 border-t border-slate-800 pt-4">
                <div className="flex-1 relative">
                    <input 
                        type="text" 
                        value={userQuery} 
                        onChange={(e) => setUserQuery(e.target.value)} 
                        placeholder="Ask your agent (e.g., 'How much did I spend on food?')" 
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono" 
                        disabled={isQuerying} 
                    />
                </div>
                <button 
                    type="submit" 
                    disabled={isQuerying} 
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg transition flex items-center justify-center min-w-[50px]"
                >
                    {isQuerying ? <RefreshCw className="animate-spin h-4 w-4"/> : <Send className="h-4 w-4"/>}
                </button>
            </form>
          </div>
        </section>

        {/* Dashboard Grids */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
          
          {/* LEFT: Transactions */}
          <div className="md:col-span-5 flex flex-col">
            <div className="bg-slate-900 p-6 rounded-xl border border-blue-900/30 shadow-xl relative overflow-hidden h-full flex flex-col max-h-[700px]">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <RefreshCw className={`h-24 w-24 text-blue-400 ${isSyncing ? 'animate-spin' : ''}`}/>
              </div>
              <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold text-white flex items-center">
                    <Database className="mr-2 h-5 w-5 text-blue-400" /> Transactions
                  </h2>
                  <button 
                    onClick={() => fetchData(undefined, true)} 
                    disabled={isSyncing} 
                    className="flex items-center gap-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 py-1 px-3 rounded-lg border border-slate-700 transition"
                    title="Force Fetch from Bank"
                  >
                      <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} /> 
                      {isSyncing ? 'Syncing...' : 'Force Sync'}
                  </button>
              </div>
              <p className="text-xs text-slate-500 mb-6 uppercase tracking-wider -mt-4">
                {new Date(selectedYear, selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </p>
              
              <div className="flex-1 overflow-y-auto pr-2 pb-6 scrollbar-thin scrollbar-thumb-slate-700">
                {loading ? (
                  <div className="space-y-3 animate-pulse">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-[68px] bg-slate-800/60 rounded-lg border border-slate-700/30"></div>
                    ))}
                  </div>
                ) : transactions.length > 0 ? (
                  <div className="space-y-3">
                    {transactions.map((tx, idx) => {
                      const amount = parseFloat(tx.amount as string);
                      const isIncome = !(tx.description.toLowerCase().includes('deposit') || tx.description.toLowerCase().includes('payroll') || tx.description.toLowerCase().includes('refund') || amount < 0) ? false : true;
                      
                      return (
                          <div key={idx} className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/50 flex justify-between items-center hover:bg-slate-800 transition">
                            <div className="flex-1 min-w-0 mr-4">
                                <p className="text-sm font-medium text-slate-200 truncate">{tx.description}</p>
                                <p className="text-[10px] text-slate-500 uppercase tracking-wide">{tx.transaction_date}</p>
                            </div>
                            <span className={`font-mono font-bold text-sm whitespace-nowrap ${isIncome ? 'text-emerald-400' : 'text-white'}`}>
                                {isIncome ? '+' : ''}{Math.abs(amount).toFixed(2)}€
                            </span>
                          </div>
                      )
                    })}
                  </div>
                ) : (
                    <p className="text-slate-500 text-sm text-center mt-10">No transactions found.</p>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Stats */}
          <div className="md:col-span-7 flex flex-col gap-6">
            
            {/* STREAK CARD */}
            <div className="bg-slate-900 rounded-xl border border-orange-500/30 shadow-xl p-6 flex items-center justify-between">
              <div>
                <h3 className="text-[#94a3b8] text-xs uppercase tracking-wider font-bold mb-1">Savings Streak</h3>
                {loading ? (
                    <div className="h-10 w-24 bg-slate-800/60 rounded animate-pulse mt-2"></div>
                ) : (
                    <>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black text-white">{currentStreak}</span>
                            <span className="text-slate-400 text-sm font-medium ml-1">Days</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                            {currentStreak > 0 ? "Keep it up! The AI is watching." : "Streak broken. The AI is disappointed."}
                        </p>
                    </>
                )}
              </div>
              <div className={`p-4 rounded-full ${currentStreak > 0 ? 'bg-orange-500/20 text-orange-500' : 'bg-slate-800 text-slate-600'}`}>
                <Flame size={36} className={currentStreak > 0 ? 'animate-pulse' : ''} />
              </div>
            </div>

            {/* SCORE CARD */}
            <div className="bg-slate-900 p-6 rounded-xl border border-indigo-500/30 shadow-xl flex-shrink-0">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 pr-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Activity className="text-indigo-400" size={20}/> AI Financial Health
                        </h3>
                        {loading ? (
                            <div className="space-y-2 mt-3 animate-pulse">
                                <div className="h-4 w-3/4 bg-slate-800/60"></div>
                            </div>
                        ) : (
                            <div className="mt-3 space-y-1">
                                {scoreShortReasons.map((reason, idx) => (
                                    <p key={idx} className="text-xs text-slate-300 flex items-center gap-2">
                                        <CheckCircle2 size={12} className="text-emerald-500"/> {reason}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col items-end">
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                {loading ? (
                                    <div className="h-12 w-16 bg-slate-800/60 rounded animate-pulse"></div>
                                ) : (
                                    <>
                                        <span className="block text-5xl font-black text-white">{financialScore}</span>
                                        <span className={`text-xs uppercase font-bold tracking-wider ${financialScore > 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                            {financialScore > 80 ? 'Excellent' : 'Average'}
                                        </span>
                                    </>
                                )}
                            </div>
                            <div className="relative h-20 w-20">
                                <svg className="h-full w-full transform -rotate-90">
                                    <circle cx="40" cy="40" r="36" stroke="#1e293b" strokeWidth="8" fill="none" />
                                    <circle 
                                        cx="40" cy="40" r="36" 
                                        stroke={financialScore > 80 ? '#10b981' : '#f59e0b'} 
                                        strokeWidth="8" fill="none" 
                                        strokeDasharray="226" 
                                        strokeDashoffset={226 - (226 * financialScore) / 100} 
                                        className="transition-all duration-1000 ease-out"
                                    />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* AUDIT LOG DEBAJO DEL SCORE */}
                <div className="mt-4 pt-4 border-t border-slate-800">
                    <h4 className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1 uppercase tracking-wider">
                        <Search size={12} /> Audit Log
                    </h4>
                    <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-400 leading-relaxed font-mono">
                       {loading ? (
                           <div className="space-y-2 animate-pulse">
                               <div className="h-3 bg-slate-800/60 rounded w-full"></div>
                           </div>
                       ) : scoreAuditLog.length > 0 ? (
                           scoreAuditLog.map((logItem, idx) => {
                               let content = <>{logItem}</>;
                               if (logItem.startsWith("Base:")) {
                                   content = <><span className="text-indigo-400 font-bold">Base:</span>{logItem.substring(5)}</>;
                               } else if (logItem.startsWith("Savings Rate:")) {
                                   content = <><span className="text-emerald-400 font-bold">Savings Rate:</span>{logItem.substring(13)}</>;
                               } else if (logItem.startsWith("Penalty:")) {
                                   content = <><span className="text-red-400 font-bold">Penalty:</span>{logItem.substring(8)}</>;
                               }
                               return (
                                   <p key={idx} className="mb-1 border-b border-slate-800/50 pb-1 last:border-0 last:pb-0">
                                       {content}
                                   </p>
                               );
                           })
                       ) : (
                           <p>Waiting for analysis...</p>
                       )}
                    </div>
                </div>
            </div>

            {/* MONETIZACIÓN */}
            {financialOffers.length > 0 && !loading && (
              <div className="bg-slate-900 p-6 rounded-xl border border-violet-500/30 shadow-xl relative overflow-hidden flex-shrink-0">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Zap className="h-20 w-20 text-violet-400"/>
                  </div>
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-wider relative z-10">
                      <Target className="text-violet-400" size={16}/> Tailored For You
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                    {financialOffers.map((offer, idx) => {
                      const isEmerald = offer.color === 'emerald'; 
                      const isAmber = offer.color === 'amber';
                      const borderColor = isEmerald ? 'border-emerald-500/40' : isAmber ? 'border-amber-500/40' : 'border-indigo-500/40';
                      const titleColor = isEmerald ? 'text-emerald-400' : isAmber ? 'text-amber-400' : 'text-indigo-400';
                      const btnColor = isEmerald ? 'bg-emerald-600' : isAmber ? 'bg-amber-600' : 'bg-indigo-600';

                      return (
                        <div key={idx} className={`p-4 rounded-lg border ${borderColor} bg-slate-950/50 flex flex-col justify-between hover:bg-slate-800/80 transition`}>
                          <div>
                            <h4 className={`text-sm font-bold ${titleColor} mb-2`}>{offer.title}</h4>
                            <p className="text-[11px] text-slate-300 leading-relaxed mb-4">{offer.description}</p>
                          </div>
                          <button className={`${btnColor} text-white text-xs font-bold px-3 py-2 rounded flex items-center justify-center gap-2 w-full hover:opacity-80`}>
                              {offer.cta_text} <ExternalLink size={12}/>
                          </button>
                        </div>
                      )
                    })}
                  </div>
              </div>
            )}

            {/* FORECAST WIDGET */}
            <div className="bg-slate-900 p-6 rounded-xl border border-blue-900/30 shadow-xl relative overflow-hidden">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Target className="text-blue-400" size={18}/> Month-End Projection
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">Based on current daily velocity</p>
                    </div>
                    <div className="text-right">
                        {loading ? (
                            <div className="h-8 w-24 bg-slate-800/60 rounded animate-pulse"></div>
                        ) : (
                            <>
                                <span className="text-2xl font-bold text-white">{projectedSpend.toFixed(2)} €</span>
                                <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Forecast</span>
                            </>
                        )}
                    </div>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden mt-2 relative">
                    <div className="h-full bg-emerald-500 absolute left-0 top-0 z-10 transition-all duration-1000" style={{ width: `${Math.min((totalExpenses / (projectedSpend || 1)) * 100, 100)}%` }}></div>
                    <div className="h-full w-full bg-[linear-gradient(45deg,transparent_25%,rgba(59,130,246,0.2)_25%,rgba(59,130,246,0.2)_50%,transparent_50%,transparent_75%,rgba(59,130,246,0.2)_75%,rgba(59,130,246,0.2)_100%)] bg-[length:10px_10px]"></div>
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-mono">
                    <span>Current: {totalExpenses.toFixed(0)}€</span>
                    <span>Projected: {projectedSpend.toFixed(0)}€</span>
                </div>
            </div>

            {/* OVERVIEW CARD (PIE CHART) */}
            <div className="bg-slate-900 rounded-xl ring-1 ring-slate-800 p-6 shadow-2xl flex-grow flex flex-col">
              <div className="flex justify-between items-start mb-6 border-b border-slate-800 pb-4">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <PieIcon className="h-5 w-5 text-indigo-400" /> Overview
                    </h3>
                </div>
                <div className="flex gap-8 text-right">
                    <div>
                        <p className="text-[10px] text-emerald-500/80 uppercase tracking-widest font-bold flex items-center justify-end gap-1">
                            Income <TrendingUp size={12}/>
                        </p>
                        {loading ? (
                            <div className="h-7 w-20 bg-slate-800/60 rounded mt-1 animate-pulse"></div>
                        ) : (
                            <p className="text-xl font-bold text-emerald-400">+{totalIncome.toFixed(2)} €</p>
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold flex items-center justify-end gap-1">
                            Expenses <TrendingDown size={12}/>
                        </p>
                        {loading ? (
                            <div className="h-8 w-24 bg-slate-800/60 rounded mt-1 animate-pulse"></div>
                        ) : (
                            <p className="text-2xl font-bold text-white">{totalExpenses.toFixed(2)} €</p>
                        )}
                    </div>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-2 gap-4 items-center">
                <div className="h-full w-full relative min-h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie 
                                data={pieData} 
                                cx="50%" cy="50%" 
                                innerRadius={50} outerRadius={70} 
                                paddingAngle={5} 
                                dataKey="value" 
                                stroke="none"
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }} 
                                itemStyle={{ color: '#fff' }} 
                                formatter={(value: number) => `${value.toFixed(2)} €`} 
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-slate-500 text-[10px] uppercase">Outflow</span>
                        <span className="text-lg font-bold text-white">{totalExpenses.toFixed(0)}€</span>
                    </div>
                </div>

                <div className="space-y-2 h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                    {loading ? (
                        <div className="space-y-3 animate-pulse">
                            {[1, 2, 3].map(i => <div key={i} className="h-8 bg-slate-800/60 rounded"></div>)}
                        </div>
                    ) : pieData.length > 0 ? (
                        pieData.map((item, index) => {
                            const Icon = item.icon;
                            const percentage = totalExpenses > 0 ? ((item.value / totalExpenses) * 100).toFixed(1) : 0;
                            return (
                                <div key={index} className="flex items-center justify-between group p-1.5 hover:bg-slate-800/50 rounded-lg transition">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="p-1 rounded-md bg-slate-800 border border-slate-700 shrink-0" style={{ color: item.color }}>
                                            <Icon size={14} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium text-slate-200 truncate">{item.name}</p>
                                            <div className="w-12 h-1 bg-slate-800 rounded-full mt-1">
                                                <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: item.color }} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right pl-2 shrink-0">
                                        <p className="text-xs font-bold text-white">{item.value.toFixed(0)}€</p>
                                    </div>
                                </div>
                            )
                        })
                    ) : (
                        <div className="text-center text-slate-500 text-sm py-10">No expenses.</div>
                    )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

// ==========================================
// PANTALLA DIVIDIDA DE LOGIN (SPLIT SCREEN)
// ==========================================
const CustomAuthWrapper = () => {
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);

  if (authStatus === 'authenticated') return <Dashboard />;

  return (
    <div className="flex min-h-screen bg-slate-950 font-sans">
      {/* Mitad Izquierda: Branding de Producto */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 border-r border-slate-800 relative overflow-hidden flex-col justify-center items-center p-12 text-center shadow-2xl">
         <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 to-blue-900/40"></div>
         <CloudLightning className="h-24 w-24 text-emerald-400 mb-6 relative z-10 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
         <h1 className="text-5xl font-black text-white mb-6 relative z-10 tracking-tight drop-shadow-lg">
           FinAI<span className="text-emerald-400">.Agent</span>
         </h1>
         <p className="text-slate-300 text-lg max-w-md relative z-10 leading-relaxed border-t border-slate-700 pt-6">
           Your personal AI-powered financial advisor. <br/> 
           <span className="font-bold text-white">Unfiltered, ruthless, and optimized to build your wealth.</span>
         </p>
      </div>

      {/* Mitad Derecha: Formulario de Cognito */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-12 bg-slate-950 relative">
         <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 pointer-events-none"></div>
         <div className="w-full relative z-10 bg-slate-900/50 p-8 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-sm">
           <div className="lg:hidden flex items-center justify-center space-x-2 mb-8">
              <CloudLightning className="h-8 w-8 text-emerald-400" />
              <span className="font-bold text-2xl text-white">FinAI<span className="text-emerald-400">.Agent</span></span>
           </div>
           <Authenticator hideSignUp={false} />
         </div>
      </div>
    </div>
  );
};

// ==========================================
// PUNTO DE ENTRADA DE LA APP
// ==========================================
const App = () => (
  <Authenticator.Provider>
    <CustomAuthWrapper />
  </Authenticator.Provider>
);

export default App;
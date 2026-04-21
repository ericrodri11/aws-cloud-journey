import React, { useState, useEffect } from 'react';
// --- AWS AMPLIFY ---
import { Amplify } from 'aws-amplify';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession, signIn, signUp, confirmSignUp, resetPassword, confirmResetPassword } from 'aws-amplify/auth';
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
  shop: '#ec4899', tech: '#8b5cf6', leisure: '#4ade80', financial: '#ef4444',
  general: '#94a3b8'
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
  const [prefWantsEmail, setPrefWantsEmail] = useState(true);
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

        let url = API_URL;
        const params = new URLSearchParams();
        if (query) params.append('query', query);
        if (forceSync) params.append('sync', 'true');
        
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        
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
    
    const uniqueTxMap = new Map();

    const filteredTxs = allTransactions.filter((tx: any) => {
        const rawDate = (tx.transaction_date || '').split('#')[0];
        const txDate = new Date(rawDate);
        return txDate.getMonth() === selectedMonth && txDate.getFullYear() === selectedYear;
    }).filter((tx: any) => {
        const rawDate = (tx.transaction_date || '').split('#')[0];
        const uniqueKey = `${rawDate}_${tx.description}_${tx.amount}`;
        
        if (uniqueTxMap.has(uniqueKey)) {
            return false;
        }
        uniqueTxMap.set(uniqueKey, true);
        return true;
    }).sort((a: any, b: any) => {
        const aDate = (a.transaction_date || '').split('#')[0];
        const bDate = (b.transaction_date || '').split('#')[0];
        return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
    
    setTransactions(filteredTxs);

    const categoryMap: Record<string, number> = {};
    let calcIncome = 0; 
    let calcExpenses = 0;

    filteredTxs.forEach((tx: any) => {
        const amount = parseFloat(tx.amount); 
        const desc = tx.description.toLowerCase();
        const absAmount = Math.abs(amount);

        const isIncomeKeyword = desc.includes('deposit') || desc.includes('payroll') || desc.includes('refund') || desc.includes('gusto') || desc.includes('united airlines') || amount < 0;
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
          wants_daily_email: prefWantsEmail
        })
      });
      setIsSettingsOpen(false);
      fetchData(undefined);
    } catch (e) { console.error("Error saving preferences", e); }
    setIsSavingPrefs(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans selection:bg-green-200 pb-20" style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}>
      
      {/* ── ANNOUNCEMENT BAR ── */}
      <div className="bg-gray-950 text-center py-2 px-4">
        <p className="text-xs text-gray-400 font-medium">
          🔥 Your AI agent syncs automatically every session —{' '}
          <span className="text-green-400 font-semibold">real-time financial intelligence</span>
        </p>
      </div>

      {/* ── TOP NAV — StartGround style ── */}
      <header className="border-b border-gray-100 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-[60px] items-center gap-6">

            {/* Logo + nav links */}
            <div className="flex items-center gap-8 shrink-0">
              <span className="font-black text-[1.2rem] text-gray-900 select-none" style={{ letterSpacing: '-0.03em' }}>
                FinAI<span className="text-green-500">.Agent</span>
              </span>

              <nav className="hidden md:flex items-center gap-1">
                {([
                  { label: 'Dashboard', active: true },
                  { label: 'Transactions', active: false },
                  { label: 'Insights', active: false },
                ] as { label: string; active: boolean }[]).map((item) => (
                  <span
                    key={item.label}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium cursor-default transition select-none ${
                      item.active
                        ? 'bg-green-50 text-green-700'
                        : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {item.label}
                  </span>
                ))}
              </nav>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2">

              {/* Month picker */}
              <div className="relative hidden sm:block">
                <select
                  value={`${selectedMonth}-${selectedYear}`}
                  onChange={handleMonthChange}
                  className="appearance-none bg-gray-50 border border-gray-200 text-gray-600 py-1.5 pl-3 pr-7 rounded-lg text-xs font-semibold focus:outline-none focus:border-green-400 cursor-pointer hover:border-gray-300 transition"
                >
                  {getMonthOptions().map((opt) => (
                    <option key={`${opt.month}-${opt.year}`} value={`${opt.month}-${opt.year}`}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <Calendar className="absolute right-2 top-2 h-3 w-3 text-gray-400 pointer-events-none" />
              </div>

              {/* Live status pill */}
              <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${
                isSyncing ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-green-50 text-green-700 border-green-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`}></span>
                {isSyncing ? 'Syncing' : 'Live'}
              </div>

              {/* Divider */}
              <div className="hidden sm:block w-px h-4 bg-gray-200 mx-0.5"></div>

              {/* Settings */}
              <button
                onClick={openSettings}
                title="Settings"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition"
              >
                <Settings size={14} />
                <span className="hidden sm:inline">Settings</span>
              </button>

              {/* Sign out */}
              <button
                onClick={signOut}
                title="Sign Out"
                className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
              >
                <LogOut size={13} />
                <span className="hidden sm:inline">Sign Out</span>
              </button>

            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Settings Modal */}
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-gray-900">Preferences</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Display Name</label>
                  <input 
                    type="text" 
                    value={prefName} 
                    onChange={(e) => setPrefName(e.target.value)} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-green-400 transition"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Daily Savings Goal (€)</label>
                  <input 
                    type="number" 
                    min="0"
                    step="1"
                    value={prefSavingsGoal} 
                    onChange={(e) => setPrefSavingsGoal(e.target.value)} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-green-400 transition"
                  />
                  <p className="text-xs text-gray-400 mt-1">To keep your streak alive, save this amount daily.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">AI Tone</label>
                  <select 
                    value={prefTone} 
                    onChange={(e) => setPrefTone(e.target.value)} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-green-400 transition"
                  >
                    <option value="brutal">Brutal</option>
                    <option value="supportive">Supportive</option>
                    <option value="professional">Professional</option>
                    <option value="polite">Polite</option>
                  </select>
                </div>
                
                <div className="flex items-center mt-4 border-t border-gray-100 pt-4">
                  <input
                    type="checkbox"
                    id="wantsEmail"
                    checked={prefWantsEmail}
                    onChange={(e) => setPrefWantsEmail(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-green-500 focus:ring-green-400 cursor-pointer"
                  />
                  <label htmlFor="wantsEmail" className="ml-3 block text-sm text-gray-700 cursor-pointer">
                    Receive Daily "Tough Love" Email
                  </label>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button 
                  onClick={() => setIsSettingsOpen(false)} 
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-lg transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={savePreferences} 
                  disabled={isSavingPrefs}
                  className="flex-1 bg-green-500 hover:bg-green-400 text-white text-sm font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
                >
                  {isSavingPrefs ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* AI Terminal Chat */}
        <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-4 border-b border-gray-100 pb-4">
            <div className="w-2 h-2 rounded-full bg-green-400"></div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">AI Agent Console</span>
          </div>
          <div className="font-mono text-sm text-green-600 min-h-[36px] mb-4 bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
              {typedText}<span className="animate-pulse text-green-400">_</span>
          </div>
          <form onSubmit={handleQuerySubmit} className="flex gap-2">
              <div className="flex-1 relative">
                  <input 
                      type="text" 
                      value={userQuery} 
                      onChange={(e) => setUserQuery(e.target.value)} 
                      placeholder="Ask your agent (e.g., 'How much did I spend on food?')" 
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-green-400 transition" 
                      disabled={isQuerying} 
                  />
              </div>
              <button 
                  type="submit" 
                  disabled={isQuerying} 
                  className="bg-green-500 hover:bg-green-400 text-white px-5 py-2.5 rounded-lg transition flex items-center justify-center min-w-[50px] font-semibold text-sm"
              >
                  {isQuerying ? <RefreshCw className="animate-spin h-4 w-4"/> : <Send className="h-4 w-4"/>}
              </button>
          </form>
        </section>

        {/* Dashboard Grids */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
          
          {/* LEFT: Transactions & Velocity Analysis */}
          <div className="md:col-span-5 flex flex-col gap-5">
            
            {/* Transactions List */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex-1 flex flex-col max-h-[700px]">
              <div className="flex justify-between items-center mb-1">
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <Database className="h-4 w-4 text-green-500" /> Transactions
                  </h2>
              </div>
              <p className="text-xs text-gray-400 mb-5 font-medium">
                {new Date(selectedYear, selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </p>
              
              <div className="flex-1 overflow-y-auto pr-1 pb-2 space-y-2">
                {loading ? (
                  <div className="space-y-2 animate-pulse">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-[60px] bg-gray-100 rounded-xl"></div>
                    ))}
                  </div>
                ) : transactions.length > 0 ? (
                  transactions.map((tx, idx) => {
                    const amount = parseFloat(tx.amount as string);
                    const descLower = tx.description.toLowerCase();
                    const isIncome = descLower.includes('deposit') || descLower.includes('payroll') || descLower.includes('refund') || descLower.includes('gusto') || descLower.includes('united airlines') || amount < 0;
                    
                    return (
                        <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center hover:bg-green-50 hover:border-green-200 transition group cursor-default">
                          <div className="flex-1 min-w-0 mr-3">
                              <p className="text-sm font-medium text-gray-800 truncate">{tx.description}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{(tx.transaction_date || '').split('#')[0]}</p>
                          </div>
                          <span className={`font-mono font-bold text-sm whitespace-nowrap ${isIncome ? 'text-green-600' : 'text-gray-800'}`}>
                              {isIncome ? '+' : ''}{Math.abs(amount).toFixed(2)}€
                          </span>
                        </div>
                    )
                  })
                ) : (
                    <p className="text-gray-400 text-sm text-center mt-10">No transactions found.</p>
                )}
              </div>
            </div>

            {/* Velocity Analysis */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex-shrink-0">
              <h3 className="text-xs font-bold text-gray-500 mb-4 flex items-center gap-2 uppercase tracking-wider">
                <TrendingDown className="text-green-500" size={14}/> Velocity Analysis
              </h3>
              
              {(() => {
                const today = new Date();
                const isCurrentMonth = selectedMonth === today.getMonth() && selectedYear === today.getFullYear();
                const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
                const daysPassed = isCurrentMonth ? Math.max(1, today.getDate()) : daysInMonth;
                
                const burnRate = totalExpenses / daysPassed;
                const recommendedBurn = totalIncome > 0 ? (totalIncome - (parseFloat(prefSavingsGoal) * daysInMonth)) / daysInMonth : 0;
                const isBurningFast = burnRate > recommendedBurn && recommendedBurn > 0;

                return (
                  <div className="space-y-4">
                    <div className="flex justify-between items-end border-b border-gray-100 pb-4">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Daily Burn Rate</p>
                        <p className="text-2xl font-black text-gray-900" style={{ letterSpacing: '-0.02em' }}>{burnRate.toFixed(2)} <span className="text-sm font-medium text-gray-400">€/day</span></p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Safe Limit</p>
                        <p className={`text-base font-bold ${isBurningFast ? 'text-red-500' : 'text-green-500'}`}>
                          {recommendedBurn > 0 ? `${recommendedBurn.toFixed(2)} €` : 'N/A'}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {isBurningFast 
                        ? `⚠️ You are spending ${Math.abs(burnRate - recommendedBurn).toFixed(2)}€/day above your safe limit to hit your savings goal.` 
                        : `✅ Your daily spending is optimal. Keep expenses under ${recommendedBurn.toFixed(2)}€ a day to reach your goals.`}
                    </p>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* RIGHT: Stats */}
          <div className="md:col-span-7 flex flex-col gap-5">
            
            {/* STREAK CARD */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 flex items-center justify-between">
              <div>
                <h3 className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Savings Streak</h3>
                {loading ? (
                    <div className="h-10 w-24 bg-gray-100 rounded-lg animate-pulse mt-2"></div>
                ) : (
                    <>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black text-gray-900" style={{ letterSpacing: '-0.03em' }}>{currentStreak}</span>
                            <span className="text-gray-400 text-sm font-medium">Days</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            {currentStreak > 0 ? "Keep it up! The AI is watching." : "Streak broken. The AI is disappointed."}
                        </p>
                    </>
                )}
              </div>
              <div className={`p-4 rounded-2xl ${currentStreak > 0 ? 'bg-orange-50' : 'bg-gray-100'}`}>
                <Flame size={32} className={currentStreak > 0 ? 'text-orange-400' : 'text-gray-300'} />
              </div>
            </div>

            {/* SCORE CARD */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 flex-shrink-0">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 pr-6">
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <Activity className="text-green-500" size={18}/> AI Financial Health
                        </h3>
                        {loading ? (
                            <div className="space-y-2 mt-3 animate-pulse">
                                <div className="h-4 w-3/4 bg-gray-100 rounded"></div>
                            </div>
                        ) : (
                            <div className="mt-3 space-y-1.5">
                                {scoreShortReasons.map((reason, idx) => (
                                    <p key={idx} className="text-xs text-gray-600 flex items-center gap-2">
                                        <CheckCircle2 size={12} className="text-green-500 shrink-0"/> {reason}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col items-end">
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                {loading ? (
                                    <div className="h-12 w-16 bg-gray-100 rounded animate-pulse"></div>
                                ) : (
                                    <>
                                        <span className="block text-5xl font-black text-gray-900" style={{ letterSpacing: '-0.04em' }}>{financialScore}</span>
                                        <span className={`text-xs uppercase font-bold tracking-wider ${financialScore > 80 ? 'text-green-500' : 'text-amber-500'}`}>
                                            {financialScore > 80 ? 'Excellent' : 'Average'}
                                        </span>
                                    </>
                                )}
                            </div>
                            <div className="relative h-20 w-20">
                                <svg className="h-full w-full transform -rotate-90">
                                    <circle cx="40" cy="40" r="36" stroke="#f3f4f6" strokeWidth="8" fill="none" />
                                    <circle 
                                        cx="40" cy="40" r="36" 
                                        stroke={financialScore > 80 ? '#4ade80' : '#fbbf24'} 
                                        strokeWidth="8" fill="none" 
                                        strokeDasharray="226" 
                                        strokeDashoffset={226 - (226 * financialScore) / 100} 
                                        className="transition-all duration-1000 ease-out"
                                        strokeLinecap="round"
                                    />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* AUDIT LOG */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <h4 className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1 uppercase tracking-wider">
                        <Search size={12} /> Audit Log
                    </h4>
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-[11px] text-gray-500 leading-relaxed font-mono">
                       {loading ? (
                           <div className="space-y-2 animate-pulse">
                               <div className="h-3 bg-gray-200 rounded w-full"></div>
                           </div>
                       ) : scoreAuditLog.length > 0 ? (
                           scoreAuditLog.map((logItem, idx) => {
                               let content = <>{logItem}</>;
                               if (logItem.startsWith("Base:")) {
                                   content = <><span className="text-blue-500 font-bold">Base:</span>{logItem.substring(5)}</>;
                               } else if (logItem.startsWith("Savings Rate:")) {
                                   content = <><span className="text-green-600 font-bold">Savings Rate:</span>{logItem.substring(13)}</>;
                               } else if (logItem.startsWith("Penalty:")) {
                                   content = <><span className="text-red-500 font-bold">Penalty:</span>{logItem.substring(8)}</>;
                               }
                               return (
                                   <p key={idx} className="mb-1 border-b border-gray-100 pb-1 last:border-0 last:pb-0">
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
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 flex-shrink-0">
                  <h3 className="text-xs font-bold text-gray-500 mb-4 flex items-center gap-2 uppercase tracking-wider">
                      <Target className="text-green-500" size={14}/> Tailored For You
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {financialOffers.map((offer, idx) => {
                      const isEmerald = offer.color === 'emerald'; 
                      const isAmber = offer.color === 'amber';

                      return (
                        <div key={idx} className="p-4 rounded-xl border border-gray-200 bg-gray-50 flex flex-col justify-between hover:border-green-300 hover:bg-green-50 transition group">
                          <div>
                            <h4 className="text-sm font-bold text-gray-900 mb-1.5">{offer.title}</h4>
                            <p className="text-xs text-gray-500 leading-relaxed mb-4">{offer.description}</p>
                          </div>
                          <button className="bg-green-500 hover:bg-green-400 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center justify-center gap-2 w-full transition">
                              {offer.cta_text} <ExternalLink size={11}/>
                          </button>
                        </div>
                      )
                    })}
                  </div>
              </div>
            )}

            {/* FORECAST WIDGET */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                <div className="flex justify-between items-end mb-3">
                    <div>
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <Target className="text-blue-500" size={16}/> Month-End Projection
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">Based on current daily velocity</p>
                    </div>
                    <div className="text-right">
                        {loading ? (
                            <div className="h-8 w-24 bg-gray-100 rounded animate-pulse"></div>
                        ) : (
                            <>
                                <span className="text-2xl font-black text-gray-900" style={{ letterSpacing: '-0.02em' }}>{projectedSpend.toFixed(2)} €</span>
                                <span className="text-xs text-gray-400 block uppercase tracking-wider">Forecast</span>
                            </>
                        )}
                    </div>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-2 relative">
                    <div 
                      className="h-full bg-green-400 absolute left-0 top-0 z-10 transition-all duration-1000 rounded-full" 
                      style={{ width: `${Math.min((totalExpenses / (projectedSpend || 1)) * 100, 100)}%` }}
                    ></div>
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-400 font-mono">
                    <span>Current: {totalExpenses.toFixed(0)}€</span>
                    <span>Projected: {projectedSpend.toFixed(0)}€</span>
                </div>
            </div>

            {/* OVERVIEW CARD (PIE CHART) */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 flex-grow flex flex-col">
              <div className="flex justify-between items-start mb-5 border-b border-gray-100 pb-4">
                <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <PieIcon className="h-4 w-4 text-green-500" /> Spending Overview
                    </h3>
                </div>
                <div className="flex gap-8 text-right">
                    <div>
                        <p className="text-[10px] text-green-600 uppercase tracking-widest font-bold flex items-center justify-end gap-1">
                            Income <TrendingUp size={10}/>
                        </p>
                        {loading ? (
                            <div className="h-6 w-20 bg-gray-100 rounded mt-1 animate-pulse"></div>
                        ) : (
                            <p className="text-lg font-black text-green-600" style={{ letterSpacing: '-0.02em' }}>+{totalIncome.toFixed(2)} €</p>
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold flex items-center justify-end gap-1">
                            Expenses <TrendingDown size={10}/>
                        </p>
                        {loading ? (
                            <div className="h-7 w-24 bg-gray-100 rounded mt-1 animate-pulse"></div>
                        ) : (
                            <p className="text-xl font-black text-gray-900" style={{ letterSpacing: '-0.02em' }}>{totalExpenses.toFixed(2)} €</p>
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
                                paddingAngle={4} 
                                dataKey="value" 
                                stroke="none"
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} 
                                itemStyle={{ color: '#374151' }} 
                                formatter={(value: number) => `${value.toFixed(2)} €`} 
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider">Total</span>
                        <span className="text-lg font-black text-gray-900">{totalExpenses.toFixed(0)}€</span>
                    </div>
                </div>

                <div className="space-y-1.5 h-[150px] overflow-y-auto pr-1">
                    {loading ? (
                        <div className="space-y-2 animate-pulse">
                            {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-100 rounded-lg"></div>)}
                        </div>
                    ) : pieData.length > 0 ? (
                        pieData.map((item, index) => {
                            const Icon = item.icon;
                            const percentage = totalExpenses > 0 ? ((item.value / totalExpenses) * 100).toFixed(1) : 0;
                            return (
                                <div key={index} className="flex items-center justify-between group p-1.5 hover:bg-gray-50 rounded-lg transition">
                                    <div className="flex items-center gap-2.5 overflow-hidden">
                                        <div className="p-1 rounded-lg bg-gray-100 shrink-0" style={{ color: item.color }}>
                                            <Icon size={12} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium text-gray-700 truncate">{item.name}</p>
                                            <div className="w-10 h-1 bg-gray-200 rounded-full mt-1">
                                                <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: item.color }} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right pl-2 shrink-0">
                                        <p className="text-xs font-bold text-gray-800">{item.value.toFixed(0)}€</p>
                                    </div>
                                </div>
                            )
                        })
                    ) : (
                        <div className="text-center text-gray-400 text-sm py-10">No expenses.</div>
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
// CUSTOM AUTH FORM — StartGround Style
// ==========================================
type AuthView = 'signIn' | 'signUp' | 'confirmSignUp' | 'forgotPassword' | 'confirmReset';

const CustomLoginForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const [view, setView] = useState<AuthView>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const clearMessages = () => { setError(''); setInfo(''); };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault(); clearMessages(); setLoading(true);
    try {
      const result = await signIn({ username: email, password });
      if (result.isSignedIn) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally { setLoading(false); }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); clearMessages();
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await signUp({ username: email, password, options: { userAttributes: { email } } });
      setInfo('Check your email for a confirmation code.');
      setView('confirmSignUp');
    } catch (err: any) {
      setError(err.message || 'Sign up failed.');
    } finally { setLoading(false); }
  };

  const handleConfirmSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); clearMessages(); setLoading(true);
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      setInfo('Account confirmed! You can now sign in.');
      setView('signIn');
    } catch (err: any) {
      setError(err.message || 'Confirmation failed.');
    } finally { setLoading(false); }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault(); clearMessages(); setLoading(true);
    try {
      await resetPassword({ username: email });
      setInfo('Reset code sent to your email.');
      setView('confirmReset');
    } catch (err: any) {
      setError(err.message || 'Could not send reset code.');
    } finally { setLoading(false); }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault(); clearMessages(); setLoading(true);
    try {
      await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
      setInfo('Password updated. Sign in now.');
      setView('signIn');
    } catch (err: any) {
      setError(err.message || 'Reset failed.');
    } finally { setLoading(false); }
  };

  const inputClass = "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-400 focus:bg-white transition-all duration-150";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider";
  const btnPrimary = "w-full bg-green-500 hover:bg-green-400 active:bg-green-600 text-white text-sm font-bold py-3 rounded-xl transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-60";
  const btnGhost = "text-sm text-green-600 hover:text-green-500 font-semibold transition underline-offset-2 hover:underline";

  const titles: Record<AuthView, { heading: string; sub: string }> = {
    signIn:       { heading: 'Welcome back',      sub: 'Sign in to your financial dashboard' },
    signUp:       { heading: 'Create account',    sub: 'Start growing your wealth today' },
    confirmSignUp:{ heading: 'Check your email',  sub: `We sent a code to ${email || 'you'}` },
    forgotPassword:{ heading: 'Reset password',   sub: 'Enter your email to get a reset code' },
    confirmReset: { heading: 'New password',      sub: `Enter the code sent to ${email || 'you'}` },
  };

  return (
    <div className="w-full space-y-5">
      {/* Heading */}
      <div>
        <h2 className="text-2xl font-black text-gray-900 leading-tight" style={{ letterSpacing: '-0.03em' }}>
          {titles[view].heading}
        </h2>
        <p className="text-sm text-gray-400 mt-1">{titles[view].sub}</p>
      </div>

      {/* Tab toggle for signIn / signUp */}
      {(view === 'signIn' || view === 'signUp') && (
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {(['signIn', 'signUp'] as AuthView[]).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); clearMessages(); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {v === 'signIn' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>
      )}

      {/* Error / Info banners */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-3 rounded-xl flex items-start gap-2">
          <span className="mt-0.5">⚠</span> {error}
        </div>
      )}
      {info && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs font-medium px-4 py-3 rounded-xl flex items-start gap-2">
          <span className="mt-0.5">✓</span> {info}
        </div>
      )}

      {/* SIGN IN */}
      {view === 'signIn' && (
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className={inputClass + ' pr-12'} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition text-xs font-semibold select-none">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="text-right -mt-2">
            <button type="button" onClick={() => { setView('forgotPassword'); clearMessages(); }} className={btnGhost}>
              Forgot password?
            </button>
          </div>
          <button type="submit" disabled={loading} className={btnPrimary}>
            {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> Signing in...</> : 'Sign In →'}
          </button>
        </form>
      )}

      {/* SIGN UP */}
      {view === 'signUp' && (
        <form onSubmit={handleSignUp} className="space-y-4">
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} required placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} className={inputClass + ' pr-12'} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition text-xs font-semibold select-none">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div>
            <label className={labelClass}>Confirm Password</label>
            <input type={showPassword ? 'text' : 'password'} required placeholder="Repeat your password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
          </div>
          <button type="submit" disabled={loading} className={btnPrimary}>
            {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> Creating account...</> : 'Create Account →'}
          </button>
        </form>
      )}

      {/* CONFIRM SIGN UP */}
      {view === 'confirmSignUp' && (
        <form onSubmit={handleConfirmSignUp} className="space-y-4">
          <div>
            <label className={labelClass}>Confirmation Code</label>
            <input type="text" required placeholder="Enter 6-digit code" value={code} onChange={e => setCode(e.target.value)} className={inputClass} maxLength={6} />
          </div>
          <button type="submit" disabled={loading} className={btnPrimary}>
            {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> Confirming...</> : 'Confirm Account →'}
          </button>
          <div className="text-center">
            <button type="button" onClick={() => { setView('signIn'); clearMessages(); }} className={btnGhost}>← Back to Sign In</button>
          </div>
        </form>
      )}

      {/* FORGOT PASSWORD */}
      {view === 'forgotPassword' && (
        <form onSubmit={handleForgotPassword} className="space-y-4">
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
          </div>
          <button type="submit" disabled={loading} className={btnPrimary}>
            {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> Sending code...</> : 'Send Reset Code →'}
          </button>
          <div className="text-center">
            <button type="button" onClick={() => { setView('signIn'); clearMessages(); }} className={btnGhost}>← Back to Sign In</button>
          </div>
        </form>
      )}

      {/* CONFIRM RESET */}
      {view === 'confirmReset' && (
        <form onSubmit={handleConfirmReset} className="space-y-4">
          <div>
            <label className={labelClass}>Reset Code</label>
            <input type="text" required placeholder="Enter code from email" value={code} onChange={e => setCode(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>New Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} required placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass + ' pr-12'} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition text-xs font-semibold select-none">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className={btnPrimary}>
            {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> Updating...</> : 'Set New Password →'}
          </button>
          <div className="text-center">
            <button type="button" onClick={() => { setView('signIn'); clearMessages(); }} className={btnGhost}>← Back to Sign In</button>
          </div>
        </form>
      )}
    </div>
  );
};

// ==========================================
// PANTALLA DE LOGIN — StartGround Style
// ==========================================
const CustomAuthWrapper = () => {
  const { authStatus, user } = useAuthenticator((context) => [context.authStatus, context.user]);

  if (authStatus === 'authenticated') return <Dashboard />;

  // force re-check after our custom sign-in
  const handleSuccess = () => window.location.reload();

  return (
    <div className="flex min-h-screen font-sans" style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}>

      {/* ── LEFT: Branding panel ── */}
      <div className="hidden lg:flex w-[55%] bg-gray-950 relative overflow-hidden flex-col justify-between p-16">

        {/* Subtle grid texture */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }}></div>

        {/* Floating green glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full" style={{
          background: 'radial-gradient(circle, rgba(74,222,128,0.10) 0%, transparent 70%)'
        }}></div>

        {/* Logo top-left */}
        <div className="relative z-10">
          <span className="font-black text-2xl text-white" style={{ letterSpacing: '-0.03em' }}>
            FinAI<span className="text-green-400">.Agent</span>
          </span>
        </div>

        {/* Center illustration + copy */}
        <div className="relative z-10 max-w-md">

          {/* Illustrated card mock */}
          <div className="mb-10 relative">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 w-72 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Financial Score</span>
                <span className="bg-green-500/10 text-green-400 text-xs font-bold px-2 py-0.5 rounded-full border border-green-500/20">↑ 12%</span>
              </div>
              <div className="text-5xl font-black text-white mb-1" style={{ letterSpacing: '-0.05em' }}>87</div>
              <div className="text-xs text-green-400 font-semibold mb-4">Excellent</div>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-green-400 rounded-full" style={{ width: '87%' }}></div>
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 mt-1.5">
                <span>0</span><span>100</span>
              </div>
            </div>
            {/* Floating spend badge */}
            <div className="absolute -right-4 top-4 bg-white rounded-xl px-3 py-2 shadow-lg border border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Monthly</p>
              <p className="text-base font-black text-gray-900" style={{ letterSpacing: '-0.02em' }}>€1,240</p>
            </div>
            {/* Floating streak badge */}
            <div className="absolute -left-3 -bottom-3 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 shadow-lg flex items-center gap-2">
              <span className="text-orange-400 text-base">🔥</span>
              <div>
                <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Streak</p>
                <p className="text-sm font-black text-gray-900">14 days</p>
              </div>
            </div>
          </div>

          <h1 className="text-4xl font-black text-white leading-tight mb-4" style={{ letterSpacing: '-0.04em' }}>
            Your money,<br/>
            <span className="text-green-400">ruthlessly</span> optimized.
          </h1>
          <p className="text-gray-400 text-base leading-relaxed">
            AI-powered financial analysis that tells you the truth about your spending — and helps you do something about it.
          </p>

          {/* Social proof row */}
          <div className="flex items-center gap-4 mt-8 pt-8 border-t border-gray-800">
            <div className="flex -space-x-2">
              {['#4ade80','#60a5fa','#f472b6','#facc15'].map((c,i) => (
                <div key={i} className="w-7 h-7 rounded-full border-2 border-gray-950 flex items-center justify-center text-xs font-bold text-white" style={{ background: c }}>
                  {['A','B','C','D'][i]}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">Joined by <span className="text-gray-300 font-semibold">2,400+ users</span> tracking their finances</p>
          </div>
        </div>

        {/* Bottom tagline */}
        <div className="relative z-10">
          <p className="text-xs text-gray-600 font-medium">Powered by AWS · Secured by Cognito</p>
        </div>
      </div>

      {/* ── RIGHT: Auth form ── */}
      <div className="w-full lg:w-[45%] flex items-center justify-center bg-white px-8 py-12">
        <div className="w-full max-w-[380px]">

          {/* Mobile logo */}
          <div className="lg:hidden mb-10 text-center">
            <span className="font-black text-2xl text-gray-900" style={{ letterSpacing: '-0.03em' }}>
              FinAI<span className="text-green-500">.Agent</span>
            </span>
          </div>

          <CustomLoginForm onSuccess={handleSuccess} />

          {/* Footer */}
          <p className="text-xs text-gray-300 text-center mt-8">
            By signing in you agree to our Terms & Privacy Policy.
          </p>
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
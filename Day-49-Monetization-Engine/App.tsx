import React, { useState, useEffect } from 'react';
import { 
  Terminal, CloudLightning, Database, Wifi, RefreshCw, PieChart as PieIcon, 
  Plane, Utensils, ShoppingBag, Car, Home, Coffee, 
  Dumbbell, Landmark, MonitorPlay, Calendar, TrendingUp, TrendingDown,
  Cpu, CreditCard, Activity, CheckCircle2, Search, Target, Send, Flame, ExternalLink, Zap
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer
} from 'recharts';

// --- CONFIGURACIÓN ---
const API_URL = "https://vdwaba4uy35hpeohz77buz6p640yvslf.lambda-url.eu-north-1.on.aws/"; 
const CACHE_KEY = "finai_dashboard_data"; // Clave para LocalStorage

// --- COLORES ---
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

// 🚀 NUEVA INTERFAZ PARA MONETIZACIÓN
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
  const start = new Date(2025, 11); // 11 = Diciembre (es base 0)
  const end = new Date(); // Fecha actual
  let current = new Date(start);
  while (current <= end) {
    options.push({
      month: current.getMonth(),
      year: current.getFullYear(),
      label: current.toLocaleString('default', { month: 'long', year: 'numeric' })
    });
    current.setMonth(current.getMonth() + 1);
  }
  return options.reverse(); // El mes actual primero
};

const App: React.FC = () => {
  const [typedText, setTypedText] = useState('');
  const [fullText, setFullText] = useState("> SYSTEM_INIT: Connecting to Neural Core...");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [pieData, setPieData] = useState<ChartDataPoint[]>([]);
  
  // ESTADOS FINANCIEROS
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [financialScore, setFinancialScore] = useState(0);
  const [scoreShortReasons, setScoreShortReasons] = useState<string[]>([]); 
  const [scoreAuditLog, setScoreAuditLog] = useState<string[]>([]);       
  const [scoreFeedback, setScoreFeedback] = useState(""); 
  const [projectedSpend, setProjectedSpend] = useState(0); 
  const [currentStreak, setCurrentStreak] = useState(0); 
  const [financialOffers, setFinancialOffers] = useState<FinancialOffer[]>([]); // 🚀 ESTADO DE OFERTAS
  
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false); // Para el indicador de fondo
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const [userQuery, setUserQuery] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);

  // Efecto de máquina de escribir
  useEffect(() => {
    setTypedText(''); 
    let index = 0;
    const timer = setInterval(() => {
      setTypedText((prev) => fullText.substring(0, index + 1));
      index++;
      if (index > fullText.length) clearInterval(timer);
    }, 20); // Acelerado un poco para mayor fluidez
    return () => clearInterval(timer);
  }, [fullText]);

  // Carga inicial (LocalStorage + Fetch)
  useEffect(() => {
    // 1. Cargar caché inmediatamente si existe
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
        setFinancialOffers(parsed.financial_offers || []); // 🚀 CARGAMOS OFERTAS DE CACHÉ
        setFullText(`> SYSTEM_RESTORE: ${parsed.dashboard_message || 'Memory loaded.'}`);
        setLoading(false); // Quitamos la pantalla de carga general
      } catch (e) { console.error("Cache parsing error", e); }
    }

    // 2. Hacer fetch en segundo plano
    fetchData();
  }, []);

  const fetchData = async (query?: string) => {
      try {
        if (!query && !localStorage.getItem(CACHE_KEY)) setLoading(true);
        setIsSyncing(true); // Siempre mostramos que estamos sincronizando
        if (query) setIsQuerying(true);

        const url = query ? `${API_URL}?query=${encodeURIComponent(query)}` : API_URL;
        
        const response = await fetch(url);
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
            
            const feedbackToSet = result.data.score_feedback || "Solid habits. Keep building the nest egg.";
            setScoreFeedback(feedbackToSet);
            setProjectedSpend(result.data.projected_spend || 0); 
            setCurrentStreak(result.data.current_streak || 0); 
            setFinancialOffers(result.data.financial_offers || []); // 🚀 GUARDAMOS OFERTAS DEL BACKEND
            
            const aiMsg = result.data.dashboard_message || "Analysis Complete.";
            setFullText(`> ${query ? 'AI_RESPONSE:' : 'SYSTEM_ANALYSIS_COMPLETE:'} ${aiMsg}`);

            // 💾 Guardar en caché solo si no es una consulta de chat
            if (!query) {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    transactions: result.data.transactions,
                    financial_score: result.data.financial_score,
                    score_short_reasons: result.data.score_short_reasons,
                    score_audit_log: auditLogToSet,
                    score_feedback: feedbackToSet,
                    projected_spend: result.data.projected_spend,
                    current_streak: result.data.current_streak,
                    financial_offers: result.data.financial_offers, // 🚀 CACHEAMOS LAS OFERTAS
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
        if (isIncomeKeyword || amount < 0) isExpense = false;
        
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30 pb-20">
      
      {/* Navbar */}
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
               <div className="relative">
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
                 {isSyncing ? 'Syncing Data...' : 'System Online'} <Wifi className="h-3 w-3"/>
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        
        {/* Terminal CON CHAT INTEGRADO */}
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
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono placeholder-slate-600"
                        disabled={isQuerying}
                    />
                </div>
                <button 
                    type="submit" 
                    disabled={isQuerying}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg transition flex items-center justify-center disabled:opacity-50 min-w-[50px]"
                >
                    {isQuerying ? <RefreshCw className="animate-spin h-4 w-4"/> : <Send className="h-4 w-4"/>}
                </button>
            </form>
          </div>
        </section>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
          
          {/* --- LEFT: Transaction List --- */}
          <div className="md:col-span-5 flex flex-col">
            <div className="bg-slate-900 p-6 rounded-xl border border-blue-900/30 shadow-xl relative overflow-hidden h-full flex flex-col max-h-[700px]">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <RefreshCw className={`h-24 w-24 text-blue-400 ${isSyncing ? 'animate-spin' : ''}`}/>
              </div>
              <h2 className="text-lg font-bold text-white flex items-center mb-2">
                <Database className="mr-2 h-5 w-5 text-blue-400" /> Transactions
              </h2>
              <p className="text-xs text-slate-500 mb-6 uppercase tracking-wider">
                {new Date(selectedYear, selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </p>
              
              <div className="flex-1 overflow-y-auto pr-2 pb-6 scrollbar-thin scrollbar-thumb-slate-700">
                {loading ? (
                  // --- SKELETON LOADER PARA TRANSACCIONES ---
                  <div className="space-y-3 animate-pulse">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="h-[68px] bg-slate-800/60 rounded-lg border border-slate-700/30"></div>
                    ))}
                  </div>
                ) : transactions.length > 0 ? (
                  <div className="space-y-3">
                    {transactions.map((tx, idx) => {
                      const amount = parseFloat(tx.amount as string);
                      const desc = tx.description.toLowerCase();
                      const isIncomeKeyword = desc.includes('deposit') || desc.includes('credit') || desc.includes('payroll') || desc.includes('gusto') || desc.includes('refund');
                      let isIncome = false;
                      if (isIncomeKeyword || amount < 0) isIncome = true;

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
                   <p className="text-slate-500 text-sm text-center mt-10">No transactions found for this month.</p>
                )}
              </div>
            </div>
          </div>

          {/* --- RIGHT: Spending & SCORE & FORECAST --- */}
          <div className="md:col-span-7 flex flex-col gap-6">
            
            {/* 0. STREAK CARD */}
            <div className="bg-slate-900 rounded-xl border border-orange-500/30 shadow-xl p-6 flex items-center justify-between">
              <div>
                <h3 className="text-[#94a3b8] text-xs uppercase tracking-wider font-bold mb-1">
                  Savings Streak
                </h3>
                {loading ? (
                    // SKELETON RACHA
                    <div className="h-10 w-24 bg-slate-800/60 rounded animate-pulse mt-2"></div>
                ) : (
                    <>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black text-white">{currentStreak}</span>
                            <span className="text-slate-400 text-sm font-medium ml-1">Days</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                        {currentStreak > 0 
                            ? "Keep it up! The AI is watching." 
                            : "Streak broken. The AI is disappointed."}
                        </p>
                    </>
                )}
              </div>
              <div className={`p-4 rounded-full ${currentStreak > 0 ? 'bg-orange-500/20 text-orange-500' : 'bg-slate-800 text-slate-600'}`}>
                <Flame size={36} className={currentStreak > 0 ? 'animate-pulse' : ''} />
              </div>
            </div>

            {/* 1. SCORE CARD */}
            <div className="bg-slate-900 p-6 rounded-xl border border-indigo-500/30 shadow-xl relative overflow-hidden flex-shrink-0">
                <div className="flex items-start justify-between relative z-10 mb-4">
                    <div className="flex-1 pr-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Activity className="text-indigo-400" size={20}/> AI Financial Health
                        </h3>
                        {loading ? (
                             <div className="space-y-2 mt-3 animate-pulse">
                                 <div className="h-4 w-3/4 bg-slate-800/60 rounded"></div>
                                 <div className="h-4 w-1/2 bg-slate-800/60 rounded"></div>
                             </div>
                        ) : (
                            <div className="mt-3 space-y-1">
                                {scoreShortReasons.length > 0 ? scoreShortReasons.map((reason, idx) => (
                                    <p key={idx} className="text-xs text-slate-300 flex items-center gap-2">
                                        <CheckCircle2 size={12} className="text-emerald-500"/> {reason}
                                    </p>
                                )) : <p className="text-xs text-slate-500">Calculating impact factors...</p>}
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
                        <div className="mt-3 max-w-[280px]">
                            <p className="text-[11px] text-indigo-300 font-medium italic border-t border-slate-800 pt-2 leading-relaxed">
                                "{loading ? 'Loading analysis...' : scoreFeedback}"
                            </p>
                        </div>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-800">
                    <h4 className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1 uppercase tracking-wider">
                        <Search size={12} /> Audit Log
                    </h4>
                    <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-400 leading-relaxed font-mono">
                       {loading ? (
                           <div className="space-y-2 animate-pulse">
                               <div className="h-3 bg-slate-800/60 rounded w-full"></div>
                               <div className="h-3 bg-slate-800/60 rounded w-5/6"></div>
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

            {/* 🚀 NUEVA SECCIÓN: MONETIZACIÓN (OFERTAS) */}
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
                      const btnColor = isEmerald ? 'bg-emerald-600 hover:bg-emerald-500' : isAmber ? 'bg-amber-600 hover:bg-amber-500' : 'bg-indigo-600 hover:bg-indigo-500';

                      return (
                        <div key={idx} className={`p-4 rounded-lg border ${borderColor} bg-slate-950/50 flex flex-col justify-between hover:bg-slate-800/80 transition`}>
                          <div>
                            <h4 className={`text-sm font-bold ${titleColor} mb-2`}>{offer.title}</h4>
                            <p className="text-[11px] text-slate-300 leading-relaxed mb-4">{offer.description}</p>
                          </div>
                          <button className={`${btnColor} text-white text-xs font-bold px-3 py-2 rounded flex items-center justify-center gap-2 transition w-full`}>
                            {offer.cta_text} <ExternalLink size={12}/>
                          </button>
                        </div>
                      )
                    })}
                  </div>
              </div>
            )}

            {/* 3. FORECAST WIDGET */}
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
                    <div 
                        className="h-full bg-emerald-500 absolute left-0 top-0 z-10 transition-all duration-1000" 
                        style={{ width: `${Math.min((totalExpenses / (projectedSpend || 1)) * 100, 100)}%` }}
                    ></div>
                    <div className="h-full w-full bg-[linear-gradient(45deg,transparent_25%,rgba(59,130,246,0.2)_25%,rgba(59,130,246,0.2)_50%,transparent_50%,transparent_75%,rgba(59,130,246,0.2)_75%,rgba(59,130,246,0.2)_100%)] bg-[length:10px_10px]"></div>
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-mono">
                    <span>Current: {totalExpenses.toFixed(0)}€</span>
                    <span>Projected: {projectedSpend.toFixed(0)}€</span>
                </div>
            </div>

            {/* 4. OVERVIEW CARD */}
            <div className="bg-slate-900 rounded-xl ring-1 ring-slate-800 p-6 shadow-2xl flex-grow flex flex-col">
              <div className="flex justify-between items-start mb-6 border-b border-slate-800 pb-4">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <PieIcon className="h-5 w-5 text-indigo-400" /> Overview
                    </h3>
                </div>
                <div className="flex gap-8 text-right">
                    <div>
                        <p className="text-[10px] text-emerald-500/80 uppercase tracking-widest font-bold flex items-center justify-end gap-1">Income <TrendingUp size={12}/></p>
                        {loading ? <div className="h-7 w-20 bg-slate-800/60 rounded mt-1 animate-pulse"></div> : <p className="text-xl font-bold text-emerald-400">+{totalIncome.toFixed(2)} €</p>}
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold flex items-center justify-end gap-1">Expenses <TrendingDown size={12}/></p>
                        {loading ? <div className="h-8 w-24 bg-slate-800/60 rounded mt-1 animate-pulse"></div> : <p className="text-2xl font-bold text-white">{totalExpenses.toFixed(2)} €</p>}
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
                    ) : pieData.length > 0 ? pieData.map((item, index) => {
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
                    }) : (
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

export default App;
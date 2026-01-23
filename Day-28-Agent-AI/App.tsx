import React, { useState, useEffect } from 'react';
import { 
  Terminal, CloudLightning, Database, Wifi, RefreshCw, PieChart as PieIcon, 
  // Iconos
  Plane, Utensils, ShoppingBag, Car, Home, Coffee, 
  Dumbbell, Landmark, MonitorPlay, Calendar, TrendingUp, TrendingDown,
  Cpu, CreditCard, Activity, CheckCircle2, Search, Target, Send
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer
} from 'recharts';

// --- CONFIGURACIÓN ---
const API_URL = "https://vdwaba4uy35hpeohz77buz6p640yvslf.lambda-url.eu-north-1.on.aws/"; 

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
  const [scoreShortReasons, setScoreShortReasons] = useState<string[]>([]); // Emojis
  const [scoreAuditLog, setScoreAuditLog] = useState<string[]>([]);       // Texto largo
  const [scoreFeedback, setScoreFeedback] = useState(""); 
  const [projectedSpend, setProjectedSpend] = useState(0); 
  
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // NUEVOS ESTADOS PARA CHAT (DÍA 28)
  const [userQuery, setUserQuery] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);

  useEffect(() => {
    setTypedText(''); 
    let index = 0;
    const timer = setInterval(() => {
      setTypedText((prev) => fullText.substring(0, index + 1));
      index++;
      if (index > fullText.length) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [fullText]);

  // FUNCIÓN FETCH MODIFICADA PARA CHAT
  const fetchData = async (query?: string) => {
      try {
        if (!query) setLoading(true);
        else setIsQuerying(true);

        // Si hay query, la añadimos a la URL
        const url = query ? `${API_URL}?query=${encodeURIComponent(query)}` : API_URL;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("Server Error");
        const result = await response.json();
        
        if (result.data) {
            setAllTransactions(result.data.transactions || []);
            setFinancialScore(result.data.financial_score || 0);
            
            // Mapeo completo de datos
            setScoreShortReasons(result.data.score_short_reasons || []);
            setScoreAuditLog(result.data.score_audit_log || []);
            setScoreFeedback(result.data.score_feedback || "Analyzing spending patterns...");
            setProjectedSpend(result.data.projected_spend || 0); 
            
            // Si es respuesta de chat, prefijo 'AI_RESPONSE', si no 'SYSTEM_ANALYSIS'
            const aiMsg = result.data.dashboard_message || "Analysis Complete.";
            setFullText(`> ${query ? 'AI_RESPONSE:' : 'SYSTEM_ANALYSIS_COMPLETE:'} ${aiMsg}`);
        }
      } catch (error) {
        setFullText("> ERROR: Connection Failed. Retrying...");
      } finally {
        setLoading(false);
        setIsQuerying(false);
      }
  };

  useEffect(() => { fetchData(); }, []);

  // MANEJADOR DE ENVÍO DE CHAT
  const handleQuerySubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!userQuery.trim()) return;
      fetchData(userQuery);
      setUserQuery(""); // Limpiar input
  };

  // 2. PROCESAMIENTO DE TRANSACCIONES (INTACTO)
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
      setSelectedMonth(parseInt(e.target.value));
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
                    value={selectedMonth} 
                    onChange={handleMonthChange}
                    className="appearance-none bg-slate-900 border border-slate-700 text-white py-1 px-3 pr-8 rounded-lg text-sm focus:outline-none focus:border-indigo-500 cursor-pointer"
                 >
                    <option value={0}>January</option>
                    <option value={11}>December 2025</option>
                 </select>
                 <Calendar className="absolute right-2 top-1.5 h-4 w-4 text-slate-500 pointer-events-none"/>
               </div>
               
               <span className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-2 ${loading ? 'bg-amber-900/30 text-amber-400 border-amber-500/30 animate-pulse' : 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30'}`}>
                 {loading ? 'Processing...' : 'System Online'} <Wifi className="h-3 w-3"/>
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
            
            {/* --- INPUT DE CHAT (NUEVO BLOQUE) --- */}
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

        {/* Dashboard Grid - ALINEACIÓN TOTAL */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
          
          {/* --- LEFT: Transaction List --- */}
          <div className="md:col-span-5 flex flex-col">
            <div className="bg-slate-900 p-6 rounded-xl border border-blue-900/30 shadow-xl relative overflow-hidden h-full flex flex-col">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <RefreshCw className="h-24 w-24 text-blue-400"/>
              </div>
              <h2 className="text-lg font-bold text-white flex items-center mb-2">
                <Database className="mr-2 h-5 w-5 text-blue-400" /> Transactions
              </h2>
              <p className="text-xs text-slate-500 mb-6 uppercase tracking-wider">
                {new Date(selectedYear, selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </p>
              
              <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 max-h-[700px]">
                {transactions.length > 0 ? (
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
                   <p className="text-slate-500 text-sm text-center mt-10">
                     {loading ? 'Syncing...' : 'No transactions found for this month.'}
                   </p>
                )}
              </div>
            </div>
          </div>

          {/* --- RIGHT: Spending & SCORE & FORECAST --- */}
          <div className="md:col-span-7 flex flex-col gap-6">
            
            {/* 1. SCORE CARD */}
            <div className="bg-slate-900 p-6 rounded-xl border border-indigo-500/30 shadow-xl relative overflow-hidden flex-shrink-0">
                <div className="flex items-start justify-between relative z-10 mb-4">
                    <div className="flex-1 pr-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Activity className="text-indigo-400" size={20}/> AI Financial Health
                        </h3>
                        {/* EMOJIS RESTAURADOS */}
                        <div className="mt-3 space-y-1">
                            {scoreShortReasons.length > 0 ? scoreShortReasons.map((reason, idx) => (
                                <p key={idx} className="text-xs text-slate-300 flex items-center gap-2">
                                    <CheckCircle2 size={12} className="text-emerald-500"/> {reason}
                                </p>
                            )) : <p className="text-xs text-slate-500">Calculating impact factors...</p>}
                        </div>
                    </div>
                    
                    <div className="flex flex-col items-end">
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <span className="block text-5xl font-black text-white">{financialScore}</span>
                                <span className={`text-xs uppercase font-bold tracking-wider ${financialScore > 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {financialScore > 80 ? 'Excellent' : 'Average'}
                                </span>
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
                                "{scoreFeedback}"
                            </p>
                        </div>
                    </div>
                </div>

                {/* AUDIT LOG */}
                <div className="mt-4 pt-4 border-t border-slate-800">
                    <h4 className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1 uppercase tracking-wider">
                        <Search size={12} /> Audit Log
                    </h4>
                    <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-400 leading-relaxed font-mono">
                       {scoreAuditLog.length > 0 ? (
                           scoreAuditLog.map((logItem, idx) => (
                               <p key={idx} className="mb-1 border-b border-slate-800/50 pb-1 last:border-0 last:pb-0">{logItem}</p>
                           ))
                       ) : (
                           <p>Waiting for analysis...</p>
                       )}
                    </div>
                </div>
            </div>

            {/* 2. FORECAST WIDGET */}
            <div className="bg-slate-900 p-6 rounded-xl border border-blue-900/30 shadow-xl relative overflow-hidden">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Target className="text-blue-400" size={18}/> Month-End Projection
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">Based on current daily velocity</p>
                    </div>
                    <div className="text-right">
                        <span className="text-2xl font-bold text-white">{projectedSpend.toFixed(2)} €</span>
                        <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Forecast</span>
                    </div>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden mt-2 relative">
                    <div 
                        className="h-full bg-emerald-500 absolute left-0 top-0 z-10 transition-all duration-1000" 
                        style={{ width: `${Math.min((totalExpenses / projectedSpend) * 100, 100)}%` }}
                    ></div>
                    <div className="h-full w-full bg-[linear-gradient(45deg,transparent_25%,rgba(59,130,246,0.2)_25%,rgba(59,130,246,0.2)_50%,transparent_50%,transparent_75%,rgba(59,130,246,0.2)_75%,rgba(59,130,246,0.2)_100%)] bg-[length:10px_10px]"></div>
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-mono">
                    <span>Current: {totalExpenses.toFixed(0)}€</span>
                    <span>Projected: {projectedSpend.toFixed(0)}€</span>
                </div>
            </div>

            {/* 3. OVERVIEW CARD */}
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
                        <p className="text-xl font-bold text-emerald-400">+{totalIncome.toFixed(2)} €</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold flex items-center justify-end gap-1">Expenses <TrendingDown size={12}/></p>
                        <p className="text-2xl font-bold text-white">{totalExpenses.toFixed(2)} €</p>
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
                    {pieData.length > 0 ? pieData.map((item, index) => {
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
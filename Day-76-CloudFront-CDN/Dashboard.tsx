import React, { useState, useEffect } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import {
  Terminal, CloudLightning, Wifi, RefreshCw,
  Zap, LogOut, Settings, Calendar
} from 'lucide-react';

import { API_URL, CACHE_KEY, getCategoryDetails, getMonthOptions } from '../constants';
import type { Transaction, ChartDataPoint, FinancialOffer } from '../types';

import AIConsole from './AIConsole';
import TransactionList from './TransactionList';
import SettingsModal from './SettingsModal';
import Profile from './Profile';
import { SpendingOverview, ForecastWidget, VelocityAnalysis } from './Charts';
import { StreakCard, ScoreCard, FinancialOffersCard } from './Widgets';

// ==========================================
// DASHBOARD PRINCIPAL
// ==========================================

const Dashboard = () => {
  const { signOut } = useAuthenticator((context) => [context.user]);

  const handleSignOut = () => {
    localStorage.clear();
    signOut();
  };

  // ── Typing animation ──
  const [typedText, setTypedText] = useState('');
  const [fullText, setFullText] = useState("> SYSTEM_INIT: Connecting to Neural Core...");

  // ── Data ──
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [pieData, setPieData] = useState<ChartDataPoint[]>([]);

  // ── Financials ──
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [financialScore, setFinancialScore] = useState(0);
  const [scoreShortReasons, setScoreShortReasons] = useState<string[]>([]);
  const [scoreAuditLog, setScoreAuditLog] = useState<string[]>([]);
  const [scoreFeedback, setScoreFeedback] = useState("");
  const [projectedSpend, setProjectedSpend] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [financialOffers, setFinancialOffers] = useState<FinancialOffer[]>([]);

  // ── UI state ──
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [currentView, setCurrentView] = useState<'dashboard' | 'profile'>('dashboard');

  // ── AI query ──
  const [userQuery, setUserQuery] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);

  // ── Settings ──
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [prefName, setPrefName] = useState("");
  const [prefAvatar, setPrefAvatar] = useState(localStorage.getItem('finai_avatar') || "/default-avatar.png");
  const [prefSavingsGoal, setPrefSavingsGoal] = useState("5");
  const [prefTone, setPrefTone] = useState("brutal");
  const [prefWantsEmail, setPrefWantsEmail] = useState(true);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  // ── Provisioning Sequence (Solo Usuarios Nuevos) ──
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingMessages = [
    "Establishing secure connection...",
    "Retrieving financial footprint...",
    "Calibrating AI semantic models...",
    "Generating personalized insights..."
  ];

  useEffect(() => {
    let msgInterval: NodeJS.Timeout;
    if (isProvisioning) {
      msgInterval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % loadingMessages.length);
      }, 2500);
    }
    return () => clearInterval(msgInterval);
  }, [isProvisioning]);

  // ── Typing effect ──
  useEffect(() => {
    setTypedText('');
    let index = 0;
    const timer = setInterval(() => {
      setTypedText(() => fullText.substring(0, index + 1));
      index++;
      if (index > fullText.length) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [fullText]);

  // ── Initial load ──
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
    fetchPreferences(true);
  }, []);

  // ── Save avatar to localStorage ──
  useEffect(() => {
    localStorage.setItem('finai_avatar', prefAvatar);
  }, [prefAvatar]);

  // ── API fetch ──
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
        headers: { 'Authorization': `Bearer ${jwtToken}` }
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
        const auditLogToSet =
          Array.isArray(result.data.score_audit_log) && result.data.score_audit_log.length > 0
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

  // ── Filter & compute transactions by selected month ──
  useEffect(() => {
    if (allTransactions.length === 0) return;

    const uniqueTxMap = new Map();
    const filteredTxs = allTransactions
      .filter((tx: any) => {
        const rawDate = (tx.transaction_date || '').split('T')[0].split('#')[0];
        const txDate = new Date(rawDate);
        return txDate.getMonth() === selectedMonth && txDate.getFullYear() === selectedYear;
      })
      .filter((tx: any) => {
        const rawDate = (tx.transaction_date || '').split('T')[0].split('#')[0];
        const uniqueKey = `${rawDate}_${tx.description}_${tx.amount}`;
        if (uniqueTxMap.has(uniqueKey)) return false;
        uniqueTxMap.set(uniqueKey, true);
        return true;
      })
      .sort((a: any, b: any) => {
        const aDate = (a.transaction_date || '').split('T')[0].split('#')[0];
        const bDate = (b.transaction_date || '').split('T')[0].split('#')[0];
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

      const isIncomeKeyword =
        desc.includes('deposit') || desc.includes('payroll') || desc.includes('refund') ||
        desc.includes('gusto') || desc.includes('united airlines') ||
        desc.includes('interest') || desc.includes('cashback') || desc.includes('intrst') ||
        amount < 0;

      // is_internal is set by the bank client (wise_client, plaid_client, etc.)
      const isInternalTransfer = (tx as any).is_internal === true;

      if (isIncomeKeyword || amount < 0) {
        calcIncome += absAmount;
      } else if (isInternalTransfer) {
        const cat = "Transfer";
        categoryMap[cat] = (categoryMap[cat] || 0) + absAmount;
      } else {
        calcExpenses += absAmount;
        let cat = "General";

        // ── Lógica de Categorización Expandida ──
        // Transfers & internal movements (shown but not categorized as expense)
        if (desc.includes('to eur') || desc.includes('to usd') || desc.includes('to gbp') || desc === 'balance' || (desc.includes('eric fernando') && desc.includes('rodriguez'))) cat = "Transfer";
        // Housing
        else if (desc.includes('rent') || desc.includes('mortgage') || desc.includes('housing') || desc.includes('alquiler')) cat = "Housing";
        // Groceries - Spanish & international chains
        else if (desc.includes('mercadona') || desc.includes('carrefour') || desc.includes('lidl') || desc.includes('aldi') || desc.includes('dia ') || desc.includes('consum') || desc.includes('alcampo') || desc.includes('market') || desc.includes('grocery') || desc.includes('walmart') || desc.includes('tesco') || desc.includes('supermercado')) cat = "Groceries";
        // Bills & utilities
        else if (desc.includes('bill') || desc.includes('electric') || desc.includes('water') || desc.includes('internet') || desc.includes('pg&e') || desc.includes('pmz') || desc.includes('recaudo') || desc.includes('hacienda') || desc.includes('seguridad social') || desc.includes('apostillas')) cat = "Bills";
        // Financial payments
        else if (desc.includes('payment') || desc.includes('credit') || desc.includes('automatic payment') || desc.includes('credit card')) cat = "Financial";
        // Coffee
        else if (desc.includes('starbucks') || desc.includes('coffee') || desc.includes('cafe') || desc.includes('cafeteria') || desc.includes('bar ')) cat = "Coffee";
        // Food & restaurants
        else if (desc.includes('mcdonald') || desc.includes('burger') || desc.includes('kfc') || desc.includes('restaurant') || desc.includes('food') || desc.includes('dining') || desc.includes('pizza') || desc.includes('sushi') || desc.includes('kebab') || desc.includes('glovo') || desc.includes('just eat') || desc.includes('deliveroo')) cat = "Food";
        // Transport
        else if (desc.includes('uber') || desc.includes('lyft') || desc.includes('taxi') || desc.includes('transit') || desc.includes('renfe') || desc.includes('metro') || desc.includes('emt') || desc.includes('cabify') || desc.includes('blablacar')) cat = "Transport";
        // Travel
        else if (desc.includes('united') || desc.includes('airline') || desc.includes('hotel') || desc.includes('airbnb') || desc.includes('booking') || desc.includes('flight') || desc.includes('iberia') || desc.includes('ryanair')) cat = "Travel";
        // Entertainment
        else if (desc.includes('movie') || desc.includes('cinema') || desc.includes('ticket') || desc.includes('entertainment') || desc.includes('teatro') || desc.includes('concierto')) cat = "Entertainment";
        // Personal Care & Health
        else if (desc.includes('pharmacy') || desc.includes('farmacia') || desc.includes('cvs') || desc.includes('health') || desc.includes('doctor') || desc.includes('clinica') || desc.includes('dentist')) cat = "Personal Care";
        // Shopping & clothing
        else if (desc.includes('amazon') || desc.includes('shop') || desc.includes('store') || desc.includes('target') || desc.includes('zara') || desc.includes('primark') || desc.includes('mango') || desc.includes('asos') || desc.includes('fnac') || desc.includes('el corte')) cat = "Shopping";
        // Electronics & tech devices
        else if (desc.includes('sparkfun') || desc.includes('apple') || desc.includes('bestbuy') || desc.includes('google') || desc.includes('samsung') || desc.includes('pccomponentes') || desc.includes('media markt')) cat = "Electronics";
        // Leisure & sports
        else if (desc.includes('climb') || desc.includes('gym') || desc.includes('sport') || desc.includes('fitness') || desc.includes('padel') || desc.includes('tennis') || desc.includes('touchstone')) cat = "Leisure";
        // Tech subscriptions
        else if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('hbo') || desc.includes('software') || desc.includes('spliiit') || desc.includes('sharesub') || desc.includes('ionos') || desc.includes('chatgpt') || desc.includes('openai') || desc.includes('adobe') || desc.includes('microsoft') || desc.includes('dropbox') || desc.includes('icloud')) cat = "Tech";

        categoryMap[cat] = (categoryMap[cat] || 0) + absAmount;
      }
    });

    setTotalIncome(calcIncome);
    setTotalExpenses(calcExpenses);

    const processedPie = Object.keys(categoryMap)
      .map((key) => {
        const details = getCategoryDetails(key);
        return { name: key, value: categoryMap[key], color: details.color, icon: details.icon };
      })
      .sort((a, b) => b.value - a.value);

    setPieData(processedPie);
  }, [allTransactions, selectedMonth, selectedYear]);

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [m, y] = e.target.value.split('-');
    setSelectedMonth(parseInt(m));
    setSelectedYear(parseInt(y));
  };

  // ── Preferences ──
  const fetchPreferences = async (autoOpen = false) => {
    try {
      const { tokens } = await fetchAuthSession();
      const response = await fetch(`${API_URL}?action=get_preferences`, {
        headers: { 'Authorization': `Bearer ${tokens?.idToken?.toString()}` }
      });
      const res = await response.json();
      if (res.data) {
        const fetchedName = res.data.display_name || "";
        setPrefName(fetchedName);
        setPrefAvatar(res.data.avatar_url || '/default-avatar.png');
        setPrefSavingsGoal(res.data.daily_savings_goal?.toString() || "5");
        setPrefTone(res.data.ai_tone || "brutal");
        setPrefWantsEmail(res.data.wants_daily_email !== false);
        
        // Si no tiene nombre o contiene números (ej. ericridri11), fuerza el modal de Settings
        if (autoOpen && (!fetchedName || /\d/.test(fetchedName))) {
          setIsSettingsOpen(true);
        }
      }
    } catch (e) { console.error("Error fetching preferences", e); }
  };

  const openSettings = () => {
    setCurrentView('profile');
    fetchPreferences();
  };

  const savePreferences = async () => {
    setIsSavingPrefs(true);

    // Si venimos del Modal inicial (usuario nuevo), activamos la carga inmersiva
    if (isSettingsOpen && allTransactions.length === 0) {
      setIsProvisioning(true);
    }

    try {
      const { tokens } = await fetchAuthSession();
      const safeSavingsGoal = Math.max(0, parseFloat(prefSavingsGoal));
      await fetch(`${API_URL}?action=save_preferences`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens?.idToken?.toString()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          display_name: prefName,
          daily_savings_goal: safeSavingsGoal,
          ai_tone: prefTone,
          wants_daily_email: prefWantsEmail
        })
      });
      
      setIsSettingsOpen(false);
      await fetchData(undefined);
    } catch (e) { console.error("Error saving preferences", e); }

    setIsSavingPrefs(false);
    setIsProvisioning(false);
  };

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans selection:bg-green-200 pb-20" style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}>

      {/* ── ANNOUNCEMENT BAR ── */}
      <div className="bg-gray-950 text-center py-2 px-4">
        <p className="text-xs text-gray-400 font-medium">
          🔥 Your AI agent syncs automatically every session —{' '}
          <span className="text-green-400 font-semibold">real-time financial intelligence</span>
        </p>
      </div>

      {/* ── TOP NAV ── */}
      <header className="border-b border-gray-100 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-[60px] items-center gap-6">

            {/* Logo + nav links */}
            <div className="flex items-center gap-8 shrink-0">
              <span onClick={() => setCurrentView('dashboard')} className="font-black text-[1.2rem] text-gray-900 select-none cursor-pointer hover:opacity-80 transition" style={{ letterSpacing: '-0.03em' }}>
                FinAI<span className="text-green-500">.Agent</span>
              </span>
              <nav className="hidden md:flex items-center gap-1">
                <span className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-default transition select-none bg-green-50 text-green-700">Dashboard</span>
                <span className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-default transition select-none text-gray-400 hover:text-gray-700 hover:bg-gray-50">Transactions</span>
                <span className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-default transition select-none text-gray-400 hover:text-gray-700 hover:bg-gray-50">Insights</span>
              </nav>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-4">
              <div className="relative hidden sm:block">
                <select
                  value={`${selectedMonth}-${selectedYear}`}
                  onChange={handleMonthChange}
                  className="appearance-none bg-gray-50 border border-gray-200 text-gray-600 py-1.5 pl-3 pr-7 rounded-lg text-xs font-semibold focus:outline-none focus:border-green-400 cursor-pointer hover:border-gray-300 transition"
                >
                  {getMonthOptions().map((opt) => (
                    <option key={`${opt.month}-${opt.year}`} value={`${opt.month}-${opt.year}`}>{opt.label}</option>
                  ))}
                </select>
                <Calendar className="absolute right-2 top-2 h-3 w-3 text-gray-400 pointer-events-none"/>
              </div>

              <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${isSyncing ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`}></span>
                {isSyncing ? 'Syncing' : 'Live'}
              </div>

              {/* Profile Avatar - Only */}
              <button onClick={() => setCurrentView('profile')} title="Profile" className="w-8 h-8 rounded-full overflow-hidden border-2 border-gray-200 hover:border-green-500 transition focus:outline-none bg-gray-100">
                <img 
                  src={prefAvatar} 
                  alt="Profile" 
                  className="w-full h-full object-cover bg-white transition-opacity duration-300 opacity-0" 
                  onLoad={(e) => e.currentTarget.classList.remove('opacity-0')}
                />
              </button>
            </div>

          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Settings Modal */}
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onSave={savePreferences}
          isSaving={isSavingPrefs}
          prefName={prefName}
          setPrefName={setPrefName}
          prefSavingsGoal={prefSavingsGoal}
          setPrefSavingsGoal={setPrefSavingsGoal}
          prefTone={prefTone}
          setPrefTone={setPrefTone}
          prefWantsEmail={prefWantsEmail}
          setPrefWantsEmail={setPrefWantsEmail}
          avatarUrl={prefAvatar}
          setAvatarUrl={setPrefAvatar}
        />

        {/* ── PREMIUM PROVISIONING OVERLAY ── */}
        {isProvisioning && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/30 backdrop-blur-xl transition-all duration-500">
            <div className="bg-white border border-gray-100 shadow-2xl rounded-3xl p-10 w-[360px] flex flex-col items-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent animate-pulse"></div>
              <div className="relative w-20 h-20 mb-8 mt-2 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-gray-100"></div>
                <div className="absolute inset-0 rounded-full border-2 border-green-500 border-t-transparent animate-spin" style={{ animationDuration: '1.5s' }}></div>
                <div className="absolute inset-2 rounded-full border border-green-200 border-b-transparent animate-spin" style={{ animationDuration: '2.5s', animationDirection: 'reverse' }}></div>
                <CloudLightning className="text-green-500 relative z-10" size={24}/>
              </div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight text-center mb-2" style={{ letterSpacing: '-0.02em' }}>Provisioning Agent</h3>
              <div className="h-6 flex items-center justify-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center animate-pulse">{loadingMessages[loadingStep]}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Profile or Dashboard ── */}
        {currentView === 'profile' ? (
          <Profile avatarUrl={prefAvatar} isSaving={isSavingPrefs} onSave={savePreferences} onSignOut={handleSignOut} prefName={prefName} prefSavingsGoal={prefSavingsGoal} prefTone={prefTone} prefWantsEmail={prefWantsEmail} setAvatarUrl={setPrefAvatar} setPrefName={setPrefName} setPrefSavingsGoal={setPrefSavingsGoal} setPrefTone={setPrefTone} setPrefWantsEmail={setPrefWantsEmail}/>
        ) : (
          <>
            <AIConsole 
              typedText={typedText}
              userQuery={userQuery}
              setUserQuery={setUserQuery}
              isQuerying={isQuerying}
              onSubmit={handleQuerySubmit}
            />
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
              <div className="md:col-span-5 flex flex-col gap-5">
                <TransactionList 
                  loading={loading} 
                  transactions={transactions}
                  selectedMonth={selectedMonth} 
                  selectedYear={selectedYear}
                />
                <VelocityAnalysis 
                  totalExpenses={totalExpenses} 
                  totalIncome={totalIncome}
                  selectedMonth={selectedMonth} 
                  selectedYear={selectedYear}
                  prefSavingsGoal={prefSavingsGoal}
                />
              </div>
              <div className="md:col-span-7 flex flex-col gap-5">
                <StreakCard currentStreak={currentStreak} loading={loading}/>
                <ScoreCard 
                  financialScore={financialScore} 
                  loading={loading} 
                  scoreAuditLog={scoreAuditLog} 
                  scoreShortReasons={scoreShortReasons}
                />
                <FinancialOffersCard financialOffers={financialOffers} loading={loading}/>
                <ForecastWidget loading={loading} projectedSpend={projectedSpend} totalExpenses={totalExpenses}/>
                <SpendingOverview 
                  loading={loading} 
                  pieData={pieData} 
                  totalExpenses={totalExpenses} 
                  totalIncome={totalIncome}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
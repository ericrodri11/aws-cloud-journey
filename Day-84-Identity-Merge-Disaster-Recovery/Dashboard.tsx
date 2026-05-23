import React, { useState, useEffect } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import {
  Terminal, CloudLightning, Wifi, RefreshCw,
  Zap, LogOut, Settings, Calendar
} from 'lucide-react';

import { API_URL, CACHE_KEY, getCategoryDetails, getMonthOptions, inferTransactionCategory } from '../constants';
import type { AccountBalance, Transaction, ChartDataPoint, FinancialOffer } from '../types';

import AIConsole from './AIConsole';
import TransactionList from './TransactionList';
import SettingsModal from './SettingsModal';
import Profile from './Profile';
import { SpendingOverview, ForecastWidget, VelocityAnalysis } from './Charts';
import { GeneralBalanceCard, StreakCard, ScoreCard, FinancialOffersCard } from './Widgets';

const INTERNAL_TRANSFER_RE = /^to (eur|usd|gbp|chf|pln|ron|huf|czk|sek|nok|dkk)\b/;

const isInternalTransfer = (tx: Transaction) => {
  const desc = String(tx.description || '').trim().toLowerCase();
  return tx.is_internal === true || desc === 'balance' || INTERNAL_TRANSFER_RE.test(desc);
};

const isIncomeTransaction = (tx: Transaction) => {
  const desc = String(tx.description || '').toLowerCase();
  return (
    desc.includes('deposit') ||
    desc.includes('payroll') ||
    desc.includes('gusto') ||
    desc.includes('interest') ||
    desc.includes('intrst')
  );
};

const isCreditTransaction = (tx: Transaction) => {
  const desc = String(tx.description || '').toLowerCase();
  const amount = parseFloat(String(tx.amount || 0));
  return (
    !isIncomeTransaction(tx) && (
      amount < 0 ||
      desc.includes('refund') ||
      desc.includes('reversal') ||
      desc.includes('returned') ||
      desc.includes('cashback') ||
      desc.includes('united airlines') ||
      desc.includes('payment thank you')
    )
  );
};

const isExpenseTransaction = (tx: Transaction) => {
  const amount = parseFloat(String(tx.amount || 0));
  return amount > 0 && !isIncomeTransaction(tx) && !isCreditTransaction(tx) && !isInternalTransfer(tx);
};

const getAccountingMonth = (dateStr: string, isIncome: boolean) => {
  if (!isIncome) return dateStr.slice(0, 7);

  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr.slice(0, 7);

  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  if (date.getDate() >= lastDay - 4) {
    const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
  }

  return dateStr.slice(0, 7);
};

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
  const [totalCredits, setTotalCredits] = useState(0);
  const [estimatedMonthlyIncome, setEstimatedMonthlyIncome] = useState(0);
  const [todayExpenses, setTodayExpenses] = useState(0);
  const [financialScore, setFinancialScore] = useState(0);
  const [scoreShortReasons, setScoreShortReasons] = useState<string[]>([]);
  const [scoreAuditLog, setScoreAuditLog] = useState<string[]>([]);
  const [scoreFeedback, setScoreFeedback] = useState("");
  const [projectedSpend, setProjectedSpend] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [financialOffers, setFinancialOffers] = useState<FinancialOffer[]>([]);
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);

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
  const [prefWantsSms, setPrefWantsSms] = useState(true);
  const [prefAlertPhone, setPrefAlertPhone] = useState("");
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  // ── Provisioning Sequence (Solo Usuarios Nuevos) ──
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isInitializingApp, setIsInitializingApp] = useState(true);
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
    localStorage.removeItem(CACHE_KEY);

    // Comprobamos preferencias ANTES de pedir datos nuevos
    fetchPreferences(true).then((needsSetup) => {
      if (needsSetup) {
        // Es usuario nuevo: Detenemos todo. No llamamos a fetchData().
        // Esperamos a que el usuario termine el modal.
        setIsInitializingApp(false);
      } else {
        // Es usuario viejo: Solo entonces refrescamos los datos en segundo plano
        fetchData();
        setIsInitializingApp(false);
      }
    });
  }, []);

  // ── Save avatar to localStorage ──
  useEffect(() => {
    localStorage.setItem('finai_avatar', prefAvatar);
  }, [prefAvatar]);

  // ── API fetch ──
  const fetchData = async (query?: string, forceSync: boolean = false, targetMonth?: string) => {
    try {
      if (!query && !forceSync) setLoading(true);
      setIsSyncing(true);
      if (query) setIsQuerying(true);

      let url = API_URL;
      const params = new URLSearchParams();
      if (query) params.append('query', query);
      if (forceSync) params.append('sync', 'true');
      
      // NUEVO: Le enviamos al backend el mes exacto (formato YYYY-MM)
      const monthToFetch = targetMonth || `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
      params.append('month', monthToFetch);

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
        setEstimatedMonthlyIncome(result.data.total_income || 0);
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
        setAccountBalances(result.data.account_balances || []);

        const aiMsg = result.data.dashboard_message || "Analysis Complete.";
        setFullText(`> ${query ? 'AI_RESPONSE:' : 'SYSTEM_ANALYSIS_COMPLETE:'} ${aiMsg}`);

        if (!query && !forceSync) {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            transactions: result.data.transactions,
            total_income: result.data.total_income,
            financial_score: result.data.financial_score,
            score_short_reasons: result.data.score_short_reasons,
            score_audit_log: auditLogToSet,
            score_feedback: result.data.score_feedback,
            projected_spend: result.data.projected_spend,
            current_streak: result.data.current_streak,
            financial_offers: result.data.financial_offers,
            account_balances: result.data.account_balances,
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
    let calcCredits = 0;
    let calcTodayExpenses = 0;
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    allTransactions.forEach((tx: any) => {
      const rawDate = (tx.transaction_date || '').split('T')[0].split('#')[0];
      if (rawDate === todayKey && isExpenseTransaction(tx)) {
        calcTodayExpenses += Math.abs(parseFloat(tx.amount));
      }
    });

    const selectedMonthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

    allTransactions.forEach((tx: any) => {
      const rawDate = (tx.transaction_date || '').split('T')[0].split('#')[0];
      const amount = parseFloat(tx.amount);
      const desc = tx.description.toLowerCase();
      const absAmount = Math.abs(amount);

      const incomeTransaction = isIncomeTransaction(tx);
      const creditTransaction = isCreditTransaction(tx);
      const internalTransfer = isInternalTransfer(tx);
      const accountingMonth = getAccountingMonth(rawDate, incomeTransaction);
      const rawMonth = rawDate.slice(0, 7);

      if (incomeTransaction && accountingMonth === selectedMonthKey) {
        calcIncome += absAmount;
      } else if (creditTransaction && rawMonth === selectedMonthKey) {
        calcCredits += absAmount;
      } else if (internalTransfer && rawMonth === selectedMonthKey) {
        const cat = "Transfer";
        categoryMap[cat] = (categoryMap[cat] || 0) + absAmount;
      } else if (rawMonth === selectedMonthKey && isExpenseTransaction(tx)) {
        calcExpenses += absAmount;
        const cat = inferTransactionCategory(desc);

        categoryMap[cat] = (categoryMap[cat] || 0) + absAmount;
      }
    });

    setTotalIncome(calcIncome);
    setTotalExpenses(calcExpenses);
    setTotalCredits(calcCredits);
    setTodayExpenses(calcTodayExpenses);

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
    const newMonth = parseInt(m);
    const newYear = parseInt(y);
    
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);

    // NUEVO: Avisamos a AWS del cambio para que recalcule la proyección
    const formattedMonth = `${newYear}-${String(newMonth + 1).padStart(2, '0')}`;
    fetchData(undefined, false, formattedMonth);
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
        setPrefWantsSms(res.data.wants_sms_alerts !== false);
        setPrefAlertPhone(res.data.alert_phone_number || "");
        
        // Si no tiene nombre o contiene números, fuerza el modal
        if (autoOpen && (!fetchedName || /\d/.test(fetchedName))) {
          setIsSettingsOpen(true);
          return true; // INDICAMOS QUE SE ABRIÓ EL MODAL DE ONBOARDING
        }
      }
      return false; // NO NECESITA ONBOARDING
    } catch (e) { 
      console.error("Error fetching preferences", e); 
      return false;
    }
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
          wants_daily_email: prefWantsEmail,
          wants_sms_alerts: prefWantsSms,
          alert_phone_number: prefAlertPhone.trim()
        })
      });
      
      setIsSettingsOpen(false);

      // FIX DEFINITIVO: Esperamos a que DynamoDB replique y forzamos a Bedrock a ignorar caché.
      if (allTransactions.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await fetchData(undefined);
      } else {
        await fetchData(undefined);
      }

    } catch (e) { console.error("Error saving preferences", e); }

    setIsSavingPrefs(false);
    setIsProvisioning(false);
  };

  // ==========================================
  // RENDER
  // ==========================================
  if (isInitializingApp) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"></div>;
  }

  // FIX: Detectamos si es usuario 100% nuevo para ocultar el fondo
  const isFirstTimeSetup = isSettingsOpen && allTransactions.length === 0;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans selection:bg-green-200 pb-20" style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}>

      {/* Solo mostramos Top Nav y Barra si NO es la primera vez */}
      {!isFirstTimeSetup && (
        <>
          <div className="bg-gray-950 text-center py-2 px-4">
            <p className="text-xs text-gray-400 font-medium">
              🔥 Your AI agent syncs automatically every session —{' '}
              <span className="text-green-400 font-semibold">real-time financial intelligence</span>
            </p>
          </div>
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

                  {/* Profile Avatar - Solucionado el parpadeo de carga */}
                  {loading && allTransactions.length === 0 ? (
                    <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse border-2 border-transparent"></div>
                  ) : (
                    <button onClick={() => setCurrentView('profile')} title="Profile" className="w-8 h-8 rounded-full overflow-hidden border-2 border-gray-200 hover:border-green-500 transition focus:outline-none bg-white">
                      <img 
                        src={prefAvatar} 
                        alt="Profile" 
                        className="w-full h-full object-cover bg-white" 
                      />
                    </button>
                  )}
                </div>

              </div>
            </div>
          </header>
        </>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Settings Modal */}
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onSave={savePreferences}
          isSaving={isSavingPrefs}
          prefName={prefName} setPrefName={setPrefName}
          prefSavingsGoal={prefSavingsGoal} setPrefSavingsGoal={setPrefSavingsGoal}
          prefTone={prefTone} setPrefTone={setPrefTone}
          prefWantsEmail={prefWantsEmail} setPrefWantsEmail={setPrefWantsEmail}
          avatarUrl={prefAvatar} setAvatarUrl={setPrefAvatar}
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

        {/* Solo renderizamos el contenido interno del dashboard si NO es el onboarding */}
        {!isFirstTimeSetup && (
          currentView === 'profile' ? (
            <Profile avatarUrl={prefAvatar} isSaving={isSavingPrefs} onSave={savePreferences} onSignOut={handleSignOut} prefName={prefName} prefSavingsGoal={prefSavingsGoal} prefTone={prefTone} prefWantsEmail={prefWantsEmail} prefWantsSms={prefWantsSms} prefAlertPhone={prefAlertPhone} setAvatarUrl={setPrefAvatar} setPrefName={setPrefName} setPrefSavingsGoal={setPrefSavingsGoal} setPrefTone={setPrefTone} setPrefWantsEmail={setPrefWantsEmail} setPrefWantsSms={setPrefWantsSms} setPrefAlertPhone={setPrefAlertPhone}/>
          ) : (
            <>
              <AIConsole typedText={typedText} userQuery={userQuery} setUserQuery={setUserQuery} isQuerying={isQuerying} onSubmit={handleQuerySubmit} />
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
                <div className="md:col-span-5 flex flex-col gap-5">
                  <GeneralBalanceCard loading={loading} accountBalances={accountBalances}/>
                  <TransactionList loading={loading} transactions={transactions} selectedMonth={selectedMonth} selectedYear={selectedYear} />
                  <ForecastWidget loading={loading} projectedSpend={projectedSpend} totalExpenses={totalExpenses}/>
                </div>
                <div className="md:col-span-7 flex flex-col gap-5">
                  <SpendingOverview loading={loading} pieData={pieData} totalExpenses={totalExpenses} totalIncome={totalIncome} totalCredits={totalCredits} />
                  <ScoreCard financialScore={financialScore} loading={loading} scoreAuditLog={scoreAuditLog} scoreShortReasons={scoreShortReasons} />
                  <StreakCard currentStreak={currentStreak} loading={loading} dailySavingsGoal={Math.max(0, parseFloat(prefSavingsGoal) || 0)} estimatedMonthlyIncome={totalIncome || estimatedMonthlyIncome} todayExpenses={todayExpenses}/>
                  <VelocityAnalysis totalExpenses={totalExpenses} totalIncome={totalIncome} estimatedMonthlyIncome={estimatedMonthlyIncome} selectedMonth={selectedMonth} selectedYear={selectedYear} prefSavingsGoal={prefSavingsGoal} />
                  <FinancialOffersCard financialOffers={financialOffers} loading={loading}/>
                </div>
              </div>
            </>
          )
        )}
      </main>
    </div>
  );
};

export default Dashboard;

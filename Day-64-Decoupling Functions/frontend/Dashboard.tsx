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
import { SpendingOverview, ForecastWidget, VelocityAnalysis } from './Charts';
import { StreakCard, ScoreCard, FinancialOffersCard } from './Widgets';

// ==========================================
// DASHBOARD PRINCIPAL
// ==========================================

const Dashboard = () => {
  const { signOut } = useAuthenticator((context) => [context.user]);

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

  // ── AI query ──
  const [userQuery, setUserQuery] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);

  // ── Settings ──
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [prefName, setPrefName] = useState("");
  const [prefSavingsGoal, setPrefSavingsGoal] = useState("5");
  const [prefTone, setPrefTone] = useState("brutal");
  const [prefWantsEmail, setPrefWantsEmail] = useState(true);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

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
  }, []);

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
        const rawDate = (tx.transaction_date || '').split('#')[0];
        const txDate = new Date(rawDate);
        return txDate.getMonth() === selectedMonth && txDate.getFullYear() === selectedYear;
      })
      .filter((tx: any) => {
        const rawDate = (tx.transaction_date || '').split('#')[0];
        const uniqueKey = `${rawDate}_${tx.description}_${tx.amount}`;
        if (uniqueTxMap.has(uniqueKey)) return false;
        uniqueTxMap.set(uniqueKey, true);
        return true;
      })
      .sort((a: any, b: any) => {
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

      const isIncomeKeyword =
        desc.includes('deposit') || desc.includes('payroll') || desc.includes('refund') ||
        desc.includes('gusto') || desc.includes('united airlines') || amount < 0;

      if (isIncomeKeyword || amount < 0) {
        calcIncome += absAmount;
      } else {
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
  const fetchPreferences = async () => {
    try {
      const { tokens } = await fetchAuthSession();
      const response = await fetch(`${API_URL}?action=get_preferences`, {
        headers: { 'Authorization': `Bearer ${tokens?.idToken?.toString()}` }
      });
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
      fetchData(undefined);
    } catch (e) { console.error("Error saving preferences", e); }
    setIsSavingPrefs(false);
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
                      item.active ? 'bg-green-50 text-green-700' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
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
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
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
        />

        {/* AI Terminal Chat */}
        <AIConsole
          typedText={typedText}
          userQuery={userQuery}
          setUserQuery={setUserQuery}
          isQuerying={isQuerying}
          onSubmit={handleQuerySubmit}
        />

        {/* Dashboard Grids */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">

          {/* LEFT: Transactions & Velocity Analysis */}
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

          {/* RIGHT: Stats */}
          <div className="md:col-span-7 flex flex-col gap-5">
            <StreakCard loading={loading} currentStreak={currentStreak} />
            <ScoreCard
              loading={loading}
              financialScore={financialScore}
              scoreShortReasons={scoreShortReasons}
              scoreAuditLog={scoreAuditLog}
            />
            <FinancialOffersCard loading={loading} financialOffers={financialOffers} />
            <ForecastWidget
              loading={loading}
              projectedSpend={projectedSpend}
              totalExpenses={totalExpenses}
            />
            <SpendingOverview
              loading={loading}
              pieData={pieData}
              totalIncome={totalIncome}
              totalExpenses={totalExpenses}
            />
          </div>

        </div>
      </main>
    </div>
  );
};

export default Dashboard;

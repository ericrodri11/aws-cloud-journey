import React from 'react';
import {
  Activity, CheckCircle2, Search, Flame, Target, ExternalLink
} from 'lucide-react';
import type { FinancialOffer } from '../types';

// ==========================================
// STREAK CARD
// ==========================================

interface StreakCardProps {
  loading: boolean;
  currentStreak: number;
}

export const StreakCard = ({ loading, currentStreak }: StreakCardProps) => (
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
);

// ==========================================
// SCORE CARD
// ==========================================

interface ScoreCardProps {
  loading: boolean;
  financialScore: number;
  scoreShortReasons: string[];
  scoreAuditLog: string[];
}

export const ScoreCard = ({ loading, financialScore, scoreShortReasons, scoreAuditLog }: ScoreCardProps) => (
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
);

// ==========================================
// FINANCIAL OFFERS CARD (Monetización)
// ==========================================

interface FinancialOffersCardProps {
  loading: boolean;
  financialOffers: FinancialOffer[];
}

export const FinancialOffersCard = ({ loading, financialOffers }: FinancialOffersCardProps) => {
  if (financialOffers.length === 0 || loading) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 flex-shrink-0">
      <h3 className="text-xs font-bold text-gray-500 mb-4 flex items-center gap-2 uppercase tracking-wider">
        <Target className="text-green-500" size={14}/> Tailored For You
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {financialOffers.map((offer, idx) => (
          <div key={idx} className="p-4 rounded-xl border border-gray-200 bg-gray-50 flex flex-col justify-between hover:border-green-300 hover:bg-green-50 transition group">
            <div>
              <h4 className="text-sm font-bold text-gray-900 mb-1.5">{offer.title}</h4>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">{offer.description}</p>
            </div>
            <button className="bg-green-500 hover:bg-green-400 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center justify-center gap-2 w-full transition">
              {offer.cta_text} <ExternalLink size={11}/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

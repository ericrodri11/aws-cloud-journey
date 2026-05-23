import React, { useState } from 'react';
import { Database, ArrowRightLeft, Coffee, Utensils, Car, Plane, ShoppingBag, Dumbbell, Cpu, MonitorPlay, Landmark, CreditCard, Home, Zap, Heart, Edit2, Check, X } from 'lucide-react';
import type { Transaction } from '../types';

// ── Category config: color + icon + label ────────────────────────────────────
const CATEGORY_CONFIG: Record<string, { color: string; bg: string; Icon: any; label: string }> = {
  Transfer:      { color: '#a78bfa', bg: '#f5f3ff', Icon: ArrowRightLeft, label: 'Transfer'     },
  Coffee:        { color: '#06b6d4', bg: '#ecfeff',  Icon: Coffee,         label: 'Coffee'       },
  Food:          { color: '#f59e0b', bg: '#fffbeb',  Icon: Utensils,       label: 'Food'         },
  Groceries:     { color: '#84cc16', bg: '#f7fee7',  Icon: ShoppingBag,    label: 'Groceries'    },
  Transport:     { color: '#f97316', bg: '#fff7ed',  Icon: Car,            label: 'Transport'    },
  Travel:        { color: '#3b82f6', bg: '#eff6ff',  Icon: Plane,          label: 'Travel'       },
  Shopping:      { color: '#ec4899', bg: '#fdf2f8',  Icon: ShoppingBag,    label: 'Shopping'     },
  Electronics:   { color: '#8b5cf6', bg: '#f5f3ff',  Icon: Cpu,            label: 'Electronics'  },
  Leisure:       { color: '#4ade80', bg: '#f0fdf4',  Icon: Dumbbell,       label: 'Leisure'      },
  Tech:          { color: '#6366f1', bg: '#eef2ff',  Icon: MonitorPlay,    label: 'Tech'         },
  Financial:     { color: '#ef4444', bg: '#fef2f2',  Icon: Landmark,       label: 'Financial'    },
  Bills:         { color: '#f59e0b', bg: '#fffbeb',  Icon: Zap,            label: 'Bills'        },
  Housing:       { color: '#0ea5e9', bg: '#f0f9ff',  Icon: Home,           label: 'Housing'      },
  'Personal Care':{ color: '#e879f9', bg: '#fdf4ff', Icon: Heart,          label: 'Personal'     },
  General:       { color: '#94a3b8', bg: '#f8fafc',  Icon: CreditCard,     label: 'General'      },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_CONFIG);

// ── Editable Transaction Row ─────────────────────────────────────────────────
const TransactionRow = ({ tx, idx }: { tx: Transaction; idx: number }) => {
  const [editing, setEditing] = useState(false);
  const [selectedCat, setSelectedCat] = useState((tx as any).category || 'General');

  const amount = parseFloat(tx.amount as string);
  const descLower = tx.description.toLowerCase();
  const isIncome =
    descLower.includes('deposit') || descLower.includes('payroll') ||
    descLower.includes('refund') || descLower.includes('gusto') ||
    descLower.includes('united airlines') || descLower.includes('intrst') ||
    descLower.includes('interest') || descLower.includes('cashback') || amount < 0;
  const isInternal = (tx as any).is_internal === true;

  const cat = isInternal ? 'Transfer' : selectedCat;
  const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG['General'];
  const CatIcon = cfg.Icon;

  return (
    <div
      className={`p-3 rounded-xl border flex justify-between items-center transition group ${
        isInternal ? 'opacity-55' : ''
      } ${editing ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-100 bg-gray-50 hover:bg-green-50 hover:border-green-200'}`}
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0 mr-2">
        {/* Category icon — click to edit */}
        <button
          onClick={() => !isInternal && setEditing(!editing)}
          title={isInternal ? 'Internal transfer' : 'Change category'}
          className={`p-1.5 rounded-lg shrink-0 transition ${
            isInternal ? 'cursor-default' : 'cursor-pointer hover:scale-110'
          }`}
          style={{ backgroundColor: cfg.bg, color: cfg.color }}
        >
          <CatIcon size={13} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-medium truncate ${isInternal ? 'text-gray-400' : 'text-gray-800'}`}>
              {tx.description}
            </p>
            {isInternal && (
              <span className="text-[10px] font-semibold text-violet-400 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                Internal
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {(tx.transaction_date || '').split('T')[0].split('#')[0]}
          </p>
        </div>
      </div>

      <span className={`font-mono font-bold text-sm whitespace-nowrap ${
        isInternal ? 'text-violet-300' : isIncome ? 'text-green-600' : 'text-gray-800'
      }`}>
        {isIncome && !isInternal ? '+' : ''}{Math.abs(amount).toFixed(2)}€
      </span>

      {/* Category picker dropdown */}
      {editing && !isInternal && (
        <div className="absolute z-20 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-xl p-2 grid grid-cols-2 gap-1"
          style={{ top: '100%', left: 0 }}
        >
          {ALL_CATEGORIES.filter(c => c !== 'Transfer').map(c => {
            const cc = CATEGORY_CONFIG[c];
            const CI = cc.Icon;
            return (
              <button
                key={c}
                onClick={() => { setSelectedCat(c); setEditing(false); }}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition hover:scale-105 ${
                  selectedCat === c ? 'ring-2 ring-offset-1' : ''
                }`}
                style={{
                  backgroundColor: cc.bg,
                  color: cc.color,
                  ringColor: cc.color,
                }}
              >
                <CI size={11} />{cc.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface TransactionListProps {
  loading: boolean;
  transactions: Transaction[];
  selectedMonth: number;
  selectedYear: number;
}

const TransactionList = ({ loading, transactions, selectedMonth, selectedYear }: TransactionListProps) => (
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
        transactions.map((tx, idx) => (
          <div key={idx} className="relative">
            <TransactionRow tx={tx} idx={idx} />
          </div>
        ))
      ) : (
        <p className="text-gray-400 text-sm text-center mt-10">No transactions found.</p>
      )}
    </div>
  </div>
);

export default TransactionList;
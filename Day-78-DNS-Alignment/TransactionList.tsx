import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Database, ArrowRightLeft, Coffee, Utensils, Car, Plane, ShoppingBag, Dumbbell, Cpu, MonitorPlay, Landmark, CreditCard, Home, Zap, Heart, ShoppingCart } from 'lucide-react';
import type { Transaction } from '../types';

interface TransactionListProps {
  loading: boolean;
  transactions: Transaction[];
  selectedMonth: number;
  selectedYear: number;
}

const CATEGORY_CONFIG: Record<string, { color: string; bg: string; Icon: any; label: string }> = {
  Transfer:       { color: '#7c3aed', bg: '#ede9fe', Icon: ArrowRightLeft, label: 'Transfer'   },
  Coffee:         { color: '#0891b2', bg: '#cffafe', Icon: Coffee,         label: 'Coffee'     },
  Food:           { color: '#d97706', bg: '#fef3c7', Icon: Utensils,       label: 'Food'       },
  Groceries:      { color: '#16a34a', bg: '#dcfce7', Icon: ShoppingCart,   label: 'Groceries'  },
  Transport:      { color: '#ea580c', bg: '#ffedd5', Icon: Car,            label: 'Transport'  },
  Travel:         { color: '#2563eb', bg: '#dbeafe', Icon: Plane,          label: 'Travel'     },
  Shopping:       { color: '#db2777', bg: '#fce7f3', Icon: ShoppingBag,    label: 'Shopping'   },
  Electronics:    { color: '#9333ea', bg: '#f3e8ff', Icon: Cpu,            label: 'Electronics'},
  Leisure:        { color: '#059669', bg: '#d1fae5', Icon: Dumbbell,       label: 'Leisure'    },
  Tech:           { color: '#4f46e5', bg: '#e0e7ff', Icon: MonitorPlay,    label: 'Tech'       },
  Financial:      { color: '#dc2626', bg: '#fee2e2', Icon: Landmark,       label: 'Financial'  },
  Bills:          { color: '#b45309', bg: '#fef9c3', Icon: Zap,            label: 'Bills'      },
  Housing:        { color: '#0284c7', bg: '#e0f2fe', Icon: Home,           label: 'Housing'    },
  'Personal Care':{ color: '#be185d', bg: '#fdf2f8', Icon: Heart,          label: 'Personal'   },
  General:        { color: '#64748b', bg: '#f1f5f9', Icon: CreditCard,     label: 'General'    },
};

const EDITABLE_CATEGORIES = Object.keys(CATEGORY_CONFIG).filter(c => c !== 'Transfer');

const CategoryPicker = ({
  current,
  anchorRect,
  onSelect,
  onClose,
}: {
  current: string;
  anchorRect: DOMRect;
  onSelect: (cat: string) => void;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleScroll = () => onClose();
    document.addEventListener('mousedown', handleClick, true);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick, true);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  const popupHeight = 320;
  const spaceBelow = window.innerHeight - anchorRect.bottom - 8;
  const top = spaceBelow >= popupHeight
    ? anchorRect.bottom + 8
    : anchorRect.top - popupHeight - 8;
  const left = Math.min(Math.max(anchorRect.left - 8, 8), window.innerWidth - 296);

  return (
    <div
      ref={ref}
      className="fixed z-[9999] bg-white border border-gray-200 rounded-2xl shadow-2xl p-3 w-72"
      style={{ top, left }}
    >
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
        Change Category
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {EDITABLE_CATEGORIES.map(cat => {
          const cfg = CATEGORY_CONFIG[cat];
          const CI = cfg.Icon;
          const isActive = current === cat;
          return (
            <button
              key={cat}
              onClick={() => { onSelect(cat); onClose(); }}
              className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-[11px] font-semibold transition-all duration-100 hover:scale-105 active:scale-95 ${isActive ? 'scale-105' : ''}`}
              style={{
                backgroundColor: isActive ? cfg.color : cfg.bg,
                color: isActive ? '#fff' : cfg.color,
                outline: isActive ? `2px solid ${cfg.color}` : undefined,
              }}
            >
              <CI size={14} />
              {cfg.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const TransactionRow = ({
  tx,
  openPickerFor,
  setOpenPickerFor,
}: {
  tx: Transaction;
  openPickerFor: string | null;
  setOpenPickerFor: (id: string | null, rect?: DOMRect) => void;
}) => {
  const [selectedCat, setSelectedCat] = useState<string>((tx as any).category || 'General');
  const btnRef = useRef<HTMLButtonElement>(null);

  const amount = parseFloat(tx.amount as string);
  const descLower = tx.description.toLowerCase();
  const isIncome =
    descLower.includes('deposit') || descLower.includes('payroll') ||
    descLower.includes('refund') || descLower.includes('gusto') ||
    descLower.includes('united airlines') || descLower.includes('intrst') ||
    descLower.includes('interest') || descLower.includes('cashback') || amount < 0;

  const isInternal = (tx as any).is_internal === true;
  const txId = (tx as any).transaction_id || tx.description;
  const isOpen = openPickerFor === txId;

  const cat = isInternal ? 'Transfer' : selectedCat;
  const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG['General'];
  const CatIcon = cfg.Icon;

  const handleIconClick = () => {
    if (isInternal) return;
    if (isOpen) {
      setOpenPickerFor(null);
    } else {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setOpenPickerFor(txId, rect);
    }
  };

  return (
    <div className={`p-3 rounded-xl border flex justify-between items-center transition ${
      isInternal ? 'opacity-55 border-gray-100 bg-gray-50/50' :
      isOpen ? 'border-gray-300 bg-white shadow-sm' :
      'border-gray-100 bg-gray-50 hover:bg-green-50 hover:border-green-200'
    }`}>
      <div className="flex items-center gap-2.5 flex-1 min-w-0 mr-2">
        <button
          ref={btnRef}
          onClick={handleIconClick}
          title={isInternal ? 'Internal transfer' : 'Change category'}
          className={`p-1.5 rounded-lg shrink-0 transition-all duration-150 ${
            isInternal ? 'cursor-default' : 'cursor-pointer hover:scale-110 active:scale-95'
          }`}
          style={{
            backgroundColor: cfg.bg,
            color: cfg.color,
            outline: isOpen ? `2px solid ${cfg.color}` : undefined,
          }}
        >
          <CatIcon size={13} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-medium truncate ${isInternal ? 'text-gray-400' : 'text-gray-800'}`}>
              {tx.description}
            </p>
            {isInternal && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                style={{ color: '#7c3aed', backgroundColor: '#ede9fe' }}>
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
    </div>
  );
};

const TransactionList = ({ loading, transactions, selectedMonth, selectedYear }: TransactionListProps) => {
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const handleSetOpen = useCallback((id: string | null, rect?: DOMRect) => {
    setOpenPickerId(id);
    if (rect) setAnchorRect(rect);
  }, []);

  const currentTx = transactions.find(t => ((t as any).transaction_id || t.description) === openPickerId);

  return (
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
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-[60px] bg-gray-100 rounded-xl" />)}
          </div>
        ) : transactions.length > 0 ? (
          transactions.map((tx, idx) => (
            <TransactionRow
              key={idx}
              tx={tx}
              openPickerFor={openPickerId}
              setOpenPickerFor={handleSetOpen}
            />
          ))
        ) : (
          <p className="text-gray-400 text-sm text-center mt-10">No transactions found.</p>
        )}
      </div>
      {openPickerId && anchorRect && currentTx && (
        <CategoryPicker
          current={(currentTx as any).category || 'General'}
          anchorRect={anchorRect}
          onSelect={() => setOpenPickerId(null)}
          onClose={() => setOpenPickerId(null)}
        />
      )}
    </div>
  );
};

export default TransactionList;
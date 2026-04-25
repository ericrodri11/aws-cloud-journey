import React from 'react';
import { Database } from 'lucide-react';
import type { Transaction } from '../types';

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
        transactions.map((tx, idx) => {
          const amount = parseFloat(tx.amount as string);
          const descLower = tx.description.toLowerCase();
          const isIncome =
            descLower.includes('deposit') ||
            descLower.includes('payroll') ||
            descLower.includes('refund') ||
            descLower.includes('gusto') ||
            descLower.includes('united airlines') ||
            amount < 0;

          return (
            <div
              key={idx}
              className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center hover:bg-green-50 hover:border-green-200 transition group cursor-default"
            >
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-medium text-gray-800 truncate">{tx.description}</p>
                <p className="text-xs text-gray-400 mt-0.5">{(tx.transaction_date || '').split('#')[0]}</p>
              </div>
              <span className={`font-mono font-bold text-sm whitespace-nowrap ${isIncome ? 'text-green-600' : 'text-gray-800'}`}>
                {isIncome ? '+' : ''}{Math.abs(amount).toFixed(2)}€
              </span>
            </div>
          );
        })
      ) : (
        <p className="text-gray-400 text-sm text-center mt-10">No transactions found.</p>
      )}
    </div>
  </div>
);

export default TransactionList;

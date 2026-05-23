import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import {
  PieChart as PieIcon, TrendingUp, TrendingDown, Target
} from 'lucide-react';
import type { ChartDataPoint } from '../types';

// ==========================================
// SPENDING OVERVIEW (PIE CHART)
// ==========================================

interface SpendingOverviewProps {
  loading: boolean;
  pieData: ChartDataPoint[];
  totalIncome: number;
  totalExpenses: number;
}

// Transfer category color override — violet to distinguish from General (gray)
const getCategoryColor = (name: string, defaultColor: string) => {
  if (name === 'Transfer') return '#a78bfa';
  if (name === 'Bills') return '#f59e0b';
  if (name === 'Groceries') return '#84cc16';
  return defaultColor;
};

export const SpendingOverview = ({ loading, pieData, totalIncome, totalExpenses }: SpendingOverviewProps) => (
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
                <Cell key={`cell-${index}`} fill={getCategoryColor(entry.name, entry.color)} />
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
                      <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: getCategoryColor(item.name, item.color) }} />
                    </div>
                  </div>
                </div>
                <div className="text-right pl-2 shrink-0">
                  <p className="text-xs font-bold text-gray-800">{item.value.toFixed(0)}€</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center text-gray-400 text-sm py-10">No expenses.</div>
        )}
      </div>
    </div>
  </div>
);

// ==========================================
// FORECAST WIDGET
// ==========================================

interface ForecastWidgetProps {
  loading: boolean;
  projectedSpend: number;
  totalExpenses: number;
}

export const ForecastWidget = ({ loading, projectedSpend, totalExpenses }: ForecastWidgetProps) => (
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
);

// ==========================================
// VELOCITY ANALYSIS
// ==========================================

interface VelocityAnalysisProps {
  totalExpenses: number;
  totalIncome: number;
  selectedMonth: number;
  selectedYear: number;
  prefSavingsGoal: string;
}

export const VelocityAnalysis = ({ totalExpenses, totalIncome, selectedMonth, selectedYear, prefSavingsGoal }: VelocityAnalysisProps) => {
  const today = new Date();
  const isCurrentMonth = selectedMonth === today.getMonth() && selectedYear === today.getFullYear();
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const daysPassed = isCurrentMonth ? Math.max(1, today.getDate()) : daysInMonth;

  const burnRate = totalExpenses / daysPassed;
  const recommendedBurn = totalIncome > 0 ? (totalIncome - (parseFloat(prefSavingsGoal) * daysInMonth)) / daysInMonth : 0;
  const isBurningFast = burnRate > recommendedBurn && recommendedBurn > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex-shrink-0">
      <h3 className="text-xs font-bold text-gray-500 mb-4 flex items-center gap-2 uppercase tracking-wider">
        <TrendingDown className="text-green-500" size={14}/> Velocity Analysis
      </h3>
      <div className="space-y-4">
        <div className="flex justify-between items-end border-b border-gray-100 pb-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Daily Burn Rate</p>
            <p className="text-2xl font-black text-gray-900" style={{ letterSpacing: '-0.02em' }}>
              {burnRate.toFixed(2)} <span className="text-sm font-medium text-gray-400">€/day</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Safe Limit</p>
            <p className={`text-base font-bold ${isBurningFast ? 'text-red-500' : 'text-green-500'}`}>
              {recommendedBurn > 0 ? `${recommendedBurn.toFixed(2)} €` : 'Sin ingresos'}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          {isBurningFast
            ? `⚠️ You are spending ${Math.abs(burnRate - recommendedBurn).toFixed(2)}€/day above your safe limit to hit your savings goal.`
            : `✅ Your daily spending is optimal. Keep expenses under ${recommendedBurn.toFixed(2)}€ a day to reach your goals.`}
        </p>
      </div>
    </div>
  );
};
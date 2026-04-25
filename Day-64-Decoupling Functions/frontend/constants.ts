import {
  Coffee, Utensils, Car, Plane, ShoppingBag, Dumbbell,
  Cpu, MonitorPlay, Landmark, CreditCard
} from 'lucide-react';

// ==========================================
// CONSTANTES GLOBALES
// ==========================================

export const API_URL = "https://vdwaba4uy35hpeohz77buz6p640yvslf.lambda-url.eu-north-1.on.aws/";
export const CACHE_KEY = "finai_dashboard_data";

export const COLORS = {
  food: '#f59e0b',
  coffee: '#06b6d4',
  transport: '#f97316',
  travel: '#3b82f6',
  shop: '#ec4899',
  tech: '#8b5cf6',
  leisure: '#4ade80',
  financial: '#ef4444',
  general: '#94a3b8',
};

// ==========================================
// HELPERS
// ==========================================

export const getCategoryDetails = (catName: string) => {
  switch (catName) {
    case 'Coffee':      return { icon: Coffee,     color: COLORS.coffee };
    case 'Food':        return { icon: Utensils,   color: COLORS.food };
    case 'Transport':   return { icon: Car,        color: COLORS.transport };
    case 'Travel':      return { icon: Plane,      color: COLORS.travel };
    case 'Shopping':    return { icon: ShoppingBag,color: COLORS.shop };
    case 'Leisure':     return { icon: Dumbbell,   color: COLORS.leisure };
    case 'Electronics': return { icon: Cpu,        color: COLORS.tech };
    case 'Tech':        return { icon: MonitorPlay,color: COLORS.tech };
    case 'Financial':   return { icon: Landmark,   color: COLORS.financial };
    default:            return { icon: CreditCard, color: COLORS.general };
  }
};

export const getMonthOptions = () => {
  const options = [];
  const start = new Date(2025, 11);
  const end = new Date();
  let current = new Date(start);
  while (current <= end) {
    options.push({
      month: current.getMonth(),
      year: current.getFullYear(),
      label: current.toLocaleString('default', { month: 'long', year: 'numeric' }),
    });
    current.setMonth(current.getMonth() + 1);
  }
  return options.reverse();
};

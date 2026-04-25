// ==========================================
// TIPOS E INTERFACES GLOBALES
// ==========================================

export interface Transaction {
  description: string;
  amount: string | number;
  currency: string;
  transaction_date: string;
  category: string;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  color: string;
  icon: any;
}

export interface FinancialOffer {
  id: string;
  type: string;
  title: string;
  description: string;
  cta_text: string;
  color: string;
}

export interface DashboardData {
  transactions: Transaction[];
  financial_score: number;
  score_short_reasons: string[];
  score_audit_log: string[];
  score_feedback: string;
  projected_spend: number;
  current_streak: number;
  financial_offers: FinancialOffer[];
  dashboard_message: string;
}

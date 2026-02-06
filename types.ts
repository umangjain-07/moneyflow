
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'INVESTMENT';

export interface User {
  id: string;
  username: string;
  passwordHash: string; 
  createdAt: string;
  googleId?: string; // Support OAuth
  photoURL?: string;
  email?: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'BANK' | 'CASH' | 'INVESTMENT';
  currency: string;
  balance: number;
  initialBalance: number;
  color?: string;
}

export interface Category {
  id: string;
  name: string;
  group: string;
  type: 'INCOME' | 'EXPENSE' | 'INVESTMENT';
  necessity?: 'NEED' | 'WANT'; 
  color?: string;
  icon?: string;
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  categoryId: string;
  accountId: string;
  type: TransactionType;
  relatedTransactionId?: string;
  tags?: string[];
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  color: string;
  icon?: string;
}

export interface ImportRule {
  id: string;
  keyword: string; 
  type: 'INCOME' | 'EXPENSE' | 'INVESTMENT';
  targetCategoryId?: string; // New: Direct mapping to existing category
}

export interface SyncConfig {
  type: 'LOCAL' | 'FIREBASE';
  lastSyncedAt?: string;
}

export interface AppSettings {
  currency: 'USD' | 'INR' | 'EUR' | 'GBP';
  currencySymbol: string;
  emergencyFundTargetMonths: number; 
  savingsGoalPercent: number;        
}

export interface FixedCostItem {
  id: string;
  name: string;
  amount: number;
}

export interface CategoryBudgetConfig {
    categoryId: string;
    type: 'FIXED' | 'VARIABLE' | 'IGNORE';
    allocatedAmount: number; // ALWAYS stored as Monthly equivalent for math consistency
    period: 'DAILY' | 'MONTHLY' | 'YEARLY'; // UI state for input preference
}

export interface FinancialPlan {
  salary: number;
  savingsGoal: number;
  startDate: string;
  endDate: string;
  categoryConfigs: CategoryBudgetConfig[];
}

export interface FinancialHealth {
  netWorth: number;
  totalAssets: number;
  totalInvestments: number;
  liquidAssets: number;
  investedAssets: number;
  monthlyBurnRate: number;
  runwayMonths: number;
  savingsRate: number;
  recommendations: string[];
}

export interface AiInsight {
  title: string;
  description: string;
  type: 'TIP' | 'WARNING' | 'OPPORTUNITY';
}

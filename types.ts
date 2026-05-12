

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'INVESTMENT' | 'GOAL';

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
  updatedAt?: string;
  isDeleted?: boolean;
}

export interface Category {
  id: string;
  name: string;
  group: string;
  type: 'INCOME' | 'EXPENSE' | 'INVESTMENT';
  necessity?: 'NEED' | 'WANT'; 
  color?: string;
  icon?: string;
  defaultFrequency?: 'DAILY' | 'MONTHLY_ONCE' | 'MONTHLY_NET' | 'YEARLY';
  defaultInvestmentSubtype?: 'SELF' | 'SPONSORED';
  updatedAt?: string;
  isDeleted?: boolean;
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
  investmentSubtype?: 'SELF' | 'SPONSORED';
  goalId?: string;
  goalContribution?: number;
  sponsoredAmount?: number;
  updatedAt?: string;
  isDeleted?: boolean;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  color: string;
  icon?: string;
  updatedAt?: string;
  isDeleted?: boolean;
}

export interface ImportRule {
  id: string;
  keyword: string; 
  type: 'INCOME' | 'EXPENSE' | 'INVESTMENT';
  targetCategoryId?: string;
  updatedAt?: string;
  isDeleted?: boolean;
}

export interface SyncConfig {
  type: 'LOCAL' | 'FIREBASE';
  lastSyncedAt?: string;
  status?: 'IDLE' | 'SYNCING' | 'ERROR';
}

export interface AppSettings {
  currency: 'USD' | 'INR' | 'EUR' | 'GBP';
  currencySymbol: string;
  emergencyFundTargetMonths: number; 
  savingsGoalPercent: number;
  betaLabEnabled?: boolean;
  updatedAt?: string;
}

export interface FixedCostItem {
  id: string;
  name: string;
  amount: number;
  description?: string;
}

export interface CategoryBudgetConfig {
    categoryId: string;
    type: 'FIXED' | 'VARIABLE' | 'IGNORE' | 'SUBSCRIPTION'; 
    allocatedAmount: number; 
    period: 'DAILY' | 'MONTHLY_ONCE' | 'MONTHLY_NET' | 'YEARLY' | 'CUSTOM'; 
    customFrequencyDays?: number; 
    renewalDate?: string; 
}

export interface BudgetTemplate {
    id: string;
    name: string;
    configs: CategoryBudgetConfig[];
    salary: number;      
    savingsGoal: number; 
}

export interface MonthlyBudgetOverride {
    configs: CategoryBudgetConfig[];
    label?: string;
    linkedTemplateId?: string; 
}

export interface FinancialPlan {
  currency?: string; 
  salary: number;
  isSalaried?: boolean; 
  salaryCategoryId?: string; 
  pfCategoryId?: string; 
  savingsGoal: number;
  startDate: string;
  endDate: string;
  customPeriod?: boolean; 
  categoryConfigs: CategoryBudgetConfig[];
  monthlyOverrides?: Record<string, MonthlyBudgetOverride>; 
  budgetTemplates?: BudgetTemplate[]; 
  activeTemplateId?: string; 
  updatedAt?: string;
}

export interface FinancialHealth {
  netWorth: number;
  totalAssets: number;
  totalInvestments: number;
  liquidAssets: number;
  investedAssets: number;
  goalLockedAssets?: number;
  freeLiquidAssets?: number;
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
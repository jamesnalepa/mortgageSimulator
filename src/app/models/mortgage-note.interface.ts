export interface MortgageNote {
  id: string;
  term: number; // in months, default 36
  totalValue: number; // initial price paid for the note
  interestRate: number; // default 12%
  monthlyPayment: number; // monthly revenue generated from this note
  purchaseMonth: number; // month when note was purchased
  monthsRemaining: number; // months left for this note to generate revenue
  amountRecovered?: number; // amount recovered so far (for current note being repaid)
}

export interface SimulationSettings {
  initialInvestment: number; // default $15,000
  monthlyIncome: number; // cashflow available monthly
  interestRate: number; // default 12%
  simulationMonths: number; // 10 years = 120 months
  maxNoteValue: number; // $75,000 cap
  noteValueMultiplier: number; // 1.5x increase
  startMonth: number; // starting month (1-12)
  startYear: number; // starting year
  noteTermLength: number; // length of each note in months
  maxPersonalExpensePercentage: number; // maximum percentage of monthly income for personal expenses (0-1)
  simulationType: 'mortgage-notes' | 'hysa'; // type of simulation
  hysaApy: number; // HYSA annual percentage yield (0-1)
}

export interface MonthlyReport {
  month: number;
  monthName: string; // "Jan 2024" format
  totalNotes: number;
  activeNotes: MortgageNote[];
  currentNoteBeingRepaid?: MortgageNote;
  monthlyIncome: number;
  monthlyRevenue: number; // total of interest + principal from notes
  monthlyInterest: number; // interest portion only
  monthlyPrincipal: number; // principal portion only
  monthlyPersonalExpense: number; // random personal expense this month
  availableCash: number;
  nextNoteValue: number;
  totalPortfolioValue: number;
  totalIncomeContributed: number; // cumulative personal income added
  totalProfitGenerated: number; // cumulative profit from note interest
  totalPersonalExpenses: number; // cumulative personal expenses
}

// ===== Combined Simulation Interfaces =====

export interface Annuity {
  id: string;
  investmentAmount: number; // initial amount invested
  annualRate: number; // annual interest rate (0-1)
  purchaseMonth: number; // month when annuity was purchased
  term: number; // how long the annuity will generate payments (in months)
  monthsRemaining: number; // months left to generate revenue
  monthlyPayment: number; // calculated monthly payment/interest
  type: 'fixed' | 'variable'; // fixed or variable rate annuity
}

export interface HYSAInvestment {
  id: string;
  investmentAmount: number; // initial amount invested
  currentBalance: number; // current balance in HYSA
  annualRate: number; // annual percentage yield (0-1)
  purchaseMonth: number; // month when HYSA "investment" was made
  totalInterestEarned: number; // cumulative interest earned
}

export interface CombinedInvestment {
  id: string;
  type: 'mortgage-note' | 'hysa' | 'annuity'; // type of investment
  investmentAmount: number; // initial amount invested
  interestRate: number; // annual interest rate (0-1)
  purchaseMonth: number; // month when investment was made
  monthsRemaining: number; // months remaining
  monthlyPayment: number; // monthly revenue generated
  currentBalance?: number; // for HYSA
  totalValue?: number; // for mortgage notes
  term?: number; // for notes and annuities
  amountRecovered?: number; // for notes being tracked for recovery
}

export interface CombinedSimulationSettings {
  initialInvestment: number;
  monthlyIncome: number;
  simulationMonths: number;
  startMonth: number;
  startYear: number;
  maxPersonalExpensePercentage: number;

  // Investment allocation percentages (must total to 100)
  mortgageNotePercentage: number; // percentage of purchases to go to mortgage notes (0-100)
  hysaPercentage: number; // percentage to go to HYSA (0-100)
  annuityPercentage: number; // percentage to go to annuities (0-100)

  // Mortgage note settings
  mortgageNoteInterestRate: number; // annual interest rate for notes (0-1)
  mortgageNoteTermLength: number; // term length in months
  mortgageNoteValueMultiplier: number; // how much to scale note value
  maxNoteValue: number; // max value per note

  // HYSA settings
  hysaApy: number; // annual percentage yield (0-1)

  // Annuity settings
  annuityAnnualRate: number; // annual interest rate for annuities (0-1)
  annuityTermLength: number; // term length in months
}

export interface CombinedMonthlyReport {
  month: number;
  monthName: string;
  monthlyIncome: number;
  monthlyPersonalExpense: number;
  totalInvestments: CombinedInvestment[]; // all active investments
  monthlyRevenue: number; // total revenue from all investments
  monthlyInterest: number; // total interest earned this month
  monthlyPrincipal: number; // principal payments this month (notes only)
  availableCash: number;
  totalInvestedValue: number; // sum of all investment amounts
  totalPortfolioValue: number; // current value of all investments
  totalIncomeContributed: number; // cumulative personal income added
  totalProfitGenerated: number; // cumulative interest/profit earned
  totalPersonalExpenses: number; // cumulative personal expenses
  investmentMix: {
    mortgageNotesValue: number;
    hysaValue: number;
    annuityValue: number;
  };
}

// ===== Investment Tracker Interfaces =====

export interface TrackedInvestment {
  id: string;
  type: 'mortgage-note' | 'hysa' | 'annuity'; // type of investment
  investmentAmount: number; // initial amount invested
  interestRate: number; // annual interest rate (0-1)
  purchaseDate: Date; // date investment was made
  monthlyPayment: number; // monthly revenue/interest generated
  termLengthMonths: number; // total term in months (for notes/annuities)
  monthsRemaining: number; // months left to generate revenue
  currentBalance: number; // current total value
  totalInterestEarned: number; // cumulative interest earned
  status: 'active' | 'completed'; // whether it's still generating revenue
  notes?: string; // any notes about the investment
}

export interface TrackedInvestorSnapshot {
  date: Date;
  totalInvested: number; // total amount invested across all investments
  totalBalance: number; // current total value of all investments
  totalInterestEarned: number; // cumulative interest from all investments
  cashBalance: number; // current available cash
  totalCashflowAdded: number; // cumulative monthly income (paycheck) added
  totalInvestmentReturns: number; // cumulative investment returns added to cash
  netWorth: number; // (totalBalance + cashBalance) - initial capital spent
  activeInvestments: number; // count of active investments
  completedInvestments: number; // count of completed investments
  investmentsByType: {
    mortgageNotes: {
      count: number;
      totalInvested: number;
      totalBalance: number;
      totalInterest: number;
    };
    hysa: {
      count: number;
      totalInvested: number;
      totalBalance: number;
      totalInterest: number;
    };
    annuities: {
      count: number;
      totalInvested: number;
      totalBalance: number;
      totalInterest: number;
    };
  };
}

export interface NetWorthHistory {
  date: Date;
  netWorth: number;
  totalBalance: number;
  totalInvested: number;
  cashBalance: number;
  totalCashflowAdded: number;
  totalInvestmentReturns: number;
}
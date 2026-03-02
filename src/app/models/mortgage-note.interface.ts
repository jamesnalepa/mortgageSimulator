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
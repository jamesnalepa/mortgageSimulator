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
}

export interface MonthlyReport {
  month: number;
  monthName: string; // "Jan 2024" format
  totalNotes: number;
  activeNotes: MortgageNote[];
  currentNoteBeingRepaid?: MortgageNote;
  monthlyIncome: number;
  monthlyRevenue: number; // interest from notes
  availableCash: number;
  nextNoteValue: number;
  totalPortfolioValue: number;
  totalIncomeContributed: number; // cumulative personal income added
  totalProfitGenerated: number; // cumulative profit from note interest
}
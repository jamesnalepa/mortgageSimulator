import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  CombinedSimulationSettings,
  CombinedMonthlyReport,
  CombinedInvestment,
  Annuity,
  HYSAInvestment,
  MortgageNote
} from '../models/mortgage-note.interface';

@Injectable({
  providedIn: 'root'
})
export class CombinedSimulationService {
  private combinedSimulationResults = new BehaviorSubject<CombinedMonthlyReport[]>([]);
  private isSimulationRunning = new BehaviorSubject<boolean>(false);

  public combinedSimulationResults$ = this.combinedSimulationResults.asObservable();
  public isSimulationRunning$ = this.isSimulationRunning.asObservable();

  private defaultSettings: CombinedSimulationSettings = {
    initialInvestment: 15000,
    monthlyIncome: 2000,
    simulationMonths: 120,
    startMonth: new Date().getMonth() + 1,
    startYear: new Date().getFullYear(),
    maxPersonalExpensePercentage: 0.5,
    mortgageNotePercentage: 40,
    hysaPercentage: 40,
    annuityPercentage: 20,
    mortgageNoteInterestRate: 0.12,
    mortgageNoteTermLength: 60,
    mortgageNoteValueMultiplier: 1.5,
    maxNoteValue: 75000,
    hysaApy: 0.045,
    annuityAnnualRate: 0.05,
    annuityTermLength: 120
  };

  constructor() {}

  public runCombinedSimulation(
    settings: Partial<CombinedSimulationSettings>
  ): Observable<CombinedMonthlyReport[]> {
    this.isSimulationRunning.next(true);
    const config = { ...this.defaultSettings, ...settings };

    // Validate percentages add up to 100
    const totalPercentage =
      config.mortgageNotePercentage +
      config.hysaPercentage +
      config.annuityPercentage;
    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new Error('Investment percentages must total 100%');
    }

    const results: CombinedMonthlyReport[] = [];
    let availableCash = config.initialInvestment;
    let investments: CombinedInvestment[] = [];
    let noteCounter = 0;
    let hysaCounter = 0;
    let annuityCounter = 0;
    let nextNoteValue = config.initialInvestment * (config.mortgageNotePercentage / 100);
    let currentNoteBeingRepaid: CombinedInvestment | null = null;
    let amountRecoveredFromCurrentNote = 0;
    let fullyRecoveredNoteIds: Set<string> = new Set();

    let totalIncomeContributed = 0;
    let totalProfitGenerated = 0;
    let totalPersonalExpenses = 0;

    for (let month = 1; month <= config.simulationMonths; month++) {
      // Add monthly income
      availableCash += config.monthlyIncome;
      totalIncomeContributed += config.monthlyIncome;

      // Deduct random personal expenses
      const monthlyPersonalExpense = Math.random() *
        (config.monthlyIncome * config.maxPersonalExpensePercentage);
      availableCash -= monthlyPersonalExpense;
      totalPersonalExpenses += monthlyPersonalExpense;

      // Process revenue from existing investments
      let monthlyInterest = 0;
      let monthlyPrincipal = 0;
      const activeInvestments: CombinedInvestment[] = [];

      investments.forEach(investment => {
        if (investment.monthsRemaining > 0) {
          if (investment.type === 'mortgage-note') {
            const { principal, interest } = this.getMortgageNotePaymentBreakdown(
              investment as MortgageNote
            );
            monthlyInterest += interest;
            monthlyPrincipal += principal;
          } else if (investment.type === 'hysa') {
            const interest = investment.currentBalance! * (investment.interestRate / 12);
            monthlyInterest += interest;
            investment.currentBalance! += interest;
          } else if (investment.type === 'annuity') {
            monthlyInterest += investment.monthlyPayment;
          }
          investment.monthsRemaining--;
          activeInvestments.push(investment);
        }
      });

      availableCash += monthlyInterest + monthlyPrincipal;
      totalProfitGenerated += monthlyInterest;
      investments = activeInvestments;

      // Track recovery of current note being repaid
      const totalCashThisMonth = config.monthlyIncome + monthlyPrincipal + monthlyInterest;
      if (currentNoteBeingRepaid !== null) {
        amountRecoveredFromCurrentNote += totalCashThisMonth;

        // Check if we've recovered enough from current note
        if (amountRecoveredFromCurrentNote >= currentNoteBeingRepaid.investmentAmount) {
          // Mark this note as fully recovered
          fullyRecoveredNoteIds.add(currentNoteBeingRepaid.id);

          // Find the next unrecovered note
          const unrecoveredNotes = investments.filter(
            n => n.type === 'mortgage-note' && !fullyRecoveredNoteIds.has(n.id)
          );
          if (unrecoveredNotes.length > 0) {
            unrecoveredNotes.sort((a, b) => {
              const aNum = parseInt(a.id.split('-')[1]);
              const bNum = parseInt(b.id.split('-')[1]);
              return aNum - bNum;
            });
            currentNoteBeingRepaid = unrecoveredNotes[0];
            amountRecoveredFromCurrentNote = 0;
          } else {
            currentNoteBeingRepaid = null;
            amountRecoveredFromCurrentNote = 0;
          }
        }
      }

      // If we have notes but no current note being tracked, start tracking the oldest unrecovered one
      if (currentNoteBeingRepaid === null && investments.some(n => n.type === 'mortgage-note')) {
        const unrecoveredNotes = investments.filter(
          n => n.type === 'mortgage-note' && !fullyRecoveredNoteIds.has(n.id)
        );
        if (unrecoveredNotes.length > 0) {
          unrecoveredNotes.sort((a, b) => {
            const aNum = parseInt(a.id.split('-')[1]);
            const bNum = parseInt(b.id.split('-')[1]);
            return aNum - bNum;
          });
          currentNoteBeingRepaid = unrecoveredNotes[0];
          amountRecoveredFromCurrentNote = 0;
        }
      }

      // Allocate all available cash to investments based on percentages
      let purchaseableCash = availableCash;
      let noteAllocation =
        (purchaseableCash * config.mortgageNotePercentage) / 100;
      let hysaAllocation =
        (purchaseableCash * config.hysaPercentage) / 100;
      let annuityAllocation =
        (purchaseableCash * config.annuityPercentage) / 100;

      // Try to purchase mortgage notes
      let remainingNoteAllocation = noteAllocation;
      while (remainingNoteAllocation >= 1000) {
        const noteValue = Math.min(
          config.maxNoteValue,
          Math.floor(Math.min(remainingNoteAllocation, nextNoteValue))
        );
        if (noteValue < 1000) break;

        const note = this.createMortgageNote(
          `NOTE-${noteCounter + 1}`,
          noteValue,
          config.mortgageNoteInterestRate,
          month,
          config.mortgageNoteTermLength
        );
        noteCounter++;
        const investmentItem: CombinedInvestment = {
          id: note.id,
          type: 'mortgage-note',
          investmentAmount: note.totalValue,
          interestRate: note.interestRate,
          purchaseMonth: note.purchaseMonth,
          monthsRemaining: note.monthsRemaining,
          monthlyPayment: note.monthlyPayment,
          totalValue: note.totalValue,
          term: note.term
        };
        investments.push(investmentItem);

        // Set as current note being repaid if we don't have one
        if (currentNoteBeingRepaid === null) {
          currentNoteBeingRepaid = investmentItem;
          amountRecoveredFromCurrentNote = 0;
        }

        availableCash -= noteValue;
        remainingNoteAllocation -= noteValue;

        // Check if we should increase note value for NEXT purchase
        // Only increase if current note can be recovered in 3 months
        if (currentNoteBeingRepaid !== null) {
          const futureMonthlyCashFlow = config.monthlyIncome + monthlyPrincipal + monthlyInterest + note.monthlyPayment;
          if ((futureMonthlyCashFlow * 3) >= currentNoteBeingRepaid.investmentAmount && nextNoteValue < config.maxNoteValue) {
            nextNoteValue = Math.min(nextNoteValue * config.mortgageNoteValueMultiplier, config.maxNoteValue);
          }
        }
      }

      // Try to purchase HYSA investments
      if (hysaAllocation >= 100) {
        const hysaAmount = Math.floor(hysaAllocation);
        const hysaInvestment: CombinedInvestment = {
          id: `HYSA-${hysaCounter + 1}`,
          type: 'hysa',
          investmentAmount: hysaAmount,
          interestRate: config.hysaApy,
          purchaseMonth: month,
          monthsRemaining: config.simulationMonths - month + 1,
          monthlyPayment: 0,
          currentBalance: hysaAmount
        };
        hysaCounter++;
        investments.push(hysaInvestment);
        availableCash -= hysaAmount;
      }

      // Try to purchase Annuities
      if (annuityAllocation >= 100) {
        const annuityAmount = Math.floor(annuityAllocation);
        const annuity = this.createAnnuity(
          `ANN-${annuityCounter + 1}`,
          annuityAmount,
          config.annuityAnnualRate,
          month,
          config.annuityTermLength
        );
        annuityCounter++;
        investments.push({
          id: annuity.id,
          type: 'annuity',
          investmentAmount: annuity.investmentAmount,
          interestRate: annuity.annualRate,
          purchaseMonth: annuity.purchaseMonth,
          monthsRemaining: annuity.monthsRemaining,
          monthlyPayment: annuity.monthlyPayment,
          term: annuity.term
        });
        availableCash -= annuityAmount;
      }
      
      // Invest any remaining cash that didn't reach minimum thresholds back into allocated categories
      // Prioritize mortgage notes if there's unspent allocation
      if (availableCash > 0) {
        if (noteAllocation - (noteAllocation - remainingNoteAllocation) < noteAllocation) {
          // There's leftover note allocation, try to buy a smaller note
          if (availableCash >= 100) {
            const remaining = Math.min(availableCash, nextNoteValue);
            if (remaining >= 100) {
              const note = this.createMortgageNote(
                `NOTE-${noteCounter + 1}`,
                remaining,
                config.mortgageNoteInterestRate,
                month,
                config.mortgageNoteTermLength
              );
              noteCounter++;
              const investmentItem: CombinedInvestment = {
                id: note.id,
                type: 'mortgage-note',
                investmentAmount: note.totalValue,
                interestRate: note.interestRate,
                purchaseMonth: note.purchaseMonth,
                monthsRemaining: note.monthsRemaining,
                monthlyPayment: note.monthlyPayment,
                totalValue: note.totalValue,
                term: note.term
              };
              investments.push(investmentItem);
              if (currentNoteBeingRepaid === null) {
                currentNoteBeingRepaid = investmentItem;
              }
              availableCash -= remaining;
            }
          }
        }
      }

      // Calculate investment mix
      const mortgageNotesValue = investments
        .filter(i => i.type === 'mortgage-note')
        .reduce((sum, i) => sum + i.investmentAmount, 0);
      const hysaValue = investments
        .filter(i => i.type === 'hysa')
        .reduce((sum, i) => sum + (i.currentBalance || i.investmentAmount), 0);
      const annuityValue = investments
        .filter(i => i.type === 'annuity')
        .reduce((sum, i) => sum + i.investmentAmount, 0);

      const monthlyReport: CombinedMonthlyReport = {
        month,
        monthName: this.getMonthName(month, config.startMonth, config.startYear),
        monthlyIncome: config.monthlyIncome,
        monthlyPersonalExpense,
        totalInvestments: investments.map(i => ({ ...i })),
        monthlyRevenue: monthlyInterest + monthlyPrincipal,
        monthlyInterest,
        monthlyPrincipal,
        availableCash,
        totalInvestedValue: investments.reduce(
          (sum, i) => sum + i.investmentAmount,
          0
        ),
        totalPortfolioValue:
          mortgageNotesValue + hysaValue + annuityValue + availableCash,
        totalIncomeContributed,
        totalProfitGenerated,
        totalPersonalExpenses,
        investmentMix: {
          mortgageNotesValue,
          hysaValue,
          annuityValue
        }
      };

      results.push(monthlyReport);
    }

    this.combinedSimulationResults.next(results);
    this.isSimulationRunning.next(false);
    return this.combinedSimulationResults$;
  }

  private createMortgageNote(
    id: string,
    totalValue: number,
    interestRate: number,
    purchaseMonth: number,
    term: number
  ): MortgageNote {
    const monthlyRate = interestRate / 12;
    const monthlyPayment =
      (totalValue *
        (monthlyRate * Math.pow(1 + monthlyRate, term))) /
      (Math.pow(1 + monthlyRate, term) - 1);

    return {
      id,
      term,
      totalValue,
      interestRate,
      monthlyPayment,
      purchaseMonth,
      monthsRemaining: term
    };
  }

  private createAnnuity(
    id: string,
    investmentAmount: number,
    annualRate: number,
    purchaseMonth: number,
    term: number
  ): Annuity {
    // Calculate monthly payment using annuity formula
    const monthlyRate = annualRate / 12;
    const monthlyPayment =
      (investmentAmount *
        (monthlyRate * Math.pow(1 + monthlyRate, term))) /
      (Math.pow(1 + monthlyRate, term) - 1);

    return {
      id,
      investmentAmount,
      annualRate,
      purchaseMonth,
      term,
      monthsRemaining: term,
      monthlyPayment,
      type: 'fixed'
    };
  }

  private getMortgageNotePaymentBreakdown(
    note: MortgageNote
  ): { principal: number; interest: number } {
    const monthlyRate = note.interestRate / 12;
    const n = note.monthsRemaining;
    if (n <= 0) return { principal: 0, interest: 0 };

    const balance = this.getRemainingBalance(note);
    const interest = balance * monthlyRate;
    const principal = note.monthlyPayment - interest;
    return { principal, interest };
  }

  private getRemainingBalance(note: MortgageNote): number {
    const monthlyRate = note.interestRate / 12;
    const n = note.monthsRemaining;
    if (n <= 0) return 0;
    return (
      (note.monthlyPayment *
        (1 - Math.pow(1 + monthlyRate, -n))) /
      monthlyRate
    );
  }

  private getMonthName(
    month: number,
    startMonth: number,
    startYear: number
  ): string {
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];

    const totalMonths = startMonth - 1 + (month - 1);
    const actualMonth = totalMonths % 12;
    const actualYear = startYear + Math.floor(totalMonths / 12);

    return `${monthNames[actualMonth]} ${actualYear}`;
  }

  public getCombinedSimulationResults(): CombinedMonthlyReport[] {
    return this.combinedSimulationResults.value;
  }

  public resetCombinedSimulation(): void {
    this.combinedSimulationResults.next([]);
    this.isSimulationRunning.next(false);
  }
}

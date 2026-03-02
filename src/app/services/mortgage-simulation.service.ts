import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { MortgageNote, SimulationSettings, MonthlyReport } from '../models/mortgage-note.interface';

@Injectable({
  providedIn: 'root'
})
export class MortgageSimulationService {
  private simulationResults = new BehaviorSubject<MonthlyReport[]>([]);
  private isSimulationRunning = new BehaviorSubject<boolean>(false);
  
  public simulationResults$ = this.simulationResults.asObservable();
  public isSimulationRunning$ = this.isSimulationRunning.asObservable();

  private defaultSettings: SimulationSettings = {
    initialInvestment: 15000,
    monthlyIncome: 0,
    interestRate: 0.12,
    simulationMonths: 240,
    maxNoteValue: 1000000,
    noteValueMultiplier: 1.5,
    startMonth: new Date().getMonth() + 1, // current month (1-12)
    startYear: new Date().getFullYear(), // current year
    noteTermLength: 60, // default note term length in months
    maxPersonalExpensePercentage: 0.5, // maximum percentage of monthly income for personal expenses (50%)
    simulationType: 'mortgage-notes', // default to mortgage notes
    hysaApy: 0.045 // default 4.5% APY for high yield savings account
  };


  constructor() { }

  // Returns the principal and interest for the current month for a given note
  private getPaymentBreakdown(note: MortgageNote): { principal: number; interest: number } {
    const monthlyRate = note.interestRate / 12;
    const n = note.monthsRemaining;
    if (n <= 0) return { principal: 0, interest: 0 };
    // Remaining balance using amortization formula
    const balance = this.getRemainingBalance(note);
    const interest = balance * monthlyRate;
    const principal = note.monthlyPayment - interest;
    return { principal, interest };
  }

  // Calculates the remaining balance of a note
  private getRemainingBalance(note: MortgageNote): number {
    const monthlyRate = note.interestRate / 12;
    const n = note.monthsRemaining;
    if (n <= 0) return 0;
    return note.monthlyPayment * (1 - Math.pow(1 + monthlyRate, -n)) / monthlyRate;
  }

  public runSimulation(settings: Partial<SimulationSettings>): Observable<MonthlyReport[]> {
    this.isSimulationRunning.next(true);
    
    const config = { ...this.defaultSettings, ...settings };
    
    if (config.simulationType === 'hysa') {
      return this.runHYSASimulation(config);
    } else {
      return this.runMortgageNotesSimulation(config);
    }
  }

  private runMortgageNotesSimulation(config: SimulationSettings): Observable<MonthlyReport[]> {
    const results: MonthlyReport[] = [];
    
    let availableCash = config.initialInvestment;
    let nextNoteValue = config.initialInvestment;
    let notes: MortgageNote[] = [];
    let noteCounter = 0;
    let currentNoteBeingRepaid: MortgageNote | null = null;
    let amountRecoveredFromCurrentNote = 0;
    let fullyRecoveredNoteIds: Set<string> = new Set();
    let totalIncomeContributed = 0;
    let totalProfitGenerated = 0;
    let totalPersonalExpenses = 0;

    for (let month = 1; month <= config.simulationMonths; month++) {
      // Add monthly income
      availableCash += config.monthlyIncome;
      totalIncomeContributed += config.monthlyIncome;

      // Deduct random personal expenses (between $0 and maxPersonalExpensePercentage of monthly income)
      const monthlyPersonalExpense = Math.random() * (config.monthlyIncome * config.maxPersonalExpensePercentage);
      availableCash -= monthlyPersonalExpense;
      totalPersonalExpenses += monthlyPersonalExpense;

      // Calculate monthly interest and principal from existing notes
      let monthlyInterest = 0;
      let monthlyPrincipal = 0;
      const activeNotes: MortgageNote[] = [];
      let notesCompletedThisMonth = 0;

      notes.forEach(note => {
        if (note.monthsRemaining > 0) {
          const { principal, interest } = this.getPaymentBreakdown(note);
          monthlyInterest += interest;
          monthlyPrincipal += principal;
          note.monthsRemaining--;

          if (note.monthsRemaining > 0) {
            activeNotes.push(note);
          } else {
            notesCompletedThisMonth++;
          }
        }
      });

      availableCash += monthlyPrincipal + monthlyInterest;
      totalProfitGenerated += monthlyInterest;
      notes = activeNotes;
      
      // Track recovery of current note investment through monthly income and revenue  
  const totalCashThisMonth = config.monthlyIncome + monthlyPrincipal + monthlyInterest;
      if (currentNoteBeingRepaid !== null) {
        amountRecoveredFromCurrentNote += totalCashThisMonth;
        
        // Check if we've recovered enough from current note
        const note = currentNoteBeingRepaid as MortgageNote;
        if (amountRecoveredFromCurrentNote >= note.totalValue) {
          // Mark this note as fully recovered
          fullyRecoveredNoteIds.add(note.id);
          
          // Find the next unrecovered note in chronological order (by note number)
          const unrecoveredNotes = notes.filter(n => !fullyRecoveredNoteIds.has(n.id));
          if (unrecoveredNotes.length > 0) {
            // Sort by note ID to get chronological order (NOTE-1, NOTE-2, etc.)
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
      if (currentNoteBeingRepaid === null && notes.length > 0) {
        const unrecoveredNotes = notes.filter(n => !fullyRecoveredNoteIds.has(n.id));
        if (unrecoveredNotes.length > 0) {
          // Sort by note ID to get chronological order
          unrecoveredNotes.sort((a, b) => {
            const aNum = parseInt(a.id.split('-')[1]);
            const bNum = parseInt(b.id.split('-')[1]);
            return aNum - bNum;
          });
          currentNoteBeingRepaid = unrecoveredNotes[0];
          amountRecoveredFromCurrentNote = 0;
        }
      }
      

      
      // Try to purchase new notes if we have enough cash
      while (availableCash >= nextNoteValue) {
        // Create the note to calculate its monthly payment
        const potentialNote = this.createMortgageNote(
          `NOTE-${noteCounter + 1}`,
          nextNoteValue,
          config.interestRate,
          month,
          config.noteTermLength
        );
        
        // Actually purchase the note
        noteCounter++;
        notes.push(potentialNote);
        availableCash -= nextNoteValue;
        
        // Set as current note being repaid if we don't have one
        if (currentNoteBeingRepaid === null) {
          currentNoteBeingRepaid = potentialNote;
          amountRecoveredFromCurrentNote = 0;
        }
        
        // Check if we should increase note value for NEXT purchase
        // Only increase if current note being repaid can be recovered in 3 months
        if (currentNoteBeingRepaid !== null) {
          const futureMonthlyCashFlow = config.monthlyIncome + monthlyPrincipal + monthlyInterest + potentialNote.monthlyPayment;
          if ((futureMonthlyCashFlow * 3) >= currentNoteBeingRepaid.totalValue && nextNoteValue < config.maxNoteValue) {
            nextNoteValue = Math.min(nextNoteValue * config.noteValueMultiplier, config.maxNoteValue);
          }
        }
      }
      
      // The current note being repaid is tracked separately
      
      const monthlyReport: MonthlyReport = {
        month,
        monthName: this.getMonthName(month, config.startMonth, config.startYear),
        totalNotes: notes.length,
        activeNotes: notes.map(note => ({ ...note })), // Deep copy to avoid mutation issues
        currentNoteBeingRepaid: currentNoteBeingRepaid ? { 
          ...currentNoteBeingRepaid, 
          amountRecovered: amountRecoveredFromCurrentNote 
        } : undefined,
        monthlyIncome: config.monthlyIncome,
        monthlyRevenue: monthlyInterest + monthlyPrincipal,
        monthlyInterest,
        monthlyPrincipal,
        monthlyPersonalExpense,
        availableCash,
        nextNoteValue,
        totalPortfolioValue: notes.reduce((sum, note) => sum + note.totalValue, 0),
        totalIncomeContributed,
        totalProfitGenerated,
        totalPersonalExpenses
      };
      
      results.push(monthlyReport);
    }
    
    this.simulationResults.next(results);
    this.isSimulationRunning.next(false);
    return this.simulationResults$;
  }

  private runHYSASimulation(config: SimulationSettings): Observable<MonthlyReport[]> {
    const results: MonthlyReport[] = [];
    
    let balance = config.initialInvestment;
    let totalIncomeContributed = 0;
    let totalProfitGenerated = 0;
    let totalPersonalExpenses = 0;
    const monthlyRate = config.hysaApy / 12; // Convert annual to monthly

    for (let month = 1; month <= config.simulationMonths; month++) {
      // Add monthly income
      balance += config.monthlyIncome;
      totalIncomeContributed += config.monthlyIncome;

      // Deduct random personal expenses (between $0 and maxPersonalExpensePercentage of monthly income)
      const monthlyPersonalExpense = Math.random() * (config.monthlyIncome * config.maxPersonalExpensePercentage);
      balance -= monthlyPersonalExpense;
      totalPersonalExpenses += monthlyPersonalExpense;

      // Calculate and add monthly interest based on current balance
      const monthlyInterest = balance * monthlyRate;
      balance += monthlyInterest;
      totalProfitGenerated += monthlyInterest;

      const monthlyReport: MonthlyReport = {
        month,
        monthName: this.getMonthName(month, config.startMonth, config.startYear),
        totalNotes: 0,
        activeNotes: [],
        monthlyIncome: config.monthlyIncome,
        monthlyRevenue: monthlyInterest,
        monthlyInterest,
        monthlyPrincipal: 0,
        monthlyPersonalExpense,
        availableCash: balance,
        nextNoteValue: 0,
        totalPortfolioValue: 0,
        totalIncomeContributed,
        totalProfitGenerated,
        totalPersonalExpenses
      };

      results.push(monthlyReport);
    }

    this.simulationResults.next(results);
    this.isSimulationRunning.next(false);
    return this.simulationResults$;
  }

  private createMortgageNote(id: string, totalValue: number, interestRate: number, purchaseMonth: number, term: number): MortgageNote {
    // const term = 60; // Default 5 years
    const monthlyRate = interestRate / 12;
    
    // Calculate monthly payment using standard loan payment formula
    // This represents the monthly payment the borrower makes (principal + interest)
    const monthlyPayment = totalValue * (monthlyRate * Math.pow(1 + monthlyRate, term)) / 
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

  public getSimulationResults(): MonthlyReport[] {
    return this.simulationResults.value;
  }

  public resetSimulation(): void {
    this.simulationResults.next([]);
    this.isSimulationRunning.next(false);
  }

  private getMonthName(month: number, startMonth: number, startYear: number): string {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Calculate the actual month and year based on simulation month
    const totalMonths = startMonth - 1 + (month - 1); // Convert to 0-based
    const actualMonth = (totalMonths % 12);
    const actualYear = startYear + Math.floor(totalMonths / 12);
    
    return `${monthNames[actualMonth]} ${actualYear}`;
  }
}

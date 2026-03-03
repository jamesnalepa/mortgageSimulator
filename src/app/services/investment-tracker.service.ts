import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  TrackedInvestment,
  TrackedInvestorSnapshot,
  NetWorthHistory
} from '../models/mortgage-note.interface';

@Injectable({
  providedIn: 'root'
})
export class InvestmentTrackerService {
      /** Quickly add cash to available balance */
      addCash(amount: number): void {
        if (amount <= 0) return;
        const newBalance = this.cashBalance.value + amount;
        this.cashBalance.next(newBalance);
        this.updateSnapshots();
        this.saveToLocalStorage();
      }
    /** Bulk import investments without deducting cash */
    importInvestments(investments: Omit<TrackedInvestment, 'id'>[]): void {
      const currentInvestments = this.investments.value;
      const imported = investments.map(inv => ({
        id: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...inv
      }));
      this.investments.next([...currentInvestments, ...imported]);
      this.updateSnapshots();
      this.saveToLocalStorage();
    }
  private investments = new BehaviorSubject<TrackedInvestment[]>([]);
  private snapshots = new BehaviorSubject<TrackedInvestorSnapshot[]>([]);
  private netWorthHistory = new BehaviorSubject<NetWorthHistory[]>([]);
  private cashBalance = new BehaviorSubject<number>(0);
  private monthlyIncome = new BehaviorSubject<number>(0);
  private totalCashflowAdded = new BehaviorSubject<number>(0);
  private totalInvestmentReturns = new BehaviorSubject<number>(0);
  private targetPrice = new BehaviorSubject<number>(5000);
  private currentMonth = new BehaviorSubject<number>(0);

  public investments$ = this.investments.asObservable();
  public snapshots$ = this.snapshots.asObservable();
  public netWorthHistory$ = this.netWorthHistory.asObservable();
  public cashBalance$ = this.cashBalance.asObservable();
  public monthlyIncome$ = this.monthlyIncome.asObservable();
  public totalCashflowAdded$ = this.totalCashflowAdded.asObservable();
  public totalInvestmentReturns$ = this.totalInvestmentReturns.asObservable();
  public targetPrice$ = this.targetPrice.asObservable();
  public currentMonth$ = this.currentMonth.asObservable();

  constructor() {
    this.loadFromLocalStorage();
  }

  addInvestment(investment: Omit<TrackedInvestment, 'id'>): void {
    // Check if there's sufficient cash for this investment
    const currentCash = this.cashBalance.value;
    if (investment.investmentAmount > currentCash) {
      console.warn(`Insufficient cash balance. Need $${investment.investmentAmount}, have $${currentCash}`);
      return;
    }

    const id = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newInvestment: TrackedInvestment = {
      id,
      ...investment
    };

    const currentInvestments = this.investments.value;
    this.investments.next([...currentInvestments, newInvestment]);
    
    // Deduct investment amount from available cash
    const newCashBalance = currentCash - investment.investmentAmount;
    this.cashBalance.next(newCashBalance);
    
    // Update target price if months to next purchase is <= 2
    this.updateTargetPriceIfNeeded();
    
    this.updateSnapshots();
    this.saveToLocalStorage();
  }

  updateInvestment(id: string, updates: Partial<TrackedInvestment>): void {
    const currentInvestments = this.investments.value;
    const index = currentInvestments.findIndex(inv => inv.id === id);
    if (index !== -1) {
      const updated = { ...currentInvestments[index], ...updates };
      currentInvestments[index] = updated;
      this.investments.next([...currentInvestments]);
      this.updateSnapshots();
      this.saveToLocalStorage();
    }
  }

  deleteInvestment(id: string): void {
    const currentInvestments = this.investments.value;
    this.investments.next(currentInvestments.filter(inv => inv.id !== id));
    this.updateSnapshots();
    this.saveToLocalStorage();
  }

  setMonthlyIncome(amount: number): void {
    if (amount < 0) {
      console.warn('Monthly income cannot be negative');
      return;
    }
    this.monthlyIncome.next(amount);
    this.saveToLocalStorage();
  }

  getMonthlyIncome(): number {
    return this.monthlyIncome.value;
  }

  getCashBalance(): number {
    return this.cashBalance.value;
  }

  getTotalCashflowAdded(): number {
    return this.totalCashflowAdded.value;
  }

  getTotalInvestmentReturns(): number {
    return this.totalInvestmentReturns.value;
  }

  getTargetPrice(): number {
    return this.targetPrice.value;
  }

  setTargetPrice(price: number): void {
    if (price > 0) {
      this.targetPrice.next(price);
      this.saveToLocalStorage();
    }
  }

  setCurrentMonth(month: number): void {
    if (month >= 0) {
      this.currentMonth.next(month);
      this.saveToLocalStorage();
    }
  }

  getCurrentMonth(): number {
    return this.currentMonth.value;
  }

  private updateTargetPriceIfNeeded(): void {
    const monthsUntilNextPurchase = this.calculateMonthsUntilNextPurchase();
    if (monthsUntilNextPurchase > 0 && monthsUntilNextPurchase <= 2) {
      const currentTarget = this.targetPrice.value;
      const newTarget = currentTarget * 1.5;
      this.targetPrice.next(newTarget);
    }
  }

  private calculateMonthsUntilNextPurchase(): number {
    const target = this.targetPrice.value;
    const currentCash = this.cashBalance.value;
    
    // If we already have enough cash, return 0
    if (currentCash >= target) {
      return 0;
    }
    
    // Calculate how much more we need
    const deficit = target - currentCash;
    const monthlyCashFlow = this.getTotalMonthlyCashFlow();
    
    // Avoid division by zero
    if (monthlyCashFlow <= 0) {
      return -1; // Indicate we can't reach target with no cash flow
    }
    
    // Calculate months needed to accumulate the deficit
    return Math.ceil(deficit / monthlyCashFlow);
  }

  private getTotalMonthlyCashFlow(): number {
    const monthlyIncome = this.monthlyIncome.value;
    const investments = this.investments.value;
    let monthlyInvestmentReturns = 0;
    
    investments.forEach(inv => {
      if (inv.status === 'active' && inv.monthsRemaining > 0) {
        monthlyInvestmentReturns += inv.monthlyPayment;
      }
    });
    
    return monthlyIncome + monthlyInvestmentReturns;
  }

  processMonthlyAccrual(): void {
    const currentInvestments = this.investments.value;
    const now = new Date();
    let totalMonthlyReturns = 0; // Track total returns (principal + interest) from investments

    const updated = currentInvestments.map(inv => {
      if (inv.status === 'completed') {
        return inv;
      }

      let monthlyInterest = 0;
      let monthlyPrincipal = 0;
      let newBalance = inv.currentBalance;

      if (inv.type === 'mortgage-note') {
        // Mortgage notes: monthly payment includes both principal and interest
        // Interest = current balance * (annual rate / 12)
        // Principal = monthly payment - interest
        // Balance decreases as principal is paid back
        const monthlyRate = inv.interestRate / 12;
        monthlyInterest = inv.currentBalance * monthlyRate;
        monthlyPrincipal = inv.monthlyPayment - monthlyInterest;
        newBalance = Math.max(0, inv.currentBalance - monthlyPrincipal);

        const totalMonthlyReturn = monthlyInterest + monthlyPrincipal;
        totalMonthlyReturns += totalMonthlyReturn; // Add both to total returns
      } else if (inv.type === 'hysa') {
        // HYSA: Works like a savings account with monthly withdrawals
        // Interest = current balance * monthly compounded rate
        // Principal = monthly payment - interest (the portion of withdrawal that comes from principal)
        // Balance decreases as both principal and interest are withdrawn
        const monthlyRate = Math.pow(1 + inv.interestRate, 1/12) - 1;
        monthlyInterest = inv.currentBalance * monthlyRate;
        monthlyPrincipal = inv.monthlyPayment - monthlyInterest;
        newBalance = Math.max(0, inv.currentBalance - monthlyPrincipal);

        // Total return = full monthly withdrawal amount (principal + interest earned this month)
        const totalMonthlyReturn = monthlyInterest + monthlyPrincipal;
        totalMonthlyReturns += totalMonthlyReturn; // Add full withdrawal to available cash
      } else if (inv.type === 'annuity') {
        // Annuity: Monthly payment includes both principal return and interest
        // Interest = current balance * (annual rate / 12)
        // Principal = monthly payment - interest
        // Balance decreases as principal is returned
        const monthlyRate = inv.interestRate / 12;
        monthlyInterest = inv.currentBalance * monthlyRate;
        monthlyPrincipal = inv.monthlyPayment - monthlyInterest;
        newBalance = Math.max(0, inv.currentBalance - monthlyPrincipal);

        // Total return = full monthly payment (principal + interest)
        const totalMonthlyReturn = monthlyInterest + monthlyPrincipal;
        totalMonthlyReturns += totalMonthlyReturn; // Add full payment to available cash
      }
      
      const monthsRemaining = Math.max(0, inv.monthsRemaining - 1);

      return {
        ...inv,
        currentBalance: newBalance,
        totalInterestEarned: inv.totalInterestEarned + monthlyInterest,
        monthsRemaining,
        status: monthsRemaining === 0 ? ('completed' as const) : ('active' as const)
      };
    });

    this.investments.next(updated);
    
    // Add monthly income from paycheck to cash balance
    const monthlyIncomeAmount = this.monthlyIncome.value;
    
    // Add both monthly income AND investment returns (principal + interest) to cash balance
    const totalCashAddition = monthlyIncomeAmount + totalMonthlyReturns;
    const newCashBalance = this.cashBalance.value + totalCashAddition;
    this.cashBalance.next(newCashBalance);
    
    // Update total cashflow added (only from actual paycheck income, not investment returns)
    const newTotalCashflow = this.totalCashflowAdded.value + monthlyIncomeAmount;
    this.totalCashflowAdded.next(newTotalCashflow);
    
    // Track total investment returns accumulated (principal + interest combined)
    const newTotalReturns = this.totalInvestmentReturns.value + totalMonthlyReturns;
    this.totalInvestmentReturns.next(newTotalReturns);
    
    this.updateSnapshots();
    this.saveToLocalStorage();
  }

  private updateSnapshots(): void {
    const investments = this.investments.value;
    const now = new Date();

    // Calculate current snapshot
    const mortgageNotes = investments.filter(i => i.type === 'mortgage-note');
    const hysas = investments.filter(i => i.type === 'hysa');
    const annuities = investments.filter(i => i.type === 'annuity');

    const calculateTypeStats = (items: TrackedInvestment[]) => ({
      count: items.length,
      totalInvested: items.reduce((sum, i) => sum + i.investmentAmount, 0),
      totalBalance: items.reduce((sum, i) => sum + i.currentBalance, 0),
      totalInterest: items.reduce((sum, i) => sum + i.totalInterestEarned, 0)
    });

    const totalInvested = investments.reduce(
      (sum, i) => sum + i.investmentAmount,
      0
    );
    const totalBalance = investments.reduce(
      (sum, i) => sum + i.currentBalance,
      0
    );
    const totalInterestEarned = investments.reduce(
      (sum, i) => sum + i.totalInterestEarned,
      0
    );
    const currentCash = this.cashBalance.value;
    const totalCashflow = this.totalCashflowAdded.value;
    const totalReturns = this.totalInvestmentReturns.value;

    const snapshot: TrackedInvestorSnapshot = {
      date: now,
      totalInvested,
      totalBalance,
      totalInterestEarned,
      cashBalance: currentCash,
      totalCashflowAdded: totalCashflow,
      totalInvestmentReturns: totalReturns,
        netWorth: totalBalance + currentCash,
      activeInvestments: investments.filter(i => i.status === 'active').length,
      completedInvestments: investments.filter(i => i.status === 'completed')
        .length,
      investmentsByType: {
        mortgageNotes: calculateTypeStats(mortgageNotes),
        hysa: calculateTypeStats(hysas),
        annuities: calculateTypeStats(annuities)
      }
    };

    const currentSnapshots = this.snapshots.value;
    this.snapshots.next([...currentSnapshots, snapshot]);

    // Update net worth history
    const currentHistory = this.netWorthHistory.value;
    const historyEntry: NetWorthHistory = {
      date: now,
      netWorth: snapshot.netWorth,
      totalBalance: snapshot.totalBalance,
      totalInvested: snapshot.totalInvested,
      cashBalance: currentCash,
      totalCashflowAdded: totalCashflow,
      totalInvestmentReturns: totalReturns
    };
    this.netWorthHistory.next([...currentHistory, historyEntry]);
  }

  getCurrentSnapshot(): TrackedInvestorSnapshot | null {
    const snapshots = this.snapshots.value;
    return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  }

  getInvestments(): TrackedInvestment[] {
    return this.investments.value;
  }

  getNetWorthHistory(): NetWorthHistory[] {
    return this.netWorthHistory.value;
  }

  getSnapshots(): TrackedInvestorSnapshot[] {
    return this.snapshots.value;
  }

  resetAll(): void {
    this.investments.next([]);
    this.snapshots.next([]);
    this.netWorthHistory.next([]);
    this.cashBalance.next(0);
    this.totalCashflowAdded.next(0);
    this.totalInvestmentReturns.next(0);
    this.targetPrice.next(5000);
    this.currentMonth.next(0);
    this.saveToLocalStorage();
  }

  private saveToLocalStorage(): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      const data = {
        investments: this.investments.value,
        snapshots: this.snapshots.value,
        netWorthHistory: this.netWorthHistory.value,
        cashBalance: this.cashBalance.value,
        monthlyIncome: this.monthlyIncome.value,
        totalCashflowAdded: this.totalCashflowAdded.value,
        totalInvestmentReturns: this.totalInvestmentReturns.value,
        targetPrice: this.targetPrice.value,
        currentMonth: this.currentMonth.value
      };
      localStorage.setItem('investmentTrackerData', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save to local storage', e);
    }
  }

  private loadFromLocalStorage(): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      const data = localStorage.getItem('investmentTrackerData');
      if (data) {
        const parsed = JSON.parse(data);
        // Convert date strings back to Date objects
        const investments = (parsed.investments || []).map((inv: any) => ({
          ...inv,
          purchaseDate: new Date(inv.purchaseDate)
        }));
        const snapshots = (parsed.snapshots || []).map((snap: any) => ({
          ...snap,
          date: new Date(snap.date)
        }));
        const netWorthHistory = (parsed.netWorthHistory || []).map((h: any) => ({
          ...h,
          date: new Date(h.date)
        }));

        this.investments.next(investments);
        this.snapshots.next(snapshots);
        this.netWorthHistory.next(netWorthHistory);
        this.cashBalance.next(parsed.cashBalance || 0);
        this.monthlyIncome.next(parsed.monthlyIncome || 0);
        this.totalCashflowAdded.next(parsed.totalCashflowAdded || 0);
        this.totalInvestmentReturns.next(parsed.totalInvestmentReturns || 0);
        this.targetPrice.next(parsed.targetPrice || 5000);
        this.currentMonth.next(parsed.currentMonth || 0);
      }
    } catch (e) {
      console.error('Failed to load from local storage', e);
    }
  }
}

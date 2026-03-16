import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  TrackedInvestment,
  TrackedInvestorSnapshot,
  NetWorthHistory,
  TrackerEvent,
  TrackerEventType
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
        this.logEvent('cash-added', `Added ${this.fmt(amount)} cash. New balance: ${this.fmt(newBalance)}`, amount);
        this.updateSnapshots();
        this.saveToLocalStorage();
      }
    /** Bulk import investments without deducting cash */
    importInvestments(investments: Omit<TrackedInvestment, 'id'>[]): void {
      const currentInvestments = this.investments.value;
      const imported = investments.map(inv => ({
        id: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...inv,
        locFinancedAmount: inv.locFinancedAmount ?? 0
      }));
      this.investments.next([...currentInvestments, ...imported]);
      this.logEvent('data-imported',
        `Imported ${imported.length} investment${imported.length !== 1 ? 's' : ''} from CSV`,
        undefined, { count: imported.length });
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
  private locBalance = new BehaviorSubject<number>(0);
  private locLimit = new BehaviorSubject<number>(0);
  private locInterestRate = new BehaviorSubject<number>(0); // annual rate (0-1)
  private totalLocInterestPaid = new BehaviorSubject<number>(0);
  private eventLog = new BehaviorSubject<TrackerEvent[]>([]);
  private undoStack = new BehaviorSubject<any[]>([]); // max 12 states, most-recent first

  public investments$ = this.investments.asObservable();
  public snapshots$ = this.snapshots.asObservable();
  public netWorthHistory$ = this.netWorthHistory.asObservable();
  public cashBalance$ = this.cashBalance.asObservable();
  public monthlyIncome$ = this.monthlyIncome.asObservable();
  public totalCashflowAdded$ = this.totalCashflowAdded.asObservable();
  public totalInvestmentReturns$ = this.totalInvestmentReturns.asObservable();
  public targetPrice$ = this.targetPrice.asObservable();
  public currentMonth$ = this.currentMonth.asObservable();
  public locBalance$ = this.locBalance.asObservable();
  public locLimit$ = this.locLimit.asObservable();
  public locInterestRate$ = this.locInterestRate.asObservable();
  public totalLocInterestPaid$ = this.totalLocInterestPaid.asObservable();
  public eventLog$ = this.eventLog.asObservable();
  public canUndo$ = this.undoStack.asObservable();

  constructor() {
    this.loadFromLocalStorage();
  }

  addInvestment(investment: Omit<TrackedInvestment, 'id'>): void {
    const locFinanced = investment.locFinancedAmount ?? 0;
    const cashRequired = investment.investmentAmount - locFinanced;

    // Validate LOC financing
    if (locFinanced > 0) {
      const availableCredit = this.locLimit.value - this.locBalance.value;
      if (locFinanced > availableCredit) {
        console.warn(`LOC draw $${locFinanced} exceeds available credit $${availableCredit}`);
        return;
      }
    }

    // Validate cash for the non-LOC portion
    const currentCash = this.cashBalance.value;
    if (cashRequired > currentCash) {
      console.warn(`Insufficient cash. Need $${cashRequired}, have $${currentCash}`);
      return;
    }

    const id = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newInvestment: TrackedInvestment = { id, ...investment, locFinancedAmount: locFinanced };

    const currentInvestments = this.investments.value;
    this.investments.next([...currentInvestments, newInvestment]);

    // Draw LOC-financed portion (adds to cash then deducted below)
    if (locFinanced > 0) {
      this.locBalance.next(this.locBalance.value + locFinanced);
    }

    // Deduct full investment amount from cash (which now includes the LOC draw)
    this.cashBalance.next(currentCash + locFinanced - investment.investmentAmount);

    // Log event
    const typeLabelMap: Record<string, string> = { 'mortgage-note': 'Mortgage Note', 'hysa': 'HYSA', 'annuity': 'Annuity' };
    const typeLabel = typeLabelMap[investment.type] || investment.type;
    let desc = `Added ${typeLabel} — ${this.fmt(investment.investmentAmount)} invested`;
    if (locFinanced > 0) {
      const locPct = ((locFinanced / investment.investmentAmount) * 100).toFixed(0);
      desc += `. LOC financed: ${this.fmt(locFinanced)} (${locPct}% of total, LOC balance now ${this.fmt(this.locBalance.value)})`;
    }
    this.logEvent('investment-added', desc, investment.investmentAmount, {
      type: investment.type,
      locFinanced,
      cashPortion: cashRequired,
      locBalanceAfter: this.locBalance.value
    });

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
    const target = currentInvestments.find(inv => inv.id === id);
    this.investments.next(currentInvestments.filter(inv => inv.id !== id));
    if (target) {
      const typeLabelMap: Record<string, string> = { 'mortgage-note': 'Mortgage Note', 'hysa': 'HYSA', 'annuity': 'Annuity' };
      this.logEvent('investment-deleted',
        `Deleted ${typeLabelMap[target.type] || target.type} — original amount ${this.fmt(target.investmentAmount)}`,
        target.investmentAmount);
    }
    this.updateSnapshots();
    this.saveToLocalStorage();
  }

  setMonthlyIncome(amount: number): void {
    if (amount < 0) {
      console.warn('Monthly income cannot be negative');
      return;
    }
    this.monthlyIncome.next(amount);
    this.logEvent('income-set', `Monthly income set to ${this.fmt(amount)}/month`, amount);
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

  configureLoc(limit: number, annualRate: number): void {
    if (limit >= 0 && annualRate >= 0) {
      this.locLimit.next(limit);
      this.locInterestRate.next(annualRate);
      this.logEvent('loc-configured',
        `Line of Credit configured — limit ${this.fmt(limit)} at ${(annualRate * 100).toFixed(2)}% APR`,
        limit, { annualRatePct: annualRate * 100 });
      this.saveToLocalStorage();
    }
  }

  restoreLocState(limit: number, annualRate: number, balance: number, totalInterestPaid: number): void {
    this.locLimit.next(limit);
    this.locInterestRate.next(annualRate);
    this.locBalance.next(balance);
    this.totalLocInterestPaid.next(totalInterestPaid);
    this.updateSnapshots();
    this.saveToLocalStorage();
  }

  drawFromLoc(amount: number): void {
    const available = this.locLimit.value - this.locBalance.value;
    if (amount <= 0 || amount > available) {
      console.warn(`Cannot draw $${amount} from LOC. Available credit: $${available}`);
      return;
    }
    this.locBalance.next(this.locBalance.value + amount);
    this.cashBalance.next(this.cashBalance.value + amount);
    this.logEvent('loc-draw',
      `Drew ${this.fmt(amount)} from Line of Credit. Outstanding balance: ${this.fmt(this.locBalance.value)}`,
      amount, { locBalanceAfter: this.locBalance.value, availableCreditAfter: this.locLimit.value - this.locBalance.value });
    this.updateSnapshots();
    this.saveToLocalStorage();
  }

  repayLoc(amount: number): void {
    const balance = this.locBalance.value;
    const cash = this.cashBalance.value;
    const repayAmount = Math.min(amount, balance, cash);
    if (repayAmount <= 0) return;

    // Reduce global LOC balance and cash
    this.locBalance.next(balance - repayAmount);
    this.cashBalance.next(cash - repayAmount);
    this.logEvent('loc-repay',
      `Repaid ${this.fmt(repayAmount)} to Line of Credit. Remaining balance: ${this.fmt(this.locBalance.value)}`,
      repayAmount, { locBalanceAfter: this.locBalance.value });

    // Proportionally reduce locFinancedAmount across investments
    const investments = this.investments.value;
    const totalTracked = investments.reduce((sum, inv) => sum + (inv.locFinancedAmount ?? 0), 0);
    if (totalTracked > 0) {
      const updated = investments.map(inv => {
        const financed = inv.locFinancedAmount ?? 0;
        if (financed <= 0) return inv;
        const reduction = repayAmount * (financed / totalTracked);
        return { ...inv, locFinancedAmount: Math.max(0, financed - reduction) };
      });
      this.investments.next(updated);
    }

    this.updateSnapshots();
    this.saveToLocalStorage();
  }

  getLocBalance(): number {
    return this.locBalance.value;
  }

  getLocLimit(): number {
    return this.locLimit.value;
  }

  getAvailableCredit(): number {
    return Math.max(0, this.locLimit.value - this.locBalance.value);
  }

  getLocInterestRate(): number {
    return this.locInterestRate.value;
  }

  getMonthlyLocInterest(): number {
    return this.locBalance.value * (this.locInterestRate.value / 12);
  }

  getTotalLocInterestPaid(): number {
    return this.totalLocInterestPaid.value;
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
    // Snapshot full state before mutating so it can be restored
    this.pushUndoState();

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

    // Log any investments that just completed
    const typeLabelMap: Record<string, string> = { 'mortgage-note': 'Mortgage Note', 'hysa': 'HYSA', 'annuity': 'Annuity' };
    updated.forEach((inv, i) => {
      if (inv.status === 'completed' && currentInvestments[i]?.status === 'active') {
        this.logEvent('investment-completed',
          `${typeLabelMap[inv.type] || inv.type} completed — original ${this.fmt(inv.investmentAmount)}, total interest earned ${this.fmt(inv.totalInterestEarned)}`,
          inv.investmentAmount);
      }
    });

    this.investments.next(updated);
    
    // Add monthly income from paycheck to cash balance
    const monthlyIncomeAmount = this.monthlyIncome.value;
    
    // Add both monthly income AND investment returns (principal + interest) to cash balance
    const totalCashAddition = monthlyIncomeAmount + totalMonthlyReturns;
    const newCashBalance = this.cashBalance.value + totalCashAddition;
    this.cashBalance.next(newCashBalance);

    // Deduct LOC monthly interest from cash
    const locBal = this.locBalance.value;
    if (locBal > 0) {
      const monthlyLocInterest = locBal * (this.locInterestRate.value / 12);
      const cashAfterLocInterest = Math.max(0, this.cashBalance.value - monthlyLocInterest);
      this.cashBalance.next(cashAfterLocInterest);
      this.totalLocInterestPaid.next(this.totalLocInterestPaid.value + monthlyLocInterest);
    }
    
    // Update total cashflow added (only from actual paycheck income, not investment returns)
    const newTotalCashflow = this.totalCashflowAdded.value + monthlyIncomeAmount;
    this.totalCashflowAdded.next(newTotalCashflow);
    
    // Track total investment returns accumulated (principal + interest combined)
    const newTotalReturns = this.totalInvestmentReturns.value + totalMonthlyReturns;
    this.totalInvestmentReturns.next(newTotalReturns);

    // Build month-processed event description
    const monthNum = this.currentMonth.value;
    const locInterestThisMonth = locBal > 0 ? locBal * (this.locInterestRate.value / 12) : 0;
    let monthDesc = `Month ${monthNum} processed — income +${this.fmt(monthlyIncomeAmount)}, investment returns +${this.fmt(totalMonthlyReturns)}`;
    if (locInterestThisMonth > 0) {
      monthDesc += `, LOC interest -${this.fmt(locInterestThisMonth)} (balance ${this.fmt(this.locBalance.value)})`;
    }
    this.logEvent('month-processed', monthDesc, totalMonthlyReturns + monthlyIncomeAmount, {
      monthlyIncome: monthlyIncomeAmount,
      investmentReturns: totalMonthlyReturns,
      locInterestPaid: locInterestThisMonth
    });

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
    const locBal = this.locBalance.value;
    const locLim = this.locLimit.value;
    const locRate = this.locInterestRate.value;
    const locInterestPaid = this.totalLocInterestPaid.value;

    const snapshot: TrackedInvestorSnapshot = {
      date: now,
      totalInvested,
      totalBalance,
      totalInterestEarned,
      cashBalance: currentCash,
      totalCashflowAdded: totalCashflow,
      totalInvestmentReturns: totalReturns,
        netWorth: totalBalance + currentCash - locBal,
      activeInvestments: investments.filter(i => i.status === 'active').length,
      completedInvestments: investments.filter(i => i.status === 'completed')
        .length,
      locBalance: locBal,
      locLimit: locLim,
      locInterestRate: locRate,
      totalLocInterestPaid: locInterestPaid,
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
      totalInvestmentReturns: totalReturns,
      locBalance: locBal,
      totalLocInterestPaid: locInterestPaid
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
    this.locBalance.next(0);
    this.locLimit.next(0);
    this.locInterestRate.next(0);
    this.totalLocInterestPaid.next(0);
    this.undoStack.next([]);
    this.eventLog.next([{ id: `EVT-${Date.now()}`, type: 'reset', date: new Date(), month: 0, description: 'All tracker data reset.' }]);
    this.saveToLocalStorage();
  }

  canUndo(): boolean {
    return this.undoStack.value.length > 0;
  }

  undoLastMonth(): void {
    const stack = this.undoStack.value;
    if (stack.length === 0) return;
    const [prev, ...rest] = stack;
    this.investments.next((prev.investments || []).map((inv: any) => ({ ...inv, purchaseDate: new Date(inv.purchaseDate) })));
    this.cashBalance.next(prev.cashBalance);
    this.monthlyIncome.next(prev.monthlyIncome);
    this.totalCashflowAdded.next(prev.totalCashflowAdded);
    this.totalInvestmentReturns.next(prev.totalInvestmentReturns);
    this.targetPrice.next(prev.targetPrice);
    this.currentMonth.next(prev.currentMonth);
    this.locBalance.next(prev.locBalance);
    this.totalLocInterestPaid.next(prev.totalLocInterestPaid);
    this.undoStack.next(rest);
    // Restore event log but append an undo marker
    const restoredLog = (prev.eventLog || []).map((e: any) => ({ ...e, date: new Date(e.date) }));
    const undoEvent: TrackerEvent = {
      id: `EVT-${Date.now()}`,
      type: 'month-processed',
      date: new Date(),
      month: prev.currentMonth,
      description: `↩ Month ${prev.currentMonth + 1} unprocessed — state restored to Month ${prev.currentMonth}`
    };
    this.eventLog.next([undoEvent, ...restoredLog]);
    this.updateSnapshots();
    this.saveToLocalStorage();
  }

  private pushUndoState(): void {
    const state = {
      investments: this.investments.value.map(inv => ({ ...inv })),
      cashBalance: this.cashBalance.value,
      monthlyIncome: this.monthlyIncome.value,
      totalCashflowAdded: this.totalCashflowAdded.value,
      totalInvestmentReturns: this.totalInvestmentReturns.value,
      targetPrice: this.targetPrice.value,
      currentMonth: this.currentMonth.value,
      locBalance: this.locBalance.value,
      totalLocInterestPaid: this.totalLocInterestPaid.value,
      eventLog: this.eventLog.value
    };
    const stack = [state, ...this.undoStack.value].slice(0, 12); // keep at most 12 undo states
    this.undoStack.next(stack);
  }

  private logEvent(type: TrackerEventType, description: string, amount?: number, meta?: Record<string, string | number | boolean>): void {
    const event: TrackerEvent = {
      id: `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      type,
      date: new Date(),
      month: this.currentMonth.value,
      description,
      amount,
      meta
    };
    this.eventLog.next([event, ...this.eventLog.value]);
  }

  private fmt(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
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
        currentMonth: this.currentMonth.value,
        locBalance: this.locBalance.value,
        locLimit: this.locLimit.value,
        locInterestRate: this.locInterestRate.value,
        totalLocInterestPaid: this.totalLocInterestPaid.value,
        eventLog: this.eventLog.value,
        undoStack: this.undoStack.value
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
          purchaseDate: new Date(inv.purchaseDate),
          locFinancedAmount: inv.locFinancedAmount ?? 0
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
        this.locBalance.next(parsed.locBalance || 0);
        this.locLimit.next(parsed.locLimit || 0);
        this.locInterestRate.next(parsed.locInterestRate || 0);
        this.totalLocInterestPaid.next(parsed.totalLocInterestPaid || 0);
        const eventLog = (parsed.eventLog || []).map((e: any) => ({ ...e, date: new Date(e.date) }));
        this.eventLog.next(eventLog);
        this.undoStack.next(parsed.undoStack || []);
      }
    } catch (e) {
      console.error('Failed to load from local storage', e);
    }
  }
}

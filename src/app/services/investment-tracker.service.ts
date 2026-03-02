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
  private investments = new BehaviorSubject<TrackedInvestment[]>([]);
  private snapshots = new BehaviorSubject<TrackedInvestorSnapshot[]>([]);
  private netWorthHistory = new BehaviorSubject<NetWorthHistory[]>([]);

  public investments$ = this.investments.asObservable();
  public snapshots$ = this.snapshots.asObservable();
  public netWorthHistory$ = this.netWorthHistory.asObservable();

  constructor() {
    this.loadFromLocalStorage();
  }

  addInvestment(investment: Omit<TrackedInvestment, 'id'>): void {
    const id = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newInvestment: TrackedInvestment = {
      id,
      ...investment
    };

    const currentInvestments = this.investments.value;
    this.investments.next([...currentInvestments, newInvestment]);
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

  processMonthlyAccrual(): void {
    const currentInvestments = this.investments.value;
    const now = new Date();

    const updated = currentInvestments.map(inv => {
      if (inv.status === 'completed') {
        return inv;
      }

      // Calculate monthly interest using proper APY compounding formula
      // For HYSA/Annuities: monthly rate = (1 + APY)^(1/12) - 1
      // For Mortgage Notes: uses amortization (handled separately)
      let monthlyRate: number;
      if (inv.type === 'mortgage-note') {
        // Mortgage notes use amortization formula (simple interest on remaining balance)
        monthlyRate = inv.interestRate / 12;
      } else {
        // HYSA and Annuities use compound APY formula
        monthlyRate = Math.pow(1 + inv.interestRate, 1/12) - 1;
      }

      const monthlyInterest = inv.currentBalance * monthlyRate;
      const newBalance = inv.currentBalance + monthlyInterest;
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

    const snapshot: TrackedInvestorSnapshot = {
      date: now,
      totalInvested,
      totalBalance,
      totalInterestEarned,
      netWorth: totalBalance - totalInvested + totalInterestEarned,
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
      totalInvested: snapshot.totalInvested
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
        netWorthHistory: this.netWorthHistory.value
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
      }
    } catch (e) {
      console.error('Failed to load from local storage', e);
    }
  }
}

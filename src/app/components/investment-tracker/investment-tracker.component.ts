import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { InvestmentTrackerService } from '../../services/investment-tracker.service';
import {
  TrackedInvestment,
  TrackedInvestorSnapshot,
  NetWorthHistory,
  TrackerEvent
} from '../../models/mortgage-note.interface';

@Component({
  selector: 'app-investment-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './investment-tracker.component.html',
  styleUrl: './investment-tracker.component.css'
})
export class InvestmentTrackerComponent implements OnInit, OnDestroy {
  readonly Math = Math;
  investmentForm: FormGroup;
  cashflowForm: FormGroup;
  locForm: FormGroup;
  investments: TrackedInvestment[] = [];
  currentSnapshot: TrackedInvestorSnapshot | null = null;
  netWorthHistory: NetWorthHistory[] = [];
  currentMonth: number = 0;
  trackerStartDate: Date = new Date();
  cashBalance: number = 0;
  monthlyIncome: number = 0;
  targetPrice: number = 5000;
  investmentError: string = '';
  addCashAmount: number = 0;
  locBalance: number = 0;
  locLimit: number = 0;
  locInterestRate: number = 0;
  totalLocInterestPaid: number = 0;
  locDrawAmount: number = 0;
  locRepayAmount: number = 0;
  eventLog: TrackerEvent[] = [];
  showAllEvents: boolean = false;
  canUndo: boolean = false;
  monthlyExpenses: number = 0;
  private subscriptions = new Subscription();

  constructor(
    private fb: FormBuilder,
    private trackerService: InvestmentTrackerService
  ) {
    this.investmentForm = this.fb.group({
      type: ['mortgage-note', [Validators.required]],
      investmentAmount: [10000, [Validators.required, Validators.min(100)]],
      interestRate: [12, [Validators.required, Validators.min(0.1), Validators.max(50)]],
      monthlyPayment: [0, [Validators.required, Validators.min(0)]],
      termLengthMonths: [60, [Validators.required, Validators.min(1), Validators.max(360)]],
      locFinancedAmount: [0, [Validators.min(0)]],
      notes: ['']
    });

    this.cashflowForm = this.fb.group({
      monthlyIncome: [5000, [Validators.required, Validators.min(0)]],
      monthlyExpenses: [0, [Validators.required, Validators.min(0)]]
    });

    this.locForm = this.fb.group({
      locLimit: [0, [Validators.required, Validators.min(0)]],
      locInterestRate: [8, [Validators.required, Validators.min(0), Validators.max(50)]]
    });

    this.addCashAmount = 0;
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.trackerService.investments$.subscribe(investments => {
        this.investments = investments;
      })
    );

    this.subscriptions.add(
      this.trackerService.snapshots$.subscribe(snapshots => {
        this.currentSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
      })
    );

    this.subscriptions.add(
      this.trackerService.netWorthHistory$.subscribe(history => {
        this.netWorthHistory = history;
      })
    );

    this.subscriptions.add(
      this.trackerService.cashBalance$.subscribe(balance => {
        this.cashBalance = balance;
      })
    );

    this.subscriptions.add(
      this.trackerService.monthlyIncome$.subscribe(income => {
        this.monthlyIncome = income;
        this.cashflowForm.patchValue({ monthlyIncome: income });
      })
    );

    this.subscriptions.add(
      this.trackerService.monthlyExpenses$.subscribe(expenses => {
        this.monthlyExpenses = expenses;
        this.cashflowForm.patchValue({ monthlyExpenses: expenses });
      })
    );

    this.subscriptions.add(
      this.trackerService.targetPrice$.subscribe(price => {
        this.targetPrice = price;
      })
    );

    this.subscriptions.add(
      this.trackerService.locBalance$.subscribe(balance => {
        this.locBalance = balance;
      })
    );

    this.subscriptions.add(
      this.trackerService.locLimit$.subscribe(limit => {
        this.locLimit = limit;
        this.locForm.patchValue({ locLimit: limit });
      })
    );

    this.subscriptions.add(
      this.trackerService.locInterestRate$.subscribe(rate => {
        this.locInterestRate = rate;
        this.locForm.patchValue({ locInterestRate: rate * 100 });
      })
    );

    this.subscriptions.add(
      this.trackerService.totalLocInterestPaid$.subscribe(paid => {
        this.totalLocInterestPaid = paid;
      })
    );

    this.subscriptions.add(
      this.trackerService.eventLog$.subscribe(log => {
        this.eventLog = log;
      })
    );

    this.subscriptions.add(
      this.trackerService.canUndo$.subscribe(stack => {
        this.canUndo = stack.length > 0;
      })
    );

    this.subscriptions.add(
      this.trackerService.currentMonth$.subscribe(month => {
        this.currentMonth = month;
      })
    );

    // Update monthly on form type change to calculate monthly payment
    this.investmentForm.get('type')?.valueChanges.subscribe(() => {
      this.calculateMonthlyPayment();
    });
    this.investmentForm.get('investmentAmount')?.valueChanges.subscribe(() => {
      this.calculateMonthlyPayment();
    });
    this.investmentForm.get('interestRate')?.valueChanges.subscribe(() => {
      this.calculateMonthlyPayment();
    });
    this.investmentForm.get('termLengthMonths')?.valueChanges.subscribe(() => {
      this.calculateMonthlyPayment();
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  calculateMonthlyPayment(): void {
    const amount = this.investmentForm.get('investmentAmount')?.value;
    const rate = this.investmentForm.get('interestRate')?.value;
    const term = this.investmentForm.get('termLengthMonths')?.value;
    const type = this.investmentForm.get('type')?.value;

    if (!amount || !rate || !term) return;

    const monthlyRate = (rate / 100) / 12;
    if (type === 'mortgage-note' && rate > 0) {
      // Amortizing loan payment
      const payment =
        (amount *
          (monthlyRate * Math.pow(1 + monthlyRate, term))) /
        (Math.pow(1 + monthlyRate, term) - 1);
      this.investmentForm.patchValue({ monthlyPayment: Math.round(payment * 100) / 100 });
    } else if (type === 'hysa' && rate > 0) {
      // HYSA: Calculate monthly withdrawal amount (principal + interests) to deplete account over term
      // Using same amortization formula as mortgage note
      const compoundRate = Math.pow(1 + rate / 100, 1/12) - 1;
      const payment =
        (amount *
          (compoundRate * Math.pow(1 + compoundRate, term))) /
        (Math.pow(1 + compoundRate, term) - 1);
      this.investmentForm.patchValue({ monthlyPayment: Math.round(payment * 100) / 100 });
    } else if (type === 'annuity' && rate > 0) {
      // Annuity: Calculate monthly withdrawal amount (principal + interest) to deplete over term
      // Using same amortization formula
      const payment =
        (amount *
          (monthlyRate * Math.pow(1 + monthlyRate, term))) /
        (Math.pow(1 + monthlyRate, term) - 1);
      this.investmentForm.patchValue({ monthlyPayment: Math.round(payment * 100) / 100 });
    } else {
      // Fallback: Simple interest (for edge cases)
      const payment = (amount * monthlyRate);
      this.investmentForm.patchValue({ monthlyPayment: Math.round(payment * 100) / 100 });
    }
  }

  addInvestment(): void {
    if (this.investmentForm.valid) {
      const formValue = this.investmentForm.value;
      const locFinanced = formValue.locFinancedAmount ?? 0;
      const cashRequired = formValue.investmentAmount - locFinanced;

      // Validate LOC portion
      if (locFinanced > 0 && locFinanced > this.getAvailableCredit()) {
        this.investmentError = `LOC draw of ${this.formatCurrency(locFinanced)} exceeds available credit of ${this.formatCurrency(this.getAvailableCredit())}.`;
        setTimeout(() => this.investmentError = '', 5000);
        return;
      }

      // Check cash covers the non-LOC portion
      if (cashRequired > this.cashBalance) {
        this.investmentError = `Insufficient cash. Need ${this.formatCurrency(cashRequired)} (after LOC financing) but only have ${this.formatCurrency(this.cashBalance)} available.`;
        setTimeout(() => this.investmentError = '', 5000);
        return;
      }

      this.investmentError = '';
      this.trackerService.addInvestment({
        type: formValue.type,
        investmentAmount: formValue.investmentAmount,
        interestRate: formValue.interestRate / 100,
        purchaseDate: new Date(),
        monthlyPayment: formValue.monthlyPayment,
        termLengthMonths: formValue.termLengthMonths,
        monthsRemaining: formValue.termLengthMonths,
        currentBalance: formValue.investmentAmount,
        totalInterestEarned: 0,
        status: 'active',
        locFinancedAmount: locFinanced,
        notes: formValue.notes
      });
      this.investmentForm.reset({
        type: 'mortgage-note',
        investmentAmount: 10000,
        interestRate: 12,
        monthlyPayment: 0,
        termLengthMonths: 60,
        locFinancedAmount: 0,
        notes: ''
      });
    }
  }

  deleteInvestment(id: string): void {
    if (confirm('Are you sure you want to delete this investment?')) {
      this.trackerService.deleteInvestment(id);
    }
  }

  setMonthlyIncome(): void {
    if (this.cashflowForm.valid) {
      const income = this.cashflowForm.get('monthlyIncome')?.value;
      this.trackerService.setMonthlyIncome(income);
      const expenses = this.cashflowForm.get('monthlyExpenses')?.value ?? 0;
      this.trackerService.setMonthlyExpenses(expenses);
    }
  }

  processMonth(): void {
    this.trackerService.setCurrentMonth(this.currentMonth + 1);
    this.trackerService.processMonthlyAccrual();
  }

  undoMonth(): void {
    if (!this.canUndo) return;
    if (confirm(`Undo Month ${this.currentMonth} and restore state to Month ${this.currentMonth - 1}?`)) {
      this.trackerService.undoLastMonth();
    }
  }

  resetAll(): void {
    if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
      this.trackerStartDate = new Date();
      this.trackerService.resetAll();
    }
  }

  getCurrentMonthLabel(): string {
    if (this.currentMonth === 0) {
      return 'Starting Point';
    }
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentDate = new Date(this.trackerStartDate);
    currentDate.setMonth(currentDate.getMonth() + this.currentMonth);
    const monthName = monthNames[currentDate.getMonth()];
    const year = currentDate.getFullYear();
    return `${monthName} ${year} (Month ${this.currentMonth})`;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  formatPercent(rate: number): string {
    return `${(rate * 100).toFixed(2)}%`;
  }

  getMonthsElapsed(investmentDate: Date): number {
    const now = new Date();
    const months =
      (now.getFullYear() - investmentDate.getFullYear()) * 12 +
      (now.getMonth() - investmentDate.getMonth());
    return Math.max(0, months);
  }

  getInvestmentTypeLabel(type: string): string {
    switch (type) {
      case 'mortgage-note':
        return 'Mortgage Note';
      case 'hysa':
        return 'HYSA';
      case 'annuity':
        return 'Annuity';
      default:
        return type;
    }
  }

  getMonthlyInvestmentReturns(): number {
    // Calculate total monthly returns from all active investments
    let totalReturns = 0;
    
    this.investments.forEach(inv => {
      if (inv.status === 'active' && inv.monthsRemaining > 0) {
        totalReturns += inv.monthlyPayment;
      }
    });
    
    return totalReturns;
  }

  getTotalMonthlyCashFlow(): number {
    return this.monthlyIncome + this.getMonthlyInvestmentReturns();
  }

  // ── Account Overview helpers ──────────────────────────────────────────────

  /** Total of all active non-mortgage-note investment balances (the "deployed" portion). */
  getDeployedBalance(): number {
    return this.investments
      .filter(inv => inv.status === 'active' && inv.type !== 'mortgage-note')
      .reduce((sum, inv) => sum + inv.currentBalance, 0);
  }

  /**
   * Gross account value: liquid cash + every investment balance still outstanding.
   * Completed investments have already returned their principal to cash, so only
   * active positions count here.
   */
  getTotalAccountValue(): number {
    return this.cashBalance + this.getDeployedBalance();
  }

  /** Net account value after subtracting external LOC debt. */
  getNetAccountValue(): number {
    return this.getTotalAccountValue() - this.locBalance;
  }

  getDeploymentRate(): number {
    const total = this.getTotalAccountValue();
    return total > 0 ? (this.getDeployedBalance() / total) * 100 : 0;
  }

  getLiquidRate(): number {
    return 100 - this.getDeploymentRate();
  }

  /**
   * Estimated monthly yield on the entire account balance.
   * Uses the weighted-average monthly rate from active non-mortgage-note positions
   * and applies it to the full account value (liquid + deployed).
   */
  getEstimatedMonthlyYield(): number {
    const activePositions = this.investments.filter(
      inv => inv.status === 'active' && inv.monthsRemaining > 0 && inv.type !== 'mortgage-note'
    );
    if (activePositions.length === 0) return 0;

    const totalDeployed = activePositions.reduce((sum, inv) => sum + inv.currentBalance, 0);
    if (totalDeployed === 0) return 0;

    // Weighted-average monthly rate across all active positions
    const weightedMonthlyRate = activePositions.reduce((sum, inv) => {
      const monthlyRate = inv.type === 'hysa'
        ? Math.pow(1 + inv.interestRate, 1 / 12) - 1
        : inv.interestRate / 12;
      return sum + (inv.currentBalance / totalDeployed) * monthlyRate;
    }, 0);

    return this.getTotalAccountValue() * weightedMonthlyRate;
  }

  getNetMonthlyFlow(): number {
    return this.monthlyIncome + this.getMonthlyInvestmentReturns() - this.getMonthlyLocInterest();
  }

  getTotalInterestEarned(): number {
    return this.investments
      .filter(inv => inv.type !== 'mortgage-note')
      .reduce((sum, inv) => sum + inv.totalInterestEarned, 0);
  }

  getTotalLocFinancedInDeployments(): number {
    return this.investments
      .filter(inv => inv.status === 'active' && inv.type !== 'mortgage-note')
      .reduce((sum, inv) => sum + (inv.locFinancedAmount ?? 0), 0);
  }

  /** Active non-mortgage-note investments sorted by months remaining ascending (maturing soonest first). */
  getActiveInvestmentsSorted(): typeof this.investments {
    return [...this.investments]
      .filter(inv => inv.status === 'active' && inv.type !== 'mortgage-note')
      .sort((a, b) => a.monthsRemaining - b.monthsRemaining);
  }

  getNextInvestmentTarget(): number {
    return this.targetPrice;
  }

  getMonthsUntilNextPurchase(): number {
    const locConfigured = this.locLimit > 0;
    const purchasingPower = locConfigured
      ? this.cashBalance + this.getAvailableCredit()
      : this.cashBalance;

    const deficit = this.targetPrice - purchasingPower;

    if (deficit <= 0) {
      return 0;
    }

    const grossCashFlow = this.getTotalMonthlyCashFlow();
    const monthlyLocInterest = locConfigured
      ? this.trackerService.getMonthlyLocInterest()
      : 0;
    const netMonthlyCashFlow = grossCashFlow - monthlyLocInterest;

    if (netMonthlyCashFlow <= 0) {
      return -1;
    }

    return Math.ceil(deficit / netMonthlyCashFlow);
  }

  exportToCSV(): void {
    // Metadata lines (prefixed with #)
    const metadataLines = [
      `#CURRENT_MONTH=${this.currentMonth}`,
      `#CASH_BALANCE=${this.cashBalance.toFixed(2)}`,
      `#MONTHLY_INCOME=${this.monthlyIncome.toFixed(2)}`,
      `#TARGET_PRICE=${this.targetPrice.toFixed(2)}`,
      `#LOC_LIMIT=${this.locLimit.toFixed(2)}`,
      `#LOC_INTEREST_RATE=${this.locInterestRate.toFixed(6)}`,
      `#LOC_BALANCE=${this.locBalance.toFixed(2)}`,
      `#LOC_INTEREST_PAID=${this.totalLocInterestPaid.toFixed(2)}`
    ];

    const headers = [
      'Type',
      'Investment Amount',
      'Current Balance',
      'Monthly Payment',
      'Interest Rate (%)',
      'Total Interest Earned',
      'Term Months',
      'Months Remaining',
      'Status',
      'Purchase Date',
      'LOC Financed Amount',
      'Notes'
    ];

    const rows = this.investments.map(inv => [
      this.getInvestmentTypeLabel(inv.type),
      inv.investmentAmount.toFixed(2),
      inv.currentBalance.toFixed(2),
      inv.monthlyPayment.toFixed(2),
      (inv.interestRate * 100).toFixed(2),
      inv.totalInterestEarned.toFixed(2),
      inv.termLengthMonths,
      inv.monthsRemaining,
      inv.status,
      new Date(inv.purchaseDate).toISOString().split('T')[0],
      (inv.locFinancedAmount ?? 0).toFixed(2),
      inv.notes || ''
    ]);

    const csvContent = [
      metadataLines.join('\n'),
      headers.join(','),
      ...rows.map(row =>
        row
          .map(cell => {
            const cellStr = String(cell);
            return cellStr.includes(',') || cellStr.includes('"')
              ? `"${cellStr.replace(/"/g, '""')}"`
              : cellStr;
          })
          .join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `investment-tracker-${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  importFromCSV(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split('\n').map(line => line.trim()).filter(line => line);
        
        if (lines.length < 2) {
          alert('Invalid CSV file');
          return;
        }

        // Extract metadata lines (lines starting with #)
        let currentMonth = 0;
        let cashBalance = 0;
        let monthlyIncome = 0;
        let targetPrice = 5000;
        let locLimit = 0;
        let locInterestRate = 0;
        let locBalance = 0;
        let locInterestPaid = 0;
        let headerIndex = 0;

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('#CURRENT_MONTH=')) {
            currentMonth = parseInt(lines[i].split('=')[1]);
          } else if (lines[i].startsWith('#CASH_BALANCE=')) {
            cashBalance = parseFloat(lines[i].split('=')[1]);
          } else if (lines[i].startsWith('#MONTHLY_INCOME=')) {
            monthlyIncome = parseFloat(lines[i].split('=')[1]);
          } else if (lines[i].startsWith('#TARGET_PRICE=')) {
            targetPrice = parseFloat(lines[i].split('=')[1]);
          } else if (lines[i].startsWith('#LOC_LIMIT=')) {
            locLimit = parseFloat(lines[i].split('=')[1]);
          } else if (lines[i].startsWith('#LOC_INTEREST_RATE=')) {
            locInterestRate = parseFloat(lines[i].split('=')[1]);
          } else if (lines[i].startsWith('#LOC_BALANCE=')) {
            locBalance = parseFloat(lines[i].split('=')[1]);
          } else if (lines[i].startsWith('#LOC_INTEREST_PAID=')) {
            locInterestPaid = parseFloat(lines[i].split('=')[1]);
          } else if (!lines[i].startsWith('#')) {
            // This is the header row
            headerIndex = i;
            break;
          }
        }

        // Skip metadata and header rows
        const dataLines = lines.slice(headerIndex + 1);
        let importedCount = 0;

        const importedInvestments: Omit<TrackedInvestment, 'id'>[] = [];
        dataLines.forEach(line => {
          try {
            // Simple CSV parsing (handles quoted fields)
            const fields: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                  current += '"';
                  i++;
                } else {
                  inQuotes = !inQuotes;
                }
              } else if (char === ',' && !inQuotes) {
                fields.push(current);
                current = '';
              } else {
                current += char;
              }
            }
            fields.push(current);
            if (fields.length < 11) return;
            const typeMap: { [key: string]: 'mortgage-note' | 'hysa' | 'annuity' } = {
              'Mortgage Note': 'mortgage-note',
              'HYSA': 'hysa',
              'Annuity': 'annuity'
            };
            const type = typeMap[fields[0].trim()] || 'mortgage-note';
            const investmentAmount = parseFloat(fields[1]);
            const interestRate = parseFloat(fields[4]) / 100;
            const termLengthMonths = parseInt(fields[6]);
            const monthsRemaining = parseInt(fields[7]);
            const monthlyPayment = parseFloat(fields[3]);
            const purchaseDate = new Date(fields[9]);
            // Column 10 is LOC Financed Amount (new), column 11 is Notes
            // Handle CSVs without the LOC column (legacy: col 10 = Notes)
            const hasLocColumn = fields.length >= 12;
            const locFinancedAmount = hasLocColumn ? parseFloat(fields[10]) || 0 : 0;
            const notes = hasLocColumn ? fields[11] : fields[10];
            importedInvestments.push({
              type,
              investmentAmount,
              interestRate,
              purchaseDate,
              monthlyPayment,
              termLengthMonths,
              monthsRemaining,
              currentBalance: parseFloat(fields[2]),
              totalInterestEarned: parseFloat(fields[5]),
              status: (fields[8] as 'active' | 'completed') || 'active',
              locFinancedAmount,
              notes
            });
            importedCount++;
          } catch (error) {
            console.error('Error parsing CSV line:', error);
          }
        });
        
        // Restore tracker state from metadata
        if (monthlyIncome > 0) {
          this.trackerService.setMonthlyIncome(monthlyIncome);
        }
        if (cashBalance > 0) {
          this.trackerService.addCash(cashBalance);
        }
        if (targetPrice > 0) {
          this.trackerService.setTargetPrice(targetPrice);
        }
        if (currentMonth > 0) {
          this.trackerService.setCurrentMonth(currentMonth);
        }
        if (locLimit > 0 || locInterestRate > 0 || locBalance > 0 || locInterestPaid > 0) {
          this.trackerService.restoreLocState(locLimit, locInterestRate, locBalance, locInterestPaid);
        }
        
        if (importedInvestments.length > 0) {
          this.trackerService.importInvestments(importedInvestments);
        }

        if (importedCount > 0) {
          alert(`Successfully imported ${importedCount} investment(s) and restored tracker state`);
          input.value = '';
        } else {
          alert('No valid investments found in CSV');
        }
      } catch (error) {
        console.error('Error importing CSV:', error);
        alert('Error importing CSV file');
      }
    };

    reader.readAsText(file);
  }

  addCash(): void {
    if (this.addCashAmount > 0) {
      this.trackerService.addCash(this.addCashAmount);
      this.addCashAmount = 0;
    }
  }

  configureLoc(): void {
    if (this.locForm.valid) {
      const limit = this.locForm.get('locLimit')?.value ?? 0;
      const rate = (this.locForm.get('locInterestRate')?.value ?? 0) / 100;
      this.trackerService.configureLoc(limit, rate);
    }
  }

  drawFromLoc(): void {
    if (this.locDrawAmount > 0) {
      this.trackerService.drawFromLoc(this.locDrawAmount);
      this.locDrawAmount = 0;
    }
  }

  repayLoc(): void {
    if (this.locRepayAmount > 0) {
      this.trackerService.repayLoc(this.locRepayAmount);
      this.locRepayAmount = 0;
    }
  }

  getAvailableCredit(): number {
    return Math.max(0, this.locLimit - this.locBalance);
  }

  getMonthlyLocInterest(): number {
    return this.locBalance * (this.locInterestRate / 12);
  }

  getLocUtilization(): number {
    if (this.locLimit === 0) return 0;
    return (this.locBalance / this.locLimit) * 100;
  }

  exportHistoryToCSV(): void {
    const headers = ['#', 'Event Type', 'Month', 'Date', 'Description', 'Amount'];

    const typeLabels: Record<string, string> = {
      'investment-added': 'Investment Added',
      'investment-deleted': 'Investment Deleted',
      'investment-completed': 'Investment Completed',
      'month-processed': 'Month Processed',
      'cash-added': 'Cash Added',
      'income-set': 'Income Set',
      'loc-configured': 'LOC Configured',
      'loc-draw': 'LOC Draw',
      'loc-repay': 'LOC Repay',
      'data-imported': 'Data Imported',
      'reset': 'Reset'
    };

    const rows = [...this.eventLog].reverse().map((event, i) => [
      String(i + 1),
      typeLabels[event.type] || event.type,
      String(event.month),
      new Date(event.date).toLocaleString(),
      event.description,
      event.amount != null ? event.amount.toFixed(2) : ''
    ]);

    const escape = (cell: string) =>
      cell.includes(',') || cell.includes('"') || cell.includes('\n')
        ? `"${cell.replace(/"/g, '""')}"`
        : cell;

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(escape).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `activity-history-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  getVisibleEvents(): TrackerEvent[] {
    return this.showAllEvents ? this.eventLog : this.eventLog.slice(0, 20);
  }

  getEventIcon(type: string): string {
    const icons: Record<string, string> = {
      'investment-added': '📈',
      'investment-deleted': '🗑️',
      'investment-completed': '✅',
      'month-processed': '📅',
      'cash-added': '💵',
      'income-set': '💼',
      'loc-configured': '🏦',
      'loc-draw': '📤',
      'loc-repay': '📥',
      'data-imported': '📋',
      'reset': '🔄'
    };
    return icons[type] || '📌';
  }

  getEventClass(type: string): string {
    const classes: Record<string, string> = {
      'investment-added': 'event-investment',
      'investment-deleted': 'event-delete',
      'investment-completed': 'event-complete',
      'month-processed': 'event-month',
      'cash-added': 'event-cash',
      'income-set': 'event-income',
      'loc-configured': 'event-loc',
      'loc-draw': 'event-loc-draw',
      'loc-repay': 'event-loc-repay',
      'data-imported': 'event-import',
      'reset': 'event-reset'
    };
    return classes[type] || '';
  }

}

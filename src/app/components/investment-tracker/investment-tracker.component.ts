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
  NetWorthHistory
} from '../../models/mortgage-note.interface';

@Component({
  selector: 'app-investment-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './investment-tracker.component.html',
  styleUrl: './investment-tracker.component.css'
})
export class InvestmentTrackerComponent implements OnInit, OnDestroy {
  investmentForm: FormGroup;
  investments: TrackedInvestment[] = [];
  currentSnapshot: TrackedInvestorSnapshot | null = null;
  netWorthHistory: NetWorthHistory[] = [];
  currentMonth: number = 0;
  trackerStartDate: Date = new Date();
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
      notes: ['']
    });
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
    } else {
      // Simple interest
      const payment = (amount * monthlyRate);
      this.investmentForm.patchValue({ monthlyPayment: Math.round(payment * 100) / 100 });
    }
  }

  addInvestment(): void {
    if (this.investmentForm.valid) {
      const formValue = this.investmentForm.value;
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
        notes: formValue.notes
      });
      this.investmentForm.reset({
        type: 'mortgage-note',
        investmentAmount: 10000,
        interestRate: 12,
        monthlyPayment: 0,
        termLengthMonths: 60,
        notes: ''
      });
    }
  }

  deleteInvestment(id: string): void {
    if (confirm('Are you sure you want to delete this investment?')) {
      this.trackerService.deleteInvestment(id);
    }
  }

  processMonth(): void {
    this.currentMonth++;
    this.trackerService.processMonthlyAccrual();
  }

  resetAll(): void {
    if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
      this.currentMonth = 0;
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

  exportToCSV(): void {
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
      inv.notes || ''
    ]);

    const csvContent = [
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

        // Skip header row
        const dataLines = lines.slice(1);
        let importedCount = 0;

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
            const notes = fields[10];

            this.trackerService.addInvestment({
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
              notes
            });

            importedCount++;
          } catch (error) {
            console.error('Error parsing CSV line:', error);
          }
        });

        if (importedCount > 0) {
          alert(`Successfully imported ${importedCount} investment(s)`);
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
}

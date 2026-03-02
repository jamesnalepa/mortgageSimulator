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
import { CombinedSimulationService } from '../../services/combined-simulation.service';
import {
  CombinedSimulationSettings,
  CombinedMonthlyReport
} from '../../models/mortgage-note.interface';

@Component({
  selector: 'app-combined-simulation',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './combined-simulation.component.html',
  styleUrl: './combined-simulation.component.css'
})
export class CombinedSimulationComponent implements OnInit, OnDestroy {
  combinedForm: FormGroup;
  monthlyReports: CombinedMonthlyReport[] = [];
  isRunning = false;
  private subscriptions = new Subscription();

  constructor(
    private fb: FormBuilder,
    private combinedSimulationService: CombinedSimulationService
  ) {
    this.combinedForm = this.fb.group({
      initialInvestment: [15000, [Validators.required, Validators.min(1000)]],
      monthlyIncome: [2000, [Validators.required, Validators.min(0)]],
      simulationMonths: [120, [Validators.required, Validators.min(1), Validators.max(1200)]],
      startMonth: [new Date().getMonth() + 1, [Validators.required]],
      startYear: [new Date().getFullYear(), [Validators.required]],
      maxPersonalExpensePercentage: [50, [Validators.required, Validators.min(0), Validators.max(100)]],

      // Investment allocation
      mortgageNotePercentage: [40, [Validators.required, Validators.min(0), Validators.max(100)]],
      hysaPercentage: [40, [Validators.required, Validators.min(0), Validators.max(100)]],
      annuityPercentage: [20, [Validators.required, Validators.min(0), Validators.max(100)]],

      // Mortgage note settings
      mortgageNoteInterestRate: [12, [Validators.required, Validators.min(0.1), Validators.max(50)]],
      mortgageNoteTermLength: [60, [Validators.required, Validators.min(1), Validators.max(240)]],
      mortgageNoteValueMultiplier: [1.5, [Validators.required, Validators.min(1.0), Validators.max(2.0)]],
      maxNoteValue: [75000, [Validators.required, Validators.min(5000), Validators.max(500000)]],

      // HYSA settings
      hysaApy: [4.5, [Validators.required, Validators.min(0.1), Validators.max(10)]],

      // Annuity settings
      annuityAnnualRate: [5, [Validators.required, Validators.min(0.1), Validators.max(20)]],
      annuityTermLength: [120, [Validators.required, Validators.min(1), Validators.max(360)]]
    });
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.combinedSimulationService.combinedSimulationResults$.subscribe(results => {
        this.monthlyReports = results;
      })
    );

    this.subscriptions.add(
      this.combinedSimulationService.isSimulationRunning$.subscribe(isRunning => {
        this.isRunning = isRunning;
      })
    );

    // Add percentage validation
    this.combinedForm.valueChanges.subscribe(() => {
      this.validatePercentages();
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  validatePercentages(): void {
    const total =
      (this.combinedForm.get('mortgageNotePercentage')?.value || 0) +
      (this.combinedForm.get('hysaPercentage')?.value || 0) +
      (this.combinedForm.get('annuityPercentage')?.value || 0);

    const percentagesValid = Math.abs(total - 100) < 0.01;
    if (!percentagesValid) {
      this.combinedForm.setErrors({ percentagesNotEqual: true });
    } else {
      const currentErrors = this.combinedForm.errors;
      if (currentErrors) {
        delete currentErrors['percentagesNotEqual'];
        if (Object.keys(currentErrors).length === 0) {
          this.combinedForm.setErrors(null);
        }
      }
    }
  }

  runSimulation(): void {
    if (this.combinedForm.valid) {
      const settings: Partial<CombinedSimulationSettings> = {
        initialInvestment: this.combinedForm.value.initialInvestment,
        monthlyIncome: this.combinedForm.value.monthlyIncome,
        simulationMonths: this.combinedForm.value.simulationMonths,
        startMonth: this.combinedForm.value.startMonth,
        startYear: this.combinedForm.value.startYear,
        maxPersonalExpensePercentage: this.combinedForm.value.maxPersonalExpensePercentage / 100,

        mortgageNotePercentage: this.combinedForm.value.mortgageNotePercentage,
        hysaPercentage: this.combinedForm.value.hysaPercentage,
        annuityPercentage: this.combinedForm.value.annuityPercentage,

        mortgageNoteInterestRate: this.combinedForm.value.mortgageNoteInterestRate / 100,
        mortgageNoteTermLength: this.combinedForm.value.mortgageNoteTermLength,
        mortgageNoteValueMultiplier: this.combinedForm.value.mortgageNoteValueMultiplier,
        maxNoteValue: this.combinedForm.value.maxNoteValue,

        hysaApy: this.combinedForm.value.hysaApy / 100,

        annuityAnnualRate: this.combinedForm.value.annuityAnnualRate / 100,
        annuityTermLength: this.combinedForm.value.annuityTermLength
      };

      this.combinedSimulationService.runCombinedSimulation(settings);
    }
  }

  resetSimulation(): void {
    this.combinedSimulationService.resetCombinedSimulation();
    this.monthlyReports = [];
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
    return `${(rate * 100).toFixed(1)}%`;
  }

  getLastReport(): CombinedMonthlyReport | undefined {
    return this.monthlyReports.length > 0
      ? this.monthlyReports[this.monthlyReports.length - 1]
      : undefined;
  }

  exportToCSV(): void {
    if (this.monthlyReports.length === 0) {
      alert('No simulation data to export');
      return;
    }

    const headers = [
      'Month',
      'Monthly Income',
      'Monthly Personal Expense',
      'Monthly Interest',
      'Monthly Principal',
      'Monthly Revenue',
      'Available Cash',
      'Total Invested Value',
      'Total Portfolio Value',
      'Mortgage Notes Value',
      'HYSA Value',
      'Annuity Value',
      'Total Income Added',
      'Total Personal Expenses',
      'Total Profit Generated'
    ];

    const rows = this.monthlyReports.map(report => [
      report.monthName,
      report.monthlyIncome.toFixed(2),
      report.monthlyPersonalExpense.toFixed(2),
      report.monthlyInterest.toFixed(2),
      report.monthlyPrincipal.toFixed(2),
      report.monthlyRevenue.toFixed(2),
      report.availableCash.toFixed(2),
      report.totalInvestedValue.toFixed(2),
      report.totalPortfolioValue.toFixed(2),
      report.investmentMix.mortgageNotesValue.toFixed(2),
      report.investmentMix.hysaValue.toFixed(2),
      report.investmentMix.annuityValue.toFixed(2),
      report.totalIncomeContributed.toFixed(2),
      report.totalPersonalExpenses.toFixed(2),
      report.totalProfitGenerated.toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row
          .map(cell => {
            const cellStr = String(cell);
            return cellStr.includes(',')
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
      `combined-simulation-${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

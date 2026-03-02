// ...existing code...
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MortgageSimulationService } from '../../services/mortgage-simulation.service';
import { MonthlyReport, SimulationSettings } from '../../models/mortgage-note.interface';
import { SimulationChartComponent } from '../simulation-chart/simulation-chart.component';

@Component({
  selector: 'app-simulation',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SimulationChartComponent],
  templateUrl: './simulation.component.html',
  styleUrl: './simulation.component.css'
})
export class SimulationComponent implements OnInit, OnDestroy {
  simulationForm: FormGroup;
  monthlyReports: MonthlyReport[] = [];
  isRunning = false;
  private subscriptions = new Subscription();

  constructor(
    private fb: FormBuilder,
    private simulationService: MortgageSimulationService
  ) {
    this.simulationForm = this.fb.group({
      initialInvestment: [15000, [Validators.required, Validators.min(1000)]],
      monthlyIncome: [2000, [Validators.required, Validators.min(0)]],
      interestRate: [12, [Validators.required, Validators.min(0.1), Validators.max(50)]],
      startMonth: [1, [Validators.required, Validators.min(1), Validators.max(12)]],
      startYear: [2026, [Validators.required, Validators.min(2020), Validators.max(2050)]],
      simulationMonths: [120, [Validators.required, Validators.min(1), Validators.max(1200)]],
      maxNoteValue: [75000, [Validators.required, Validators.min(5000), Validators.max(500000)]],
      noteValueMultiplier: [1.5, [Validators.required, Validators.min(1.0), Validators.max(2.0)]],
      noteTermLength: [60, [Validators.required, Validators.min(1), Validators.max(240)]],
      maxPersonalExpensePercentage: [50, [Validators.required, Validators.min(0), Validators.max(100)]],
      simulationType: ['mortgage-notes', [Validators.required]],
      hysaApy: [4.5, [Validators.required, Validators.min(0.1), Validators.max(10)]]
    });
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.simulationService.simulationResults$.subscribe(results => {
        this.monthlyReports = results;
      })
    );

    this.subscriptions.add(
      this.simulationService.isSimulationRunning$.subscribe(isRunning => {
        this.isRunning = isRunning;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  runSimulation(): void {
    if (this.simulationForm.valid) {
      const settings: Partial<SimulationSettings> = {
        initialInvestment: this.simulationForm.value.initialInvestment,
        monthlyIncome: this.simulationForm.value.monthlyIncome,
        interestRate: this.simulationForm.value.interestRate / 100, // Convert percentage to decimal
        startMonth: this.simulationForm.value.startMonth,
        startYear: this.simulationForm.value.startYear,
        simulationMonths: this.simulationForm.value.simulationMonths,
        maxNoteValue: this.simulationForm.value.maxNoteValue,
        noteValueMultiplier: this.simulationForm.value.noteValueMultiplier,
        noteTermLength: this.simulationForm.value.noteTermLength,
        maxPersonalExpensePercentage: this.simulationForm.value.maxPersonalExpensePercentage / 100, // Convert percentage to decimal
        simulationType: this.simulationForm.value.simulationType,
        hysaApy: this.simulationForm.value.hysaApy / 100 // Convert percentage to decimal
      };
      
      this.simulationService.runSimulation(settings);
    }
  }

  resetSimulation(): void {
    this.simulationService.resetSimulation();
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

  getLastReport(): MonthlyReport | undefined {
    return this.monthlyReports.length > 0 ? this.monthlyReports[this.monthlyReports.length - 1] : undefined;
  }

  // Returns the end net worth summary for the simulation
  get endNetWorthSummary() {
    const last = this.getLastReport();
    if (!last) {
      return {
        totalInvested: 0,
        totalProfit: 0,
        portfolioValue: 0,
        finalCash: 0,
        netWorth: 0
      };
    }
    // totalInvested = totalIncomeContributed + initialInvestment
    const totalInvested = last.totalIncomeContributed + (this.simulationForm.value.initialInvestment || 0);
    const totalProfit = last.totalProfitGenerated;
    const portfolioValue = last.totalPortfolioValue;
    const finalCash = last.availableCash;
    const netWorth = totalInvested + totalProfit + portfolioValue + finalCash;
    return { totalInvested, totalProfit, portfolioValue, finalCash, netWorth };
  }

  exportToCSV(): void {
    if (this.monthlyReports.length === 0) {
      alert('No simulation data to export');
      return;
    }

    const simulationType = this.simulationForm.get('simulationType')?.value;
    let headers: string[] = [];
    let rows: any[][] = [];

    if (simulationType === 'hysa') {
      // HYSA format matching table display
      headers = [
        'Month',
        'Monthly Income',
        'Monthly Personal Expense',
        'Monthly Interest',
        'Balance',
        'Total Income Added',
        'Total Personal Expenses',
        'Total Interest Generated'
      ];

      rows = this.monthlyReports.map(report => [
        report.monthName,
        report.monthlyIncome.toFixed(2),
        report.monthlyPersonalExpense.toFixed(2),
        report.monthlyInterest.toFixed(2),
        report.availableCash.toFixed(2),
        report.totalIncomeContributed.toFixed(2),
        report.totalPersonalExpenses.toFixed(2),
        report.totalProfitGenerated.toFixed(2)
      ]);
    } else {
      // Mortgage Notes format (original)
      headers = [
        'Month',
        'Active Notes',
        'Cashflow',
        'Monthly Personal Expense',
        'Monthly Revenue',
        'Interest',
        'Principal',
        'Available Cash',
        'Next Note Value',
        'Portfolio Value',
        'Total Income Added',
        'Total Personal Expenses',
        'Total Profit Generated (Interest)',
        'Current Note Being Repaid'
      ];

      rows = this.monthlyReports.map(report => [
        report.monthName,
        report.totalNotes,
        report.monthlyIncome.toFixed(2),
        report.monthlyPersonalExpense.toFixed(2),
        report.monthlyRevenue.toFixed(2),
        report.monthlyInterest.toFixed(2),
        report.monthlyPrincipal.toFixed(2),
        report.availableCash.toFixed(2),
        report.nextNoteValue.toFixed(2),
        report.totalPortfolioValue.toFixed(2),
        report.totalIncomeContributed.toFixed(2),
        report.totalPersonalExpenses.toFixed(2),
        report.totalProfitGenerated.toFixed(2),
        report.currentNoteBeingRepaid 
          ? `${report.currentNoteBeingRepaid.id} (Recovered: $${(report.currentNoteBeingRepaid.amountRecovered || 0).toFixed(2)} / $${report.currentNoteBeingRepaid.totalValue.toFixed(2)})`
          : ''
      ]);
    }

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map(cell => {
          // Escape quotes and wrap in quotes if contains comma
          const cellStr = String(cell);
          return cellStr.includes(',') ? `"${cellStr.replace(/"/g, '""')}"` : cellStr;
        }).join(',')
      )
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const fileName = simulationType === 'hysa' 
      ? `hysa-simulation-${new Date().toISOString().split('T')[0]}.csv`
      : `mortgage-simulation-${new Date().toISOString().split('T')[0]}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

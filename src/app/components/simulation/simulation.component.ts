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
      startMonth: [1, [Validators.required, Validators.min(1), Validators.max(12)]], // January
      startYear: [2026, [Validators.required, Validators.min(2020), Validators.max(2050)]]
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
        startYear: this.simulationForm.value.startYear
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
}

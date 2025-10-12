import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import { MonthlyReport } from '../../models/mortgage-note.interface';

Chart.register(...registerables);

@Component({
  selector: 'app-simulation-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './simulation-chart.component.html',
  styleUrl: './simulation-chart.component.css'
})
export class SimulationChartComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  @Input() monthlyReports: MonthlyReport[] = [];
  @ViewChild('portfolioChart') portfolioChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('cashFlowChart') cashFlowChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('notesChart') notesChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('incomeVsProfitChart') incomeVsProfitChartRef?: ElementRef<HTMLCanvasElement>;

  private portfolioChart?: Chart;
  private cashFlowChart?: Chart;
  private notesChart?: Chart;
  private incomeVsProfitChart?: Chart;

  currentView: 'portfolio' | 'cashflow' | 'notes' | 'income-vs-profit' = 'portfolio';

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.createCharts();
      if (this.monthlyReports.length > 0) {
        this.updateCharts();
      }
    }, 100);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['monthlyReports'] && this.monthlyReports.length > 0) {
      setTimeout(() => {
        this.updateCharts();
      }, 100);
    }
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  switchView(view: 'portfolio' | 'cashflow' | 'notes' | 'income-vs-profit'): void {
    this.currentView = view;
    // Recreate charts when switching views to ensure canvas is available
    setTimeout(() => {
      this.createCharts();
      if (this.monthlyReports.length > 0) {
        this.updateCharts();
      }
    }, 50);
  }

  private createCharts(): void {
    try {
      // Destroy existing charts first
      this.destroyCharts();
      
      // Only create chart for current view
      switch(this.currentView) {
        case 'portfolio':
          this.createPortfolioChart();
          break;
        case 'cashflow':
          this.createCashFlowChart();
          break;
        case 'notes':
          this.createNotesChart();
          break;
        case 'income-vs-profit':
          this.createIncomeVsProfitChart();
          break;
      }
    } catch (error) {
      console.error('Error creating charts:', error);
    }
  }

  private updateCharts(): void {
    if (this.monthlyReports.length === 0) return;

    const labels = this.monthlyReports.map(report => report.monthName);
    
    // Update active chart based on current view
    switch(this.currentView) {
      case 'portfolio':
        if (this.portfolioChart) {
          this.portfolioChart.data.labels = labels;
          this.portfolioChart.data.datasets[0].data = this.monthlyReports.map(r => r.totalPortfolioValue);
          this.portfolioChart.data.datasets[1].data = this.monthlyReports.map(r => r.availableCash);
          this.portfolioChart.update();
        }
        break;
      case 'cashflow':
        if (this.cashFlowChart) {
          this.cashFlowChart.data.labels = labels;
          this.cashFlowChart.data.datasets[0].data = this.monthlyReports.map(r => r.monthlyRevenue);
          this.cashFlowChart.data.datasets[1].data = this.monthlyReports.map(r => r.monthlyIncome);
          this.cashFlowChart.update();
        }
        break;
      case 'notes':
        if (this.notesChart) {
          this.notesChart.data.labels = labels;
          this.notesChart.data.datasets[0].data = this.monthlyReports.map(r => r.totalNotes);
          this.notesChart.data.datasets[1].data = this.monthlyReports.map(r => r.nextNoteValue);
          this.notesChart.update();
        }
        break;
      case 'income-vs-profit':
        if (this.incomeVsProfitChart) {
          this.incomeVsProfitChart.data.labels = labels;
          this.incomeVsProfitChart.data.datasets[0].data = this.monthlyReports.map(r => r.totalIncomeContributed);
          this.incomeVsProfitChart.data.datasets[1].data = this.monthlyReports.map(r => r.totalProfitGenerated);
          // Total wealth = income + profit + current cash
          this.incomeVsProfitChart.data.datasets[2].data = this.monthlyReports.map(r => 
            r.totalIncomeContributed + r.totalProfitGenerated + r.availableCash);
          this.incomeVsProfitChart.update();
        }
        break;
    }
  }

  private createPortfolioChart(): void {
    if (!this.portfolioChartRef?.nativeElement) {
      console.log('Portfolio chart canvas not available yet');
      return;
    }

    const config: ChartConfiguration = {
      type: 'line' as ChartType,
      data: {
        labels: [],
        datasets: [
          {
            label: 'Portfolio Value',
            data: [],
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            tension: 0.1
          },
          {
            label: 'Available Cash',
            data: [],
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            tension: 0.1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + Number(value).toLocaleString();
              }
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Portfolio Value & Available Cash Over Time'
          },
          legend: {
            position: 'top'
          }
        }
      }
    };

    this.portfolioChart = new Chart(this.portfolioChartRef.nativeElement, config);
  }

  private createCashFlowChart(): void {
    if (!this.cashFlowChartRef?.nativeElement) return;

    const config: ChartConfiguration = {
      type: 'bar' as ChartType,
      data: {
        labels: [],
        datasets: [
          {
            label: 'Monthly Revenue from Notes',
            data: [],
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgb(54, 162, 235)',
            borderWidth: 1
          },
          {
            label: 'Monthly Income',
            data: [],
            backgroundColor: 'rgba(255, 206, 86, 0.6)',
            borderColor: 'rgb(255, 206, 86)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + Number(value).toLocaleString();
              }
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Monthly Cash Flow'
          },
          legend: {
            position: 'top'
          }
        }
      }
    };

    this.cashFlowChart = new Chart(this.cashFlowChartRef.nativeElement, config);
  }

  private createNotesChart(): void {
    if (!this.notesChartRef?.nativeElement) return;

    const config: ChartConfiguration = {
      type: 'line' as ChartType,
      data: {
        labels: [],
        datasets: [
          {
            label: 'Active Notes Count',
            data: [],
            borderColor: 'rgb(153, 102, 255)',
            backgroundColor: 'rgba(153, 102, 255, 0.2)',
            tension: 0.1,
            yAxisID: 'y'
          },
          {
            label: 'Next Note Value',
            data: [],
            borderColor: 'rgb(255, 159, 64)',
            backgroundColor: 'rgba(255, 159, 64, 0.2)',
            tension: 0.1,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Notes'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Next Note Value ($)'
            },
            grid: {
              drawOnChartArea: false,
            },
            ticks: {
              callback: function(value) {
                return '$' + Number(value).toLocaleString();
              }
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Active Notes Count & Next Note Value'
          },
          legend: {
            position: 'top'
          }
        }
      }
    };

    this.notesChart = new Chart(this.notesChartRef.nativeElement, config);
  }

  private createIncomeVsProfitChart(): void {
    if (!this.incomeVsProfitChartRef?.nativeElement) {
      console.log('Income vs Profit chart canvas not available yet');
      return;
    }

    const config: ChartConfiguration = {
      type: 'line' as ChartType,
      data: {
        labels: [],
        datasets: [
          {
            label: 'Total Income Added',
            data: [],
            borderColor: '#4CAF50',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.4
          },
          {
            label: 'Total Profit Generated',
            data: [],
            borderColor: '#ff9800',
            backgroundColor: 'rgba(255, 152, 0, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.4
          },
          {
            label: 'Total Wealth (Income + Profit + Cash)',
            data: [],
            borderColor: '#2196F3',
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            borderWidth: 3,
            fill: false,
            tension: 0.4,
            borderDash: [5, 5]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: {
              display: true,
              text: 'Month'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Amount ($)'
            },
            ticks: {
              callback: function(value) {
                return '$' + Number(value).toLocaleString();
              }
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Income Contributions vs Investment Profits Over Time'
          },
          legend: {
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': $' + Number(context.parsed.y).toLocaleString();
              }
            }
          }
        }
      }
    };

    this.incomeVsProfitChart = new Chart(this.incomeVsProfitChartRef.nativeElement, config);
  }

  private destroyCharts(): void {
    if (this.portfolioChart) {
      this.portfolioChart.destroy();
    }
    if (this.cashFlowChart) {
      this.cashFlowChart.destroy();
    }
    if (this.notesChart) {
      this.notesChart.destroy();
    }
    if (this.incomeVsProfitChart) {
      this.incomeVsProfitChart.destroy();
    }
  }
}

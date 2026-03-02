import { Routes } from '@angular/router';
import { SimulationComponent } from './components/simulation/simulation.component';
import { CombinedSimulationComponent } from './components/combined-simulation/combined-simulation.component';
import { InvestmentTrackerComponent } from './components/investment-tracker/investment-tracker.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'simulation',
    pathMatch: 'full'
  },
  {
    path: 'simulation',
    component: SimulationComponent
  },
  {
    path: 'combined',
    component: CombinedSimulationComponent
  },
  {
    path: 'tracker',
    component: InvestmentTrackerComponent
  },
  {
    path: '**',
    redirectTo: 'simulation'
  }
];

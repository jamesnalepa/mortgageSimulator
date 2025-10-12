import { TestBed } from '@angular/core/testing';

import { MortgageSimulationService } from './mortgage-simulation.service';

describe('MortgageSimulationService', () => {
  let service: MortgageSimulationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MortgageSimulationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

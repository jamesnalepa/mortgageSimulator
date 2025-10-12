import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SimulationChartComponent } from './simulation-chart.component';

describe('SimulationChartComponent', () => {
  let component: SimulationChartComponent;
  let fixture: ComponentFixture<SimulationChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SimulationChartComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SimulationChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

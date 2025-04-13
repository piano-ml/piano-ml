import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScalesComponent } from './scales.component';

describe('ScalesComponent', () => {
  let component: ScalesComponent;
  let fixture: ComponentFixture<ScalesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScalesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ScalesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

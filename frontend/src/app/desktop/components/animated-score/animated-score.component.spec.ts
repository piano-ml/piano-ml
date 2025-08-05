import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnimatedScoreComponent } from './animated-score.component';

describe('AnimatedScoreComponent', () => {
  let component: AnimatedScoreComponent;
  let fixture: ComponentFixture<AnimatedScoreComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnimatedScoreComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AnimatedScoreComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

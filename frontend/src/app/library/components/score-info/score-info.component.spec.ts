import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTesting } from '../../../testing/test-providers';

import { ScoreInfoComponent } from './score-info.component';

describe('ScoreInfoComponent', () => {
  let component: ScoreInfoComponent;
  let fixture: ComponentFixture<ScoreInfoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScoreInfoComponent],
      providers: provideTesting()
    })
    .compileComponents();

    fixture = TestBed.createComponent(ScoreInfoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

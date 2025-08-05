import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgilityComponent } from './agility.component';

describe('AgilityComponent', () => {
  let component: AgilityComponent;
  let fixture: ComponentFixture<AgilityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgilityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgilityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

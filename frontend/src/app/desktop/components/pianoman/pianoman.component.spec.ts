import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PianomanComponent } from './pianoman.component';

describe('PianomanComponent', () => {
  let component: PianomanComponent;
  let fixture: ComponentFixture<PianomanComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PianomanComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PianomanComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

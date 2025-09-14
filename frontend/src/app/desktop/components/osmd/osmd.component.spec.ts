import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OsmdComponent } from './osmd.component';

describe('OsmdComponent', () => {
  let component: OsmdComponent;
  let fixture: ComponentFixture<OsmdComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OsmdComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OsmdComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

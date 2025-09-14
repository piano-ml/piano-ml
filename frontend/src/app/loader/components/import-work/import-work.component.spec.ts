import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ImportWorkComponent } from './import-work.component';

describe('ImportWorkComponent', () => {
  let component: ImportWorkComponent;
  let fixture: ComponentFixture<ImportWorkComponent>;
  let mockActivatedRoute: any;

  beforeEach(async () => {
    mockActivatedRoute = {
      params: of({ mbid: 'test-mbid-123' })
    };

    await TestBed.configureTestingModule({
      imports: [ImportWorkComponent],
      providers: [
        { provide: ActivatedRoute, useValue: mockActivatedRoute }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ImportWorkComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set mbid from route params', () => {
    expect(component.mbid).toBe('test-mbid-123');
  });

  it('should display mbid when provided', () => {
    component.mbid = 'test-mbid-456';
    fixture.detectChanges();
    
    const compiled = fixture.nativeElement;
    expect(compiled.textContent).toContain('test-mbid-456');
  });
});

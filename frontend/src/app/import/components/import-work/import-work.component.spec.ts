import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideTesting } from '../../../testing/test-providers';
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
        ...provideTesting(),
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
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { LoaderHomeComponent } from './loader-home.component';

describe('LoaderHomeComponent', () => {
  let component: LoaderHomeComponent;
  let fixture: ComponentFixture<LoaderHomeComponent>;
  let mockActivatedRoute: any;

  beforeEach(async () => {
    mockActivatedRoute = {
      params: of({})
    };

    await TestBed.configureTestingModule({
      imports: [LoaderHomeComponent],
      providers: [
        { provide: ActivatedRoute, useValue: mockActivatedRoute }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoaderHomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display import link', () => {
    const compiled = fixture.nativeElement;
    const importLink = compiled.querySelector('a[routerLink="/loader/link"]');
    expect(importLink).toBeTruthy();
    expect(importLink.textContent).toContain('Import a new file');
  });

  it('should have correct routing for import link', () => {
    const compiled = fixture.nativeElement;
    const importLink = compiled.querySelector('a[routerLink="/loader/link"]');
    expect(importLink.getAttribute('routerLink')).toBe('/loader/link');
  });
});

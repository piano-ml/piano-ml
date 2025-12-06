import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { LibraryHomeComponent } from './library-home.component';

describe('LibraryHomeComponent', () => {
  let component: LibraryHomeComponent;
  let fixture: ComponentFixture<LibraryHomeComponent>;
  let mockActivatedRoute: any;

  beforeEach(async () => {
    mockActivatedRoute = {
      params: of({})
    };

    await TestBed.configureTestingModule({
      imports: [LibraryHomeComponent],
      providers: [
        { provide: ActivatedRoute, useValue: mockActivatedRoute }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LibraryHomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display import link', () => {
    const compiled = fixture.nativeElement;
    const importLink = compiled.querySelector('a[routerLink="/import/link"]');
    expect(importLink).toBeTruthy();
    expect(importLink.textContent).toContain('Import a new file');
  });

  it('should have correct routing for import link', () => {
    const compiled = fixture.nativeElement;
    const importLink = compiled.querySelector('a[routerLink="/import/link"]');
    expect(importLink.getAttribute('routerLink')).toBe('/import/link');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTesting } from '../../../testing/test-providers';
import { LibraryHomeComponent } from './library-home.component';

describe('LibraryHomeComponent', () => {
  let component: LibraryHomeComponent;
  let fixture: ComponentFixture<LibraryHomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LibraryHomeComponent],
      providers: provideTesting()
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
    expect(importLink.textContent).toContain('Import');
  });

  it('should have correct routing for import link', () => {
    const compiled = fixture.nativeElement;
    const importLink = compiled.querySelector('a[routerLink="/import/link"]');
    expect(importLink.getAttribute('routerLink')).toBe('/import/link');
  });
});

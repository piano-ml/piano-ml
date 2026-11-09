import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideTesting } from '../../../testing/test-providers';

import { OsmdComponent } from './osmd.component';

describe('OsmdComponent', () => {
  let component: OsmdComponent;
  let fixture: ComponentFixture<OsmdComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OsmdComponent],
      providers: [
        ...provideTesting(),
        // Skips loadMusicXML(), which builds a real OpenSheetMusicDisplay and
        // leaves async work running past the end of the spec.
        { provide: PLATFORM_ID, useValue: 'server' }
      ]
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

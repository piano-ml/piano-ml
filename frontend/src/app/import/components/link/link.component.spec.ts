import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { LinkComponent } from './link.component';
import { MusicbrainzService } from '../../../shared/services/musicbrainz.service';

describe('LinkComponent', () => {
  let component: LinkComponent;
  let fixture: ComponentFixture<LinkComponent>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockMusicbrainzService: jasmine.SpyObj<MusicbrainzService>;

  beforeEach(async () => {
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    const musicbrainzSpy = jasmine.createSpyObj('MusicbrainzService', [
      'searchWorks', 
      'searchWorksByArtistAndTitle',
      'getSongsOnly',
      'sortByRelevance',
      'getComposers',
      'getLyricists',
      'getRecordings',
      'getPrimaryLanguage'
    ]);

    await TestBed.configureTestingModule({
      imports: [LinkComponent, FormsModule, HttpClientTestingModule],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: MusicbrainzService, useValue: musicbrainzSpy }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LinkComponent);
    component = fixture.componentInstance;
    mockRouter = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    mockMusicbrainzService = TestBed.inject(MusicbrainzService) as jasmine.SpyObj<MusicbrainzService>;
    
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with default values', () => {
    expect(component.searchQuery).toBe('');
    expect(component.artistQuery).toBe('');
    expect(component.titleQuery).toBe('');
    expect(component.loading).toBeFalse();
    expect(component.showSongsOnly).toBeTrue();
  });

  it('should clear search', () => {
    component.searchQuery = 'test';
    component.artistQuery = 'artist';
    component.titleQuery = 'title';
    component.response = { created: '', count: 0, offset: 0, works: [] };
    component.error = 'some error';

    component.clearSearch();

    expect(component.searchQuery).toBe('');
    expect(component.artistQuery).toBe('');
    expect(component.titleQuery).toBe('');
    expect(component.response).toBeNull();
    expect(component.error).toBeNull();
  });
});

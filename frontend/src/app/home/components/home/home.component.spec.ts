import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { SITE } from '../../../shared/seo';
import { provideTesting } from '../../../testing/test-providers';
import { HOME_SEO, SUMMARY_SEO } from '../../home.seo';
import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let http: HttpTestingController;
  let mediaListeners: ((e: { matches: boolean }) => void)[];

  function render(mobile = false) {
    mediaListeners = [];
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: mobile,
      addEventListener: (_type: string, listener: (e: { matches: boolean }) => void) => mediaListeners.push(listener),
    } as unknown as MediaQueryList);
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await TestBed.configureTestingModule({ imports: [HomeComponent], providers: provideTesting() }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  it('wakes the API server up through a public endpoint of the API, ignoring the answer', () => {
    render();
    const warmUp = http.expectOne(`${environment.api}/score/stats`);
    expect(warmUp.request.method).toBe('GET');
    expect(() => warmUp.flush('Unavailable', { status: 503, statusText: 'Service Unavailable' })).not.toThrow();
  });

  it('never warms up through an account endpoint (its 401 would end the session and open the login page)', () => {
    render();
    expect(http.match((request) => request.url.includes('/account/'))).toEqual([]);
  });

  it('"Take a seat" goes to the summary page', () => {
    render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.summary();
    expect(navigate).toHaveBeenCalledWith(['summary']);
  });

  it('knows whether it is on a phone or tablet, and follows window resizes', () => {
    render(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 1024px)');
    expect(component.isMobileOrTablet()).toBe(true);
    mediaListeners[0]({ matches: false });
    expect(component.isMobileOrTablet()).toBe(false);
  });
});

describe('home SEO data', () => {
  it('describes the homepage as the canonical site root, with the organization and site search', () => {
    expect(HOME_SEO).toMatchObject({ title: SITE.defaultTitle, description: SITE.defaultDescription, canonical: '/' });
    const [organization, website] = HOME_SEO.structuredData as Record<string, unknown>[];
    expect(organization).toMatchObject({ '@type': 'Organization', name: SITE.name, url: SITE.url });
    expect(website).toMatchObject({ '@type': 'WebSite', publisher: { '@id': `${SITE.url}/#organization` } });
    const search = (website['potentialAction'] as { target: { urlTemplate: string } }).target.urlTemplate;
    expect(search).toBe(`${SITE.url}/library/popular?search={search_term_string}`);
  });

  it('describes the summary page as a free educational web application', () => {
    expect(SUMMARY_SEO.title).toBe('Features & Practice Tools');
    expect(SUMMARY_SEO.structuredData).toMatchObject({
      '@type': 'WebApplication', applicationCategory: 'EducationalApplication', offers: { price: '0' },
    });
  });
});

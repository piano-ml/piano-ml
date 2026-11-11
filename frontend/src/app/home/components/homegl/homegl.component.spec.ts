import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomeglComponent } from './homegl.component';
import { ShaderServer } from './homegl.testing';

/**
 * The homepage's animated WebGL background: loads GLSL shaders from assets/shader and renders one.
 * The rendering on real WebGL is in homegl.webgl.spec.ts (not run in CI).
 */
describe('HomeglComponent', () => {
  let fixture: ComponentFixture<HomeglComponent>;
  let component: HomeglComponent;
  afterEach(() => fixture?.destroy());

  describe('when the files are missing', () => {
    let http: HttpTestingController;
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      TestBed.configureTestingModule({ imports: [HomeglComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
      http = TestBed.inject(HttpTestingController);
      fixture = TestBed.createComponent(HomeglComponent);
      component = fixture.componentInstance;
    });

    it('looks for shader folders 1 to 20 without a manifest, and reports when none is found', async () => {
      const loading = component.loadAvailableShaders();
      http.expectOne('assets/shader/manifest.json?').flush('missing', { status: 404, statusText: 'Not Found' });
      await new Promise((resolve) => setTimeout(resolve));
      const probes = http.match(() => true);
      expect(probes).toHaveLength(40); // fragment + vertex for each folder
      for (const probe of probes) probe.flush('missing', { status: 404, statusText: 'Not Found' });
      await loading;
      expect(component.getAvailableShaderIndexes()).toEqual([]);
      expect(component.getCurrentShaderInfo()).toBeNull();
      expect(console.error).toHaveBeenCalledWith('❌ Aucun shader trouvé !');
    });

    it('names and describes shaders found without a manifest', async () => {
      const loading = component.loadAvailableShaders();
      http.expectOne('assets/shader/manifest.json?').flush(null);
      await new Promise((resolve) => setTimeout(resolve));
      for (const probe of http.match(() => true)) {
        if (probe.request.url.startsWith('assets/shader/6/')) probe.flush('void main() {}');
        else probe.flush('missing', { status: 404, statusText: 'Not Found' });
      }
      await loading;
      expect(component.getAllAvailableShaders()).toEqual([{ index: 6, name: 'Shader 6', description: 'Pas de description disponible' }]);
      expect(component.getCurrentShaderInfo()?.name).toBe('Shader 6');
    });
  });

  it('goes without the background, silently, when WebGL is unavailable', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const shaders = new ShaderServer();
    fixture = TestBed.createComponent(HomeglComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await shaders.waitFor(() => warn.mock.calls.length > 0);
    expect(alert).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('WebGL unavailable: the homepage background animation is disabled.');
    expect(component.program).toBeUndefined();
  });

  it('does nothing during server-side rendering', async () => {
    TestBed.configureTestingModule({
      imports: [HomeglComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_ID, useValue: 'server' }],
    });
    fixture = TestBed.createComponent(HomeglComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.initGlAndProgram();
    TestBed.inject(HttpTestingController).expectNone(() => true);
    expect(component.gl).toBeUndefined();
  });
});

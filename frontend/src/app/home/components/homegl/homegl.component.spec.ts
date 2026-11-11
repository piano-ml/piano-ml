import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SHADER_FILES } from '../../../testing/shader-fixtures';
import { HomeglComponent } from './homegl.component';

/** The homepage's animated WebGL background: loads GLSL shaders from assets/shader and renders one. */
describe('HomeglComponent', () => {
  let fixture: ComponentFixture<HomeglComponent>;
  let component: HomeglComponent;
  /** Set when the shader requests are answered with the real files (no test-server fetch: not served on CI). */
  let shaderServer: HttpTestingController | null = null;

  /** Answers every pending request with the matching file of src/assets/shader, or a 404. */
  function serveShaders() {
    for (const request of shaderServer?.match(() => true) ?? []) {
      const file = SHADER_FILES[request.request.url];
      if (file === undefined) request.flush('missing', { status: 404, statusText: 'Not Found' });
      else request.flush(file);
    }
  }

  async function waitFor(condition: () => boolean, timeout = 8000) {
    const start = Date.now();
    serveShaders();
    while (!condition()) {
      if (Date.now() - start > timeout) throw new Error('timed out waiting');
      await new Promise((resolve) => setTimeout(resolve, 20));
      serveShaders();
    }
  }

  /** Awaits a promise whose shader requests still need answering. */
  async function served<T>(promise: Promise<T>): Promise<T> {
    let done = false;
    const result = promise.finally(() => (done = true));
    await waitFor(() => done);
    return result;
  }

  function provideShaderFiles() {
    TestBed.configureTestingModule({ imports: [HomeglComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    shaderServer = TestBed.inject(HttpTestingController);
  }
  const canvas = () => fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;

  afterEach(() => {
    fixture?.destroy();
    shaderServer = null;
  });

  describe('with the real shaders (the files of assets/shader)', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      provideShaderFiles();
      fixture = TestBed.createComponent(HomeglComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('loads the shaders listed in the manifest', async () => {
      await waitFor(() => component.getAvailableShaderIndexes().length > 0);
      expect(component.getAvailableShaderIndexes().sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(component.getAllAvailableShaders().find((s) => s.index === 2)?.name).toBe('Galaxy Trip');
    });

    it('compiles and links the selected shader (always #6 for now) and renders it full screen', async () => {
      await waitFor(() => !!component.program);
      expect(component.getCurrentShaderInfo()?.index).toBe(6);
      expect(component.gl.getProgramParameter(component.program, component.gl.LINK_STATUS)).toBe(true);
      expect([canvas().width, canvas().height]).toEqual([window.innerWidth, window.innerHeight]);
      component.render(1000);
      expect(component.gl.getError()).toBe(component.gl.NO_ERROR);
    });

    it('keeps animating, then stops and frees WebGL when destroyed', async () => {
      await waitFor(() => !!component.program);
      const draw = vi.spyOn(component.gl, 'drawElements');
      await waitFor(() => draw.mock.calls.length >= 2);
      fixture.destroy();
      expect(component.animationRunning).toBe(false);
      expect(component.gl).toBeNull();
      expect(canvas().width).toBe(0);
      expect(window.onresize).toBeNull();
    });

    it('follows the window size', async () => {
      await waitFor(() => !!component.program);
      canvas().width = 10;
      component.resize();
      expect(canvas().width).toBe(window.innerWidth);
    });

    it('can switch to another shader', async () => {
      await waitFor(() => !!component.program);
      const before = component.program;
      component.switchToShader(1);
      await waitFor(() => !!component.program && component.program !== before);
      expect(component.getCurrentShaderInfo()?.index).toBe(1);
    });

    it('warns about an unknown shader', async () => {
      await waitFor(() => component.getAvailableShaderIndexes().length > 0);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      component.switchToShader(99);
      expect(warn).toHaveBeenCalled();
    });

    it('rejects a shader that does not compile', async () => {
      await waitFor(() => !!component.program);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(component.createShader('not glsl', component.gl.FRAGMENT_SHADER, 0)).toBeNull();
    });

    it('rejects a program that does not link', async () => {
      await waitFor(() => !!component.program);
      expect(component.createProgram([])).toBeNull();
    });

    it('reloads the shaders on demand', async () => {
      await waitFor(() => component.getAvailableShaderIndexes().length > 0);
      await served(component.reloadShaders());
      expect(component.getAvailableShaderIndexes().length).toBe(7);
    });
  });

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
    provideShaderFiles();
    fixture = TestBed.createComponent(HomeglComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await waitFor(() => warn.mock.calls.length > 0);
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

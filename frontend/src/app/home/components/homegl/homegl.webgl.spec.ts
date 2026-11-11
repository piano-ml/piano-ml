import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomeglComponent } from './homegl.component';
import { ShaderServer } from './homegl.testing';

/**
 * The homepage background on real WebGL: the shaders of assets/shader compiled, linked and rendered.
 * Excluded in CI (.github/workflows/test.yaml): the runners have no GPU. Run locally with the other specs.
 */
describe('HomeglComponent with the real shaders on WebGL', () => {
  let fixture: ComponentFixture<HomeglComponent>;
  let component: HomeglComponent;
  let shaders: ShaderServer;
  const canvas = () => fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    shaders = new ShaderServer();
    fixture = TestBed.createComponent(HomeglComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture?.destroy());

  it('loads the shaders listed in the manifest', async () => {
    await shaders.waitFor(() => component.getAvailableShaderIndexes().length > 0);
    expect(component.getAvailableShaderIndexes().sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(component.getAllAvailableShaders().find((s) => s.index === 2)?.name).toBe('Galaxy Trip');
  });

  it('compiles and links the selected shader (always #6 for now) and renders it full screen', async () => {
    await shaders.waitFor(() => !!component.program);
    expect(component.getCurrentShaderInfo()?.index).toBe(6);
    expect(component.gl.getProgramParameter(component.program, component.gl.LINK_STATUS)).toBe(true);
    expect([canvas().width, canvas().height]).toEqual([window.innerWidth, window.innerHeight]);
    component.render(1000);
    expect(component.gl.getError()).toBe(component.gl.NO_ERROR);
  });

  it('keeps animating, then stops and frees WebGL when destroyed', async () => {
    await shaders.waitFor(() => !!component.program);
    const draw = vi.spyOn(component.gl, 'drawElements');
    await shaders.waitFor(() => draw.mock.calls.length >= 2);
    fixture.destroy();
    expect(component.animationRunning).toBe(false);
    expect(component.gl).toBeNull();
    expect(canvas().width).toBe(0);
    expect(window.onresize).toBeNull();
  });

  it('follows the window size', async () => {
    await shaders.waitFor(() => !!component.program);
    canvas().width = 10;
    component.resize();
    expect(canvas().width).toBe(window.innerWidth);
  });

  it('can switch to another shader', async () => {
    await shaders.waitFor(() => !!component.program);
    const before = component.program;
    component.switchToShader(1);
    await shaders.waitFor(() => !!component.program && component.program !== before);
    expect(component.getCurrentShaderInfo()?.index).toBe(1);
  });

  it('warns about an unknown shader', async () => {
    await shaders.waitFor(() => component.getAvailableShaderIndexes().length > 0);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    component.switchToShader(99);
    expect(warn).toHaveBeenCalled();
  });

  it('rejects a shader that does not compile', async () => {
    await shaders.waitFor(() => !!component.program);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(component.createShader('not glsl', component.gl.FRAGMENT_SHADER, 0)).toBeNull();
  });

  it('rejects a program that does not link', async () => {
    await shaders.waitFor(() => !!component.program);
    expect(component.createProgram([])).toBeNull();
  });

  it('reloads the shaders on demand', async () => {
    await shaders.waitFor(() => component.getAvailableShaderIndexes().length > 0);
    await shaders.served(component.reloadShaders());
    expect(component.getAvailableShaderIndexes().length).toBe(7);
  });
});

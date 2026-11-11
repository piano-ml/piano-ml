import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SHADER_FILES } from '../../../testing/shader-fixtures';
import { HomeglComponent } from './homegl.component';

/**
 * Test helpers for the homegl specs: the component's shader requests are answered with the real files of
 * src/assets/shader (bundled, see shader-fixtures.ts) instead of being fetched from the test server.
 */
export class ShaderServer {
  private readonly http: HttpTestingController;

  constructor() {
    TestBed.configureTestingModule({ imports: [HomeglComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    this.http = TestBed.inject(HttpTestingController);
  }

  /** Answers every pending request with the matching file of src/assets/shader, or a 404. */
  serve() {
    for (const request of this.http.match(() => true)) {
      const file = SHADER_FILES[request.request.url];
      if (file === undefined) request.flush('missing', { status: 404, statusText: 'Not Found' });
      else request.flush(file);
    }
  }

  /** Waits for a condition, answering the shader requests meanwhile. */
  async waitFor(condition: () => boolean, timeout = 8000) {
    const start = Date.now();
    this.serve();
    while (!condition()) {
      if (Date.now() - start > timeout) throw new Error('timed out waiting');
      await new Promise((resolve) => setTimeout(resolve, 20));
      this.serve();
    }
  }

  /** Awaits a promise whose shader requests still need answering. */
  async served<T>(promise: Promise<T>): Promise<T> {
    let done = false;
    const result = promise.finally(() => (done = true));
    await this.waitFor(() => done);
    return result;
  }
}

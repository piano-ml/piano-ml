/**
 * The homepage shaders (src/assets/shader), bundled into the specs as text: the homegl specs answer the
 * component's requests with the real files instead of fetching them from the test server.
 */
import manifest from '../../assets/shader/manifest.json' with { type: 'json' };
import shader1Fragment from '../../assets/shader/1/fragment_shader.glsl' with { loader: 'text' };
import shader1Vertex from '../../assets/shader/1/vertex_shader.glsl' with { loader: 'text' };
import shader2Fragment from '../../assets/shader/2/fragment_shader.glsl' with { loader: 'text' };
import shader2Vertex from '../../assets/shader/2/vertex_shader.glsl' with { loader: 'text' };
import shader3Fragment from '../../assets/shader/3/fragment_shader.glsl' with { loader: 'text' };
import shader3Vertex from '../../assets/shader/3/vertex_shader.glsl' with { loader: 'text' };
import shader4Fragment from '../../assets/shader/4/fragment_shader.glsl' with { loader: 'text' };
import shader4Vertex from '../../assets/shader/4/vertex_shader.glsl' with { loader: 'text' };
import shader5Fragment from '../../assets/shader/5/fragment_shader.glsl' with { loader: 'text' };
import shader5Vertex from '../../assets/shader/5/vertex_shader.glsl' with { loader: 'text' };
import shader6Fragment from '../../assets/shader/6/fragment_shader.glsl' with { loader: 'text' };
import shader6Vertex from '../../assets/shader/6/vertex_shader.glsl' with { loader: 'text' };
import shader7Fragment from '../../assets/shader/7/fragment_shader.glsl' with { loader: 'text' };
import shader7Vertex from '../../assets/shader/7/vertex_shader.glsl' with { loader: 'text' };

/** URL requested by the component -> file content. */
export const SHADER_FILES: Record<string, string | object> = {
  'assets/shader/manifest.json?': manifest,
  'assets/shader/1/fragment_shader.glsl': shader1Fragment,
  'assets/shader/1/vertex_shader.glsl': shader1Vertex,
  'assets/shader/2/fragment_shader.glsl': shader2Fragment,
  'assets/shader/2/vertex_shader.glsl': shader2Vertex,
  'assets/shader/3/fragment_shader.glsl': shader3Fragment,
  'assets/shader/3/vertex_shader.glsl': shader3Vertex,
  'assets/shader/4/fragment_shader.glsl': shader4Fragment,
  'assets/shader/4/vertex_shader.glsl': shader4Vertex,
  'assets/shader/5/fragment_shader.glsl': shader5Fragment,
  'assets/shader/5/vertex_shader.glsl': shader5Vertex,
  'assets/shader/6/fragment_shader.glsl': shader6Fragment,
  'assets/shader/6/vertex_shader.glsl': shader6Vertex,
  'assets/shader/7/fragment_shader.glsl': shader7Fragment,
  'assets/shader/7/vertex_shader.glsl': shader7Vertex,
};

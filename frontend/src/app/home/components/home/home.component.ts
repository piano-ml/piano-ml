import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { type AfterViewInit, ChangeDetectionStrategy, Component, type ElementRef, OnInit, ViewChild, inject, PLATFORM_ID } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
// biome-ignore lint/style/useImportType: <explanation>
import { Router, RouterModule } from '@angular/router';
import { noop } from 'rxjs';


interface ShaderManifest {
  shaders: Array<{
    id: number;
    name: string;
    description: string;
  }>;
}

interface ShaderSet {
  fragment: string;
  vertex: string;
  index: number;
  name?: string;
  description?: string;
}

@Component({
  selector: 'app-home',
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements AfterViewInit {

  @ViewChild('glCanvas') canvas!: ElementRef<HTMLCanvasElement>;

  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private isBrowser: boolean;

  gl!: WebGLRenderingContext
  program!: WebGLProgram
  iTimeLocation!: WebGLUniformLocation
  iMouseLocation!: WebGLUniformLocation | null
  inPos!: GLint
  iResolution!: WebGLUniformLocation
  bufObjInx!: WebGLBuffer
  animmationRunning: true | false = true;

  // Shaders chargés dynamiquement
  private availableShaders: ShaderSet[] = [];
  private selectedShader: ShaderSet | null = null;
  private isInitialized = false;



  constructor(private router: Router, private titleService: Title, private metaService: Meta) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    this.render = this.render.bind(this);
    
    // SEO: Page Title
    this.titleService.setTitle('PianoML: Learn Piano with Smart Sheet Music & Practice Tools');
    
    // SEO: Meta Tags
    this.metaService.addTags([
      { name: 'description', content: 'Learn piano with PianoML: A free, open-source web app supporting MusicXML, MIDI, and PDF sheet music. Practice scales, get instant feedback, and build your personal music library with OMR technology.' },
      { name: 'keywords', content: 'piano learning app, piano education software, sight reading' },
      { name: 'author', content: 'PianoML' },
      { name: 'robots', content: 'index, follow' },
      { property: 'og:title', content: 'PianoML: Learn Piano with Smart Sheet Music & Practice Tools' },
      { property: 'og:description', content: 'Free piano learning app supporting MusicXML, MIDI, and PDF files. Practice scales, get instant feedback, and organize your music library.' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://www.pianoml.com' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'PianoML: Learn Piano with Smart Sheet Music & Practice Tools' },
      { name: 'twitter:description', content: 'Free piano learning app supporting MusicXML, MIDI, and PDF files. Practice scales and get instant feedback.' },
      { name: 'application-name', content: 'PianoML' },
      { name: 'apple-mobile-web-app-title', content: 'PianoML' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' }
    ]);
  }

  /**
   * Charge dynamiquement tous les shaders disponibles
   * 1. Essaie d'abord de charger le manifeste
   * 2. Sinon, fait une recherche automatique
   */
  async loadAvailableShaders(): Promise<void> {
    
    // Méthode 1: Essayer de charger depuis le manifeste
    const manifestShaders = await this.loadFromManifest();
    
    if (manifestShaders.length > 0) {
      this.availableShaders = manifestShaders;
    } else {
      // Méthode 2: Recherche automatique
      await this.autoDiscoverShaders();
    }

    if (this.availableShaders.length > 0) {
      this.selectRandomShader();
    } else {
      console.error('❌ Aucun shader trouvé !');
    }
  }

  /**
   * Charge les shaders depuis le fichier manifeste
   */
  private async loadFromManifest(): Promise<ShaderSet[]> {
    try {
      const manifest = await this.http.get<ShaderManifest>('assets/shader/manifest.json').toPromise();
      if (!manifest?.shaders) {
        return [];
      }

      const loadPromises = manifest.shaders.map(shaderInfo => 
        this.tryLoadShaderSet(shaderInfo.id, shaderInfo.name, shaderInfo.description)
      );

      const results = await Promise.allSettled(loadPromises);
      return results
        .filter((result): result is PromiseFulfilledResult<ShaderSet> => 
          result.status === 'fulfilled' && result.value !== null)
        .map(result => result.value);
    } catch (error) {
      console.log('ℹ️ Pas de manifeste trouvé, utilisation de la détection automatique');
      return [];
    }
  }

  /**
   * Recherche automatique des shaders (fallback)
   */
  private async autoDiscoverShaders(): Promise<void> {
    const maxShaderFolders = 20; // Limite raisonnable
    const loadPromises: Promise<ShaderSet | null>[] = [];

    // Essaye de charger les shaders de 1 à maxShaderFolders
    for (let i = 1; i <= maxShaderFolders; i++) {
      loadPromises.push(this.tryLoadShaderSet(i));
    }

    const results = await Promise.allSettled(loadPromises);
    this.availableShaders = results
      .filter((result): result is PromiseFulfilledResult<ShaderSet> => 
        result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value);

  }

  /**
   * Tente de charger un set de shaders depuis un dossier spécifique
   */
  private async tryLoadShaderSet(index: number, name?: string, description?: string): Promise<ShaderSet | null> {
    try {
      const [fragmentResponse, vertexResponse] = await Promise.all([
        this.http.get(`assets/shader/${index}/fragment_shader.glsl`, { responseType: 'text' }).toPromise(),
        this.http.get(`assets/shader/${index}/vertex_shader.glsl`, { responseType: 'text' }).toPromise()
      ]);

      if (fragmentResponse && vertexResponse) {
        return {
          fragment: fragmentResponse,
          vertex: vertexResponse,
          index,
          name,
          description
        };
      }
      return null;
    } catch (error) {
      // Silencieux - c'est normal que certains dossiers n'existent pas
      return null;
    }
  }

  /**
   * Sélectionne aléatoirement un shader parmi ceux disponibles
   */
  selectRandomShader(): void {
    
    // Exclude shader 4 too heavy
    const filteredShaders = this.availableShaders.filter(s => s.index !== 4);
    if (filteredShaders.length > 0) {
      const randomIndex = Math.floor(Math.random() * filteredShaders.length);
      //const randomIndex=5;
      this.selectedShader = filteredShaders[randomIndex];
    }
  }

  /**
   * Change de shader manuellement
   */
  switchToShader(index: number): void {
    const shader = this.availableShaders.find(s => s.index === index);
    if (shader) {
      this.selectedShader = shader;
      // Redémarrer l'initialisation WebGL si nécessaire
      if (this.gl && this.isInitialized) {
        this.tearDownGL();
        this.initGlAndProgram();
      }
    } else {
      console.warn(`⚠️ Shader ${index} non trouvé. Disponibles:`, this.availableShaders.map(s => s.index));
    }
  }

  /**
   * Retourne la liste des index de shaders disponibles
   */
  getAvailableShaderIndexes(): number[] {
    return this.availableShaders.map(s => s.index);
  }

  /**
   * Retourne des informations sur le shader actuellement sélectionné
   */
  getCurrentShaderInfo(): { index: number; name: string; description: string } | null {
    if (!this.selectedShader) {
      return null;
    }
    
    return {
      index: this.selectedShader.index,
      name: this.selectedShader.name || `Shader ${this.selectedShader.index}`,
      description: this.selectedShader.description || 'Pas de description disponible'
    };
  }

  /**
   * Retourne la liste complète des shaders disponibles avec leurs infos
   */
  getAllAvailableShaders(): Array<{ index: number; name: string; description: string }> {
    return this.availableShaders.map(shader => ({
      index: shader.index,
      name: shader.name || `Shader ${shader.index}`,
      description: shader.description || 'Pas de description disponible'
    }));
  }

  /**
   * Force le rechargement des shaders
   */
  async reloadShaders(): Promise<void> {
    this.availableShaders = [];
    this.selectedShader = null;
    await this.loadAvailableShaders();
  }

  async initGlAndProgram() {
    if (!this.isBrowser) {
      return;
    }
    
    // S'assurer que les shaders sont chargés
    if (!this.selectedShader) {
      console.error('❌ Aucun shader sélectionné. Chargement des shaders...');
      await this.loadAvailableShaders();
    }

    if (!this.selectedShader) {
      console.error('❌ Impossible de charger les shaders');
      return;
    }

    try {
      const glContext = this.canvas.nativeElement.getContext('webgl');
      if (!glContext) {
        throw new Error('Unable to initialize WebGL. Your browser or machine may not support it.');
      }
      this.gl = glContext;
    } catch (e) {
      console.error('Error initializing WebGL', e);
    }
    if (!this.gl) {
      alert('Unable to initialize WebGL. Your browser or machine may not support it.');
      return;
    }

    // Set clear color to black, fully opaque
    this.gl.clearColor(0.0, 0.0, 0.0, 0.5);
    // Clear the color buffer with specified clear color
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    
    const program = this.createProgram(
      [
        this.createShader(this.selectedShader.vertex, this.gl.VERTEX_SHADER, 0),
        this.createShader(this.selectedShader.fragment, this.gl.FRAGMENT_SHADER, 0)
      ].filter((shader): shader is WebGLShader => shader !== null));

    if (!program) {
      console.error('Error creating program');
      return;
    }
    this.program = program;

    if (!program) {
      console.error('Error creating program');
      return;
    }

    this.inPos = this.gl.getAttribLocation(this.program, "inPos");
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    this.iTimeLocation = this.gl.getUniformLocation(this.program, "iTime")!;
    this.iMouseLocation = this.gl.getUniformLocation(this.program, "iMouse"); // Peut être null si non utilisé
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    this.iResolution = this.gl.getUniformLocation(this.program, "iResolution")!;
    this.gl.useProgram(program);
    this.gl.uniform1f(this.gl.getUniformLocation(this.program, "iTime"), 0.);
    
    // Seulement initialiser iMouse si l'uniform existe
    if (this.iMouseLocation) {
      this.gl.uniform4f(this.iMouseLocation, 0.0, 0.0, 0.0, 0.0);
    }


    const pos = [-1, -1, 1, -1, 1, 1, -1, 1];
    const inx = [0, 1, 2, 0, 2, 3];
    const bufObjPos = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, bufObjPos);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(pos), this.gl.STATIC_DRAW);
    this.bufObjInx = this.gl.createBuffer();
    //this.bufObjInx.len = inx.length;
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.bufObjInx);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(inx), this.gl.STATIC_DRAW);


    this.gl.enableVertexAttribArray(this.inPos);
    this.gl.vertexAttribPointer(this.inPos, 2, this.gl.FLOAT, false, 0, 0);

    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0);

    if (this.isBrowser) {
      window.onresize = this.resize;
    }
    this.resize();
    this.isInitialized = true;
    requestAnimationFrame(this.render);
  }


  resize() {
    if (!this.isBrowser || !this.canvas) {
      return;
    }
    const vp_size = [window.innerWidth, window.innerHeight];
    this.canvas.nativeElement.width = vp_size[0];
    this.canvas.nativeElement.height = vp_size[1];
  }



  render(deltaMS: number) {
    if (!this.gl) {
      return
    }
    this.gl.viewport(0, 0, this.canvas.nativeElement.width, this.canvas.nativeElement.height);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.gl.uniform1f(this.iTimeLocation, deltaMS / 1000.0);

    this.gl.uniform2f(this.iResolution, this.canvas.nativeElement.width, this.canvas.nativeElement.height);
    
    // Seulement mettre à jour iMouse si l'uniform existe
    if (this.iMouseLocation) {
      this.gl.uniform4f(this.iMouseLocation, 0.0, 0.0, 0.0, 0.0);
    }
    
    this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
    if (this.animmationRunning) {
      requestAnimationFrame(this.render);
    }
  }


  tearDownGL() {
    if (this.gl) {
      this.animmationRunning = false;
      this.gl.finish();
      this.gl.flush();
      this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
      this.gl.deleteProgram(this.program);
      this.gl.deleteBuffer(this.bufObjInx);
      //this.gl.deleteBuffer(this.bu
      this.gl.deleteBuffer(this.gl.getParameter(this.gl.ARRAY_BUFFER_BINDING));
      this.gl.deleteBuffer(this.gl.getParameter(this.gl.ELEMENT_ARRAY_BUFFER_BINDING));
      this.gl.useProgram(null);
      this.gl = null as unknown as WebGLRenderingContext;
      this.program = null as unknown as WebGLProgram;
      this.bufObjInx = null as unknown as WebGLBuffer;
      if (this.canvas) {
        this.canvas.nativeElement.width = 0;
        this.canvas.nativeElement.height = 0;
      }
    }
  }

  summary() {
    this.tearDownGL();
    this.router.navigate(['summary']);
  }

  async ngAfterViewInit(): Promise<void> {
    // Warm up the server (ignore response and errors)
    void this.http.get('/account/userinfo').subscribe({
      next: noop,
      error: noop
    });

    if (!this.isBrowser) {
      return;
    }

    // Chargement dynamique des shaders au démarrage
    await this.loadAvailableShaders();
    
    // Initialisation WebGL avec le shader sélectionné
    await this.initGlAndProgram();
  }

  createProgram(shaders: WebGLShader[]): WebGLProgram | null {

    const program = this.gl.createProgram();
    for (let ii = 0; ii < shaders.length; ++ii) {
      this.gl.attachShader(program, shaders[ii]);
    }
    this.gl.linkProgram(program);
    // Check the link status
    const linked = this.gl.getProgramParameter(program, this.gl.LINK_STATUS);
    if (!linked) {
      // something went wrong with the link
      const lastError = this.gl.getProgramInfoLog(program);
      console.log(`Error in program linking:${lastError}`);
      this.gl.deleteProgram(program);
      return null;
    }
    // todo in create program !
    const status = this.gl.getProgramParameter(program, this.gl.LINK_STATUS);
    if (!status) {
      console.error(this.gl.getProgramInfoLog(program));
    }
    return program;
  }


  createShader(source: string, type: GLenum, offset: number): WebGLShader | null {

    const shader = this.gl.createShader(type);
    if (!shader) {
      console.error(`*** Error creating shader ${type}`);
      return null
    }
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    const compiled = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS);

    if (!compiled) {
      // Something went wrong during compilation; get the error
      const lastError = this.gl.getShaderInfoLog(shader);
      console.error(`*** Error compiling shader ${source}:${lastError}`);
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }


  resizeCanvasToDisplaySize(canvas: HTMLCanvasElement, multiplier = 1) {

    const width = canvas.clientWidth * multiplier | 0;
    const height = canvas.clientHeight * multiplier | 0;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      return true;
    }
    return false;
  }


}


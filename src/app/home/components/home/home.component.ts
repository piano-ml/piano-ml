import { CommonModule } from '@angular/common';
import { type AfterViewInit, ChangeDetectionStrategy, Component, type ElementRef, OnInit, ViewChild } from '@angular/core';
// biome-ignore lint/style/useImportType: <explanation>
import { Router, RouterModule } from '@angular/router';
import fragmentScript from '../../../../assets/shader/fragment_shader1.glsl'
import vertexScript from '../../../../assets/shader/vertex_shader1.glsl'


@Component({
  selector: 'app-home',
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements AfterViewInit {

  @ViewChild('glCanvas') canvas!: ElementRef<HTMLCanvasElement>;

  gl!: WebGLRenderingContext
  program!: WebGLProgram
  iTimeLocation!: WebGLUniformLocation
  inPos!: GLint
  iResolution!: WebGLUniformLocation
  bufObjInx!: WebGLBuffer
  animmationRunning: true | false = true;


  constructor(private router: Router) {
    this.render = this.render.bind(this);
  }

  initGlAndProgram() {
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
      return; // Ensure this is inside a valid function or method scope
    }

    // Set clear color to black, fully opaque
    this.gl.clearColor(0.0, 0.0, 0.0, 0.5);
    // Clear the color buffer with specified clear color
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    const program = this.createProgram(
      [
        this.createShader(vertexScript, this.gl.VERTEX_SHADER, 0),
        this.createShader(fragmentScript, this.gl.FRAGMENT_SHADER, 0)
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
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    this.iResolution = this.gl.getUniformLocation(this.program, "iResolution")!;
    this.gl.useProgram(program);
    this.gl.uniform1f(this.gl.getUniformLocation(this.program, "iTime"), 0.);


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

    window.onresize = this.resize;
    this.resize();
    requestAnimationFrame(this.render);

  }


  resize() {
    if (!this.canvas) {
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
    // this.gl.uniform2f(this.programLocations.get("iMouse") ?? null, 0, 0);
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

  ngAfterViewInit(): void {
    this.initGlAndProgram();
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


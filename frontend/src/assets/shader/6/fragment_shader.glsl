precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform sampler2D iChannel0;
  /* Shading constants */
  /* --------------------- */
  const vec3 LP = vec3(0, 0, 0);  // light position
  const vec3 LC = vec3(.85,0.80,0.70);    // light colour
  const vec3 HC1 = vec3(.5, .4, .3);      // hemisphere light colour 1
  const vec3 HC2 = vec3(0.1,.1,.6)*.5;    // hemisphere light colour 2
  const vec3 HLD = vec3(0,1,0);           // hemisphere light direction
  const vec3 BC = vec3(0.25,0.25,0.25);   // back light colour
  const vec3 FC = vec3(1.30,1.20,1.00);   // fresnel colour
  const float AS = .5;                    // ambient light strength
  const float DS = 1.;                    // diffuse light strength
  const float BS = .3;                    // back light strength
  const float FS = .3;                    // fresnel strength
  /* Raymarching constants */
  /* --------------------- */
  const float MAX_TRACE_DISTANCE = 50.;             // max trace distance
  const float INTERSECTION_PRECISION = 0.0001;       // precision of the intersection
  const int NUM_OF_TRACE_STEPS = 256;               // max number of trace steps
  const float STEP_MULTIPLIER = 1.;                 // the step mutliplier - ie, how much further to progress on each step
  
  /* Structures */
  /* ---------- */
  struct Camera {
    vec3 ro;
    vec3 rd;
    vec3 forward;
    vec3 right;
    vec3 up;
    float FOV;
  };
  struct Surface {
    float len;
    vec3 position;
    vec3 colour;
    float id;
    float steps;
    float AO;
  };
struct Model {
    float dist;
    vec3 colour;
    float id;
};


  /* RNG */
  /* ---------- */
  // Hash without sine from Dave Hoskins
  // https://www.shadertoy.com/view/4djSRWa
  float hash12(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx+33.33);
    return fract((p3.xx+p3.yz)*p3.zy);
  }
  
  
  /* Utilities */
  /* ---------- */
  vec2 toScreenspace(in vec2 p) {
    vec2 uv = (p - 0.5 * iResolution.xy) / min(iResolution.y, iResolution.x);
    return uv;
  }
  mat2 R(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, -s, s, c);
  }
  Camera getCamera(in vec2 uv, in vec3 pos, in vec3 target) {
    vec3 f = normalize(target - pos);
    vec3 r = normalize(vec3(f.z, 0., -f.x));
    vec3 u = normalize(cross(f, r));
    
    float FOV = .6;
    
    return Camera(
      pos,
      normalize(f + FOV * uv.x * r + FOV * uv.y * u),
      f,
      r,
      u,
      FOV
    );
  }
  // folding from gaz: https://www.shadertoy.com/view/4tX3DS
  vec2 fold(vec2 p, float a) {
      p.x=abs(p.x);
      vec2 n = vec2(cos(a),sin(a));
      for(int i = 0; i < 2; ++i)
      {
          p -= 2.*min(0.,dot(p,n))*n;
          n = normalize(n-vec2(1.,0.));
      }
      return p;
  }
  vec3 path(in float delta) {
    return vec3(cos(delta*.1) * 4.2 + sin((delta) * .3) * .5*cos(delta * .05), sin(delta * .04) * 5.4+cos(delta * .04) * 5.4, delta);
  }
  
  #define PI 3.14159236
  #define SCALE 2.5
  
  
  //--------------------------------
  // Modelling
  //--------------------------------
  Model model(vec3 p) {
    float d = length(p)-.4;
    
    p.xy -= path(p.z).xy;
    float m=length(p.xy)*.5;
    float z = p.z;
    float r = cos(z*.2+sin(m)*.3)*.4+.5;
    float r2 = (sin(z*.05124)*cos(z*.025203))+1.;
    p*=SCALE;
    
    vec3 q=p;
    p=vec3(R(0.05*p.z+r)*p.xy, p.z);
    p.xy=fold(p.xy,PI/6.+z*.2);
    p=mod(p,3.)-1.5;
    
    vec3 o = abs(p); 
    o-=(o.x+o.y+o.z)*0.33333;
    float d0=max(o.x,max(o.y,o.z))-0.01;
    float d1=length(q.xy)-1.-r2*2.;
    d0=max(d0,-d1);
    d0=max(d0,length(q.xy)-4.-r2*2.);
    d=length( vec2(abs(d0), length(mod(p,vec3(.1))-.05)) )-.3*r;
    
    vec3 colour = mix(mix(vec3(.8,.3,.6), vec3(.3,.9,.9), vec3(cos(z*.1)*.5+.5, sin(z*.12)*.5+.5, cos(z*.05+1.)*.5+.5)), vec3(1.,.6,.4)*.1, m);
    return Model(d/SCALE, colour, 1.);
  }
  Model map( vec3 p ){
    return model(p);
  }
  
  /* Modelling utilities */
  /* ---------- */
  // I *think* I borrowed this from Shane, but probably orginally comes from IQ. 
  // Calculates the normal by taking a very small distance,
  // remapping the function, and getting normal for that
  vec3 calcNormal( in vec3 pos ){
    vec3 eps = vec3( 0.001, 0.0, 0.0 );
    vec3 nor = vec3(
      map(pos+eps.xyy).dist - map(pos-eps.xyy).dist,
      map(pos+eps.yxy).dist - map(pos-eps.yxy).dist,
      map(pos+eps.yyx).dist - map(pos-eps.yyx).dist );
    return normalize(nor);
  }
  
  //--------------------------------
  // Raymarcher
  //--------------------------------
  Surface march( in Camera cam ){
    float h = 1e4; // local distance
    float d = 0.; // ray depth
    float id = -1.; // surace id
    float s = 0.; // number of steps
    float ao = 0.; // march space AO. Simple weighted accumulator. Not really AO, but ¯\_(ツ)_/¯
    vec3 p; // ray position
    vec3 c; // surface colour

    for( int i=0; i< NUM_OF_TRACE_STEPS ; i++ ) {
      if( abs(h) < INTERSECTION_PRECISION || d > MAX_TRACE_DISTANCE ) break;
      p = cam.ro+cam.rd*d;
      Model m = map( p );
      h = m.dist;
      d += h * STEP_MULTIPLIER;
      id = m.id;
      s += 1.;
      ao += max(h, 0.);
      c = m.colour;
    }

    if( d >= MAX_TRACE_DISTANCE ) id = -1.0;

    return Surface( d, p, c, id, s, ao );
  }
  
  //--------------------------------
  // Shading
  //--------------------------------
  /*
   * Soft shadows and AO curtesy of Inigo Quilez
   * https://iquilezles.org/articles/rmshadows
  */
  float softshadow( in vec3 ro, in vec3 rd, in float mint, in float tmax ) {
    float res = 1.0;
    float t = mint;
    for( int i=0; i<16; i++ ) {
      float h = map( ro + rd*t ).dist;
      res = min( res, 8.0*h/t );
      t += clamp( h, 0.02, 0.10 );
      if( h<0.001 || t>tmax ) break;
    }
    return clamp( res, 0.0, 1.0 );
  }
  float AO( in vec3 pos, in vec3 nor ) {
    float occ = 0.0;
    float sca = 1.0;
    for( int i=0; i<5; i++ )
    {
      float hr = 0.01 + 0.12*float(i)/4.0;
      vec3 aopos =  nor * hr + pos;
      float dd = map( aopos ).dist;
      occ += -(dd-hr)*sca;
      sca *= 0.95;
    }
    return clamp( 1.0 - 3.0*occ, 0.0, 1.0 );    
  }
  vec3 shade(vec3 col, vec3 pos, vec3 nor, vec3 ref, Camera cam) {
    
    vec3 plp = LP - pos; // point light
    
    float o = AO( pos, nor );                 // Ambient occlusion
    vec3  l = normalize( plp );                    // light direction
    
    float d = clamp( dot( nor, l ), 0.0, 1.0 )*DS;   // diffuse component
    float b = clamp( dot( nor, normalize(vec3(-l.x,0,-l.z))), 0.0, 1.0 )*clamp( 1.0-pos.y,0.0,1.0)*BS; // back light component
    float f = pow( clamp(1.0+dot(nor,cam.rd),0.0,1.0), 2.0 )*FS; // fresnel component

    vec3 c = vec3(0.0);
    c += d*LC;                           // diffuse light integration
    c += mix(HC1,HC2,dot(nor, HLD))*AS;        // hemisphere light integration (ambient)
    c += b*BC*o;       // back light integration
    c += f*FC*o;       // fresnel integration
    
    return col*c;
  }
  vec3 render(Surface surface, Camera cam, vec2 uv) {
    vec3 colour = vec3(.04,.045,.05);
    colour = vec3(.1, .0, .3);
    vec3 colourB = vec3(.1, .05, .2);
    
    vec2 pp = uv;
    
    colour = mix(colourB, colour, pow(length(pp), 2.)/1.5);
    vec3 bg = colour;

      vec3 surfaceNormal = calcNormal( surface.position );
      vec3 ref = reflect(cam.rd, surfaceNormal);
      colour = surfaceNormal;
      vec3 pos = surface.position;
      
      vec3 col = surface.colour;
      
      colour = shade(col, pos, surfaceNormal, ref, cam);
    
    
    float sceneLength = length(cam.ro - surface.position);
    float fog = smoothstep(MAX_TRACE_DISTANCE, -3., sceneLength);
    colour = mix(bg, colour, pow(fog, 2.));
    
    
    colour *= clamp(1./(surface.steps*.02), .2, 10.);


    return colour;
  }


  void mainImage( out vec4 c, in vec2 f ) {
    vec2 uv = toScreenspace(f.xy);
    
    float t = iTime*5.;
    vec3 la = path(t+.5);
    Camera cam = getCamera(uv, path(t), la);
    
    vec2 a = sin(vec2(1.5707963, 0) - path(la.z).x/8.); 
    mat2 rM = mat2(a, -a.y, a.x);
    cam.rd.xy *= rM;
    
    Surface surface = march(cam);
    
    vec3 r = render(surface, cam, uv);
    
    c = texture2D(iChannel0, f/iResolution.xy) * .8;
    vec4 c2 = vec4(r,1);
    c = clamp(mix(c+c2, c2*2., clamp(surface.len*.05, 0., 1.)), vec4(0.), vec4(1));
  }


// Wrapper main pour compatibilité WebGL (comme dans shader 5)
void main() {
    vec4 color = vec4(0.0);
    mainImage(color, gl_FragCoord.xy);
    gl_FragColor = color;
}

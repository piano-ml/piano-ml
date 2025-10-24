precision mediump float;

uniform vec2 iResolution;
uniform float iTime;

// Performance optimization parameters
#define ANIMATION_SPEED 0.2        // Animation speed multiplier (lower = slower)
#define MAIN_ITERATIONS 50.0       // Main raymarching loop iterations (was 60)
#define INNER_ITERATIONS 5.0       // Inner fractal iterations (was 7)
#define MANDELBROT_ITERATIONS 7.0  // Mandelbrot iterations (was 8)
#define MANDELBROT_THRESHOLD 3.0   // Mandelbrot break threshold (was 4)
#define STEP_DIVISOR 180.0         // Ray step size divisor (was 200, lower = bigger steps)
#define STEP_EPSILON 8e-6          // Minimum step size (was 8e-6)
#define COLOR_THRESHOLD 5.0        // Color accumulation threshold (was 5)
#define COLOR_INTENSITY 0.6e-1     // Color intensity multiplier (was 0.6e-1)
#define EXP_COMPLEXITY 1e1         // Exponential calculation complexity (was 1e1)
#define EXP_MULTIPLIER 2e1         // Exponential multiplier (was 2e1)

#define rot(x) mat2(cos(x+vec4(0,11,33,0)))

//Rodrigues-Euler axis angle rotation - not used here but it nice
#define ROT(p,axis,t) mix(axis*dot(p,axis),p,cos(t))+sin(t)*cross(p,axis)

//formula for creating colors;
#define H(h)  (  cos(  h*h/3. + vec3(0,1,4)   )*.9 + .4 )

//formula for mapping scale factor 
#define M(c)  log(c)

#define R iResolution

//polar repeat by fabriceneyret2
vec2 polarRep(vec2 U, float n) {
    n = 6.283/n;
    float a = atan(U.y, U.x),
          r = length(U);
    a = mod(a+n/2.,n) - n/2.;
    U = r * vec2(cos(a), sin(a));
    return .5* ( U+U - vec2(1,0) );
}

void main() {
    vec2 U = gl_FragCoord.xy;
    vec4 O = vec4(0);
    
    vec3 c=vec3(0);
    vec4 rd = normalize( vec4(U-.5*R.xy, .8*R.y, R.y))*2000.;
    
    float sc,dotp,totdist=0., t1=.95, tt=iTime*ANIMATION_SPEED, t=0.; // Slow down animation by 0.5x
 
    float sn = mod(iTime,20.)<12. ? 0. : 1.;
    float sn2 = mod(iTime,40.)<20. ? 0. : 1.;
    
    for (float i=0.; i<MAIN_ITERATIONS; i++) {
        
        vec4 p = vec4( rd*totdist);
        
        float shell =  length(p) - .5*sn2;
        p.z += (1.-sn)*-18. +sn*-10. + mod( (1.-sn)*tt*3.,40.);
        
        p.xz *= rot( 3.14/2. + sn*tt );

        p.yzw = p.xyz; 
  
     
        sc = 1.; 

        float rotsign = p.x > 0. ? 1. : -1.;
        p.zw *= rot( (tt/3. + sin(tt/6.) )*rotsign);
        
        p.wz = polarRep(p.wz,6.);  //hex is so much nicer than square
   
        vec4 w = p;
     
        for (float j=0.; j<INNER_ITERATIONS; j++) {
          
            p = abs(p)*.7;
                        
            dotp = max(1./dot(w,w),.1-.03*sn2);
            
            sc *= dotp ; 
            
            p = p * dotp  - .9*vec4(.5,.5,.3,.3);
            
            w = vec4(0);
            //quaternionic mandelbrot iterations - reduce from 8 to 4
            for (float k=0.; k<MANDELBROT_ITERATIONS; k++) {
                if (k >= MANDELBROT_THRESHOLD+sn2) break; // Reduce complexity
                w =
                    vec4( w.x*w.x-w.y*w.y-w.z*w.z-w.w*w.w,
                       2.*w.x*w.y,
                       2.*w.x*w.z,
                       2.*w.x*w.w ) - .35*p;
                                  
            }
        }
         
        float dist = max(-shell,abs( length(p.zw) -.1)/sc) ;  //funky distance estimate
        float stepsize = dist/STEP_DIVISOR + STEP_EPSILON; // Increase step size for fewer iterations
        totdist += stepsize;                  //move the distance along rd
        
        if (i>COLOR_THRESHOLD*sn2) // Reduce threshold for color accumulation
        //accumulate color, fading with distance and iteration count
        c +=
             COLOR_INTENSITY* // Slightly increase color intensity to compensate
             mix( vec3(1), H(M(sc)),.9)  * exp(-i*i*stepsize*max(EXP_COMPLEXITY,sn2*EXP_MULTIPLIER)); // Reduce exp calculation complexity
    }
    
    c = 1. - exp(-c*c);
    gl_FragColor = vec4(c,1.0);
}
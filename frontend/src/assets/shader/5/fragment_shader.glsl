precision mediump float;

uniform vec2 iResolution;
uniform float iTime;

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
    
    float sc,dotp,totdist=0., t1=.95, tt=iTime, t=0.;
 
    float sn = mod(iTime,20.)<12. ? 0. : 1.;
    float sn2 = mod(iTime,40.)<20. ? 0. : 1.;
    
    for (float i=0.; i<60.; i++) {
        
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
     
        for (float j=0.; j<7.; j++) {
          
            p = abs(p)*.7;
                        
            dotp = max(1./dot(w,w),.1-.03*sn2);
            
            sc *= dotp ; 
            
            p = p * dotp  - .9*vec4(.5,.5,.3,.3);
            
            w = vec4(0);
            //quaternionic mandelbrot iterations
            for (float k=0.; k<8.; k++) {
                if (k >= 4.+sn2) break;
                w =
                    vec4( w.x*w.x-w.y*w.y-w.z*w.z-w.w*w.w,
                       2.*w.x*w.y,
                       2.*w.x*w.z,
                       2.*w.x*w.w ) - .35*p;
                                  
            }
        }
         
        float dist = max(-shell,abs( length(p.zw) -.1)/sc) ;  //funky distance estimate
        float stepsize = dist/200. + 8e-6;     
        totdist += stepsize;                  //move the distance along rd
        
        if (i>5.*sn2)
        //accumulate color, fading with distance and iteration count
        c +=
             .6e-1* 
             mix( vec3(1), H(M(sc)),.9)  * exp(-i*i*stepsize*max(1e1,sn2*2e1));
    }
    
    c = 1. - exp(-c*c);
    gl_FragColor = vec4(c,1.0);
}
// Interstellar (WebGL Compatible)
// Based on Hazel Quantock's work
// Adapted for WebGL without external textures

precision mediump float;

uniform vec2 iResolution;
uniform float iTime;

const float tau = 6.28318530717958647692;

// Contrôle de la vitesse d'animation (plus petit = plus lent)
const float ANIMATION_SPEED = 0.2;

// Gamma correction
#define GAMMA (2.2)

vec3 ToLinear( in vec3 col )
{
	// simulate a monitor, converting colour values into light values
	return pow( col, vec3(GAMMA) );
}

vec3 ToGamma( in vec3 col )
{
	// convert back into colour values, so the correct light will come out of the monitor
	return pow( col, vec3(1.0/GAMMA) );
}

// Replace texture-based noise with procedural noise
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec4 Noise( in ivec2 x )
{
    vec2 p = vec2(x);
    float n = hash(p);
    return vec4(n, n, n, 1.0);
}

vec4 Rand( in int x )
{
    float f = float(x);
    float n = hash(vec2(f, f + 1.0));
    return vec4(n, n, n, 1.0);
}


void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
	vec3 ray;
	ray.xy = 2.0*(fragCoord.xy-iResolution.xy*.5)/iResolution.x;
	ray.z = 1.0;

	// Ralentir l'animation en utilisant la constante de vitesse
	float offset = iTime * ANIMATION_SPEED;
	float speed2 = (cos(offset)+1.0)*2.0;
	float speed = speed2+.1;
	offset += sin(offset)*.96;
	offset *= 1.0;  // Réduit de 2.0 à 1.0 (2x plus lent)
	
	
	vec3 col = vec3(0);
	
	vec3 stp = ray/max(abs(ray.x),abs(ray.y));
	
	vec3 pos = 2.0*stp+.5;
	for ( int i=0; i < 20; i++ )
	{
		float z = Noise(ivec2(pos.xy)).x;
		z = fract(z-offset);
		float d = 50.0*z-pos.z;
		float w = pow(max(0.0,1.0-8.0*length(fract(pos.xy)-.5)),2.0);
		vec3 c = max(vec3(0),vec3(1.0-abs(d+speed2*.5)/speed,1.0-abs(d)/speed,1.0-abs(d-speed2*.5)/speed));
		col += 1.5*(1.0-z)*c*w;
		pos += stp;
	}
	
	fragColor = vec4(ToGamma(col),1.0);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
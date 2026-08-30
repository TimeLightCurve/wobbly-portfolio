import * as THREE from 'three'

type LiquidGlassUniforms = {
	uLiquidStrength: { value: number }
	uLiquidScale: { value: number }
	uLiquidEdgeGlow: { value: number }
	uLiquidTint: { value: THREE.Color }
}

export type LiquidGlassMaterial = {
	material: THREE.MeshPhysicalMaterial
	uniforms: LiquidGlassUniforms
}

const LIQUID_NORMAL_SHADER = /* glsl */`
	#include <normal_fragment_maps>

	vec3 liquidPosition = vViewPosition * uLiquidScale;
	float liquidWaveA = sin(liquidPosition.y + liquidPosition.x * 0.23)
		+ sin(liquidPosition.z * 1.37 - liquidPosition.y * 0.19);
	float liquidWaveB = sin(liquidPosition.x * 1.17 - liquidPosition.z * 0.21)
		+ sin((liquidPosition.x + liquidPosition.y) * 0.72);
	vec3 liquidNormalOffset = vec3(
		liquidWaveA,
		liquidWaveB,
		liquidWaveA - liquidWaveB
	) * (uLiquidStrength * 0.5);

	normal = normalize(normal + liquidNormalOffset);
	nonPerturbedNormal = normal;
	float liquidFresnel = pow(
		1.0 - saturate(dot(normal, normalize(vViewPosition))),
		3.0
	);
	totalEmissiveRadiance += uLiquidTint * liquidFresnel * uLiquidEdgeGlow;
`

export function createLiquidGlassMaterial(reducedPerformance: boolean): LiquidGlassMaterial {
	const uniforms: LiquidGlassUniforms = {
		uLiquidStrength: { value: reducedPerformance ? 0.008 : 0.026 },
		uLiquidScale: { value: reducedPerformance ? 1.1 : 1.45 },
		uLiquidEdgeGlow: { value: reducedPerformance ? 0.035 : 0.085 },
		uLiquidTint: { value: new THREE.Color('#c8d3ef') },
	}
	const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(reducedPerformance ? '#343945' : '#8d9bb4'),
    metalness: 0,
    roughness: reducedPerformance ? 0.22 : 0.24,
    transmission: reducedPerformance ? 0.7 : 0.82,
    thickness: reducedPerformance ? 0.7 : 0.9,
    ior: 1.16,
    clearcoat: reducedPerformance ? 0.46 : 0.48,
    clearcoatRoughness: reducedPerformance ? 0.5 : 0.2,
    specularIntensity: reducedPerformance ? 0.58 : 0.72,
    specularColor: new THREE.Color('#dce4f5'),
    envMapIntensity: reducedPerformance ? 0.72 : 0.78,
    // Keep the surface alpha-blended so disconnected glass shells can remain
    // visible through the shell in front of them. Transmission alone samples
    // Three's opaque transmission buffer and cannot contain other glass meshes.
    transparent: true,
    opacity: reducedPerformance ? 0.9 : 0.9,
    depthWrite: false,
  })

	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms)
		shader.fragmentShader = `
			uniform float uLiquidStrength;
			uniform float uLiquidScale;
			uniform float uLiquidEdgeGlow;
			uniform vec3 uLiquidTint;
		${shader.fragmentShader}`.replace(
			'#include <normal_fragment_maps>',
			LIQUID_NORMAL_SHADER,
		)
	}
	material.customProgramCacheKey = () => 'portfolio-liquid-glass-v1'

	return { material, uniforms }
}

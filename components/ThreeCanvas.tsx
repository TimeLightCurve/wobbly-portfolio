
'use client'

import { CameraControls, Environment, type CameraControlsImpl } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
// import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useScroll, type MotionValue } from 'motion/react'
import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Room } from './Room'

const WOBBLE_VERTEX_SHADER = `
	uniform float uTime;
	uniform float uPositionFrequency;
	uniform float uTimeFrequency;
	uniform float uStrength;
	uniform float uWarpPositionFrequency;
	uniform float uWarpTimeFrequency;
	uniform float uWarpStrength;

	varying float vWobble;
	varying vec3 vViewPosition;

	vec4 permute(vec4 value) { return mod(((value * 34.0) + 1.0) * value, 289.0); }
	float permute(float value) { return floor(mod(((value * 34.0) + 1.0) * value, 289.0)); }
	vec4 taylorInvSqrt(vec4 value) { return 1.79284291400159 - 0.85373472095314 * value; }
	float taylorInvSqrt(float value) { return 1.79284291400159 - 0.85373472095314 * value; }

	vec4 grad4(float index, vec4 ip) {
		const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
		vec4 gradient;
		vec4 signs;
		gradient.xyz = floor(fract(vec3(index) * ip.xyz) * 7.0) * ip.z - 1.0;
		gradient.w = 1.5 - dot(abs(gradient.xyz), ones.xyz);
		signs = vec4(lessThan(gradient, vec4(0.0)));
		gradient.xyz += (signs.xyz * 2.0 - 1.0) * signs.www;
		return gradient;
	}

	float simplexNoise4d(vec4 value) {
		const vec2 constants = vec2(0.138196601125010504, 0.309016994374947451);
		vec4 cell = floor(value + dot(value, constants.yyyy));
		vec4 corner = value - cell + dot(cell, constants.xxxx);
		vec4 rank;
		vec3 isX = step(corner.yzw, corner.xxx);
		vec3 isYZ = step(corner.zww, corner.yyz);
		rank.x = isX.x + isX.y + isX.z;
		rank.yzw = 1.0 - isX;
		rank.y += isYZ.x + isYZ.y;
		rank.zw += 1.0 - isYZ.xy;
		rank.z += isYZ.z;
		rank.w += 1.0 - isYZ.z;
		vec4 rank3 = clamp(rank, 0.0, 1.0);
		vec4 rank2 = clamp(rank - 1.0, 0.0, 1.0);
		vec4 rank1 = clamp(rank - 2.0, 0.0, 1.0);
		vec4 corner1 = corner - rank1 + constants.xxxx;
		vec4 corner2 = corner - rank2 + 2.0 * constants.xxxx;
		vec4 corner3 = corner - rank3 + 3.0 * constants.xxxx;
		vec4 corner4 = corner - 1.0 + 4.0 * constants.xxxx;
		cell = mod(cell, 289.0);
		float index0 = permute(permute(permute(permute(cell.w) + cell.z) + cell.y) + cell.x);
		vec4 index1 = permute(permute(permute(permute(
			cell.w + vec4(rank1.w, rank2.w, rank3.w, 1.0)) +
			cell.z + vec4(rank1.z, rank2.z, rank3.z, 1.0)) +
			cell.y + vec4(rank1.y, rank2.y, rank3.y, 1.0)) +
			cell.x + vec4(rank1.x, rank2.x, rank3.x, 1.0));
		vec4 ip = vec4(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);
		vec4 gradient0 = grad4(index0, ip);
		vec4 gradient1 = grad4(index1.x, ip);
		vec4 gradient2 = grad4(index1.y, ip);
		vec4 gradient3 = grad4(index1.z, ip);
		vec4 gradient4 = grad4(index1.w, ip);
		vec4 normalization = taylorInvSqrt(vec4(dot(gradient0, gradient0), dot(gradient1, gradient1), dot(gradient2, gradient2), dot(gradient3, gradient3)));
		gradient0 *= normalization.x;
		gradient1 *= normalization.y;
		gradient2 *= normalization.z;
		gradient3 *= normalization.w;
		gradient4 *= taylorInvSqrt(dot(gradient4, gradient4));
		vec3 weights0 = max(0.6 - vec3(dot(corner, corner), dot(corner1, corner1), dot(corner2, corner2)), 0.0);
		vec2 weights1 = max(0.6 - vec2(dot(corner3, corner3), dot(corner4, corner4)), 0.0);
		weights0 *= weights0;
		weights1 *= weights1;
		return 49.0 * (dot(weights0 * weights0, vec3(dot(gradient0, corner), dot(gradient1, corner1), dot(gradient2, corner2))) + dot(weights1 * weights1, vec2(dot(gradient3, corner3), dot(gradient4, corner4))));
	}

	void main() {
		vec3 warpedPosition = position + simplexNoise4d(vec4(position * uWarpPositionFrequency, uTime * uWarpTimeFrequency)) * uWarpStrength;
		float wobble = simplexNoise4d(vec4(warpedPosition * uPositionFrequency, uTime * uTimeFrequency)) * uStrength;
		vec3 displacedPosition = position + normal * wobble;

		vWobble = uStrength > 0.0 ? wobble / uStrength : 0.0;
		vViewPosition = (modelViewMatrix * vec4(displacedPosition, 1.0)).xyz;
		gl_Position = projectionMatrix * vec4(vViewPosition, 1.0);
	}
`

const WOBBLE_FRAGMENT_SHADER = `
	uniform vec3 uColorA;
	uniform vec3 uColorB;

	varying float vWobble;
	varying vec3 vViewPosition;

	void main() {
		float colorMix = smoothstep(-1.0, 1.0, vWobble);
		vec3 normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
		vec3 viewDirection = normalize(-vViewPosition);
		vec3 lightDirection = normalize(vec3(-0.85, 0.65, 1.0));
		vec3 halfDirection = normalize(lightDirection + viewDirection);
		float diffuse = max(dot(normal, lightDirection), 0.0);
		float specular = pow(max(dot(normal, halfDirection), 0.0), 12.0);
		float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.5);
		vec3 baseColor = mix(uColorA, uColorB, colorMix);
		vec3 color = baseColor * (0.2 + diffuse * 0.8) + vec3(1.0, 0.5, 0.85) * specular * 0.25 + vec3(0.2, 0.2, 0.2) * rim * 0.3;
		gl_FragColor = vec4(color, 1.0);
	}
`

const SPHERE_PATH = {
	startX: 0,
	z: -1.41,
	startY: 0.2,
	endY: -8.4,
}

function ScrollCamera({ scrollYProgress }: { scrollYProgress: MotionValue<number> }) {
	const cameraControls = useRef<CameraControlsImpl>(null)

	useFrame((state) => {
		const scrollProgress = scrollYProgress.get()
		const pointerOffsetX = state.pointer.x * 0.18
		const pointerOffsetY = state.pointer.y * 0.2
		const targetY = THREE.MathUtils.lerp(0, -8, scrollProgress)

		cameraControls.current?.setLookAt(
			pointerOffsetX,
			targetY + pointerOffsetY,
			5,
			SPHERE_PATH.startX + pointerOffsetX * 0.35,
			targetY + pointerOffsetY * 0.35,
			SPHERE_PATH.z,
			true,
		)
	})

	return <CameraControls ref={cameraControls} enabled={false} />
}

class ColumnAnchorStore {
	positions: [[number, number], [number, number]] = [[0, 0], [0, 0]]
	basePositions: [[number, number], [number, number]] = [[0, 0], [0, 0]]
	initialized: [boolean, boolean] = [false, false]

	update(columnIndex: 0 | 1, x: number, z: number) {
		this.positions[columnIndex] = [x, z]
		if (!this.initialized[columnIndex]) {
			this.basePositions[columnIndex] = [x, z]
			this.initialized[columnIndex] = true
		}
	}
}

function WobbleSphere({ scrollYProgress, anchorStore }: { scrollYProgress: MotionValue<number>, anchorStore: ColumnAnchorStore }) {
	const sphere = useRef<THREE.Mesh>(null)
	const material = useRef<THREE.ShaderMaterial>(null)
	const rotationAngle = useRef(0)
	const pointerProximity = useRef(1)
	const rotationAxis = useMemo(() => new THREE.Vector3(
		THREE.MathUtils.randFloatSpread(2),
		THREE.MathUtils.randFloatSpread(2),
		THREE.MathUtils.randFloatSpread(2),
	).normalize(), [])
	const uniforms = useMemo(() => ({
		uTime: { value: 0 },
		uPositionFrequency: { value: 1.9 },
		uTimeFrequency: { value: 0.22 },
		uStrength: { value: 0.14 },
		uWarpPositionFrequency: { value: 1.0 },
		uWarpTimeFrequency: { value: 0.1 },
		uWarpStrength: { value: 0.32 },
		uColorA: { value: new THREE.Color('#101010') },
		uColorB: { value: new THREE.Color('#cccccc') },
	}), [])

	useFrame((state, delta) => {
		const scrollProgress = scrollYProgress.get()
		const activeColumn = scrollProgress < 0.5 ? 0 : 1
		const currentAnchor = anchorStore.positions[activeColumn]
		const baseAnchor = anchorStore.basePositions[activeColumn]
		const worldDeltaX = currentAnchor[0] - baseAnchor[0]
		const worldDeltaZ = currentAnchor[1] - baseAnchor[1]
		const targetX = SPHERE_PATH.startX + worldDeltaX
		const targetY = THREE.MathUtils.lerp(SPHERE_PATH.startY, SPHERE_PATH.endY, scrollProgress)
		const targetZ = SPHERE_PATH.z + worldDeltaZ
		const pointerDistance = state.pointer.length()
		const targetPointerProximity = 1 - THREE.MathUtils.clamp(pointerDistance / Math.SQRT2, 0, 1)
		pointerProximity.current = THREE.MathUtils.damp(pointerProximity.current, targetPointerProximity, 8, delta)

		if (sphere.current) {
			sphere.current.position.x = THREE.MathUtils.damp(sphere.current.position.x, targetX, 2, delta)
			sphere.current.position.y = THREE.MathUtils.damp(sphere.current.position.y, targetY, 2, delta)
			sphere.current.position.z = THREE.MathUtils.damp(sphere.current.position.z, targetZ, 2, delta)
			rotationAngle.current = THREE.MathUtils.damp(rotationAngle.current, scrollProgress * Math.PI * 4, 5, delta)
			sphere.current.setRotationFromAxisAngle(rotationAxis, rotationAngle.current)
		}

		if (material.current) {
			const proximity = pointerProximity.current
			material.current.uniforms.uPositionFrequency.value = 1.9
			material.current.uniforms.uTimeFrequency.value = 0.66 + 0.001 * proximity
			material.current.uniforms.uStrength.value = 0.14 * proximity
			material.current.uniforms.uWarpPositionFrequency.value = 1.0 * proximity
			material.current.uniforms.uWarpTimeFrequency.value = 0.72 + 0.0006 * proximity
			material.current.uniforms.uWarpStrength.value = 0.32 * proximity
			material.current.uniforms.uTime.value = state.clock.getElapsedTime()
		}
	})

	return (
		<mesh ref={sphere} position={[SPHERE_PATH.startX, SPHERE_PATH.startY, SPHERE_PATH.z]}>
			<sphereGeometry args={[0.62, 256, 256]} />
			<shaderMaterial ref={material} vertexShader={WOBBLE_VERTEX_SHADER} fragmentShader={WOBBLE_FRAGMENT_SHADER} uniforms={uniforms} />
		</mesh>
	)
}

export function ThreeCanvas() {
	const { scrollYProgress } = useScroll()
	const anchorStore = useMemo(() => new ColumnAnchorStore(), [])
	const handleAnchorChange = (columnIndex: 0 | 1, x: number, z: number) => {
		anchorStore.update(columnIndex, x, z)
	}

	return (
		<section id="neuron-canvas" className="relative h-[520vh] w-full bg-transparent">
			{/* <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(110,255,214,0.16),transparent_42%),linear-gradient(180deg,#0b1513_0%,#07110f_100%)]" /> */}
			<div className="sticky top-0 z-10 h-screen w-full">
				<Canvas camera={{ position: [0, 0, 5], fov: 34 }} dpr={[1, 2]} gl={{ antialias: false, powerPreference: 'high-performance' }} className="h-full w-full">
					{/* <color attach="background" args={["#07110f"]} /> */}
					<ambientLight intensity={0.1} />
					{/* <directionalLight position={[4, 6, 5]} intensity={1.8} color="#d6fff1" /> */}
					{/* <pointLight position={[-5, -2, 4]} intensity={1} color="#6ef3cf" /> */}
					<Suspense fallback={null}>

						<Environment files={'/venice_sunset_1k.hdr'} background={false} environmentIntensity={0.5} />
						<Room position={[0, 0., 0]} rotation={[0, -Math.PI / 2, 0]} onAnchorChange={handleAnchorChange} />
						{/* <Float floatIntensity={1} floatingRange={[-0.1, 0.1]} rotationIntensity={1} speed={3}> */}
						<WobbleSphere scrollYProgress={scrollYProgress} anchorStore={anchorStore} />
						{/* </Float> */}
					</Suspense>
					<ScrollCamera scrollYProgress={scrollYProgress} />
					{/* <EffectComposer multisampling={0} enableNormalPass={false}>
					<Bloom
						intensity={1.25}
						luminanceThreshold={0.72}
						luminanceSmoothing={0.08}
						mipmapBlur={true}
					/>
				</EffectComposer> */}
					{/* <OrbitControls
					enablePan={false}
					enablePan={false}
					enableZoom={false}
					minPolarAngle={Math.PI / 2.4}
					maxPolarAngle={Math.PI / 1.8}
				autoRotate
				autoRotateSpeed={0.9}
				/> */}
				</Canvas>
			</div>

			{/* <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-[#07110f] via-[#07110f]/70 to-transparent px-4 pb-10 pt-24 sm:px-6 lg:px-10">
				<div className="mx-auto flex w-full items-end justify-between gap-6 text-[#e8fff7]" style={{ maxWidth: '1380px' }}>
					<div>
						<p className="mb-3 text-sm tracking-[0.3em] text-[#9fcbbe] uppercase">3D Visualization</p>
						<h2 className="font-nian text-4xl sm:text-5xl lg:text-6xl">مدل سه بعدی نورون</h2>
					</div>
					<p className="max-w-xl text-base leading-8 text-[#d5ebe3] sm:text-lg">
						این بخش به صورت تمام صفحه مدل سه بعدی نورون را نمایش می دهد تا حال و هوای علمی و درمانی صفحه حفظ شود.
					</p>
				</div>
			</div> */}
		</section>
	)
}
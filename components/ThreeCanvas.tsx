
'use client'

import { CameraControls, Environment, type CameraControlsImpl } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
// import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { folder, LevaPanel, useControls, useCreateStore } from 'leva'
import { useScroll, type MotionValue } from 'motion/react'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
	createPointerAudioRig,
	disposePointerAudioRig,
	PointerAudioModulator,
	setPointerAudioMuted,
	triggerColumnSlowMotion,
	type PointerAudioRig,
	type PointerAudioSettings,
} from './PointerAudio'
import { COLUMN_SPACING, getProjectColumnCount, Room } from './Room'
import { projects } from './projects'

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
}

const MOBILE_FOV = 80
const DESKTOP_FOV_MAX = 60
const DESKTOP_FOV_MIN = 40
const MOBILE_BREAKPOINT = 640
const DESKTOP_BREAKPOINT = 1024
const WIDE_DESKTOP_BREAKPOINT = 1920

function getResponsiveFov(viewportWidth: number) {
	if (viewportWidth <= MOBILE_BREAKPOINT) return MOBILE_FOV

	if (viewportWidth < DESKTOP_BREAKPOINT) {
		const tabletProgress = (viewportWidth - MOBILE_BREAKPOINT) / (DESKTOP_BREAKPOINT - MOBILE_BREAKPOINT)
		return THREE.MathUtils.lerp(MOBILE_FOV, DESKTOP_FOV_MAX, tabletProgress)
	}

	const desktopProgress = THREE.MathUtils.clamp(
		(viewportWidth - DESKTOP_BREAKPOINT) / (WIDE_DESKTOP_BREAKPOINT - DESKTOP_BREAKPOINT),
		0,
		1,
	)
	return THREE.MathUtils.lerp(DESKTOP_FOV_MAX, DESKTOP_FOV_MIN, desktopProgress)
}

function ResponsiveCameraFov() {
	useFrame(({ camera, size }, delta) => {
		if (!(camera instanceof THREE.PerspectiveCamera)) return

		const nextFov = THREE.MathUtils.damp(camera.fov, getResponsiveFov(size.width), 8, delta)
		if (Math.abs(camera.fov - nextFov) < 0.001) return

		camera.fov = nextFov
		camera.updateProjectionMatrix()
	})

	return null
}

function useMobilePerformanceProfile() {
	const [isMobile, setIsMobile] = useState(true)

	useEffect(() => {
		const media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
		const updateProfile = () => setIsMobile(media.matches)

		updateProfile()
		if (typeof media.addEventListener === 'function') {
			media.addEventListener('change', updateProfile)
			return () => media.removeEventListener('change', updateProfile)
		}

		media.addListener(updateProfile)
		return () => media.removeListener(updateProfile)
	}, [])

	return isMobile
}

function ScrollCamera({ scrollYProgress, endY, mobilePerformance }: { scrollYProgress: MotionValue<number>, endY: number, mobilePerformance: boolean }) {
	const cameraControls = useRef<CameraControlsImpl>(null)

	useFrame((state) => {
		const scrollProgress = scrollYProgress.get()
		const pointerOffsetX = mobilePerformance ? 0 : state.pointer.x * 0.18
		const pointerOffsetY = mobilePerformance ? 0 : state.pointer.y * 0.2
		const targetY = THREE.MathUtils.lerp(0, endY, scrollProgress)

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
	positions: Array<[number, number]> = []
	basePositions: Array<[number, number]> = []

	update(columnIndex: number, x: number, z: number) {
		this.positions[columnIndex] = [x, z]
		if (!this.basePositions[columnIndex]) {
			this.basePositions[columnIndex] = [x, z]
		}
	}
}

function WobbleSphere({ scrollYProgress, anchorStore, columnCount, endY, mobilePerformance }: { scrollYProgress: MotionValue<number>, anchorStore: ColumnAnchorStore, columnCount: number, endY: number, mobilePerformance: boolean }) {
	const sphere = useRef<THREE.Mesh>(null)
	const material = useRef<THREE.ShaderMaterial>(null)
	const rotationAngle = useRef(0)
	const pointerProximity = useRef(1)
	const sphereSegments = mobilePerformance ? 96 : 256
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
		const activeColumn = Math.min(Math.floor(scrollProgress * columnCount), columnCount - 1)
		const currentAnchor = anchorStore.positions[activeColumn] ?? [0, 0]
		const baseAnchor = anchorStore.basePositions[activeColumn] ?? currentAnchor
		const worldDeltaX = currentAnchor[0] - baseAnchor[0]
		const worldDeltaZ = currentAnchor[1] - baseAnchor[1]
		const anchorInfluence = THREE.MathUtils.smoothstep(scrollProgress, 0.08, 0.18)
		const targetX = SPHERE_PATH.startX + worldDeltaX * anchorInfluence
		const targetY = THREE.MathUtils.lerp(SPHERE_PATH.startY, endY, scrollProgress)
		const targetZ = SPHERE_PATH.z + worldDeltaZ * anchorInfluence
		const pointerDistance = state.pointer.length()
		const targetPointerProximity = 1 - THREE.MathUtils.clamp(pointerDistance / Math.SQRT2, 0, 1)
		pointerProximity.current = THREE.MathUtils.damp(pointerProximity.current, targetPointerProximity, 8, delta)

		if (sphere.current) {
			sphere.current.position.x = THREE.MathUtils.damp(sphere.current.position.x, targetX, 2, delta)
			sphere.current.position.y = THREE.MathUtils.damp(sphere.current.position.y, targetY, 2, delta)
			sphere.current.position.z = THREE.MathUtils.damp(sphere.current.position.z, targetZ, 2, delta)
			rotationAngle.current = THREE.MathUtils.damp(rotationAngle.current, scrollProgress * Math.PI * 4, 9, delta)
			sphere.current.setRotationFromAxisAngle(rotationAxis, rotationAngle.current)
		}

		if (material.current) {
			const proximity = pointerProximity.current
			material.current.uniforms.uPositionFrequency.value = 1.9
			material.current.uniforms.uTimeFrequency.value = 0.66 + 0.001 * proximity
			material.current.uniforms.uStrength.value = 0.14 * proximity
			material.current.uniforms.uWarpPositionFrequency.value = 1.0 * proximity
			material.current.uniforms.uWarpTimeFrequency.value = 0.72 + 0.0008 * proximity
			material.current.uniforms.uWarpStrength.value = 0.32 * proximity
			material.current.uniforms.uTime.value = state.clock.getElapsedTime()
		}
	})

	return (
		<mesh ref={sphere} position={[SPHERE_PATH.startX, SPHERE_PATH.startY, SPHERE_PATH.z]}>
			<sphereGeometry key={sphereSegments} args={[0.62, sphereSegments, sphereSegments]} />
			<shaderMaterial ref={material} vertexShader={WOBBLE_VERTEX_SHADER} fragmentShader={WOBBLE_FRAGMENT_SHADER} uniforms={uniforms} />
		</mesh>
	)
}

export function ThreeCanvas() {
	const { scrollYProgress } = useScroll()
	const mobilePerformance = useMobilePerformanceProfile()
	const audioControlStore = useCreateStore()
	const audioSettings = useControls({
		Output: folder({
			masterVolume: { value: 0.18, min: 0, max: 0.5, step: 0.005, label: 'Master volume' },
		}, { collapsed: true }),
		Trigger: folder({
			centerThreshold: { value: 0.6, min: 0.4, max: 0.98, step: 0.01, label: 'Center threshold' },
			centerRearm: { value: 0.56, min: 0.1, max: 0.9, step: 0.01, label: 'Re-arm distance' },
			triggerCooldown: { value: 0.76, min: 0.05, max: 1, step: 0.01, label: 'Trigger cooldown' },
			pointerVelocityThreshold: { value: 0.12, min: 0, max: 1, step: 0.01, label: 'Pointer threshold' },
			pointerVelocityScale: { value: 0.79, min: 0.01, max: 1, step: 0.01, label: 'Pointer velocity' },
			scrollVelocityThreshold: { value: 0.07, min: 0.01, max: 1, step: 0.01, label: 'Scroll contrast' },
			scrollVelocityScale: { value: 39, min: 1, max: 60, step: 1, label: 'Scroll velocity' },
		}, { collapsed: true }),
		Envelope: folder({
			baseDuration: { value: 1.87, min: 0.05, max: 2, step: 0.01, label: 'Base duration' },
			centerDurationStretch: { value: 1.93, min: 0, max: 3, step: 0.01, label: 'Center stretch' },
			velocityDurationStretch: { value: 2.75, min: 0, max: 3, step: 0.01, label: 'Velocity stretch' },
			attack: { value: 0.17, min: 0.001, max: 0.2, step: 0.001, label: 'Attack' },
		}, { collapsed: true }),
		Tone: folder({
			basePitch: { value: 62, min: 24, max: 120, step: 1, label: 'Base pitch' },
			pitchSweep: { value: 19, min: 0, max: 48, step: 1, label: 'Velocity pitch sweep' },
			baseCutoff: { value: 150, min: 40, max: 4000, step: 10, label: 'Base cutoff' },
			centerCutoffStretch: { value: 9500, min: 0, max: 12000, step: 50, label: 'Center filter stretch' },
			velocityCutoffStretch: { value: 7700, min: 0, max: 12000, step: 50, label: 'Velocity filter stretch' },
			baseResonance: { value: 2.8, min: 0, max: 25, step: 0.1, label: 'Base resonance' },
			resonanceStretch: { value: 21.9, min: 0, max: 28, step: 0.1, label: 'Resonance stretch' },
			distortion: { value: 132, min: 0, max: 150, step: 1, label: 'Distortion' },
		}, { collapsed: true }),
		Mix: folder({
			acidLevel: { value: 0.16, min: 0, max: 0.6, step: 0.005, label: 'Acid level' },
			noiseLevel: { value: 0.16, min: 0, max: 0.6, step: 0.005, label: 'Noise level' },
			proximityCurve: { value: 3, min: 0.4, max: 4, step: 0.05, label: 'Center curve' },
			stereoWidth: { value: 0.65, min: 0, max: 1, step: 0.01, label: 'Stereo width' },
		}, { collapsed: true }),
		Randomness: folder({
			randomness: { value: 0.71, min: 0, max: 1, step: 0.01, label: 'Variation amount' },
			pitchRandomness: { value: 4, min: 0, max: 24, step: 1, label: 'Pitch variation' },
			durationRandomness: { value: 0.61, min: 0, max: 0.75, step: 0.01, label: 'Duration variation' },
			filterRandomness: { value: 0.25, min: 0, max: 1.5, step: 0.01, label: 'Filter variation' },
			timbreRandomness: { value: 0.55, min: 0, max: 1, step: 0.01, label: 'Timbre variation' },
		}, { collapsed: true }),
		'Slow motion': folder({
			slowMotionCooldown: { value: 0.35, min: 0.2, max: 3, step: 0.05, label: 'Cooldown' },
			slowMotionDuration: { value: 2.2, min: 0.5, max: 6, step: 0.05, label: 'Duration' },
			slowMotionVelocityStretch: { value: 0.25, min: 0, max: 4, step: 0.05, label: 'Velocity stretch' },
			slowMotionPitch: { value: 48, min: 18, max: 90, step: 1, label: 'Low pitch' },
			slowMotionPitchDrop: { value: 2, min: 0, max: 36, step: 1, label: 'Pitch drop' },
			slowMotionCutoff: { value: 130, min: 35, max: 800, step: 5, label: 'Low cutoff' },
			slowMotionCutoffStretch: { value: 500, min: 0, max: 3000, step: 25, label: 'Velocity cutoff' },
			slowMotionResonance: { value: 15.5, min: 0.1, max: 18, step: 0.1, label: 'Resonance' },
			slowMotionRumbleLevel: { value: 0.16, min: 0, max: 0.7, step: 0.005, label: 'Growl level' },
			slowMotionNoiseLevel: { value: 0.42, min: 0, max: 0.5, step: 0.005, label: 'Dark texture' },
			slowMotionImpactLevel: { value: 0, min: 0, max: 0.7, step: 0.005, label: 'Impact level' },
			slowMotionOutput: { value: 1.5, min: 0.25, max: 2, step: 0.05, label: 'Output boost' },
		}, { collapsed: true }),
	}, { store: audioControlStore }) as PointerAudioSettings
	const anchorStore = useMemo(() => new ColumnAnchorStore(), [])
	const audioRig = useRef<PointerAudioRig | null>(null)
	const audioEnabledRef = useRef(false)
	const [audioEnabled, setAudioEnabled] = useState(false)
	const columnCount = getProjectColumnCount(projects.length)
	const cameraEndY = -5.3 - (columnCount - 1) * COLUMN_SPACING
	const sphereEndY = cameraEndY - 0.4

	const enableAudio = useCallback(() => {
		try {
			const rig = audioRig.current ?? createPointerAudioRig()
			audioRig.current = rig
			void rig.context.resume()
			setPointerAudioMuted(rig, false)
			audioEnabledRef.current = true
			setAudioEnabled(true)
		} catch {
			// Web Audio can be unavailable or blocked by browser/device policy.
		}
	}, [])

	const disableAudio = useCallback(() => {
		if (audioRig.current) setPointerAudioMuted(audioRig.current, true)
		audioEnabledRef.current = false
		setAudioEnabled(false)
	}, [])

	const toggleAudio = useCallback(() => {
		if (audioEnabledRef.current) {
			disableAudio()
		} else {
			enableAudio()
		}
	}, [disableAudio, enableAudio])

	useEffect(() => {
		const enableFromFirstGesture = (event: PointerEvent | KeyboardEvent) => {
			const target = event.target
			if (target instanceof Element && target.closest('[data-audio-toggle]')) return
			enableAudio()
		}

		window.addEventListener('pointerdown', enableFromFirstGesture, { capture: true, once: true })
		window.addEventListener('keydown', enableFromFirstGesture, { capture: true, once: true })

		return () => {
			window.removeEventListener('pointerdown', enableFromFirstGesture, true)
			window.removeEventListener('keydown', enableFromFirstGesture, true)
			if (audioRig.current) disposePointerAudioRig(audioRig.current)
		}
	}, [enableAudio])

	const handleAnchorChange = (columnIndex: number, x: number, z: number) => {
		anchorStore.update(columnIndex, x, z)
	}
	const handleColumnMotion = useCallback((velocity: number, direction: number) => {
		const rig = audioRig.current
		if (!rig || !audioEnabledRef.current) return
		triggerColumnSlowMotion(rig, audioSettings, velocity, direction)
	}, [audioSettings])

	return (
		<section id="neuron-canvas" className="relative w-full bg-transparent" style={{ height: `${columnCount * 160}vh` }}>
			{/* <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(110,255,214,0.16),transparent_42%),linear-gradient(180deg,#0b1513_0%,#07110f_100%)]" /> */}
			<div className="sticky top-0 z-10 h-screen w-full" style={{ touchAction: 'pan-y' }}>
				<Canvas
					camera={{ position: [0, 0, 5], fov: DESKTOP_FOV_MAX }}
					dpr={mobilePerformance ? [1, 1.25] : [1, 2]}
					gl={{ antialias: false, powerPreference: mobilePerformance ? 'default' : 'high-performance' }}
					className="h-full w-full"
					style={{ touchAction: 'pan-y' }}
				>
					<ResponsiveCameraFov />
					<PointerAudioModulator rigRef={audioRig} settings={audioSettings} enabled={audioEnabled} scrollProgress={scrollYProgress} />
					{/* <color attach="background" args={["#07110f"]} /> */}
					{/* <ambientLight intensity={0.8} /> */}
					{/* <directionalLight position={[4, 6, 5]} intensity={1.8} color="#d6fff1" /> */}
					{/* <pointLight position={[-5, -2, 4]} intensity={1} color="#6ef3cf" /> */}
					<Suspense fallback={null}>

						<Environment files={'/venice_sunset_1k.hdr'} background={false} environmentIntensity={0.5} />
						<Room
							position={[0, 0., 0]}
							rotation={[0, -Math.PI / 2, 0]}
							onAnchorChange={handleAnchorChange}
							onColumnMotion={handleColumnMotion}
						/>
						{/* <Float floatIntensity={1} floatingRange={[-0.1, 0.1]} rotationIntensity={1} speed={3}> */}
						<WobbleSphere scrollYProgress={scrollYProgress} anchorStore={anchorStore} columnCount={columnCount} endY={sphereEndY} mobilePerformance={mobilePerformance} />
						{/* </Float> */}
					</Suspense>
					<ScrollCamera scrollYProgress={scrollYProgress} endY={cameraEndY} mobilePerformance={mobilePerformance} />
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
				<aside dir="ltr" className="absolute top-4 right-4 z-40 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg">
					<LevaPanel
						store={audioControlStore}
						fill
						titleBar={{ title: 'Gesture Noise Lab', drag: false, filter: false }}
						hideCopyButton
						hidden={true}
					/>
				</aside>
				<button
					type="button"
					data-audio-toggle
					dir="ltr"
					aria-pressed={audioEnabled}
					aria-label={audioEnabled ? 'Mute interactive sound' : 'Enable interactive sound'}
					onClick={toggleAudio}
					className="absolute right-5 bottom-5 z-30 flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-4 py-2 text-xs tracking-[0.18em] text-white/70 uppercase backdrop-blur-md transition-colors hover:border-white/40 hover:text-white"
				>
					<span className={`h-1.5 w-1.5 rounded-full transition-colors ${audioEnabled ? 'bg-fuchsia-300' : 'bg-white/30'}`} />
					{audioEnabled ? 'Sound on' : 'Enable sound'}
				</button>
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

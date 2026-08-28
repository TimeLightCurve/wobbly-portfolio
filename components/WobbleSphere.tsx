'use client'

import { MotionPathControls, Trail, useMotion, type MeshLineGeometry } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { type MotionValue } from 'motion/react'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { type ScenePerformanceProfile } from './CanvasViewport'
import { COLUMN_SPACING, COLUMN_SYSTEM_OFFSET_Y, FIRST_COLUMN_CENTER_Y } from './Room'
import {
	FLIGHT_SPHERE_SCALE,
	MAIN_ROOM_CAMERA_DISTANCE,
	PIPELINE_INLET_Z,
	PIPELINE_ROOM_OFFSET_X,
	PIPELINE_SPHERE_SCALE,
	SPHERE_PATH,
	type SceneRoute,
} from './SceneRoute'

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

const TRAIL_ATTENUATION = (width: number) => width * width
const PIPELINE_TRANSITION_START = 0.48
const PIPELINE_TRANSITION_END = 0.94
const FIRST_COLUMN_Y = COLUMN_SYSTEM_OFFSET_Y + FIRST_COLUMN_CENTER_Y
const EMPTY_ANCHOR: [number, number] = [0, 0]

function easeInOutCubic(progress: number) {
	const value = THREE.MathUtils.clamp(progress, 0, 1)
	return value < 0.5
		? 4 * value * value * value
		: 1 - Math.pow(-2 * value + 2, 3) / 2
}

export class ColumnAnchorStore {
	positions: Array<[number, number]> = []
	basePositions: Array<[number, number]> = []

	update(columnIndex: number, x: number, z: number) {
		this.positions[columnIndex] = [x, z]
		if (!this.basePositions[columnIndex]) {
			this.basePositions[columnIndex] = [x, z]
		}
	}
}

function ScrollPathDriver({ scrollYProgress }: { scrollYProgress: MotionValue<number> }) {
	const motionRef = useMotion()

	useFrame(() => {
		motionRef.current = THREE.MathUtils.clamp(scrollYProgress.get(), 0, 1)
	}, -1)

	return null
}

export function WobbleSphere({
	scrollYProgress,
	anchorStore,
	route,
	performanceProfile,
	pathCarrierRef,
}: {
	scrollYProgress: MotionValue<number>
	anchorStore: ColumnAnchorStore
	route: SceneRoute
	performanceProfile: ScenePerformanceProfile
	pathCarrierRef: RefObject<THREE.Group>
}) {
	const sphere = useRef<THREE.Mesh>(null)
	const sphereLight = useRef<THREE.PointLight>(null)
	const trail = useRef<MeshLineGeometry>(null)
	const material = useRef<THREE.ShaderMaterial>(null)
	const rotationAngle = useRef(0)
	const pointerProximity = useRef(1)
	const carrierPosition = useMemo(() => new THREE.Vector3(), [])
	const lastColumnY = useMemo(
		() => FIRST_COLUMN_Y - (route.columnProgress.length - 1) * COLUMN_SPACING,
		[route.columnProgress.length],
	)
	const motionCurves = useMemo(() => [route.curve], [route.curve])
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
		if (pathCarrierRef.current) {
			pathCarrierRef.current.getWorldPosition(carrierPosition)
		} else {
			route.curve.getPointAt(scrollProgress, carrierPosition)
		}

		const destinationColumn = THREE.MathUtils.clamp(
			Math.ceil((FIRST_COLUMN_Y - carrierPosition.y) / COLUMN_SPACING),
			0,
			route.columnProgress.length - 1,
		)
		const sourceColumn = Math.max(destinationColumn - 1, 0)
		const destinationSectionProgress = destinationColumn === 0
			? 0
			: THREE.MathUtils.clamp(
				(FIRST_COLUMN_Y - sourceColumn * COLUMN_SPACING - carrierPosition.y) / COLUMN_SPACING,
				0,
				1,
			)
		const sourceAnchor = anchorStore.positions[sourceColumn] ?? EMPTY_ANCHOR
		const sourceBaseAnchor = anchorStore.basePositions[sourceColumn] ?? sourceAnchor
		const destinationAnchor = anchorStore.positions[destinationColumn] ?? sourceAnchor
		const destinationBaseAnchor = anchorStore.basePositions[destinationColumn] ?? destinationAnchor
		const sourceDeltaX = sourceAnchor[0] - sourceBaseAnchor[0]
		const sourceDeltaZ = sourceAnchor[1] - sourceBaseAnchor[1]
		const destinationDeltaX = destinationAnchor[0] - destinationBaseAnchor[0]
		const destinationDeltaZ = destinationAnchor[1] - destinationBaseAnchor[1]
		const sourceStopX = sourceDeltaX
		const sourceStopZ = SPHERE_PATH.z + sourceDeltaZ
		const destinationStopX = destinationDeltaX
		const destinationStopZ = SPHERE_PATH.z + destinationDeltaZ
		let desiredX = carrierPosition.x
		let desiredZ = carrierPosition.z

		if (carrierPosition.y >= FIRST_COLUMN_Y) {
			const verticalProgress = THREE.MathUtils.clamp(
				(SPHERE_PATH.startY - carrierPosition.y) / (SPHERE_PATH.startY - FIRST_COLUMN_Y),
				0,
				1,
			)
			const transition = easeInOutCubic(verticalProgress)
			desiredX = THREE.MathUtils.lerp(SPHERE_PATH.startX, destinationStopX, transition)
			desiredZ = THREE.MathUtils.lerp(SPHERE_PATH.z, destinationStopZ, transition)
		} else if (carrierPosition.y >= lastColumnY && destinationColumn > 0) {
			const transition = easeInOutCubic(destinationSectionProgress)
			desiredX = THREE.MathUtils.lerp(sourceStopX, destinationStopX, transition)
			desiredZ = THREE.MathUtils.lerp(sourceStopZ, destinationStopZ, transition)
		} else if (carrierPosition.y < lastColumnY && carrierPosition.y >= route.pipelineInletY) {
			const pipelineExitProgress = THREE.MathUtils.clamp((lastColumnY - carrierPosition.y) / (lastColumnY - route.pipelineInletY), 0, 1)
			const transition = THREE.MathUtils.smoothstep(
				pipelineExitProgress,
				PIPELINE_TRANSITION_START,
				PIPELINE_TRANSITION_END,
			)
			desiredX = THREE.MathUtils.lerp(destinationStopX, PIPELINE_ROOM_OFFSET_X, transition)
			desiredZ = THREE.MathUtils.lerp(destinationStopZ, PIPELINE_INLET_Z, transition)
		}

		const targetX = desiredX - carrierPosition.x
		const targetZ = desiredZ - carrierPosition.z
		const pipelineTransition = THREE.MathUtils.smoothstep(scrollProgress, route.lastColumnProgress, route.pipelineStartProgress)
		const flightTransition = THREE.MathUtils.smoothstep(scrollProgress, route.pipelineExitProgress, route.flightStartProgress)
		if (trail.current) {
			trail.current.visible = scrollProgress >= route.pipelineExitProgress - 0.068
		}
		const columnPerspectiveScale = THREE.MathUtils.clamp(
			(SPHERE_PATH.z + MAIN_ROOM_CAMERA_DISTANCE - desiredZ) / MAIN_ROOM_CAMERA_DISTANCE,
			0.4,
			1,
		)
		const enclosedSphereScale = THREE.MathUtils.lerp(PIPELINE_SPHERE_SCALE, FLIGHT_SPHERE_SCALE, flightTransition)
		const targetScale = THREE.MathUtils.lerp(1, enclosedSphereScale, pipelineTransition)
			* THREE.MathUtils.lerp(columnPerspectiveScale, 1, pipelineTransition)
		const pointerDistance = state.pointer.length()
		const targetPointerProximity = 1 - THREE.MathUtils.clamp(pointerDistance / Math.SQRT2, 0, 1)
		pointerProximity.current = THREE.MathUtils.damp(pointerProximity.current, targetPointerProximity, 8, delta)

		if (sphere.current) {
			sphere.current.position.set(targetX, 0, targetZ)
			const scale = THREE.MathUtils.damp(sphere.current.scale.x, targetScale, 5, delta)
			sphere.current.scale.setScalar(scale)
			rotationAngle.current = THREE.MathUtils.damp(rotationAngle.current, scrollProgress * Math.PI * 4, 2, delta)
			sphere.current.setRotationFromAxisAngle(rotationAxis, rotationAngle.current)
		}

		if (material.current) {
			const proximity = pointerProximity.current
			const waveStrength = 1 - pipelineTransition
			material.current.uniforms.uPositionFrequency.value = 1.9 * waveStrength
			material.current.uniforms.uTimeFrequency.value = (0.66 + 0.001 * proximity) * waveStrength
			material.current.uniforms.uStrength.value = 0.14 * proximity * waveStrength
			material.current.uniforms.uWarpPositionFrequency.value = 1.0 * proximity * waveStrength
			material.current.uniforms.uWarpTimeFrequency.value = (0.72 + 0.0008 * proximity) * waveStrength
			material.current.uniforms.uWarpStrength.value = 0.32 * proximity * waveStrength
			material.current.uniforms.uTime.value = state.clock.getElapsedTime() * waveStrength
			material.current.uniforms.uColorA.value.setRGB(
				THREE.MathUtils.lerp(0.063, 1.8, pipelineTransition),
				THREE.MathUtils.lerp(0.063, 1.55, pipelineTransition),
				THREE.MathUtils.lerp(0.063, 2.15, pipelineTransition),
			)
			material.current.uniforms.uColorB.value.setRGB(
				THREE.MathUtils.lerp(0.8, 3, pipelineTransition),
				THREE.MathUtils.lerp(0.8, 2.65, pipelineTransition),
				THREE.MathUtils.lerp(0.8, 3.45, pipelineTransition),
			)
		}

		if (sphereLight.current) {
			sphereLight.current.intensity = THREE.MathUtils.damp(
				sphereLight.current.intensity,
				THREE.MathUtils.lerp(12, 20, flightTransition) * pipelineTransition,
				6,
				delta,
			)
		}
	})

	return (
		<>
			<MotionPathControls object={pathCarrierRef} curves={motionCurves} damping={0.7} eps={0.00001} loop={false}>
				<ScrollPathDriver scrollYProgress={scrollYProgress} />
			</MotionPathControls>
			<Trail
				ref={trail}
				width={performanceProfile.conserveResources ? 0.16 : 2.62}
				length={performanceProfile.trailLength}
				decay={1}
				// Drei compares stride per frame, so this must stay near zero to let
				// the trail head finish the sphere's damped movement without a gap.
				stride={0.0001}
				interval={performanceProfile.trailInterval}
				color="#d8c9ff"
				attenuation={TRAIL_ATTENUATION}
			>
				<group ref={pathCarrierRef} position={[SPHERE_PATH.startX, SPHERE_PATH.startY, SPHERE_PATH.z]}>
					<mesh ref={sphere}>
						<sphereGeometry
							key={performanceProfile.sphereSegments}
							args={[0.62, performanceProfile.sphereSegments, performanceProfile.sphereSegments]}
						/>
						<shaderMaterial
							ref={material}
							vertexShader={WOBBLE_VERTEX_SHADER}
							fragmentShader={WOBBLE_FRAGMENT_SHADER}
							uniforms={uniforms}
							depthTest
							depthWrite
							depthFunc={THREE.LessEqualDepth}
							toneMapped={false}
						/>
						<pointLight ref={sphereLight} color="#eee6ff" intensity={0} distance={8.2} decay={2} />
					</mesh>
				</group>
			</Trail>
		</>
	)
}

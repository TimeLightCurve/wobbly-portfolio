'use client'

import { Center, Text3D } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { type MotionValue } from 'motion/react'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { type SceneRoute } from './SceneRoute'

const TYPEFACE_URL = '/fonts/helvetiker_regular.typeface.json'
const STATEMENTS = [
	'IDEAS INTO SYSTEMS',
	'CODE WITH CHARACTER',
	'BUILT TO FEEL ALIVE',
] as const
const ACCENT_COLORS = ['#b794ff', '#6de7ff', '#ff8fd8'] as const
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)

type FlightStatementProps = {
	statement: string
	accent: string
	index: number
	progress: number
	route: SceneRoute
	scrollYProgress: MotionValue<number>
	pathCarrierRef: RefObject<THREE.Group>
	mobilePerformance: boolean
}

function FlightStatement({
	statement,
	accent,
	index,
	progress,
	route,
	scrollYProgress,
	pathCarrierRef,
	mobilePerformance,
}: FlightStatementProps) {
	const root = useRef<THREE.Group>(null)
	const markerGroup = useRef<THREE.Group>(null)
	const textMaterial = useRef<THREE.MeshStandardMaterial>(null)
	const spherePositionRef = useRef(new THREE.Vector3())
	const stopOffsetRef = useRef(new THREE.Vector3())
	const stopTransform = useMemo(() => {
		const position = route.curve.getPointAt(progress)
		const tangent = route.curve.getTangentAt(progress).normalize()
		const cameraFacingNormal = tangent.clone().negate()
		const quaternion = new THREE.Quaternion().setFromUnitVectors(FORWARD_AXIS, cameraFacingNormal)

		position.y += 0.72
		return { position, quaternion, tangent }
	}, [progress, route.curve])

	useFrame(({ clock }, delta) => {
		if (!root.current || !textMaterial.current) return

		const spherePosition = spherePositionRef.current
		pathCarrierRef.current?.getWorldPosition(spherePosition)
		const distance = spherePosition.distanceTo(stopTransform.position)
		const signedStopDistance = stopOffsetRef.current
			.copy(stopTransform.position)
			.sub(spherePosition)
			.dot(stopTransform.tangent)
		const passVisibility = THREE.MathUtils.smoothstep(signedStopDistance, -2, -0.35)
		const flightVisibility = THREE.MathUtils.smoothstep(
			scrollYProgress.get(),
			route.flightStartProgress - 0.012,
			route.flightStartProgress + 0.012,
		)
		const proximity = (1 - THREE.MathUtils.smoothstep(distance, 2.1, 8.2))
			* flightVisibility
			* passVisibility
		const targetScale = THREE.MathUtils.lerp(0.2, 1, proximity)
		const nextScale = THREE.MathUtils.damp(root.current.scale.x, targetScale, 5.5, delta)

		root.current.visible = proximity > 0.008 || nextScale > 0.205
		root.current.scale.setScalar(nextScale)
		textMaterial.current.opacity = THREE.MathUtils.damp(
			textMaterial.current.opacity,
			Math.pow(proximity, 0.72),
			6,
			delta,
		)
		textMaterial.current.emissiveIntensity = THREE.MathUtils.damp(
			textMaterial.current.emissiveIntensity,
			proximity * 0.18,
			5,
			delta,
		)

		if (markerGroup.current) {
			markerGroup.current.rotation.z = Math.sin(clock.elapsedTime * 0.34 + index) * 0.08
			markerGroup.current.rotation.y = Math.sin(clock.elapsedTime * 0.48 + index * 1.7) * 0.12
		}
	})

	const side = index % 2 === 0 ? -1 : 1

	return (
		<group
			ref={root}
			position={stopTransform.position}
			quaternion={stopTransform.quaternion}
			scale={0.2}
			visible={false}
		>
			<Center>
				<Text3D
					font={TYPEFACE_URL}
					size={mobilePerformance ? 0.36 : 0.42}
					height={0.055}
					curveSegments={mobilePerformance ? 4 : 7}
					bevelEnabled
					bevelSize={0.007}
					bevelThickness={0.008}
					bevelSegments={mobilePerformance ? 1 : 2}
					letterSpacing={0.015}
				>
					{statement}
					<meshStandardMaterial
						ref={textMaterial}
						color="#e8e4ee"
						emissive={accent}
						emissiveIntensity={0}
						metalness={0.08}
						roughness={0.56}
						transparent
						opacity={0}
						depthWrite={false}
					/>
				</Text3D>
			</Center>
			<group ref={markerGroup}>
				<mesh position={[side * 2.65, -0.66, 0.1]} rotation={[0.3, 0.2, index * 0.55]}>
					<torusGeometry args={[0.22, 0.026, 6, mobilePerformance ? 14 : 24]} />
					<meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.65} toneMapped={false} />
				</mesh>
				<mesh position={[-side * 2.4, 0.7, 0.08]} rotation={[0.2, index * 0.65, 0.35]}>
					<octahedronGeometry args={[0.12, 0]} />
					<meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.35} toneMapped={false} />
				</mesh>
				{!mobilePerformance && (
					<mesh position={[-side * 2.05, -0.72, 0.05]} rotation={[0, 0, side * 0.18]}>
						<boxGeometry args={[0.72, 0.018, 0.018]} />
						<meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.15} toneMapped={false} />
					</mesh>
				)}
			</group>
		</group>
	)
}

export function FlightStatements({
	route,
	scrollYProgress,
	pathCarrierRef,
	mobilePerformance,
}: {
	route: SceneRoute
	scrollYProgress: MotionValue<number>
	pathCarrierRef: RefObject<THREE.Group>
	mobilePerformance: boolean
}) {
	return route.flightStatementProgress.map((progress, index) => (
		<FlightStatement
			key={STATEMENTS[index]}
			statement={STATEMENTS[index]}
			accent={ACCENT_COLORS[index]}
			index={index}
			progress={progress}
			route={route}
			scrollYProgress={scrollYProgress}
			pathCarrierRef={pathCarrierRef}
			mobilePerformance={mobilePerformance}
		/>
	))
}

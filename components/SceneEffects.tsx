'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { type ScenePerformanceProfile } from './CanvasViewport'
import { type SceneRoute } from './SceneRoute'

export function PipelineAtmosphere({
	scrollYProgress,
	route,
}: {
	scrollYProgress: MotionValue<number>
	route: SceneRoute
}) {
	const getThreeState = useThree((state) => state.get)
	const regularBackground = useMemo(() => new THREE.Color('#171828'), [])
	const pipelineBackground = useMemo(() => new THREE.Color('#010102'), [])
	const currentBackground = useMemo(() => new THREE.Color(), [])
	const previousDarkness = useRef(Number.NaN)

	useEffect(() => {
		const scene = getThreeState().scene
		const previousBackground = scene.background
		const previousEnvironmentIntensity = scene.environmentIntensity

		return () => {
			scene.background = previousBackground
			scene.environmentIntensity = previousEnvironmentIntensity
		}
	}, [getThreeState])

	useFrame(({ scene }) => {
		const darkness = THREE.MathUtils.smoothstep(
			scrollYProgress.get(),
			route.lastColumnProgress + 0.05,
			route.pipelineRevealProgress + 0.05,
		)
		
		if (Math.abs(darkness - previousDarkness.current) < 0.0001) return
		previousDarkness.current = darkness
		currentBackground.lerpColors(regularBackground, pipelineBackground, darkness)
		scene.background = currentBackground
		scene.environmentIntensity = THREE.MathUtils.lerp(0.5, 0.018, darkness)
	})

	return null
}

export function PipelineBloom({
	route,
	performanceProfile,
	pathCarrierRef,
}: {
	route: SceneRoute
	performanceProfile: ScenePerformanceProfile
	pathCarrierRef: RefObject<THREE.Group>
}) {
	const [active, setActive] = useState(false)
	const [warmingUp, setWarmingUp] = useState(false)
	const activeRef = useRef(false)
	const bloomWasEnabled = useRef(false)
	const warmupFrames = useRef(0)
	const carrierPosition = useRef(new THREE.Vector3())

	useFrame(() => {
		if (!performanceProfile.bloomEnabled) {
			bloomWasEnabled.current = false
			return
		}

		if (!bloomWasEnabled.current) {
			bloomWasEnabled.current = true
			warmupFrames.current = 2
			setWarmingUp(true)
		} else if (warmupFrames.current > 0) {
			warmupFrames.current -= 1
			if (warmupFrames.current === 0) setWarmingUp(false)
		}

		if (!pathCarrierRef.current) return
		pathCarrierRef.current.getWorldPosition(carrierPosition.current)
		const shouldBeActive = carrierPosition.current.y <= route.lastColumnExitY
		if (shouldBeActive === activeRef.current) return
		activeRef.current = shouldBeActive
		setActive(shouldBeActive)
	})

	if (!performanceProfile.bloomEnabled) return null

	return (
		<EffectComposer
			enabled={warmingUp || active}
			multisampling={0}
			enableNormalPass={false}
			depthBuffer={false}
		>
			<Bloom
				opacity={active ? 1 : 0}
				intensity={0.8}
				luminanceThreshold={0.2}
				luminanceSmoothing={0.18}
				mipmapBlur
				levels={performanceProfile.bloomLevels}
				radius={0.72}
				resolutionScale={performanceProfile.bloomResolutionScale}
			/>
		</EffectComposer>
	)
}

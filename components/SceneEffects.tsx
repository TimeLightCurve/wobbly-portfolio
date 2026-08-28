'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
	const regularBackground = useMemo(() => new THREE.Color('#27282b'), [])
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
			route.lastColumnProgress,
			route.pipelineRevealProgress,
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
	scrollYProgress,
	route,
	performanceProfile,
}: {
	scrollYProgress: MotionValue<number>
	route: SceneRoute
	performanceProfile: ScenePerformanceProfile
}) {
	const [active, setActive] = useState(false)
	const activeRef = useRef(false)

	useEffect(() => {
		if (!performanceProfile.bloomEnabled) return
		return scrollYProgress.on('change', (progress) => {
			const shouldBeActive = progress >= route.lastColumnProgress - 0.015
			if (shouldBeActive === activeRef.current) return
			activeRef.current = shouldBeActive
			setActive(shouldBeActive)
		})
	}, [performanceProfile.bloomEnabled, route.lastColumnProgress, scrollYProgress])

	if (!performanceProfile.bloomEnabled || !active) return null

	return (
		<EffectComposer multisampling={0} enableNormalPass={false} depthBuffer={false}>
			<Bloom
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

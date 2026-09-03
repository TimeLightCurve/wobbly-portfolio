'use client'

import { Environment } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useScroll } from 'motion/react'
import { Suspense, useCallback, useMemo, useRef, type CSSProperties } from 'react'
import * as THREE from 'three'
import { useScenePerformanceProfile } from './CanvasViewport'
import { FlightStatements } from './FlightStatements'
import { PipelineRoom } from './PipelineRoom'
import { PipelineNarrative } from './PipelineNarrative'
// import { PointerAudioModulator } from './PointerAudio'
import { getProjectColumnCount, Room } from './Room'
// import { SceneAudioPanel, useSceneAudio } from './SceneAudio'
import { DESKTOP_FOV_MAX, ResponsiveCameraFov, SceneCamera } from './SceneCamera'
import { PipelineAtmosphere, PipelineBloom } from './SceneEffects'
import {
	createSceneRoute,
	DESKTOP_SCROLL_VH_PER_ROUTE_UNIT,
	MOBILE_SCROLL_VH_PER_ROUTE_UNIT,
} from './SceneRoute'
import { ScrollSectionSnap } from './ScrollSectionSnap'
import { ColumnAnchorStore, WobbleSphere } from './WobbleSphere'
import { projects } from './projects'

const CANVAS_CAMERA = { position: [0, 0, 5] as [number, number, number], fov: DESKTOP_FOV_MAX }
const CANVAS_STYLE: CSSProperties = { touchAction: 'pan-y' }
const FALLBACK_LIGHT_POSITION: [number, number, number] = [4, 6, 5]

export function ThreeCanvas() {
	const { scrollYProgress } = useScroll()
	const performanceProfile = useScenePerformanceProfile()
	// const audio = useSceneAudio(performanceProfile.conserveResources)
	const anchorStore = useMemo(() => new ColumnAnchorStore(), [])
	const sectionRef = useRef<HTMLElement>(null)
	const spherePathCarrier = useRef<THREE.Group>(null!)
	const columnCount = getProjectColumnCount(projects.length)
	const route = useMemo(() => createSceneRoute(columnCount), [columnCount])
	const canvasGl = useMemo(() => ({
		antialias: false,
		stencil: true,
		transmissionResolutionScale: performanceProfile.conserveResources ? 0.2 : 0.4,
		powerPreference: performanceProfile.conserveResources
			? 'default' as const
			: 'high-performance' as const,
	}), [performanceProfile.conserveResources])
	const sectionHeightVariables = useMemo(() => ({
		'--desktop-canvas-height': `${(1500 + route.length * DESKTOP_SCROLL_VH_PER_ROUTE_UNIT).toFixed(3)}vh`,
		'--mobile-canvas-height': `${(100 + route.length * MOBILE_SCROLL_VH_PER_ROUTE_UNIT).toFixed(3)}svh`,
	}) as CSSProperties, [route.length])
	const handleAnchorChange = useCallback((
		columnIndex: number,
		x: number,
		z: number,
	) => {
		anchorStore.update(columnIndex, x, z)
	}, [anchorStore])

	return (
		<section
			ref={sectionRef}
			id="neuron-canvas"
			className="three-canvas-section relative w-full bg-transparent"
			style={sectionHeightVariables}
		>
			<ScrollSectionSnap sectionRef={sectionRef} snapProgress={route.snapProgress} />
			<div className="three-canvas-sticky sticky top-0 z-10 w-full">
				<Canvas
					camera={CANVAS_CAMERA}
					dpr={performanceProfile.dpr}
					gl={canvasGl}
					className="h-full w-full"
					style={CANVAS_STYLE}
				>
					<ResponsiveCameraFov scrollYProgress={scrollYProgress} route={route} />
					<PipelineAtmosphere
						scrollYProgress={scrollYProgress}
						route={route}
						reducedPerformance={performanceProfile.conserveResources}
					/>
					{/* <PointerAudioModulator
						rigRef={audio.rigRef}
						settings={audio.settings}
						enabled={audio.enabled}
					/> */}
					<color attach="background" args={['#171828']} />
					<Suspense fallback={null}>
						{performanceProfile.useEnvironment ? (
							<Environment preset={'dawn'} background={false} environmentIntensity={0.8} />
							// <></>
						) : (
							<>
									{/* <Environment preset={'dawn'} background={false} environmentIntensity={0.8} /> */}

								<ambientLight intensity={0.42} />
								<directionalLight position={FALLBACK_LIGHT_POSITION} intensity={0.72} color="#ded8e8" />
							</>
						)}
						<Room
							position={[0, 0, 0]}
							rotation={[0, -Math.PI / 2, 0]}
							onAnchorChange={handleAnchorChange}
							// onColumnMotion={audio.handleColumnMotion}
							reducedPerformance={performanceProfile.conserveResources}
							pathCarrierRef={spherePathCarrier}
							hideY={route.pipelineInletY + 0.04}
						/>
						<PipelineRoom
							positionX={route.pipelinePositionX}
							positionY={route.pipelinePositionY}
							positionZ={route.pipelinePositionZ}
							revealProgress={route.pipelineRevealProgress}
							scrollYProgress={scrollYProgress}
						/>
						<PipelineNarrative
							scrollYProgress={scrollYProgress}
							route={route}
							reducedPerformance={performanceProfile.conserveResources}
							mobileLayout={performanceProfile.isMobile}
						/>
						<WobbleSphere
							scrollYProgress={scrollYProgress}
							anchorStore={anchorStore}
							route={route}
							performanceProfile={performanceProfile}
							pathCarrierRef={spherePathCarrier}
						/>
						<FlightStatements
							route={route}
							scrollYProgress={scrollYProgress}
							pathCarrierRef={spherePathCarrier}
							mobilePerformance={performanceProfile.conserveResources}
						/>
					</Suspense>

					<SceneCamera
						scrollYProgress={scrollYProgress}
						route={route}
						mobilePerformance={performanceProfile.conserveResources}
						pathCarrierRef={spherePathCarrier}
					/>
					<PipelineBloom
						route={route}
						performanceProfile={performanceProfile}
						pathCarrierRef={spherePathCarrier}
					/>
				</Canvas>
				{/* <SceneAudioPanel store={audio.controlStore} enabled={audio.enabled} onToggle={audio.toggle} /> */}
			</div>
		</section>
	)
}

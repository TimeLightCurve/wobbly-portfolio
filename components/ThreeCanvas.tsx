'use client'

import { Environment } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useScroll } from 'motion/react'
import { Suspense, useCallback, useMemo, useRef, type CSSProperties } from 'react'
import * as THREE from 'three'
import { useEvenIOSViewport, useMobilePerformanceProfile } from './CanvasViewport'
import { FlightStatements } from './FlightStatements'
import { PipelineRoom } from './PipelineRoom'
import { PointerAudioModulator } from './PointerAudio'
import { getProjectColumnCount, Room } from './Room'
import { SceneAudioPanel, useSceneAudio } from './SceneAudio'
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

export function ThreeCanvas() {
	const { scrollYProgress } = useScroll()
	const mobilePerformance = useMobilePerformanceProfile()
	const iosViewport = useEvenIOSViewport()
	const audio = useSceneAudio(mobilePerformance)
	const anchorStore = useMemo(() => new ColumnAnchorStore(), [])
	const sectionRef = useRef<HTMLElement>(null)
	const spherePathCarrier = useRef<THREE.Group>(null!)
	const columnCount = getProjectColumnCount(projects.length)
	const route = useMemo(() => createSceneRoute(columnCount), [columnCount])
	const sectionHeightVariables = {
		'--desktop-canvas-height': `${(1500 + route.length * DESKTOP_SCROLL_VH_PER_ROUTE_UNIT).toFixed(3)}vh`,
		'--mobile-canvas-height': `${(100 + route.length * MOBILE_SCROLL_VH_PER_ROUTE_UNIT).toFixed(3)}svh`,
	} as CSSProperties
	const stickyViewportStyle = {
		touchAction: 'pan-y',
		...(iosViewport && {
			width: `${iosViewport.width}px`,
			height: `${iosViewport.height}px`,
			marginInline: 'auto',
		}),
	} as CSSProperties

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
			<div className="three-canvas-sticky sticky top-0 z-10 h-screen w-full" style={stickyViewportStyle}>
				<Canvas
					camera={{ position: [0, 0, 5], fov: DESKTOP_FOV_MAX }}
					dpr={mobilePerformance ? [1, 3] : [1, 2]}
					gl={{ antialias: false, powerPreference: mobilePerformance ? 'default' : 'high-performance' }}
					className="h-full w-full"
					style={{ touchAction: 'pan-y' }}
				>
					<ResponsiveCameraFov scrollYProgress={scrollYProgress} route={route} />
					<PipelineAtmosphere scrollYProgress={scrollYProgress} route={route} />
					<PointerAudioModulator
						rigRef={audio.rigRef}
						settings={audio.settings}
						enabled={audio.enabled}
					/>
					<Suspense fallback={null}>
						<Environment files="/venice_sunset_1k.hdr" background={false} environmentIntensity={0.5} />
						<Room
							position={[0, 0, 0]}
							rotation={[0, -Math.PI / 2, 0]}
							onAnchorChange={handleAnchorChange}
							onColumnMotion={audio.handleColumnMotion}
						/>
						<PipelineRoom
							positionX={route.pipelinePositionX}
							positionY={route.pipelinePositionY}
							positionZ={route.pipelinePositionZ}
							revealProgress={route.pipelineRevealProgress}
							scrollYProgress={scrollYProgress}
						/>
						<WobbleSphere
							scrollYProgress={scrollYProgress}
							anchorStore={anchorStore}
							route={route}
							mobilePerformance={mobilePerformance}
							pathCarrierRef={spherePathCarrier}
						/>
						<FlightStatements
							route={route}
							scrollYProgress={scrollYProgress}
							pathCarrierRef={spherePathCarrier}
							mobilePerformance={mobilePerformance}
						/>
					</Suspense>

					<SceneCamera
						scrollYProgress={scrollYProgress}
						route={route}
						mobilePerformance={mobilePerformance}
						pathCarrierRef={spherePathCarrier}
					/>
					<PipelineBloom
						scrollYProgress={scrollYProgress}
						route={route}
						mobilePerformance={mobilePerformance}
					/>
				</Canvas>
				<SceneAudioPanel store={audio.controlStore} enabled={audio.enabled} onToggle={audio.toggle} />
			</div>
		</section>
	)
}

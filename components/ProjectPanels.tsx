'use client'

import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import Image from 'next/image'
import projectPreview from '../public/image3.jpg'
import { memo, useMemo, useRef, useState, useSyncExternalStore, type RefCallback } from 'react'
import * as THREE from 'three'
import type { Project } from './projects'

type ProjectFaceProps = {
	project: Project
	layout: ProjectPanelLayout
	position: [number, number, number]
	rotation: [number, number, number]
	width: number
	height: number
	channelWidth: number
	htmlOffset: [number, number, number]
	imageXOffset: number
	isVisible: boolean
	sceneVisible: boolean
	rasterDensity: 1 | 2
	faceRef: RefCallback<THREE.Group>
}

type ProjectPanelLayout = 'balanced' | 'image-dominant' | 'compact-equal' | 'portrait'

// The room starts at -90deg, so the visible sequence is face 1, 2, 3, then 0.
const PROJECT_LAYOUTS: ProjectPanelLayout[] = [
	'compact-equal',
	'balanced',
	'image-dominant',
	'portrait',
]

const FACE_NORMALS = [
	new THREE.Vector3(0, 0, 1),
	new THREE.Vector3(1, 0, 0),
	new THREE.Vector3(0, 0, -1),
	new THREE.Vector3(-1, 0, 0),
] as const

// Enter at a stricter angle than the exit angle. Reversing these values causes
// the face to alternate every visibility update while it settles into place.
const FACE_SHOW_THRESHOLD = 0.82
const FACE_HIDE_THRESHOLD = 0.70
const FACE_SHOW_DELAY = 0.4
const FACE_SHOW_DURATION = 0.3
const FACE_HIDE_DURATION = 0.1
const MOBILE_FACE_SHOW_DELAY = 0.04
const MOBILE_FACE_SHOW_DURATION = 0.12
const MOBILE_FACE_HIDE_DURATION = 0.06
const FACE_SURFACE_GAP = 0.006

const BASE_CSS_PIXELS_PER_WORLD_UNIT = 400
const MOBILE_RASTER_BREAKPOINT = 640
// iOS WebKit offsets Drei's transformed DOM relative to its WebGL face.
// Keep the correction in local model space so it follows every face rotation.
const IOS_HTML_Y_OFFSET = 0.145

function getIsIOSWebKitSnapshot() {
	if (typeof navigator === 'undefined') return false
	const appleMobileDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
	const touchEnabledMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
	return appleMobileDevice || touchEnabledMac
}

function useIOSWebKit() {
	return useSyncExternalStore(
		() => () => undefined,
		getIsIOSWebKitSnapshot,
		() => false,
	)
}

const ProjectFace = memo(function ProjectFace({
	project,
	layout,
	position,
	rotation,
	width,
	height,
	channelWidth,
	htmlOffset,
	imageXOffset,
	isVisible,
	sceneVisible,
	rasterDensity,
	faceRef,
}: ProjectFaceProps) {
	const shouldShow = sceneVisible && isVisible
	const mobileRaster = rasterDensity === 1
	const htmlDistanceFactor = 1 / rasterDensity
	const cssPixelsPerWorldUnit = BASE_CSS_PIXELS_PER_WORLD_UNIT / htmlDistanceFactor
	const panelSize = useMemo(() => ({
		width: width * cssPixelsPerWorldUnit,
		height: height * cssPixelsPerWorldUnit,
		gap: channelWidth * cssPixelsPerWorldUnit,
	}), [channelWidth, cssPixelsPerWorldUnit, height, width])
	const imageDensityMultiplier = rasterDensity === 1 ? 1 : 2
	const imageSizes = layout === 'portrait'
		? `${10 * imageDensityMultiplier}vw`
		: layout === 'compact-equal'
			? `${30 * imageDensityMultiplier}vw`
			: `${50 * imageDensityMultiplier}vw`

	return (
		<group ref={faceRef} position={position} rotation={rotation}>
			<Html
				transform
				position={htmlOffset}
				distanceFactor={htmlDistanceFactor}
				pointerEvents="none"
				wrapperClass="project-panel-html"
				style={{
					pointerEvents: 'none',
				}}
			>
				<div
					style={{
						width: `${panelSize.width}px`,
						height: `${panelSize.height}px`,
						transformStyle: 'preserve-3d',
					}}
				>
					<article
							className="project-panel"
							data-layout={layout}
							style={{
								columnGap: `${panelSize.gap}px`,
								opacity: shouldShow ? 1 : 0,
								transitionProperty: 'opacity',
								transitionDelay: shouldShow ? `${mobileRaster ? MOBILE_FACE_SHOW_DELAY : FACE_SHOW_DELAY}s` : '0s',
								transitionDuration: `${mobileRaster
									? (shouldShow ? MOBILE_FACE_SHOW_DURATION : MOBILE_FACE_HIDE_DURATION)
									: (shouldShow ? FACE_SHOW_DURATION : FACE_HIDE_DURATION)}s`,
								transitionTimingFunction: shouldShow ? 'ease-out' : 'linear',
								backfaceVisibility: 'hidden',
								WebkitBackfaceVisibility: 'hidden',
							}}
						>
							<div
								className="project-panel__image self-s"
								style={{ transform: `translate3d(${imageXOffset * cssPixelsPerWorldUnit}px, 0, 0)` }}
							>
								<Image
									src={projectPreview}
									alt={`${project.title} preview`}
									fill
									sizes={imageSizes}
									loading="eager"
									decoding="sync"
									placeholder="blur"
									className="object-cover"
								/>
							</div>
						<div className=' w-[98%] h-[98%] self-center place-self-center   '>

						
							<div className="project-panel__info self-center place-self-center">
								<p className="project-panel__eyebrow">Selected project</p>
								<h2 className="project-panel__title">{project.title}</h2>
								<p className="project-panel__blurb">{project.blurb}</p>
								<div className="project-panel__metrics">
									<div className="project-panel__metric">
										<strong>{project.metrics.volume}</strong>
										<span>Volume</span>
									</div>
									<div className="project-panel__metric">
										<strong>{project.metrics.transactions}</strong>
										<span>Transactions</span>
									</div>
								</div>
								<div className="project-panel__tags">
									{project.tags.map((tag) => (
										<span key={tag}>
											{tag}
										</span>
									))}
								</div>
							</div>
						</div>
					</article>
				</div>
			</Html>
		</group>
	)
})

export function ProjectPanels({
	geometry,
	projects,
	scaleY,
	reducedPerformance,
	sceneVisible,
}: {
	geometry: THREE.BufferGeometry
	projects: Project[]
	scaleY: number
	reducedPerformance: boolean
	sceneVisible: boolean
}) {
	const viewportWidth = useThree((state) => state.size.width)
	const isIOSWebKit = useIOSWebKit()
	const rasterDensity: 1 | 2 = reducedPerformance || viewportWidth <= MOBILE_RASTER_BREAKPOINT ? 1 : 2
	const faceRefs = useRef<Array<THREE.Group | null>>([])
	const faceVisibility = useRef(FACE_NORMALS.map(() => false))
	const visibilityAccumulator = useRef(0)
	const [visibleFaces, setVisibleFaces] = useState(() => FACE_NORMALS.map(() => false))
	const worldQuaternion = useMemo(() => new THREE.Quaternion(), [])
	const facePosition = useMemo(() => new THREE.Vector3(), [])
	const faceNormal = useMemo(() => new THREE.Vector3(), [])
	const cameraDirection = useMemo(() => new THREE.Vector3(), [])
	const faceRefCallbacks = useMemo(() => FACE_NORMALS.map((_, index): RefCallback<THREE.Group> => (
		face => {
			faceRefs.current[index] = face
		}
	)), [])
	const faces = useMemo(() => {
		geometry.computeBoundingBox()
		const bounds = geometry.boundingBox
		if (!bounds) return []

		const center = new THREE.Vector3()
		bounds.getCenter(center)
		center.y *= scaleY
		const halfSize = new THREE.Vector3()
		bounds.getSize(halfSize).multiplyScalar(0.5)
		const positions = geometry.getAttribute('position')

		return FACE_NORMALS.map((normal) => {
			const position = center.clone()
			const tangent = new THREE.Vector3(normal.z, 0, -normal.x)
			const faceHalfDepth = Math.abs(normal.x) * halfSize.x + Math.abs(normal.z) * halfSize.z
			const width = 2 * (Math.abs(tangent.x) * halfSize.x + Math.abs(tangent.z) * halfSize.z)
			const tangentCenter = center.dot(tangent)
			let lowerChannelEdge = -Infinity
			let upperChannelEdge = Infinity

			for (let index = 0; index < positions.count; index += 1) {
				const tangentPosition = positions.getX(index) * tangent.x + positions.getZ(index) * tangent.z
				if (tangentPosition < tangentCenter && tangentPosition > lowerChannelEdge) {
					lowerChannelEdge = tangentPosition
				} else if (tangentPosition > tangentCenter && tangentPosition < upperChannelEdge) {
					upperChannelEdge = tangentPosition
				}
			}

			const channelWidth = Number.isFinite(lowerChannelEdge) && Number.isFinite(upperChannelEdge)
				? upperChannelEdge - lowerChannelEdge
				: 0

			position.addScaledVector(normal, faceHalfDepth + FACE_SURFACE_GAP)

			return {
				position: position.toArray() as [number, number, number],
				rotation: [0, Math.atan2(normal.x, normal.z), 0] as [number, number, number],
				width,
				height: halfSize.y * 2 * scaleY,
				channelWidth,
			}
		})
	}, [geometry, scaleY])

	useFrame(({ camera }, delta) => {
		if (!sceneVisible) return
		visibilityAccumulator.current += delta
		const updateInterval = reducedPerformance ? 1 / 20 : 1 / 45
		if (visibilityAccumulator.current < updateInterval) return
		visibilityAccumulator.current %= updateInterval

		let visibilityChanged = false
		for (let index = 0; index < faceRefs.current.length; index += 1) {
			const face = faceRefs.current[index]
			if (!face) continue
			face.getWorldPosition(facePosition)
			face.getWorldQuaternion(worldQuaternion)
			faceNormal.set(0, 0, 1).applyQuaternion(worldQuaternion)
			cameraDirection.copy(camera.position).sub(facePosition).normalize()
			const facingScore = faceNormal.dot(cameraDirection)
			const nextIsVisible = faceVisibility.current[index]
				? facingScore > FACE_HIDE_THRESHOLD
				: facingScore > FACE_SHOW_THRESHOLD
			if (faceVisibility.current[index] === nextIsVisible) continue
			faceVisibility.current[index] = nextIsVisible
			visibilityChanged = true
		}

		if (visibilityChanged) setVisibleFaces([...faceVisibility.current])
	})

	return (
		<group>
			{projects.slice(0, 4).map((project, index) => {
				const face = faces[index]
				if (!face) return null
				const htmlOffset: [number, number, number] = isIOSWebKit
					? [face.channelWidth * 0.5, IOS_HTML_Y_OFFSET, 0]
					: [0, 0, 0]
				const imageXOffset = isIOSWebKit ? face.channelWidth : 0

				return (
					<ProjectFace
						key={project.title}
						project={project}
						layout={PROJECT_LAYOUTS[index] ?? 'balanced'}
						htmlOffset={htmlOffset}
						imageXOffset={imageXOffset}
						isVisible={visibleFaces[index]}
						sceneVisible={sceneVisible}
						rasterDensity={rasterDensity}
						faceRef={faceRefCallbacks[index]}
						{...face}
					/>
				)
			})}
		</group>
	)
}

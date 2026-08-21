'use client'

import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { AnimatePresence, motion } from 'motion/react'
import Image from 'next/image'
import { useMemo, useRef, useState } from 'react'
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

const FACE_SHOW_THRESHOLD = 0.68
const FACE_HIDE_THRESHOLD = 0.80
const FACE_SHOW_DELAY = 0.4
const FACE_SHOW_DURATION = 0.3
const FACE_HIDE_DURATION = 0.1
const FACE_SURFACE_GAP = 0.006

const HTML_DISTANCE_FACTOR = 1
const HTML_RASTER_SCALE = 0.5
const HTML_RASTER_SUPERSAMPLE = 2
const CSS_PIXELS_PER_WORLD_UNIT = 400 / HTML_DISTANCE_FACTOR

function ProjectFace({ project, layout, position, rotation, width, height, channelWidth }: ProjectFaceProps) {
	const face = useRef<THREE.Group>(null)
	const faceVisibility = useRef(false)
	const [isVisible, setIsVisible] = useState(false)
	const worldQuaternion = useMemo(() => new THREE.Quaternion(), [])
	const facePosition = useMemo(() => new THREE.Vector3(), [])
	const faceNormal = useMemo(() => new THREE.Vector3(), [])
	const cameraDirection = useMemo(() => new THREE.Vector3(), [])
	const panelSize = useMemo(() => ({
		width: width * CSS_PIXELS_PER_WORLD_UNIT,
		height: height * CSS_PIXELS_PER_WORLD_UNIT,
		gap: channelWidth * CSS_PIXELS_PER_WORLD_UNIT,
	}), [channelWidth, height, width])
	const imageSizes = layout === 'portrait'
		? '20vw'
		: layout === 'compact-equal'
			? '60vw'
			: '100vw'

	useFrame(({ camera }) => {
		if (!face.current) return

		face.current.getWorldPosition(facePosition)
		face.current.getWorldQuaternion(worldQuaternion)
		faceNormal.set(0, 0, 1).applyQuaternion(worldQuaternion).normalize()
		cameraDirection.copy(camera.position).sub(facePosition).normalize()
		const facingScore = faceNormal.dot(cameraDirection)
		const nextIsVisible = faceVisibility.current
			? facingScore > FACE_HIDE_THRESHOLD
			: facingScore > FACE_SHOW_THRESHOLD

		if (faceVisibility.current !== nextIsVisible) {
			faceVisibility.current = nextIsVisible
			setIsVisible(nextIsVisible)
		}
	})

	return (
		<group ref={face} position={position} rotation={rotation}>
			<Html
				transform
				distanceFactor={HTML_DISTANCE_FACTOR}
				scale={HTML_RASTER_SCALE}
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
					<div
						style={{
							width: '100%',
							height: '100%',
							transform: `scale(${HTML_RASTER_SUPERSAMPLE})`,
							transformOrigin: 'center center',
						}}
					>
					<AnimatePresence initial={false}>
						<motion.article
							key={`info-${project.title}`}
							initial={{ opacity: 0 }}
							animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
							transition={{
								opacity: isVisible
									? { delay: FACE_SHOW_DELAY, duration: FACE_SHOW_DURATION, ease: 'easeOut' }
									: { duration: FACE_HIDE_DURATION, ease: 'linear' },
							}}
							className="project-panel"
							data-layout={layout}
							style={{
								columnGap: `${panelSize.gap}px`,
							}}
						>
							<div className="project-panel__image self-s">
								<Image
									src="/image3.jpg"
									alt={`${project.title} preview`}
									fill
									sizes={imageSizes}
									className="object-cover"
								/>
							</div>
							<div className="project-panel__info">
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
						</motion.article>
					</AnimatePresence>
					</div>
				</div>
			</Html>
		</group>
	)
}

export function ProjectPanels({ geometry, projects, scaleY }: { geometry: THREE.BufferGeometry, projects: Project[], scaleY: number }) {
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

	return (
		<group>
			{projects.slice(0, 4).map((project, index) => {
				const face = faces[index]
				if (!face) return null

				return (
					<ProjectFace
						key={project.title}
						project={project}
						layout={PROJECT_LAYOUTS[index] ?? 'balanced'}
						{...face}
					/>
				)
			})}
		</group>
	)
}

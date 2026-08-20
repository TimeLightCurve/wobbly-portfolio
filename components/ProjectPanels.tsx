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
	position: [number, number, number]
	rotation: [number, number, number]
}

const FACE_NORMALS = [
	new THREE.Vector3(0, 0, 1),
	new THREE.Vector3(1, 0, 0),
	new THREE.Vector3(0, 0, -1),
	new THREE.Vector3(-1, 0, 0),
] as const

const FACE_SHOW_THRESHOLD = 0.88
const FACE_HIDE_THRESHOLD = 0.80
const FACE_SHOW_DELAY = 0.88
const FACE_SHOW_DURATION = 0.8
const FACE_HIDE_DURATION = 0.1

function ProjectFace({ project, position, rotation }: ProjectFaceProps) {
	const face = useRef<THREE.Group>(null)
	const panel = useRef<HTMLDivElement>(null)
	const facingCamera = useRef(false)
	const faceVisibility = useRef(false)
	const [isVisible, setIsVisible] = useState(false)
	const worldQuaternion = useMemo(() => new THREE.Quaternion(), [])
	const cameraQuaternion = useMemo(() => new THREE.Quaternion(), [])
	const cameraSpaceNormal = useMemo(() => new THREE.Vector3(), [])
	const facePosition = useMemo(() => new THREE.Vector3(), [])
	const faceNormal = useMemo(() => new THREE.Vector3(), [])
	const cameraDirection = useMemo(() => new THREE.Vector3(), [])

	useFrame(({ camera }) => {
		if (!face.current || !panel.current) return

		face.current.getWorldPosition(facePosition)
		face.current.getWorldQuaternion(worldQuaternion)
		faceNormal.set(0, 0, 1).applyQuaternion(worldQuaternion).normalize()
		cameraDirection.copy(camera.position).sub(facePosition).normalize()
		const facingScore = faceNormal.dot(cameraDirection)
		const nextIsVisible = faceVisibility.current
			? facingScore > FACE_HIDE_THRESHOLD
			: facingScore > FACE_SHOW_THRESHOLD

		if (facingCamera.current !== nextIsVisible) {
			facingCamera.current = nextIsVisible
			faceVisibility.current = nextIsVisible
			setIsVisible(nextIsVisible)
		}

		camera.getWorldQuaternion(cameraQuaternion).invert()
		cameraSpaceNormal
			.set(0, 0, 1)
			.applyQuaternion(worldQuaternion)
			.applyQuaternion(cameraQuaternion)
			.normalize()

		const yaw = Math.atan2(cameraSpaceNormal.x, cameraSpaceNormal.z)
		const pitch = -Math.asin(THREE.MathUtils.clamp(cameraSpaceNormal.y, -1, 1))
		panel.current.style.transform = `perspective(80000px) rotateX(${pitch}rad) rotateY(${yaw}rad) `
	})

	return (
		<group ref={face} position={position} rotation={rotation}>
			<Html
				center
				distanceFactor={0.45}
				style={{
					pointerEvents: 'none',

				}}
			>
				<div
					ref={panel}
					style={{
						backfaceVisibility: 'hidden',
						transformOrigin: 'center center',
						transformStyle: 'preserve-3d',
						willChange: 'transform',
						// display: isVisible ? 'block' : 'none',
						// transition: 'opacity 0.1s ease-in-out',
					}}
				>
					<AnimatePresence initial={false}>
						<motion.article
							key={`info-${project.title}`}
							initial={{ opacity: 0, x: -20 }}
							animate={isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
							transition={{
								opacity: isVisible
									? { delay: FACE_SHOW_DELAY, duration: FACE_SHOW_DURATION, ease: 'easeOut' }
									: { duration: FACE_HIDE_DURATION, ease: 'linear' },
								x: isVisible
									? { delay: FACE_SHOW_DELAY, duration: FACE_SHOW_DURATION, ease: 'easeOut' }
									: { duration: FACE_HIDE_DURATION, ease: 'linear' },
							}}
							className="grid w-[150vw] h-[150vh] grid-cols-2 overflow-hidden bg-transparent text-white"
						>
							<div className="p-8">
								<p className="mb-4 text-base uppercase tracking-[0.28em] text-white/50">Selected project</p>
								<h2 className="mb-4 text-9xl font-semibold">{project.title}</h2>
								<p className="mb-6 text-6xl leading-16 text-white/70">{project.blurb}</p>
								<div className="mb-6 flex gap-8 border-y border-white/15 py-4">
									<div>
										<strong className="block text-2xl">{project.metrics.volume}</strong>
										<span className="text-[10px] uppercase tracking-wider text-white/45">Volume</span>
									</div>
									<div>
										<strong className="block text-2xl">{project.metrics.transactions}</strong>
										<span className="text-[10px] uppercase tracking-wider text-white/45">Transactions</span>
									</div>
								</div>
								<div className="flex flex-wrap gap-12">
									{project.tags.map((tag) => (
										<span key={tag} className="border border-white/20 px-8 py-6 text-base text-white/70">
											{tag}
										</span>
									))}
								</div>
							</div>
							<div className="relative bg-black">
								<Image
									src="/image1.jpg"
									alt={`${project.title} preview`}
									fill
									sizes="480px"
									className="object-cover"
								/>
							</div>
						</motion.article>
					</AnimatePresence>
				</div>
			</Html>
		</group>
	)
}

export function ProjectPanels({ geometry, projects }: { geometry: THREE.BufferGeometry, projects: Project[] }) {
	const faces = useMemo(() => {
		geometry.computeBoundingBox()
		const bounds = geometry.boundingBox
		if (!bounds) return []

		const center = new THREE.Vector3()
		bounds.getCenter(center)
		center.y *= 0.25
		const halfSize = new THREE.Vector3()
		bounds.getSize(halfSize).multiplyScalar(0.5)
		const faceOffset = 0.025
		const panelOffset = Math.min(halfSize.x, halfSize.z) * 0.02

		return FACE_NORMALS.map((normal) => {
			const position = center.clone()
			const tangent = new THREE.Vector3(normal.z, 0, -normal.x)
			position.x += normal.x * (halfSize.x + faceOffset)
			position.z += normal.z * (halfSize.z + faceOffset)
			position.addScaledVector(tangent, -panelOffset)

			return {
				position: position.toArray() as [number, number, number],
				rotation: [0, Math.atan2(normal.x, normal.z), 0] as [number, number, number],
			}
		})
	}, [geometry])

	return (
		<group>
			{projects.slice(0, 4).map((project, index) => {
				const face = faces[index]
				if (!face) return null

				return <ProjectFace key={project.title} project={project} {...face} />
			})}
		</group>
	)
}

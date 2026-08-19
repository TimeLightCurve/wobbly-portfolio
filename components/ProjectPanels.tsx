'use client'

import { Html } from '@react-three/drei'
import { AnimatePresence, motion } from 'motion/react'
import Image from 'next/image'
import { useMemo } from 'react'
import * as THREE from 'three'
import type { Project } from './projects'

type ProjectFaceProps = {
	project: Project
	position: [number, number, number]
	rotation: [number, number, number]
}

function ProjectFace({ project, position, rotation }: ProjectFaceProps) {
	return (
		<group position={position} rotation={rotation}>
			<Html
				transform
				distanceFactor={5}
				style={{ pointerEvents: 'none' }}
			>
				<AnimatePresence initial={false}>
					<motion.article
						key={`info-${project.title}`}
						initial={{ opacity: 0, x: -40 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: 40, transition: { duration: 0.01, ease: 'easeIn' } }}
						transition={{ duration: 0.45, ease: 'easeOut' }}
						className="grid h-[420px] w-[960px] grid-cols-2 overflow-hidden bg-transparent text-white"
					>
						<div className="p-8">
							<p className="mb-4 text-xs uppercase tracking-[0.28em] text-white/50">Selected project</p>
							<h2 className="mb-4 text-4xl font-semibold">{project.title}</h2>
							<p className="mb-6 text-base leading-7 text-white/70">{project.blurb}</p>
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
							<div className="flex flex-wrap gap-2">
								{project.tags.map((tag) => (
									<span key={tag} className="border border-white/20 px-3 py-2 text-xs text-white/70">
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
		const offset = 0.03

		return [
			{ position: [center.x, center.y, bounds.max.z + offset], rotation: [0, 0, 0] },
			{ position: [bounds.max.x + offset, center.y, center.z], rotation: [0, Math.PI / 2, 0] },
			{ position: [center.x, center.y, bounds.min.z - offset], rotation: [0, Math.PI, 0] },
			{ position: [bounds.min.x - offset, center.y, center.z], rotation: [0, -Math.PI / 2, 0] },
		] satisfies Array<{ position: [number, number, number], rotation: [number, number, number] }>
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

'use client'

import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { AnimatePresence, motion, type MotionValue, useMotionValueEvent } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { MOBILE_BREAKPOINT } from './CanvasViewport'
import { type SceneRoute } from './SceneRoute'

const CHAPTER_BLOCKS = [
	{
		chapter: 0,
		eyebrow: '01 / CREATIVE ENGINEERING',
		title: 'We make ideas feel alive.',
		body: 'Motion, code and interaction shaped into one expressive system.',
		placement: 'entry-right',
		stop: 1,
		offset: [2.65, 0.15, 0] as const,
		mobileOffset: [0.15, -1.75, 0] as const,
	},
	{
		chapter: 1,
		eyebrow: '02 / ORIGINAL BY DESIGN',
		title: 'Ideas deserve more than a template.',
		body: 'We build distinct digital identities around the story only you can tell.',
		placement: 'middle-left',
		stop: 2,
		offset: [-2.2, -0.45, 0] as const,
		mobileOffset: [-0.55, 2.25, 0] as const,
	},
	{
		chapter: 1,
		eyebrow: 'EXPERIENCE FIRST',
		title: 'Built around how it feels.',
		body: 'Every transition, sound and detail guides attention with purpose.',
		placement: 'middle-right',
		stop: 2,
		offset: [2.4, 0.75, 0] as const,
		mobileOffset: [0.55, -2.35, 0] as const,
	},
	{
		chapter: 2,
		eyebrow: '03 / PRODUCT THINKING',
		title: 'From prototype to product.',
		body: 'Expressive frontends backed by reliable, scalable engineering.',
		placement: 'exit-right',
		stop: 3,
		offset: [2.75, 0.15, 0] as const,
		mobileOffset: [0.2, -1.95, 0] as const,
	},
] as const

const CHAPTER_COUNT = 3

function findChapter(progress: number, boundaries: readonly number[]) {
	if (progress < boundaries[0] || progress >= boundaries[boundaries.length - 1]) return -1
	for (let chapter = 0; chapter < CHAPTER_COUNT; chapter += 1) {
		if (progress < boundaries[chapter + 1]) return chapter
	}
	return -1
}

export function PipelineNarrative({
	scrollYProgress,
	route,
	reducedPerformance,
	mobileLayout,
}: {
	scrollYProgress: MotionValue<number>
	route: SceneRoute
	reducedPerformance: boolean
	mobileLayout: boolean
}) {
	const mobileViewport = useThree((state) => state.size.width <= MOBILE_BREAKPOINT)
	const useMobileLayout = mobileLayout || mobileViewport
	const boundaries = useMemo(() => {
		const stops = route.pipelineProgress
		return [
			(stops[0] + stops[1]) * 0.5,
			(stops[1] + stops[2]) * 0.5,
			(stops[2] + stops[3]) * 0.5,
			(stops[3] + stops[4]) * 0.5,
		]
	}, [route.pipelineProgress])
	const blockPositions = useMemo(() => CHAPTER_BLOCKS.map((block) => {
		const position = route.curve.getPointAt(route.pipelineProgress[block.stop], new THREE.Vector3())
		const offset = useMobileLayout ? block.mobileOffset : block.offset
		return position.add(new THREE.Vector3(...offset))
	}), [route, useMobileLayout])
	const [activeChapter, setActiveChapter] = useState(() => findChapter(scrollYProgress.get(), boundaries))
	const activeChapterRef = useRef(activeChapter)
	const updateChapter = useCallback((progress: number) => {
		const nextChapter = findChapter(progress, boundaries)
		if (nextChapter === activeChapterRef.current) return
		activeChapterRef.current = nextChapter
		setActiveChapter(nextChapter)
	}, [boundaries])

	useEffect(() => updateChapter(scrollYProgress.get()), [scrollYProgress, updateChapter])
	useMotionValueEvent(scrollYProgress, 'change', updateChapter)

	const blurIn = reducedPerformance ? 16 : 32
	const blurOut = reducedPerformance ? 10 : 22

	return (
		<group name="pipeline-narrative">
			{CHAPTER_BLOCKS.map((block, index) => (
				<Html
					key={block.placement}
					center
					transform
					sprite
					distanceFactor={useMobileLayout ? 1.65 : 2.1}
					position={blockPositions[index]}
					pointerEvents="none"
					wrapperClass="pipeline-narrative-html"
				>
					<AnimatePresence>
						{activeChapter === block.chapter ? (
							<motion.article
								key={block.placement}
								className={`pipeline-narrative__chapter pipeline-narrative__chapter--${block.placement}`}
								initial={{ opacity: 0, filter: `blur(${blurIn}px)`, y: 22, color: 'rgba(255,255,255,0)' }}
								animate={{ opacity: 1, filter: 'blur(0px)', y: 0, color: '#ffffff' }}
								exit={{ opacity: 0, filter: `blur(${blurOut}px)`, y: -18, color: 'rgba(255,255,255,0)', transition: { duration: reducedPerformance ? 0.58 : 0.82, ease: [0.22, 1, 0.36, 1] } }}
								transition={{ duration: reducedPerformance ? 0.58 : 0.82, delay: 1.5, ease: [0.22, 1, 0.36, 1] }}
							>
								<p className="pipeline-narrative__eyebrow">{block.eyebrow}</p>
								<h2 className="pipeline-narrative__title">{block.title}</h2>
								<p className="pipeline-narrative__body">{block.body}</p>
							</motion.article>
						) : null}
					</AnimatePresence>
				</Html>
			))}
		</group>
	)
}

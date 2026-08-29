'use client'

import { useLenis } from 'lenis/react'
import { useEffect, type RefObject } from 'react'
import * as THREE from 'three'

const SNAP_MAX_SECTIONS_PER_GESTURE = 2

const DESKTOP_SNAP = {
	idleDelay: 190,
	thresholdRatio: 0.29,
	thresholdMin: 88,
	thresholdMax: 200,
	secondStepMultiplier: 3.8,
}

const MOBILE_SNAP = {
	idleDelay: 150,
	thresholdRatio: 0.18,
	thresholdMin: 48,
	thresholdMax: 118,
	secondStepMultiplier: 4.2,
}

export function ScrollSectionSnap({
	sectionRef,
	snapProgress,
}: {
	sectionRef: RefObject<HTMLElement | null>
	snapProgress: number[]
}) {
	const lenis = useLenis()

	useEffect(() => {
		if (!lenis) return
		const mobileInput = window.matchMedia('(pointer: coarse), (max-width: 640px)').matches
		const snapConfig = mobileInput ? MOBILE_SNAP : DESKTOP_SNAP

		let gestureActive = false
		let gestureStartIndex = 0
		let anchorIndex = 0
		let accumulatedDelta = 0
		let wheelIdleTimer: ReturnType<typeof setTimeout> | null = null
		let pendingSnapFrame: number | null = null
		let queuedSnapIndex: number | null = null

		const getSnapTargets = () => {
			const section = sectionRef.current
			if (!section) return []
			const sectionTravel = Math.max(section.offsetHeight - window.innerHeight, 0)
			return snapProgress.map((progress) => THREE.MathUtils.clamp(
				section.offsetTop + progress * sectionTravel,
				0,
				lenis.limit,
			))
		}

		const getNearestIndex = (scroll: number, targets: number[]) => {
			let nearestIndex = 0
			let nearestDistance = Number.POSITIVE_INFINITY
			for (let index = 0; index < targets.length; index += 1) {
				const distance = Math.abs(targets[index] - scroll)
				if (distance >= nearestDistance) continue
				nearestDistance = distance
				nearestIndex = index
			}
			return nearestIndex
		}

		const runQueuedSnap = () => {
			pendingSnapFrame = null
			const targets = getSnapTargets()
			const targetIndex = queuedSnapIndex
			queuedSnapIndex = null
			if (targetIndex === null || targets[targetIndex] === undefined) return

			const target = targets[targetIndex]
			const distance = Math.abs(target - lenis.animatedScroll)
			if (distance < 0.5) return
			const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
			const duration = THREE.MathUtils.clamp(0.56 + distance / 1900, 0.62, 1.08)

			lenis.scrollTo(target, {
				immediate: reducedMotion,
				duration,
				easing: (time) => time < 0.5
					? 4 * time * time * time
					: 1 - Math.pow(-2 * time + 2, 3) / 2,
				lock: false,
				programmatic: true,
				userData: { sectionSnap: true, sectionIndex: targetIndex },
			})
		}

		const queueSnap = (targetIndex: number) => {
			queuedSnapIndex = targetIndex
			if (pendingSnapFrame !== null) cancelAnimationFrame(pendingSnapFrame)
			pendingSnapFrame = requestAnimationFrame(runQueuedSnap)
		}

		const finishGesture = () => {
			if (!gestureActive) return
			gestureActive = false
			accumulatedDelta = 0
			queueSnap(anchorIndex)
		}

		const handleVirtualScroll = ({ deltaY, event }: { deltaY: number, event: WheelEvent | TouchEvent }) => {
			const target = event.target
			if (target instanceof Element && target.closest('aside, [data-audio-toggle]')) return
			const targets = getSnapTargets()
			if (targets.length === 0) return
			const currentScroll = lenis.targetScroll
			const sectionStart = targets[0]
			const sectionEnd = targets[targets.length - 1]
			if (currentScroll < sectionStart - 1 || currentScroll > sectionEnd + window.innerHeight) return

			if (!gestureActive) {
				gestureActive = true
				anchorIndex = getNearestIndex(currentScroll, targets)
				gestureStartIndex = anchorIndex
				accumulatedDelta = 0
			}

			accumulatedDelta += deltaY
			for (let steps = 0; steps < targets.length; steps += 1) {
				const direction = Math.sign(accumulatedDelta)
				if (direction === 0) break
				const gestureMinimumIndex = Math.max(
					gestureStartIndex - SNAP_MAX_SECTIONS_PER_GESTURE,
					0,
				)
				const gestureMaximumIndex = Math.min(
					gestureStartIndex + SNAP_MAX_SECTIONS_PER_GESTURE,
					targets.length - 1,
				)
				const nextIndex = THREE.MathUtils.clamp(
					anchorIndex + direction,
					gestureMinimumIndex,
					gestureMaximumIndex,
				)
				if (nextIndex === anchorIndex) {
					accumulatedDelta = 0
					break
				}
				const gap = Math.abs(targets[nextIndex] - targets[anchorIndex])
				const baseThreshold = THREE.MathUtils.clamp(
					gap * snapConfig.thresholdRatio,
					snapConfig.thresholdMin,
					snapConfig.thresholdMax,
				)
				const sectionsFromGestureStart = Math.abs(nextIndex - gestureStartIndex)
				const threshold = sectionsFromGestureStart === 2
					? baseThreshold * snapConfig.secondStepMultiplier
					: baseThreshold
				if (Math.abs(accumulatedDelta) < threshold) break

				anchorIndex = nextIndex
				accumulatedDelta -= direction * threshold
				queueSnap(anchorIndex)
			}

			if (event instanceof WheelEvent) {
				if (wheelIdleTimer) clearTimeout(wheelIdleTimer)
				wheelIdleTimer = setTimeout(() => {
					wheelIdleTimer = null
					finishGesture()
				}, snapConfig.idleDelay)
			}
		}

		const handleTouchEnd = () => finishGesture()
		const removeVirtualScroll = lenis.on('virtual-scroll', handleVirtualScroll)
		window.addEventListener('touchend', handleTouchEnd, { passive: true })
		window.addEventListener('touchcancel', handleTouchEnd, { passive: true })

		return () => {
			removeVirtualScroll()
			window.removeEventListener('touchend', handleTouchEnd)
			window.removeEventListener('touchcancel', handleTouchEnd)
			if (wheelIdleTimer) clearTimeout(wheelIdleTimer)
			if (pendingSnapFrame !== null) cancelAnimationFrame(pendingSnapFrame)
		}
	}, [lenis, sectionRef, snapProgress])

	return null
}

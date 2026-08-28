'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

export const MOBILE_BREAKPOINT = 640

function isIOSWebKitDevice() {
	if (typeof navigator === 'undefined') return false
	const appleMobileDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
	const touchEnabledMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
	return appleMobileDevice || touchEnabledMac
}

function getEvenIOSViewportSnapshot() {
	if (typeof window === 'undefined' || !isIOSWebKitDevice()) return ''
	const visualViewport = window.visualViewport
	const width = visualViewport?.width ?? document.documentElement.clientWidth
	const height = visualViewport?.height ?? window.innerHeight
	const evenWidth = Math.max(2, Math.floor(width / 2) * 2)
	const evenHeight = Math.max(2, Math.floor(height / 2) * 2)
	return `${evenWidth}:${evenHeight}`
}

function subscribeToIOSViewport(onStoreChange: () => void) {
	if (typeof window === 'undefined' || !isIOSWebKitDevice()) return () => undefined
	let orientationTimer: ReturnType<typeof setTimeout> | null = null
	const handleOrientationChange = () => {
		if (orientationTimer) clearTimeout(orientationTimer)
		orientationTimer = setTimeout(onStoreChange, 250)
	}
	window.addEventListener('orientationchange', handleOrientationChange)

	return () => {
		window.removeEventListener('orientationchange', handleOrientationChange)
		if (orientationTimer) clearTimeout(orientationTimer)
	}
}

export function useEvenIOSViewport() {
	const snapshot = useSyncExternalStore(
		subscribeToIOSViewport,
		getEvenIOSViewportSnapshot,
		() => '',
	)
	if (!snapshot) return null
	const [width, height] = snapshot.split(':').map(Number)
	return { width, height }
}

export function useMobilePerformanceProfile() {
	const [isMobile, setIsMobile] = useState(true)

	useEffect(() => {
		const media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
		const updateProfile = () => setIsMobile(media.matches)

		updateProfile()
		if (typeof media.addEventListener === 'function') {
			media.addEventListener('change', updateProfile)
			return () => media.removeEventListener('change', updateProfile)
		}

		media.addListener(updateProfile)
		return () => media.removeListener(updateProfile)
	}, [])

	return isMobile
}

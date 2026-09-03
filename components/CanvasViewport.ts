'use client'

import { getGPUTier, type TierResult } from '@pmndrs/detect-gpu'
import { useEffect, useState } from 'react'

export const MOBILE_BREAKPOINT = 640

export type ScenePerformanceProfile = Readonly<{
	tier: number
	isMobile: boolean
	conserveResources: boolean
	dpr: [number, number]
	sphereSegments: number
	trailLength: number
	trailInterval: number
	bloomEnabled: boolean
	bloomLevels: number
	bloomResolutionScale: number
	useEnvironment: boolean
}>

const SAFE_PERFORMANCE_PROFILE: ScenePerformanceProfile = {
	tier: 1,
	isMobile: true,
	conserveResources: true,
	dpr: [1, 1],
	sphereSegments: 48,
	trailLength: 2.8,
	trailInterval: 3,
	bloomEnabled: false,
	bloomLevels: 2,
	bloomResolutionScale: 0.16,
	useEnvironment: false,
}
const GPU_TIER_CACHE_KEY = 'portfolio-gpu-tier-v1'

function createPerformanceProfile(result: Pick<TierResult, 'tier' | 'isMobile'>): ScenePerformanceProfile {
	const tier = Math.round(Math.max(0, Math.min(3, result.tier)))
	const isMobile = result.isMobile ?? false
	const conserveResources = isMobile || tier <= 1
	console.log('GPU tier detected:', { tier, isMobile, conserveResources })

	if (tier <= 1) {
		return { ...SAFE_PERFORMANCE_PROFILE, tier, isMobile }
	}

	if (tier === 2) {
		return {
			tier,
			isMobile,
			conserveResources,
			dpr: [1, isMobile ? 1.25 : 1.5],
			sphereSegments: isMobile ? 64 : 80,
			trailLength: isMobile ? 4.2 : 5.4,
			trailInterval: 2,
			bloomEnabled: true,
			bloomLevels: isMobile ? 2 : 3,
			bloomResolutionScale: isMobile ? 0.18 : 0.26,
			useEnvironment: true,
		}
	}

	return {
		tier,
		isMobile,
		conserveResources,
		dpr: [1, isMobile ? 1.5 : 3],
		sphereSegments: isMobile ? 80 : 128,
		trailLength: isMobile ? 5.8 : 8,
		trailInterval: isMobile ? 2 : 1,
		bloomEnabled: true,
		bloomLevels: isMobile ? 3 : 5,
		bloomResolutionScale: isMobile ? 0.24 : 0.38,
		useEnvironment: true,
	}
}

function getFallbackProfile() {
	if (typeof window === 'undefined') return SAFE_PERFORMANCE_PROFILE
	const isMobile = window.matchMedia('(pointer: coarse)').matches
		|| window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
	return createPerformanceProfile({ tier: isMobile ? 1 : 2, isMobile })
}

function getCachedGpuTier(): Pick<TierResult, 'tier' | 'isMobile'> | null {
	try {
		const cached = window.sessionStorage.getItem(GPU_TIER_CACHE_KEY)
		if (!cached) return null
		const result = JSON.parse(cached) as Partial<Pick<TierResult, 'tier' | 'isMobile'>>
		return typeof result.tier === 'number'
			? { tier: result.tier, isMobile: result.isMobile }
			: null
	} catch {
		return null
	}
}

export function useScenePerformanceProfile() {
	const [profile, setProfile] = useState<ScenePerformanceProfile>(SAFE_PERFORMANCE_PROFILE)

	useEffect(() => {
		let cancelled = false
		const cachedTier = getCachedGpuTier()
		if (cachedTier) {
			const cachedProfileFrame = window.requestAnimationFrame(() => {
				if (!cancelled) setProfile(createPerformanceProfile(cachedTier))
			})
			return () => {
				cancelled = true
				window.cancelAnimationFrame(cachedProfileFrame)
			}
		}

		void getGPUTier({
			failIfMajorPerformanceCaveat: true,
			mobileTiers: [0, 20, 40, 58],
			desktopTiers: [0, 18, 36, 58],
		}).then((result) => {
			if (cancelled) return
			try {
				window.sessionStorage.setItem(GPU_TIER_CACHE_KEY, JSON.stringify({
					tier: result.tier,
					isMobile: result.isMobile,
				}))
			} catch {
				// Storage can be unavailable in private browsing modes.
			}
			setProfile(createPerformanceProfile(result))
		}).catch(() => {
			if (!cancelled) setProfile(getFallbackProfile())
		})

		return () => {
			cancelled = true
		}
	}, [])

	return profile
}

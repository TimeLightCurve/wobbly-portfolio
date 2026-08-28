'use client'

import { folder, LevaPanel, useControls, useCreateStore } from 'leva'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
	createPointerAudioRig,
	disposePointerAudioRig,
	setPointerAudioMuted,
	triggerColumnSlowMotion,
	type PointerAudioRig,
	type PointerAudioSettings,
} from './PointerAudio'

export function useSceneAudio(mobilePerformance: boolean) {
	const controlStore = useCreateStore()
	const settings = useControls({
		Output: folder({
			masterVolume: { value: 0.18, min: 0, max: 0.5, step: 0.005, label: 'Master volume' },
			backgroundNoiseLevel: { value: 0.04, min: 0, max: 0.15, step: 0.0025, label: 'Low static + spikes' },
		}, { collapsed: true }),
		Trigger: folder({
			centerThreshold: { value: 0.6, min: 0.4, max: 0.98, step: 0.01, label: 'Center threshold' },
			centerRearm: { value: 0.56, min: 0.1, max: 0.9, step: 0.01, label: 'Re-arm distance' },
			triggerCooldown: { value: 0.76, min: 0.05, max: 1, step: 0.01, label: 'Trigger cooldown' },
			pointerVelocityThreshold: { value: 0.12, min: 0, max: 1, step: 0.01, label: 'Pointer threshold' },
			pointerVelocityScale: { value: 0.79, min: 0.01, max: 1, step: 0.01, label: 'Pointer velocity' },
			scrollVelocityThreshold: { value: 0.07, min: 0.01, max: 1, step: 0.01, label: 'Scroll contrast' },
			scrollVelocityScale: { value: 39, min: 1, max: 60, step: 1, label: 'Scroll velocity' },
		}, { collapsed: true }),
		Envelope: folder({
			baseDuration: { value: 1.87, min: 0.05, max: 2, step: 0.01, label: 'Base duration' },
			centerDurationStretch: { value: 1.93, min: 0, max: 3, step: 0.01, label: 'Center stretch' },
			velocityDurationStretch: { value: 2.75, min: 0, max: 3, step: 0.01, label: 'Velocity stretch' },
			attack: { value: 0.17, min: 0.001, max: 0.2, step: 0.001, label: 'Attack' },
		}, { collapsed: true }),
		Tone: folder({
			basePitch: { value: 62, min: 24, max: 120, step: 1, label: 'Base pitch' },
			pitchSweep: { value: 19, min: 0, max: 48, step: 1, label: 'Velocity pitch sweep' },
			baseCutoff: { value: 150, min: 40, max: 4000, step: 10, label: 'Base cutoff' },
			centerCutoffStretch: { value: 9500, min: 0, max: 12000, step: 50, label: 'Center filter stretch' },
			velocityCutoffStretch: { value: 7700, min: 0, max: 12000, step: 50, label: 'Velocity filter stretch' },
			baseResonance: { value: 2.8, min: 0, max: 25, step: 0.1, label: 'Base resonance' },
			resonanceStretch: { value: 21.9, min: 0, max: 28, step: 0.1, label: 'Resonance stretch' },
			distortion: { value: 132, min: 0, max: 150, step: 1, label: 'Distortion' },
		}, { collapsed: true }),
		Mix: folder({
			acidLevel: { value: 0.08, min: 0, max: 0.6, step: 0.005, label: 'Hover acid' },
			noiseLevel: { value: 0.16, min: 0, max: 0.6, step: 0.005, label: 'Noise level' },
			proximityCurve: { value: 3, min: 0.4, max: 4, step: 0.05, label: 'Center curve' },
			stereoWidth: { value: 0.65, min: 0, max: 1, step: 0.01, label: 'Stereo width' },
		}, { collapsed: true }),
		Randomness: folder({
			randomness: { value: 0.71, min: 0, max: 1, step: 0.01, label: 'Variation amount' },
			pitchRandomness: { value: 4, min: 0, max: 24, step: 1, label: 'Pitch variation' },
			durationRandomness: { value: 0.61, min: 0, max: 0.75, step: 0.01, label: 'Duration variation' },
			filterRandomness: { value: 0.25, min: 0, max: 1.5, step: 0.01, label: 'Filter variation' },
			timbreRandomness: { value: 0.55, min: 0, max: 1, step: 0.01, label: 'Timbre variation' },
		}, { collapsed: true }),
		'Low acid': folder({
			slowMotionCooldown: { value: 1.5, min: 0.2, max: 3, step: 0.05, label: 'Cooldown' },
			slowMotionDuration: { value: 5.45, min: 0.5, max: 6, step: 0.05, label: 'Duration' },
			slowMotionVelocityStretch: { value: 2.55, min: 0, max: 4, step: 0.05, label: 'Velocity stretch' },
			slowMotionPitch: { value: 51, min: 18, max: 90, step: 1, label: 'Low pitch' },
			slowMotionPitchDrop: { value: 17, min: 0, max: 36, step: 1, label: 'Pitch drop' },
			slowMotionCutoff: { value: 170, min: 35, max: 800, step: 5, label: 'Low cutoff' },
			slowMotionCutoffStretch: { value: 900, min: 0, max: 3000, step: 25, label: 'Velocity cutoff' },
			slowMotionResonance: { value: 13.2, min: 0.1, max: 18, step: 0.1, label: 'Resonance' },
			slowMotionRumbleLevel: { value: 0.43, min: 0, max: 0.7, step: 0.005, label: 'Acid body' },
			slowMotionNoiseLevel: { value: 0.34, min: 0, max: 0.5, step: 0.005, label: 'Acid texture' },
			slowMotionImpactLevel: { value: 0, min: 0, max: 0.7, step: 0.005, label: 'Impact level' },
			slowMotionOutput: { value: 1.5, min: 0.25, max: 2, step: 0.05, label: 'Output boost' },
		}, { collapsed: true }),
	}, { store: controlStore }) as PointerAudioSettings
	const rigRef = useRef<PointerAudioRig | null>(null)
	const mobilePerformanceRef = useRef(mobilePerformance)
	const enabledRef = useRef(false)
	const [enabled, setEnabled] = useState(false)

	useEffect(() => {
		mobilePerformanceRef.current = mobilePerformance
	}, [mobilePerformance])

	const enable = useCallback(() => {
		try {
			const currentRig = rigRef.current
			const rig = currentRig && currentRig.context.state !== 'closed'
				? currentRig
				: createPointerAudioRig(mobilePerformanceRef.current)
			rigRef.current = rig
			void rig.context.resume()
			setPointerAudioMuted(rig, false)
			enabledRef.current = true
			setEnabled(true)
		} catch {
			// Web Audio can be unavailable or blocked by browser/device policy.
		}
	}, [])

	const disable = useCallback(() => {
		if (rigRef.current) setPointerAudioMuted(rigRef.current, true)
		enabledRef.current = false
		setEnabled(false)
	}, [])

	const toggle = useCallback(() => {
		if (enabledRef.current) disable()
		else enable()
	}, [disable, enable])

	const handleColumnMotion = useCallback((velocity: number, direction: number) => {
		const rig = rigRef.current
		if (!rig || !enabledRef.current || mobilePerformance) return
		triggerColumnSlowMotion(rig, settings, velocity, direction)
	}, [mobilePerformance, settings])

	useEffect(() => {
		const enableFromFirstGesture = (event: PointerEvent | KeyboardEvent) => {
			const target = event.target
			if (target instanceof Element && target.closest('[data-audio-toggle]')) return
			enable()
		}

		window.addEventListener('pointerdown', enableFromFirstGesture, { capture: true, once: true })
		window.addEventListener('keydown', enableFromFirstGesture, { capture: true, once: true })

		return () => {
			window.removeEventListener('pointerdown', enableFromFirstGesture, true)
			window.removeEventListener('keydown', enableFromFirstGesture, true)
			if (rigRef.current) {
				disposePointerAudioRig(rigRef.current)
				rigRef.current = null
			}
		}
	}, [enable])

	return { controlStore, settings, rigRef, enabled, toggle, handleColumnMotion }
}

export function SceneAudioPanel({
	store,
	enabled,
	onToggle,
}: {
	store: ReturnType<typeof useCreateStore>
	enabled: boolean
	onToggle: () => void
}) {
	return (
		<>
			<aside dir="ltr" className="absolute top-4 right-4 z-40 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg">
				<LevaPanel
					store={store}
					fill
					titleBar={{ title: 'Low Acid & Static Lab', drag: false, filter: false }}
					hideCopyButton
					hidden={false}
				/>
			</aside>
			<button
				type="button"
				data-audio-toggle
				dir="ltr"
				aria-pressed={enabled}
				aria-label={enabled ? 'Mute interactive sound' : 'Enable interactive sound'}
				onClick={onToggle}
				className="absolute right-5 bottom-5 z-30 flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-4 py-2 text-xs tracking-[0.18em] text-white/70 uppercase backdrop-blur-md transition-colors hover:border-white/40 hover:text-white"
			>
				<span className={`h-1.5 w-1.5 rounded-full transition-colors ${enabled ? 'bg-fuchsia-300' : 'bg-white/30'}`} />
				{enabled ? 'Sound on' : 'Enable sound'}
			</button>
		</>
	)
}

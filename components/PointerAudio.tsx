'use client'

import { useFrame } from '@react-three/fiber'
import type { MutableRefObject } from 'react'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

type SlowMotionGestureOwner = 'touch' | 'wheel'

type ActiveSlowMotionVoice = {
	owner: SlowMotionGestureOwner
	sub: OscillatorNode
	body: OscillatorNode
	texture: AudioBufferSourceNode
	textureFilter: BiquadFilterNode
	rumbleEnvelope: GainNode
	textureEnvelope: GainNode
	panner: StereoPannerNode
	output: GainNode
	lastSweepTime: number
	sweepEndTime: number
	panOffset: number
	basePitch: number
	glideRatio: number
	phraseDuration: number
	filterBase: number
	filterPeakVariation: number
	filterPeakPosition: number
	pitchGlidePosition: number
	resonance: number
	textureRate: number
	textureRateEndScale: number
	attack: number
	stopped: boolean
}

export type PointerAudioRig = {
	context: AudioContext
	master: GainNode
	noiseBuffer: AudioBuffer
	slowMotionBuffer: AudioBuffer
	televisionStaticGain: GainNode
	televisionStaticLfoDepth: GainNode
	mobilePerformance: boolean
	activeSources: Set<AudioScheduledSourceNode>
	lastTriggerTime: number
	lastSlowMotionTime: number
	activeSlowMotionVoice: ActiveSlowMotionVoice | null
	muted: boolean
}

export type PointerAudioSettings = {
	masterVolume: number
	backgroundNoiseLevel: number
	centerThreshold: number
	centerRearm: number
	triggerCooldown: number
	pointerVelocityThreshold: number
	pointerVelocityScale: number
	scrollVelocityThreshold: number
	scrollVelocityScale: number
	baseDuration: number
	centerDurationStretch: number
	velocityDurationStretch: number
	basePitch: number
	pitchSweep: number
	baseCutoff: number
	centerCutoffStretch: number
	velocityCutoffStretch: number
	baseResonance: number
	resonanceStretch: number
	acidLevel: number
	noiseLevel: number
	distortion: number
	attack: number
	proximityCurve: number
	stereoWidth: number
	randomness: number
	pitchRandomness: number
	durationRandomness: number
	filterRandomness: number
	timbreRandomness: number
	slowMotionCooldown: number
	slowMotionDuration: number
	slowMotionVelocityStretch: number
	slowMotionPitch: number
	slowMotionPitchDrop: number
	slowMotionCutoff: number
	slowMotionCutoffStretch: number
	slowMotionResonance: number
	slowMotionRumbleLevel: number
	slowMotionNoiseLevel: number
	slowMotionImpactLevel: number
	slowMotionOutput: number
}

type GestureSource = 'pointer' | 'scroll'

type GestureVoice = {
	proximity: number
	velocity: number
	direction: number
	pan: number
	source: GestureSource
}

function createDistortionCurve(amount: number) {
	const sampleCount = 2048
	const curve = new Float32Array(sampleCount)

	for (let index = 0; index < sampleCount; index += 1) {
		const value = index * 2 / (sampleCount - 1) - 1
		curve[index] = ((3 + amount) * value * 20 * Math.PI / 180) /
			(Math.PI + amount * Math.abs(value))
	}

	return curve
}

function createGestureNoise(context: AudioContext, duration: number) {
	const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate)
	const samples = buffer.getChannelData(0)
	let brown = 0

	for (let index = 0; index < samples.length; index += 1) {
		const white = Math.random() * 2 - 1
		brown = (brown + white * 0.025) / 1.025
		samples[index] = white * 0.68 + brown * 2.4
	}

	return buffer
}

function createSlowMotionRumble(context: AudioContext, duration: number) {
	const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate)
	const samples = buffer.getChannelData(0)
	let brown = 0
	let deepRumble = 0

	for (let index = 0; index < samples.length; index += 1) {
		const white = Math.random() * 2 - 1
		brown = brown * 0.985 + white * 0.015
		deepRumble = deepRumble * 0.998 + brown * 0.002
		samples[index] = THREE.MathUtils.clamp(brown * 3.2 + deepRumble * 7.5, -1, 1)
	}

	return buffer
}

function createTelevisionStatic(context: AudioContext, duration: number) {
	const buffer = context.createBuffer(2, context.sampleRate * duration, context.sampleRate)

	for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
		const samples = buffer.getChannelData(channel)
		let brown = 0
		let murmur = 0
		let spike = 0
		let spikePhase = 0
		let spikeFrequency = 90
		for (let index = 0; index < samples.length; index += 1) {
			const white = Math.random() * 2 - 1
			brown = brown * 0.994 + white * 0.006
			murmur = murmur * 0.965 + white * 0.035
			if (Math.random() < 0.000055) {
				spike = 0.6 + Math.random() * 0.4
				spikeFrequency = 55 + Math.random() * 170
			}
			spikePhase += Math.PI * 2 * spikeFrequency / context.sampleRate
			spike *= 0.9986
			const ringingSpike = Math.sin(spikePhase) * spike
			samples[index] = THREE.MathUtils.clamp(
				brown * 4.4 + murmur * 0.8 + ringingSpike,
				-1,
				1,
			)
		}
	}

	return buffer
}

export function createPointerAudioRig(mobilePerformance = false): PointerAudioRig {
	const context = new AudioContext()
	const master = context.createGain()
	const compressor = context.createDynamicsCompressor()

	master.gain.value = 0
	compressor.threshold.value = -12
	compressor.knee.value = 10
	compressor.ratio.value = 3
	compressor.attack.value = 0.008
	compressor.release.value = 0.12
	master.connect(compressor).connect(context.destination)

	const noiseDuration = mobilePerformance ? 1 : 10
	const televisionStatic = context.createBufferSource()
	const televisionStaticHighpass = context.createBiquadFilter()
	const televisionStaticLowpass = context.createBiquadFilter()
	const televisionStaticGain = context.createGain()
	const televisionStaticLfo = context.createOscillator()
	const televisionStaticLfoDepth = context.createGain()
	const activeSources = new Set<AudioScheduledSourceNode>()

	televisionStatic.buffer = createTelevisionStatic(context, mobilePerformance ? 1 : 4)
	televisionStatic.loop = true
	televisionStaticHighpass.type = 'highpass'
	televisionStaticHighpass.frequency.value = 28
	televisionStaticHighpass.Q.value = 0.35
	televisionStaticLowpass.type = 'lowpass'
	televisionStaticLowpass.frequency.value = 980
	televisionStaticLowpass.Q.value = 3.2
	televisionStaticGain.gain.value = 0.055
	televisionStaticLfo.type = 'sine'
	televisionStaticLfo.frequency.value = 0.085
	televisionStaticLfoDepth.gain.value = 0.014
	televisionStaticLfo.connect(televisionStaticLfoDepth).connect(televisionStaticGain.gain)
	televisionStatic
		.connect(televisionStaticHighpass)
		.connect(televisionStaticLowpass)
		.connect(televisionStaticGain)
		.connect(master)
	televisionStatic.start()
	televisionStaticLfo.start()
	activeSources.add(televisionStatic)
	activeSources.add(televisionStaticLfo)

	return {
		context,
		master,
		noiseBuffer: createGestureNoise(context, noiseDuration),
		slowMotionBuffer: createSlowMotionRumble(context, noiseDuration),
		televisionStaticGain,
		televisionStaticLfoDepth,
		mobilePerformance,
		activeSources,
		lastTriggerTime: Number.NEGATIVE_INFINITY,
		lastSlowMotionTime: Number.NEGATIVE_INFINITY,
		activeSlowMotionVoice: null,
		muted: true,
	}
}

export function setPointerAudioMuted(rig: PointerAudioRig, muted: boolean) {
	rig.muted = muted
	const now = rig.context.currentTime
	rig.master.gain.cancelScheduledValues(now)
	rig.master.gain.setValueAtTime(rig.master.gain.value, now)
	rig.master.gain.linearRampToValueAtTime(muted ? 0 : 0.18, now + (muted ? 0.12 : 0.35))
}

export function disposePointerAudioRig(rig: PointerAudioRig) {
	setPointerAudioMuted(rig, true)
	for (const source of rig.activeSources) {
		try {
			source.stop()
		} catch {
			// The source may already have ended.
		}
	}
	rig.activeSources.clear()
	void rig.context.close()
}

function triggerGestureVoice(
	rig: PointerAudioRig,
	gesture: GestureVoice,
	settings: PointerAudioSettings,
) {
	const now = rig.context.currentTime
	if (now - rig.lastTriggerTime < settings.triggerCooldown) return
	rig.lastTriggerTime = now

	const proximity = Math.pow(THREE.MathUtils.clamp(gesture.proximity, 0, 1), settings.proximityCurve)
	const velocity = THREE.MathUtils.clamp(gesture.velocity, 0, 1)
	const randomness = THREE.MathUtils.clamp(settings.randomness, 0, 1)
	const randomSigned = () => Math.random() * 2 - 1
	const musicalIntervals = [-12, -7, -5, -3, 0, 3, 5, 7, 12]
	const availableIntervals = musicalIntervals.filter((interval) => Math.abs(interval) <= settings.pitchRandomness)
	const durationVariation = 1 + randomSigned() * settings.durationRandomness * randomness
	const pitchVariation = Math.random() < randomness && availableIntervals.length > 0
		? availableIntervals[Math.floor(Math.random() * availableIntervals.length)]
		: 0
	const filterVariation = Math.pow(2, randomSigned() * settings.filterRandomness * randomness)
	const timbreVariation = THREE.MathUtils.clamp(settings.timbreRandomness * randomness, 0, 1)
	const amplitudeVariation = 1 + randomSigned() * 0.18 * randomness
	const sweepDirection = Math.random() < randomness * 0.24 ? -gesture.direction : gesture.direction
	const intensity = THREE.MathUtils.clamp((0.28 + proximity * 0.46 + velocity * 0.34) * amplitudeVariation, 0.08, 1.15)
	const duration = THREE.MathUtils.clamp(
		(settings.baseDuration + proximity * settings.centerDurationStretch + velocity * settings.velocityDurationStretch) * durationVariation,
		0.08,
		8.5,
	)
	const attack = Math.min(settings.attack, duration * 0.2)
	const frequency = THREE.MathUtils.clamp(
		settings.basePitch * (1 + proximity * 0.22) * Math.pow(2, pitchVariation / 12),
		24,
		620,
	)
	const bendSemitones = settings.pitchSweep * (0.2 + velocity * 0.8)
	const bendRatio = Math.pow(2, bendSemitones / 12)
	const targetFrequency = THREE.MathUtils.clamp(
		sweepDirection >= 0 ? frequency * bendRatio : frequency / bendRatio,
		20,
		1400,
	)
	const maximumFilterFrequency = Math.min(18000, rig.context.sampleRate * 0.45)
	const filterPeak = THREE.MathUtils.clamp(
		(settings.baseCutoff + proximity * settings.centerCutoffStretch + velocity * settings.velocityCutoffStretch) * filterVariation,
		60,
		maximumFilterFrequency,
	)
	const resonance = THREE.MathUtils.clamp(
		(settings.baseResonance + (proximity * 0.7 + velocity * 0.3) * settings.resonanceStretch) * (1 + randomSigned() * 0.16 * randomness),
		0.1,
		28,
	)
	const filterPeakTime = duration * THREE.MathUtils.lerp(0.07, 0.3, Math.random() * timbreVariation)
	const oscillatorBRatios = [1, 1.5, 2, 3] as const
	const oscillatorBRatio = Math.random() < timbreVariation * 0.48
		? oscillatorBRatios[Math.floor(Math.random() * oscillatorBRatios.length)]
		: 2
	const oscillatorATypes: OscillatorType[] = ['sawtooth', 'sawtooth', 'triangle']
	const oscillatorBTypes: OscillatorType[] = ['square', 'square', 'sawtooth', 'triangle']
	const startTime = now + 0.006
	const endTime = startTime + duration

	const oscillatorA = rig.context.createOscillator()
	const oscillatorB = rig.context.createOscillator()
	const oscillatorBLevel = rig.context.createGain()
	const oscillatorMix = rig.context.createGain()
	const acidFilter = rig.context.createBiquadFilter()
	const distortion = rig.context.createWaveShaper()
	const acidEnvelope = rig.context.createGain()
	const noise = rig.context.createBufferSource()
	const noiseFilter = rig.context.createBiquadFilter()
	const noiseEnvelope = rig.context.createGain()
	const panner = rig.context.createStereoPanner()

	oscillatorA.type = Math.random() < timbreVariation
		? oscillatorATypes[Math.floor(Math.random() * oscillatorATypes.length)]
		: 'sawtooth'
	oscillatorB.type = Math.random() < timbreVariation
		? oscillatorBTypes[Math.floor(Math.random() * oscillatorBTypes.length)]
		: 'square'
	oscillatorB.detune.value = (gesture.source === 'scroll' ? 11 : 7) + randomSigned() * 34 * timbreVariation
	oscillatorBLevel.gain.value = THREE.MathUtils.clamp(0.24 + velocity * 0.18 + randomSigned() * 0.1 * timbreVariation, 0.08, 0.5)
	oscillatorMix.gain.value = 0.34 * (1 + randomSigned() * 0.14 * randomness)

	for (const [oscillator, multiplier] of [[oscillatorA, 1], [oscillatorB, oscillatorBRatio]] as const) {
		oscillator.frequency.setValueAtTime(frequency * multiplier, startTime)
		oscillator.frequency.exponentialRampToValueAtTime(targetFrequency * multiplier, startTime + duration * 0.42)
		oscillator.frequency.exponentialRampToValueAtTime(
			Math.max(frequency * multiplier * 0.86, 20),
			endTime,
		)
	}

	acidFilter.type = 'lowpass'
	acidFilter.Q.value = resonance
	acidFilter.frequency.setValueAtTime(Math.max(settings.baseCutoff * 0.7, 40), startTime)
	acidFilter.frequency.exponentialRampToValueAtTime(filterPeak, startTime + Math.max(attack * 1.2, filterPeakTime))
	acidFilter.frequency.exponentialRampToValueAtTime(Math.max(settings.baseCutoff * 0.55, 35), endTime)
	distortion.curve = createDistortionCurve(settings.distortion * (0.65 + velocity * 0.55) * (1 + randomSigned() * 0.24 * randomness))
	distortion.oversample = rig.mobilePerformance ? 'none' : '4x'
	acidEnvelope.gain.setValueAtTime(0.0001, startTime)
	acidEnvelope.gain.exponentialRampToValueAtTime(Math.max(settings.acidLevel * intensity, 0.0001), startTime + attack)
	acidEnvelope.gain.setTargetAtTime(
		Math.max(settings.acidLevel * intensity * 0.42, 0.0001),
		startTime + attack,
		Math.max(duration * 0.18, 0.02),
	)
	acidEnvelope.gain.exponentialRampToValueAtTime(0.0001, endTime)

	noise.buffer = rig.noiseBuffer
	noise.loop = true
	noise.playbackRate.value = THREE.MathUtils.clamp(
		(0.72 + velocity * 1.45) * (1 + randomSigned() * 0.42 * randomness),
		0.25,
		3.5,
	)
	noiseFilter.type = Math.random() < timbreVariation * 0.22 ? 'highpass' : 'bandpass'
	noiseFilter.Q.value = Math.max(0.7, resonance * 0.52)
	noiseFilter.frequency.setValueAtTime(Math.max(settings.baseCutoff * 1.2, 80), startTime)
	noiseFilter.frequency.exponentialRampToValueAtTime(
		THREE.MathUtils.clamp(filterPeak * (sweepDirection >= 0 ? 1.1 : 0.62), 80, maximumFilterFrequency),
		startTime + filterPeakTime * THREE.MathUtils.lerp(0.7, 1.35, Math.random() * randomness),
	)
	noiseFilter.frequency.exponentialRampToValueAtTime(Math.max(settings.baseCutoff * 0.9, 60), endTime)
	noiseEnvelope.gain.setValueAtTime(0.0001, startTime)
	noiseEnvelope.gain.exponentialRampToValueAtTime(
		Math.max(settings.noiseLevel * intensity * (0.42 + velocity * 0.58), 0.0001),
		startTime + Math.max(attack * 0.7, 0.003),
	)
	noiseEnvelope.gain.exponentialRampToValueAtTime(0.0001, endTime)
	panner.pan.value = THREE.MathUtils.clamp(
		(gesture.pan + randomSigned() * 0.24 * randomness) * settings.stereoWidth,
		-1,
		1,
	)

	oscillatorA.connect(oscillatorMix)
	oscillatorB.connect(oscillatorBLevel).connect(oscillatorMix)
	oscillatorMix.connect(acidFilter).connect(distortion).connect(acidEnvelope).connect(panner)
	noise.connect(noiseFilter).connect(noiseEnvelope).connect(panner)
	panner.connect(rig.master)

	const sources: AudioScheduledSourceNode[] = [oscillatorA, oscillatorB, noise]
	for (const source of sources) {
		rig.activeSources.add(source)
		source.addEventListener('ended', () => rig.activeSources.delete(source), { once: true })
	}

	oscillatorA.addEventListener('ended', () => {
		for (const node of [oscillatorA, oscillatorB, oscillatorBLevel, oscillatorMix, acidFilter, distortion, acidEnvelope, noise, noiseFilter, noiseEnvelope, panner]) {
			node.disconnect()
		}
	}, { once: true })

	const noiseOffset = Math.random() * Math.max(rig.noiseBuffer.duration - duration, 0)
	oscillatorA.start(startTime)
	oscillatorB.start(startTime)
	noise.start(startTime, noiseOffset)
	oscillatorA.stop(endTime + 0.02)
	oscillatorB.stop(endTime + 0.02)
	noise.stop(endTime + 0.02)
}

type MotionGesture = {
	velocity: number
	direction: number
	pan: number
}

function updateHeldSlowMotionVoice(
	rig: PointerAudioRig,
	gesture: MotionGesture,
	settings: PointerAudioSettings,
) {
	const voice = rig.activeSlowMotionVoice
	if (!voice || voice.stopped) return

	const now = rig.context.currentTime
	const velocity = THREE.MathUtils.clamp(gesture.velocity, 0, 1)
	const motionStrength = Math.pow(velocity, 0.68)
	const filterPeak = 430 + motionStrength * 360 + voice.filterPeakVariation
	const rumblePeak = Math.max(settings.slowMotionRumbleLevel * (0.12 + motionStrength * 0.07), 0.0001)
	const texturePeak = Math.max(settings.slowMotionNoiseLevel * (0.07 + motionStrength * 0.055), 0.0001)

	if (now - voice.lastSweepTime >= voice.phraseDuration * 0.72) {
		voice.lastSweepTime = now
		const phraseEnd = now + voice.phraseDuration
		voice.sweepEndTime = phraseEnd
		const filterPeakTime = now + voice.phraseDuration * voice.filterPeakPosition
		const pitchGlideTime = now + voice.phraseDuration * voice.pitchGlidePosition

		for (const [oscillator, start, end] of [
			[voice.sub, voice.basePitch, voice.basePitch * voice.glideRatio],
			[voice.body, voice.basePitch * 1.005, voice.basePitch * voice.glideRatio * 1.012],
		] as const) {
			oscillator.frequency.cancelScheduledValues(now)
			oscillator.frequency.setValueAtTime(start, now)
			oscillator.frequency.exponentialRampToValueAtTime(end, pitchGlideTime)
			oscillator.frequency.exponentialRampToValueAtTime(Math.max(voice.basePitch * 0.86, 24), phraseEnd)
		}

		voice.texture.playbackRate.cancelScheduledValues(now)
		voice.texture.playbackRate.setValueAtTime(voice.textureRate, now)
		voice.texture.playbackRate.exponentialRampToValueAtTime(Math.max(voice.textureRate * voice.textureRateEndScale, 0.18), phraseEnd)
		voice.textureFilter.frequency.cancelScheduledValues(now)
		voice.textureFilter.frequency.setValueAtTime(voice.filterBase, now)
		voice.textureFilter.frequency.exponentialRampToValueAtTime(filterPeak, filterPeakTime)
		voice.textureFilter.frequency.exponentialRampToValueAtTime(Math.max(voice.filterBase * 0.78, 90), phraseEnd)
		voice.textureFilter.Q.setTargetAtTime(voice.resonance, now, 0.055)

		voice.rumbleEnvelope.gain.cancelAndHoldAtTime(now)
		voice.rumbleEnvelope.gain.linearRampToValueAtTime(rumblePeak, now + voice.attack)
		voice.rumbleEnvelope.gain.exponentialRampToValueAtTime(Math.max(rumblePeak * 0.26, 0.0001), phraseEnd)
		voice.textureEnvelope.gain.cancelAndHoldAtTime(now)
		voice.textureEnvelope.gain.linearRampToValueAtTime(texturePeak, now + voice.attack * 1.3)
		voice.textureEnvelope.gain.exponentialRampToValueAtTime(Math.max(texturePeak * 0.22, 0.0001), phraseEnd)
	}
	voice.panner.pan.setTargetAtTime(
		THREE.MathUtils.clamp(gesture.pan * settings.stereoWidth + voice.panOffset, -1, 1),
		now,
		0.12,
	)
	voice.output.gain.setTargetAtTime(settings.slowMotionOutput * 0.5, now, 0.06)
}

function releaseHeldSlowMotionVoice(rig: PointerAudioRig, owner: SlowMotionGestureOwner) {
	const voice = rig.activeSlowMotionVoice
	if (!voice || voice.owner !== owner || voice.stopped) return

	voice.stopped = true
	rig.activeSlowMotionVoice = null
	const now = rig.context.currentTime
	const releaseEnd = Math.max(now + 0.8, voice.sweepEndTime + 0.65)

	voice.rumbleEnvelope.gain.cancelAndHoldAtTime(now)
	voice.rumbleEnvelope.gain.linearRampToValueAtTime(Math.max(voice.rumbleEnvelope.gain.value, 0.0001), voice.sweepEndTime)
	voice.rumbleEnvelope.gain.exponentialRampToValueAtTime(0.0001, releaseEnd)
	voice.textureEnvelope.gain.exponentialRampToValueAtTime(0.0001, releaseEnd)

	for (const source of [voice.sub, voice.body, voice.texture]) {
		try {
			source.stop(releaseEnd + 0.02)
		} catch {
			// The source may already have ended.
		}
	}
}

function beginHeldSlowMotionVoice(
	rig: PointerAudioRig,
	owner: SlowMotionGestureOwner,
	gesture: MotionGesture,
	settings: PointerAudioSettings,
) {
	if (rig.context.state === 'closed' || rig.muted) return
	if (rig.context.state === 'suspended') void rig.context.resume()

	const currentVoice = rig.activeSlowMotionVoice
	if (currentVoice && !currentVoice.stopped) {
		if (currentVoice.owner === owner) updateHeldSlowMotionVoice(rig, gesture, settings)
		return
	}

	const now = rig.context.currentTime
	const startTime = now + 0.004
	const sub = rig.context.createOscillator()
	const body = rig.context.createOscillator()
	const texture = rig.context.createBufferSource()
	const subLevel = rig.context.createGain()
	const bodyLevel = rig.context.createGain()
	const textureHighpass = rig.context.createBiquadFilter()
	const textureFilter = rig.context.createBiquadFilter()
	const rumbleEnvelope = rig.context.createGain()
	const textureEnvelope = rig.context.createGain()
	const panner = rig.context.createStereoPanner()
	const output = rig.context.createGain()

	sub.type = 'sawtooth'
	sub.frequency.value = 42
	subLevel.gain.value = 0.14
	body.type = 'triangle'
	body.frequency.value = 42.2
	body.detune.value = (Math.random() * 2 - 1) * 7
	bodyLevel.gain.value = 0.075
	texture.buffer = rig.noiseBuffer
	texture.loop = true
	texture.playbackRate.value = 0.45
	textureHighpass.type = 'highpass'
	textureHighpass.frequency.value = 36
	textureFilter.type = 'lowpass'
	textureFilter.frequency.value = 160
	textureFilter.Q.value = 6.5
	rumbleEnvelope.gain.setValueAtTime(0.0001, now)
	textureEnvelope.gain.setValueAtTime(0.0001, now)
	panner.pan.value = THREE.MathUtils.clamp(gesture.pan * settings.stereoWidth, -1, 1)
	output.gain.value = settings.slowMotionOutput * 0.5

	sub.connect(subLevel).connect(rumbleEnvelope)
	body.connect(bodyLevel).connect(rumbleEnvelope)
	rumbleEnvelope.connect(textureFilter)
	texture.connect(textureHighpass).connect(textureEnvelope).connect(textureFilter)
	textureFilter.connect(panner)
	panner.connect(output).connect(rig.master)

	const noteOffsets = [-12, -7, -5, 0, 3, 7]
	const noteOffset = noteOffsets[Math.floor(Math.random() * noteOffsets.length)]
	const voice: ActiveSlowMotionVoice = {
		owner,
		sub,
		body,
		texture,
		textureFilter,
		rumbleEnvelope,
		textureEnvelope,
		panner,
		output,
		lastSweepTime: Number.NEGATIVE_INFINITY,
		sweepEndTime: startTime,
		panOffset: (Math.random() * 2 - 1) * 0.16,
		basePitch: THREE.MathUtils.clamp(settings.slowMotionPitch * Math.pow(2, noteOffset / 12), 27, 68),
		glideRatio: gesture.direction >= 0
			? THREE.MathUtils.lerp(1.08, 1.42, Math.random())
			: THREE.MathUtils.lerp(0.68, 0.92, Math.random()),
		phraseDuration: THREE.MathUtils.lerp(2.1, 3.6, Math.random()),
		filterBase: 125 + Math.random() * 115,
		filterPeakVariation: Math.random() * 310,
		filterPeakPosition: 0.18 + Math.random() * 0.18,
		pitchGlidePosition: 0.42 + Math.random() * 0.18,
		resonance: 5.2 + Math.random() * 4.6,
		textureRate: 0.32 + Math.random() * 0.52,
		textureRateEndScale: 0.72 + Math.random() * 0.36,
		attack: 0.09 + Math.random() * 0.12,
		stopped: false,
	}
	rig.activeSlowMotionVoice = voice

	for (const source of [sub, body, texture]) {
		rig.activeSources.add(source)
		source.addEventListener('ended', () => rig.activeSources.delete(source), { once: true })
	}
	sub.addEventListener('ended', () => {
		for (const node of [sub, body, texture, subLevel, bodyLevel, textureHighpass, textureFilter, rumbleEnvelope, textureEnvelope, panner, output]) {
			node.disconnect()
		}
	}, { once: true })

	const textureOffset = Math.random() * rig.noiseBuffer.duration
	sub.start(startTime)
	body.start(startTime)
	texture.start(startTime, textureOffset)
	updateHeldSlowMotionVoice(rig, gesture, settings)
}

function triggerSlowMotionVoice(
	rig: PointerAudioRig,
	gesture: MotionGesture,
	settings: PointerAudioSettings,
) {
	const now = rig.context.currentTime
	const velocity = THREE.MathUtils.clamp(gesture.velocity, 0, 1)
	const effectiveCooldown = THREE.MathUtils.lerp(0.14, settings.slowMotionCooldown, velocity)
	if (now - rig.lastSlowMotionTime < effectiveCooldown) return
	rig.lastSlowMotionTime = now

	const variation = THREE.MathUtils.clamp(settings.randomness * 0.32, 0, 0.35)
	const randomSigned = () => Math.random() * 2 - 1
	const motionStrength = Math.pow(velocity, 1.65)
	const minimumDuration = Math.max(settings.slowMotionDuration * 0.08, 0.14)
	const maximumDuration = settings.slowMotionDuration + settings.slowMotionVelocityStretch
	const duration = THREE.MathUtils.clamp(
		THREE.MathUtils.lerp(minimumDuration, maximumDuration, motionStrength) * (1 + randomSigned() * variation * 0.08),
		0.14,
		7.5,
	)
	const startTime = now + 0.006
	const endTime = startTime + duration
	const slowPoint = startTime + duration * THREE.MathUtils.lerp(0.38, 0.62, motionStrength)
	const startPitch = THREE.MathUtils.clamp(
		settings.slowMotionPitch * (1 + velocity * 0.24) * (1 + randomSigned() * variation * 0.35),
		18,
		100,
	)
	const effectivePitchDrop = settings.slowMotionPitchDrop * THREE.MathUtils.lerp(0.12, 1, motionStrength)
	const pitchDrop = Math.pow(2, -effectivePitchDrop / 12)
	const endPitch = Math.max(startPitch * pitchDrop, 16)
	const filterPeak = THREE.MathUtils.clamp(
		(settings.slowMotionCutoff + velocity * settings.slowMotionCutoffStretch) * (1 + randomSigned() * variation),
		45,
		2600,
	)
	const attack = Math.min(0.12 + (1 - velocity) * 0.14, duration * 0.2)

	const sub = rig.context.createOscillator()
	const body = rig.context.createOscillator()
	const impact = rig.mobilePerformance ? null : rig.context.createOscillator()
	const fmModulator = rig.mobilePerformance ? null : rig.context.createOscillator()
	const fmDepth = rig.mobilePerformance ? null : rig.context.createGain()
	const subLevel = rig.context.createGain()
	const bodyLevel = rig.context.createGain()
	const impactEnvelope = rig.mobilePerformance ? null : rig.context.createGain()
	const bodyDrive = rig.mobilePerformance ? null : rig.context.createWaveShaper()
	const rumbleFilter = rig.context.createBiquadFilter()
	const rumbleEnvelope = rig.context.createGain()
	const noise = rig.context.createBufferSource()
	const noiseHighpass = rig.context.createBiquadFilter()
	const noiseFilter = rig.context.createBiquadFilter()
	const noiseEnvelope = rig.context.createGain()
	const panner = rig.context.createStereoPanner()
	const slowMotionOutput = rig.context.createGain()

	sub.type = 'sine'
	sub.frequency.setValueAtTime(startPitch * 0.9, startTime)
	sub.frequency.exponentialRampToValueAtTime(Math.max(endPitch * 0.76, 18), slowPoint)
	sub.frequency.exponentialRampToValueAtTime(startPitch * 0.86, endTime)
	subLevel.gain.value = 0.34

	body.type = 'triangle'
	body.detune.value = randomSigned() * 7
	body.frequency.setValueAtTime(startPitch * 2.2, startTime)
	body.frequency.exponentialRampToValueAtTime(Math.max(endPitch * 1.55, 44), slowPoint)
	body.frequency.exponentialRampToValueAtTime(startPitch * 2.05, endTime)
	bodyLevel.gain.value = 0.2 + velocity * 0.03
	if (bodyDrive) {
		bodyDrive.curve = createDistortionCurve(18 + velocity * 28)
		bodyDrive.oversample = '4x'
	}

	if (fmModulator && fmDepth) {
		fmModulator.type = 'sine'
		fmModulator.frequency.setValueAtTime(24 + velocity * 20, startTime)
		fmModulator.frequency.exponentialRampToValueAtTime(THREE.MathUtils.lerp(13, 3.2, motionStrength), slowPoint)
		fmModulator.frequency.exponentialRampToValueAtTime(20 + velocity * 16, endTime)
		fmDepth.gain.setValueAtTime(12 + velocity * 22, startTime)
		fmDepth.gain.exponentialRampToValueAtTime(5 + motionStrength * 12, slowPoint)
		fmDepth.gain.exponentialRampToValueAtTime(9 + velocity * 16, endTime)
	}

	if (impact && impactEnvelope) {
		impact.type = 'sine'
		impact.frequency.setValueAtTime(105 + velocity * 115, startTime)
		impact.frequency.exponentialRampToValueAtTime(28, startTime + Math.min(duration * 0.34, 1.25))
		impactEnvelope.gain.setValueAtTime(0.0001, startTime)
		impactEnvelope.gain.exponentialRampToValueAtTime(
			Math.max(settings.slowMotionImpactLevel * (0.7 + velocity * 0.3), 0.0001),
			startTime + 0.012,
		)
		impactEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.min(duration * 0.42, 1.5))
	}

	rumbleFilter.type = 'lowpass'
	rumbleFilter.Q.value = 0.7 + settings.slowMotionResonance * 0.04
	rumbleFilter.frequency.setValueAtTime(filterPeak, startTime)
	rumbleFilter.frequency.exponentialRampToValueAtTime(
		Math.max(settings.slowMotionCutoff * THREE.MathUtils.lerp(1, 0.7, motionStrength), 95),
		slowPoint,
	)
	rumbleFilter.frequency.exponentialRampToValueAtTime(filterPeak * 0.88, endTime)
	rumbleEnvelope.gain.setValueAtTime(0.0001, startTime)
	rumbleEnvelope.gain.exponentialRampToValueAtTime(
		Math.max(settings.slowMotionRumbleLevel * (0.62 + velocity * 0.38), 0.0001),
		startTime + attack,
	)
	rumbleEnvelope.gain.setTargetAtTime(
		Math.max(settings.slowMotionRumbleLevel * 0.48, 0.0001),
		startTime + attack,
		duration * 0.3,
	)
	rumbleEnvelope.gain.exponentialRampToValueAtTime(0.0001, endTime)

	noise.buffer = rig.slowMotionBuffer
	noise.loop = true
	noise.playbackRate.setValueAtTime(0.74 + velocity * 0.08, startTime)
	noise.playbackRate.exponentialRampToValueAtTime(THREE.MathUtils.lerp(0.48, 0.14, motionStrength), slowPoint)
	noise.playbackRate.exponentialRampToValueAtTime(0.82 + velocity * 0.05, endTime)
	noiseHighpass.type = 'highpass'
	noiseHighpass.frequency.value = 38
	noiseFilter.type = 'lowpass'
	noiseFilter.Q.value = 0.8
	noiseFilter.frequency.setValueAtTime(THREE.MathUtils.clamp(filterPeak * 0.75, 360, 900), startTime)
	noiseFilter.frequency.exponentialRampToValueAtTime(
		THREE.MathUtils.lerp(300, 140, motionStrength),
		slowPoint,
	)
	noiseFilter.frequency.exponentialRampToValueAtTime(THREE.MathUtils.clamp(filterPeak * 0.58, 300, 760), endTime)
	noiseEnvelope.gain.setValueAtTime(0.0001, startTime)
	noiseEnvelope.gain.exponentialRampToValueAtTime(
		Math.max(settings.slowMotionNoiseLevel * (0.55 + velocity * 0.45), 0.0001),
		startTime + attack * 1.35,
	)
	noiseEnvelope.gain.setTargetAtTime(
		Math.max(settings.slowMotionNoiseLevel * 0.35, 0.0001),
		startTime + duration * 0.28,
		duration * 0.22,
	)
	noiseEnvelope.gain.exponentialRampToValueAtTime(0.0001, endTime)

	panner.pan.value = THREE.MathUtils.clamp(
		gesture.pan * settings.stereoWidth + gesture.direction * 0.08,
		-1,
		1,
	)
	slowMotionOutput.gain.value = settings.slowMotionOutput

	sub.connect(subLevel).connect(rumbleFilter)
	if (bodyDrive) {
		body.connect(bodyLevel).connect(bodyDrive).connect(rumbleFilter)
	} else {
		body.connect(bodyLevel).connect(rumbleFilter)
	}
	if (fmModulator && fmDepth) fmModulator.connect(fmDepth).connect(body.frequency)
	rumbleFilter.connect(rumbleEnvelope).connect(panner)
	if (impact && impactEnvelope) impact.connect(impactEnvelope).connect(panner)
	noise.connect(noiseHighpass).connect(noiseFilter).connect(noiseEnvelope).connect(panner)
	panner.connect(slowMotionOutput).connect(rig.master)

	const sources: AudioScheduledSourceNode[] = [sub, body, noise]
	if (impact) sources.push(impact)
	if (fmModulator) sources.push(fmModulator)
	for (const source of sources) {
		rig.activeSources.add(source)
		source.addEventListener('ended', () => rig.activeSources.delete(source), { once: true })
	}

	sub.addEventListener('ended', () => {
		const nodes: AudioNode[] = [sub, body, subLevel, bodyLevel, rumbleFilter, rumbleEnvelope, noise, noiseHighpass, noiseFilter, noiseEnvelope, panner, slowMotionOutput]
		if (impact) nodes.push(impact)
		if (fmModulator) nodes.push(fmModulator)
		if (fmDepth) nodes.push(fmDepth)
		if (impactEnvelope) nodes.push(impactEnvelope)
		if (bodyDrive) nodes.push(bodyDrive)
		for (const node of nodes) {
			node.disconnect()
		}
	}, { once: true })

	const noiseOffset = Math.random() * rig.slowMotionBuffer.duration
	sub.start(startTime)
	body.start(startTime)
	impact?.start(startTime)
	fmModulator?.start(startTime)
	noise.start(startTime, noiseOffset)
	impact?.stop(startTime + Math.min(duration * 0.44, 1.55))
	sub.stop(endTime + 0.02)
	body.stop(endTime + 0.02)
	fmModulator?.stop(endTime + 0.02)
	noise.stop(endTime + 0.02)
}

export function triggerColumnSlowMotion(
	rig: PointerAudioRig,
	settings: PointerAudioSettings,
	velocity: number,
	direction: number,
) {
	if (rig.context.state === 'closed') return
	if (rig.context.state === 'suspended') void rig.context.resume()
	triggerSlowMotionVoice(rig, {
		velocity,
		direction,
		pan: direction * 0.22,
	}, settings)
}

export function PointerAudioModulator({
	rigRef,
	settings,
	enabled,
}: {
	rigRef: MutableRefObject<PointerAudioRig | null>
	settings: PointerAudioSettings
	enabled: boolean
}) {
	const previousPointer = useRef(new THREE.Vector2())
	const currentPointer = useRef(new THREE.Vector2())
	const previousProximity = useRef(0)
	const hasPointerSample = useRef(false)
	const pointerArmed = useRef(false)
	const pointerCapture = useRef(false)
	const capturedProximity = useRef(0)
	const capturedVelocity = useRef(0)
	const capturedDirection = useRef(1)
	const wheelStrength = useRef(0)
	const wheelDirection = useRef(-1)
	const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const activeTouchId = useRef<number | null>(null)
	const previousTouchX = useRef(0)
	const previousTouchY = useRef(0)
	const previousTouchTime = useRef(0)

	useEffect(() => {
		const cleanupRig = rigRef.current
		const canStartSlowMotion = () => {
			const rig = rigRef.current
			return rig && rig.context.state !== 'closed' && !rig.muted ? rig : null
		}
		const isControlTarget = (target: EventTarget | null) =>
			target instanceof Element && Boolean(target.closest('aside, [data-audio-toggle]'))

		const handleWheel = (event: WheelEvent) => {
			if (isControlTarget(event.target)) return
			const rig = canStartSlowMotion()
			if (!rig) return
			const unitMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
				? 16
				: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
					? window.innerHeight
					: 1
			const pixelDelta = Math.abs(event.deltaY) * unitMultiplier
			const impulseStrength = 1 - Math.exp(-pixelDelta * settings.scrollVelocityScale / 1400)
			wheelStrength.current = Math.max(impulseStrength, wheelStrength.current * 0.72)
			wheelDirection.current = event.deltaY >= 0 ? -1 : 1
			const strength = Math.pow(wheelStrength.current, 1 + settings.scrollVelocityThreshold * 1.5)
			const gesture = {
				velocity: strength,
				direction: wheelDirection.current,
				pan: 0,
			}

			if (rig.activeSlowMotionVoice?.owner === 'wheel') {
				updateHeldSlowMotionVoice(rig, gesture, settings)
			} else {
				beginHeldSlowMotionVoice(rig, 'wheel', gesture, settings)
			}

			if (wheelTimer.current) clearTimeout(wheelTimer.current)
			wheelTimer.current = setTimeout(() => {
				wheelStrength.current = 0
				wheelTimer.current = null
				releaseHeldSlowMotionVoice(rig, 'wheel')
			}, 320)
		}

		const handleTouchStart = (event: TouchEvent) => {
			if (activeTouchId.current !== null || isControlTarget(event.target)) return
			const touch = event.changedTouches[0]
			if (!touch) return

			activeTouchId.current = touch.identifier
			previousTouchX.current = touch.clientX
			previousTouchY.current = touch.clientY
			previousTouchTime.current = event.timeStamp
			const rig = canStartSlowMotion()
			if (!rig) return
			beginHeldSlowMotionVoice(rig, 'touch', {
				velocity: 0.12,
				direction: -1,
				pan: THREE.MathUtils.clamp(touch.clientX / window.innerWidth * 2 - 1, -1, 1),
			}, settings)
		}

		const handleTouchMove = (event: TouchEvent) => {
			if (activeTouchId.current === null) return
			const touch = Array.from(event.touches).find(({ identifier }) => identifier === activeTouchId.current)
			if (!touch) return

			const elapsed = Math.max(event.timeStamp - previousTouchTime.current, 1)
			const deltaX = touch.clientX - previousTouchX.current
			const deltaY = touch.clientY - previousTouchY.current
			const pixelsPerMillisecond = Math.hypot(deltaX, deltaY) / elapsed
			const velocity = 1 - Math.exp(-pixelsPerMillisecond * settings.scrollVelocityScale / 55)
			const dominantDelta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX
			const rig = canStartSlowMotion()
			if (rig) {
				updateHeldSlowMotionVoice(rig, {
					velocity,
					direction: dominantDelta >= 0 ? -1 : 1,
					pan: THREE.MathUtils.clamp(touch.clientX / window.innerWidth * 2 - 1, -1, 1),
				}, settings)
			}

			previousTouchX.current = touch.clientX
			previousTouchY.current = touch.clientY
			previousTouchTime.current = event.timeStamp
		}

		const handleTouchEnd = (event: TouchEvent) => {
			if (activeTouchId.current === null) return
			const ended = Array.from(event.changedTouches).some(({ identifier }) => identifier === activeTouchId.current)
			if (!ended) return

			activeTouchId.current = null
			const rig = rigRef.current
			if (rig) releaseHeldSlowMotionVoice(rig, 'touch')
		}

		window.addEventListener('wheel', handleWheel, { passive: true })
		window.addEventListener('touchstart', handleTouchStart, { passive: true })
		window.addEventListener('touchmove', handleTouchMove, { passive: true })
		window.addEventListener('touchend', handleTouchEnd, { passive: true })
		window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
		return () => {
			window.removeEventListener('wheel', handleWheel)
			window.removeEventListener('touchstart', handleTouchStart)
			window.removeEventListener('touchmove', handleTouchMove)
			window.removeEventListener('touchend', handleTouchEnd)
			window.removeEventListener('touchcancel', handleTouchEnd)
			if (wheelTimer.current) clearTimeout(wheelTimer.current)
			if (cleanupRig) {
				releaseHeldSlowMotionVoice(cleanupRig, 'wheel')
				releaseHeldSlowMotionVoice(cleanupRig, 'touch')
			}
		}
	}, [enabled, rigRef, settings])

	useEffect(() => {
		const rig = rigRef.current
		if (!rig || rig.context.state === 'closed') return
		const now = rig.context.currentTime
		rig.master.gain.setTargetAtTime(enabled ? settings.masterVolume : 0, now, 0.035)
		rig.televisionStaticGain.gain.setTargetAtTime(settings.backgroundNoiseLevel, now, 0.08)
		rig.televisionStaticLfoDepth.gain.setTargetAtTime(settings.backgroundNoiseLevel * 0.3, now, 0.12)
	}, [enabled, rigRef, settings.backgroundNoiseLevel, settings.masterVolume])

	useFrame((state, delta) => {
		const pointerX = THREE.MathUtils.clamp(state.pointer.x, -1, 1)
		const pointerY = THREE.MathUtils.clamp(state.pointer.y, -1, 1)
		currentPointer.current.set(pointerX, pointerY)
		if (!enabled) {
			pointerCapture.current = false
			hasPointerSample.current = false
			previousPointer.current.copy(currentPointer.current)
			return
		}
		const frameDuration = Math.max(delta, 1 / 240)
		const distance = Math.hypot(pointerX, pointerY)
		const proximity = 1 - THREE.MathUtils.clamp(distance / Math.SQRT2, 0, 1)
		const rawPointerVelocity = hasPointerSample.current
			? currentPointer.current.distanceTo(previousPointer.current) / frameDuration
			: 0
		const pointerVelocity = 1 - Math.exp(-rawPointerVelocity * settings.pointerVelocityScale)
		const inwardMotion = proximity - previousProximity.current
		const rearmThreshold = Math.min(settings.centerRearm, settings.centerThreshold - 0.03)
		if (proximity <= rearmThreshold) {
			pointerArmed.current = true
			pointerCapture.current = false
		}
		const rig = rigRef.current
		if (rig && rig.context.state === 'running') {
			if (pointerArmed.current && proximity >= settings.centerThreshold && inwardMotion > 0) {
				pointerArmed.current = false
				pointerCapture.current = true
				capturedProximity.current = proximity
				capturedVelocity.current = pointerVelocity
				capturedDirection.current = pointerY <= previousPointer.current.y ? 1 : -1
			}

			if (pointerCapture.current) {
				capturedProximity.current = Math.max(capturedProximity.current, proximity)
				if (pointerVelocity > capturedVelocity.current) {
					capturedVelocity.current = pointerVelocity
					capturedDirection.current = pointerY <= previousPointer.current.y ? 1 : -1
				}

				if (inwardMotion <= 0 || proximity >= 0.985) {
					if (capturedVelocity.current >= settings.pointerVelocityThreshold) {
						triggerGestureVoice(rig, {
							proximity: capturedProximity.current,
							velocity: capturedVelocity.current,
							direction: capturedDirection.current,
							pan: pointerX,
							source: 'pointer',
						}, settings)
					}
					pointerCapture.current = false
				}
			}
		}

		previousPointer.current.copy(currentPointer.current)
		previousProximity.current = proximity
		hasPointerSample.current = true
	})

	return null
}

'use client'

import ReactLenis, { LenisRef } from "lenis/react"
import { cancelFrame, frame } from "motion/react"
import { ReactNode, useEffect, useRef } from "react"

export default function LenisWrapper({children}:{children: ReactNode}) {

	const lenisRef = useRef<LenisRef>(null)

	useEffect(() => {
		function update(data: { timestamp: number }) {
			const time = data.timestamp
			lenisRef.current?.lenis?.raf(time)
		}

		frame.update(update, true)

		return () => cancelFrame(update)
	}, [])

  return (
	  <ReactLenis root options={{  autoRaf: false, syncTouch: true, touchMultiplier: 1. }} ref={lenisRef} >
		{children}
	  </ReactLenis>

  )
}

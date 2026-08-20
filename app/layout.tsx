import type { Metadata } from "next"
import { Geist, Geist_Mono, Poppins } from "next/font/google"
import localFont from 'next/font/local'
import "./globals.css"
import LenisWrapper from "@/components/lenis/LenisWrapper"


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

const poppins = Poppins({ subsets: ['latin'], weight: '400' })

const nian = localFont({
  src: [
    {
      path: '../public/fonts/nian/Nian ExtraLight.ttf',
      weight: '200',
      style: 'normal',
    },
    {
      path: '../public/fonts/nian/Nian Light.ttf',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../public/fonts/nian/Nian.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/nian/Nian Thin.ttf',
      weight: '100',
      style: 'normal',
    },
    {
      path: '../public/fonts/nian/Nian SemiBold.ttf',
      weight: '600',
      style: 'normal',
    },

    {
      path: '../public/fonts/nian/Nian Bold.ttf',
      weight: '700',
      style: 'normal',
    },

    {
      path: '../public/fonts/nian/Nian Black.ttf',
      weight: '800',
      style: 'normal',
    },
  ],
  variable: '--font-nian-source',
})


export const metadata: Metadata = {
  title: "Wobira | AI, Software & SaaS Studio",
  description: "Wobira is the portfolio studio of Amirhosein Tahmasb and Shayan, building enterprise AI solutions, digital products, SaaS platforms, fintech, and blockchain software.",
  applicationName: "Wobira",
  keywords: [
    "Wobira",
    "AI solutions",
    "enterprise software",
    "digital products",
    "SaaS development",
    "fintech",
    "blockchain software",
  ],
  openGraph: {
    title: "Wobira | AI, Software & SaaS Studio",
    description: "Enterprise AI solutions, digital products, SaaS, fintech, and blockchain software by Amirhosein Tahmasb and Shayan.",
    siteName: "Wobira",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wobira | AI, Software & SaaS Studio",
    description: "Enterprise AI solutions, digital products, SaaS, fintech, and blockchain software.",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className="w-full ">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${poppins.className} ${nian.variable} antialiased font-nian`}
      >
        <LenisWrapper >
            {children}
        </LenisWrapper>
      </body>
    </html>
  )
}

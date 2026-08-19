export type Project = {
  title: string
  blurb: string
  tags: string[]
  tech: string[]
  previewUrl: string
  metrics: {
    volume: string
    transactions: string
  }
}

export const projects: Project[] = [
  {
    title: 'SocialOrder',
    blurb: 'Hybrid escrow and payments with milestones, installments, and crypto checkout.',
    tags: ['Payments', 'Wallets'],
    tech: ['Solidity', 'Next.js', 'Stripe', 'Ethers.js'],
    previewUrl: 'https://prd.socialorder.io/',
    metrics: { volume: '$2.1M', transactions: '15K+' },
  },
  {
    title: 'InfraFund',
    blurb: 'Tokenized crowdfunding for net-zero projects with fiat and crypto rails.',
    tags: ['ITO', 'Compliance'],
    tech: ['Solidity', 'Next.js', 'Postgres', 'Cloudflare'],
    previewUrl: 'https://infrafund.net/',
    metrics: { volume: '$8.5M', transactions: '2K+' },
  },
  {
    title: 'SarrafEx',
    blurb: 'Mobile crypto exchange with spot trading, rewards, KYC, and notifications.',
    tags: ['Wallets', 'Mobile'],
    tech: ['Flutter', 'Node', 'Go', 'Postgres'],
    previewUrl: 'https://app.sarrafex.com/',
    metrics: { volume: '$15.2M', transactions: '45K+' },
  },
  {
    title: 'Titan Chain',
    blurb:
      'EVM-compatible L1 initiative with low fees, wallet connectivity, and developer tooling.',
    tags: ['Blockchain', 'R&D'],
    tech: ['Go', 'Cosmos SDK', 'Solidity', 'Foundry'],
    previewUrl: 'https://titanlab.io/',
    metrics: { volume: 'N/A', transactions: '1M+' },
  },
]

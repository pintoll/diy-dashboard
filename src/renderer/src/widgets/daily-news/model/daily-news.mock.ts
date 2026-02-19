import type { NewsItem } from "./daily-news.types";

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export const MOCK_NEWS_ITEMS: NewsItem[] = [
  {
    id: "mock-1",
    title: "React Server Components Now Stable in Next.js 15",
    summary:
      "The latest Next.js release marks RSC as production-ready, with streaming improvements and a new caching strategy that reduces TTFB by up to 40%.",
    url: "https://nextjs.org/blog/next-15",
    source: "Vercel Blog",
    category: "tech",
    publishedAt: hoursAgo(2),
    relevanceScore: 95,
  },
  {
    id: "mock-2",
    title: "Bun 1.2 Ships with Native S3 Support and SQL Client",
    summary:
      "Bun continues its push toward being a full-stack runtime. The new release includes a built-in S3 client and a unified SQL interface that works across PostgreSQL, MySQL, and SQLite.",
    url: "https://bun.sh/blog/bun-v1.2",
    source: "Bun Blog",
    category: "tech",
    publishedAt: hoursAgo(4),
    relevanceScore: 90,
  },
  {
    id: "mock-3",
    title: "TypeScript 5.8 Introduces Isolated Declarations by Default",
    summary:
      "Microsoft enables isolated declarations in strict mode by default, significantly speeding up type-checking in monorepos and improving editor responsiveness.",
    url: "https://devblogs.microsoft.com/typescript",
    source: "Microsoft DevBlogs",
    category: "tech",
    publishedAt: hoursAgo(6),
    relevanceScore: 85,
  },
  {
    id: "mock-4",
    title: "Fed Signals Potential Rate Cut in March Meeting",
    summary:
      "Federal Reserve minutes reveal growing consensus for a 25 basis point cut, citing cooling inflation data and moderating labor market conditions.",
    url: "https://reuters.com/markets/fed-rate-decision",
    source: "Reuters",
    category: "finance",
    publishedAt: hoursAgo(3),
    relevanceScore: 88,
  },
  {
    id: "mock-5",
    title: "NVIDIA Surpasses $4T Market Cap on AI Demand",
    summary:
      "Driven by insatiable demand for AI training hardware, NVIDIA becomes the second company to reach a $4 trillion valuation. Data center revenue grew 180% year-over-year.",
    url: "https://bloomberg.com/nvidia-market-cap",
    source: "Bloomberg",
    category: "finance",
    publishedAt: hoursAgo(5),
    relevanceScore: 82,
  },
  {
    id: "mock-6",
    title: "The Science of Deep Work: New Research on Flow States",
    summary:
      "A Stanford study finds that 90-minute focused sessions with 20-minute breaks optimize cognitive performance. The key insight: environmental cues matter more than willpower.",
    url: "https://hubermanlab.com/deep-work-study",
    source: "Huberman Lab",
    category: "growth",
    publishedAt: hoursAgo(8),
    relevanceScore: 78,
  },
  {
    id: "mock-7",
    title: "Building a Second Brain: The PARA Method Gets an Update",
    summary:
      "Tiago Forte releases PARA 2.0, simplifying the original system to four folders and introducing automated capture workflows using AI summarization tools.",
    url: "https://fortelabs.com/para-2",
    source: "Forte Labs",
    category: "growth",
    publishedAt: hoursAgo(10),
    relevanceScore: 75,
  },
  {
    id: "mock-8",
    title: "EU Passes Landmark AI Regulation Framework",
    summary:
      "The European Parliament approves comprehensive AI governance rules, requiring transparency disclosures for foundation models and risk assessments for high-stakes applications.",
    url: "https://europarl.europa.eu/ai-act",
    source: "European Parliament",
    category: "world",
    publishedAt: hoursAgo(7),
    relevanceScore: 80,
  },
];

export const MOCK_FETCHED_AT = new Date().toISOString();

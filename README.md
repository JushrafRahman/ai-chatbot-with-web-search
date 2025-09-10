<h1 align="center">LLM Chatbot with Web Search functionality</h1>
<h3>Demo:</h3>

https://github.com/user-attachments/assets/7ad4d45d-efda-41f9-a132-36331e5c67b7

## Features
- Dual-mode chatbot: Normal LLM responses OR targeted web search results
- Domain-specific search: Select from dropdown options (GitHub, LinkedIn, Articles, News, etc.)
- Real-time results: Get live data from specific platforms
- Example: Select "LinkedIn" → Ask for "big tech recruiters hiring software engineers" → Receive 5-10 actual recruiter profiles

## Architecture
- User selects search category from dropdown and submits query
- Chat context passed to LLM to generate optimized search query
- Refined query sent to Exa AI API for domain-specific results
- Search results fed into LLM again which then generates final response to user
- Maintains conversational flow while providing current information

## Tech Stack
- [Exa](https://dashboard.exa.ai/playground) Exa Search
  - Find webpages using Exa’s embeddings-based or Google-style keyword search
  - Get clean, up-to-date, parsed HTML from Exa search results
  - Based on a link, find and return pages that are similar in meaning
  - Get direct answers to questions using Exa’s Answer API
- [Next.js](https://nextjs.org) App Router
- [AI SDK](https://sdk.vercel.ai/docs)
  - Unified API for generating text, structured objects, and tool calls with LLMs
  - Hooks for building dynamic chat and generative user interfaces
- Data Persistence
  - [Neon Serverless Postgres](https://vercel.com/marketplace/neon) for saving chat history and user data
  - [Vercel Blob](https://vercel.com/storage/blob) for efficient file storage
- [Auth.js](https://authjs.dev)
  - Simple and secure authentication
- [shadcn/ui](https://ui.shadcn.com)
  - Styling with [Tailwind CSS](https://tailwindcss.com)
  - Component primitives from [Radix UI](https://radix-ui.com) for accessibility and flexibility

## Running locally

Must populate the environment variables [defined in `.env.example`](.env.example) to run this chatbot.
1. Install Vercel CLI: `npm i -g vercel`
2. Link local instance with Vercel and GitHub accounts (creates `.vercel` directory): `vercel link`
3. Download your environment variables: `vercel env pull`

```bash
pnpm install
pnpm dev
```

It should now be running on [localhost:3000](http://localhost:3000).

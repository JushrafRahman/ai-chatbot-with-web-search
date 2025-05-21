import Exa from 'exa-js';
import { config } from 'dotenv';
import type { WebSearchCategory } from '@/components/search-dropdown';

config({
  path: '.env.local',
});

const exa = new Exa(process.env.EXA_API_KEY);

if (!process.env.EXA_API_KEY) {
  throw new Error('Missing EXA_API_KEY in environment variables');
}

export type WebSearchResponse = Awaited<
  ReturnType<typeof exa.searchAndContents>
>;

export const webSearch = async ({
  searchQuery,
  searchCategory,
}: {
  searchQuery: string;
  searchCategory: WebSearchCategory;
}): Promise<WebSearchResponse> => {
  try {
    return await exa.searchAndContents(searchQuery, {
      type: 'auto',
      category: searchCategory,
      // summary: true,
      text: {
        maxCharacters: 500, // 1000
      },
      numResults: 5,
    });
  } catch (error) {
    console.error('Web search with exa-ai failed: ', error);
    throw error;
  }
};

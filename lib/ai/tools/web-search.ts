import Exa from 'exa-js';
import { config } from 'dotenv';

config({
  path: '.env.local',
});

const exa = new Exa(process.env.EXA_API_KEY);

export type WebSearchResponse = {
  requestId: string;
  results: Array<{
    id: string;
    title: string;
    url: string;
    publishedDate: string | null;
    author: string;
    image?: string;
    text?: string;
    highlights?: string[];
    summary?: string;
  }>;
};

export const webSearch = async ({
  searchQuery,
  searchCategory,
}: {
  searchQuery: string;
  searchCategory: string;
}) => {
  console.log('at exa service fn, searchQuery: ', searchQuery);
  console.log('searchCategory: ', searchCategory);

  const result: WebSearchResponse = await exa.searchAndContents(searchQuery, {
    type: 'auto',
    category: searchCategory as
      | 'company'
      | 'research paper'
      | 'news'
      | 'pdf'
      | 'github'
      | 'tweet'
      | 'personal site'
      | 'linkedin profile'
      | 'financial report',
    // summary: true,
    text: {
      maxCharacters: 500, // 1000
    },
    numResults: 2,
  });

  console.log('exa search results: ');
  console.log(result);

  return result;
};

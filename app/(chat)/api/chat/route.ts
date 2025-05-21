import {
  appendClientMessage,
  appendResponseMessages,
  createDataStream,
  generateText,
  type LanguageModelV1,
  type Message,
  smoothStream,
  streamText,
} from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getStreamIdsByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import type { Chat } from '@/lib/db/schema';
import { differenceInSeconds } from 'date-fns';
import { ChatSDKError } from '@/lib/errors';
import { webSearch, type WebSearchResponse } from '@/lib/ai/tools/web-search';

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

async function generateOptimizedSearchQuery({
  messages,
  currentMessage,
  model,
  systemPrompt,
}: {
  messages: Message[];
  currentMessage: PostRequestBody['message'];
  model: LanguageModelV1;
  systemPrompt: string; // do we need more system prompt to generate a good search query?
}): Promise<string> {
  // create a focused system prompt for query generation
  const queryGenSystemPrompt = `${systemPrompt}
  
Your task is to generate an optimal search query based on the user's message and conversation history. The search query will be used to search the web i.e google for relevant information.

INSTRUCTIONS:
1. Analyze the user's current message and previous conversation context
2. Extract the key information needs and search intent
3. Formulate a clear, concise search query (3-10 words) that will yield the most relevant results
4. Return ONLY the search query text with no additional explanation or formatting
5. Focus on specific technical terms, entities, or concepts that will help find precise information
6. Avoid generic terms that would lead to broad results

Example user message: "I want to learn about Meta's latest LLM model and how to use it"
Example output: "meta llama 3 github implementation tutorial"`;

  // use last 5 messages for context
  const conversationHistory = messages.slice(-5);

  const queryGenMessage: Message = {
    id: generateUUID(),
    role: 'user',
    content: `Generate a search query for: ${currentMessage.parts?.[0]?.text ?? ''}`,
    parts: [
      {
        type: 'text',
        text: `Generate a search query for: ${currentMessage.parts?.[0]?.text ?? ''}`,
      },
    ],
  };

  // call llm to generate optimized search query
  const queryGenResponse = await generateText({
    model,
    system: queryGenSystemPrompt,
    messages: [...conversationHistory, queryGenMessage],
    temperature: 0.1, // for more focused queries
    maxTokens: 30, // short response - just the query
  });

  const searchQuery = queryGenResponse.text.trim();
  return searchQuery;
}

function formatSearchResultsForUser(
  searchResults: WebSearchResponse,
  searchQuery: string,
): string {
  if (
    !searchResults ||
    !searchResults.results ||
    searchResults.results.length === 0
  ) {
    return `## Search Results for "${searchQuery}"\n\nNo results found. Try refining your search or asking a different question.`;
  }

  const { results } = searchResults;

  // Create a formatted string with the search results
  let formattedResults = `## Search Results for "${searchQuery}"\n\n`;

  results.forEach((result, index) => {
    const { title, url, publishedDate, author, text } = result;

    // Format date if available
    const date = publishedDate
      ? new Date(publishedDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '';

    // Add formatted result
    formattedResults += `### ${index + 1}. [${title ?? ''}](${url ?? ''})\n`;
    formattedResults += date ? `Published: ${date}\n` : '';
    formattedResults += author ? `Author: ${author}\n` : '';
    formattedResults += text?.length
      ? `\n${text.slice(0, 300)}${text.length > 300 ? '...' : ''}\n\n`
      : '';
    formattedResults += `---\n\n`;
  });

  return formattedResults;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
      searchCategory,
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    const previousMessages = await getMessagesByChatId({ id });

    const messages = appendClientMessage({
      // @ts-expect-error: todo add type conversion from DBMessage[] to UIMessage[]
      messages: previousMessages,
      message,
    });

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: message.experimental_attachments ?? [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    const stream = createDataStream({
      execute: async (dataStream) => {
        const baseSystemPrompt = systemPrompt({
          selectedChatModel,
          requestHints,
        });

        const model = myProvider.languageModel(selectedChatModel);

        if (searchCategory) {
          // make web search

          try {
            dataStream.writeData('Searching for relevant information...');

            // use LLM to generate optimized search query for exa-ai
            const optimizedQuery = await generateOptimizedSearchQuery({
              messages,
              currentMessage: message,
              model,
              systemPrompt: baseSystemPrompt,
            });

            // make exa-ai search with optimized query
            const webSearchResult = await webSearch({
              searchQuery: optimizedQuery,
              searchCategory,
            });

            // format exa-ai response to feed into LLM again
            const formattedResults = formatSearchResultsForUser(
              webSearchResult,
              optimizedQuery,
            );

            // stream the search results
            // TODO: remove the llm call and directly render formatted response
            const resultsStream = streamText({
              model,
              system: baseSystemPrompt,
              messages: [
                {
                  role: 'assistant',
                  content: formattedResults,
                },
                {
                  role: 'user',
                  content: 'Show search results',
                },
              ],
              experimental_generateMessageId: generateUUID,
              onFinish: async ({ response }) => {
                if (session.user?.id) {
                  try {
                    const assistantId = getTrailingMessageId({
                      messages: response.messages.filter(
                        (message) => message.role === 'assistant',
                      ),
                    });

                    if (!assistantId) {
                      throw new Error('No assistant message found!');
                    }

                    const [, assistantMessage] = appendResponseMessages({
                      messages: [message],
                      responseMessages: response.messages,
                    });

                    await saveMessages({
                      messages: [
                        {
                          id: assistantId,
                          chatId: id,
                          role: assistantMessage.role,
                          parts: assistantMessage.parts,
                          attachments:
                            assistantMessage.experimental_attachments ?? [],
                          createdAt: new Date(),
                        },
                      ],
                    });
                  } catch (_) {
                    console.error('Failed to save chat');
                  }
                }
              },
            });

            resultsStream.consumeStream();
            resultsStream.mergeIntoDataStream(dataStream, {
              sendReasoning: false,
            });
          } catch (error) {
            console.error('Error in web search workflow:');
            console.error(error);
          }
        } else {
          const result = streamText({
            model,
            system: baseSystemPrompt,
            messages,
            maxSteps: 5,
            experimental_activeTools:
              selectedChatModel === 'chat-model-reasoning'
                ? []
                : [
                    'getWeather',
                    'createDocument',
                    'updateDocument',
                    'requestSuggestions',
                  ],
            experimental_transform: smoothStream({ chunking: 'word' }),
            experimental_generateMessageId: generateUUID,
            tools: {
              getWeather,
              createDocument: createDocument({ session, dataStream }),
              updateDocument: updateDocument({ session, dataStream }),
              requestSuggestions: requestSuggestions({
                session,
                dataStream,
              }),
            },
            onFinish: async ({ response }) => {
              if (session.user?.id) {
                try {
                  const assistantId = getTrailingMessageId({
                    messages: response.messages.filter(
                      (message) => message.role === 'assistant',
                    ),
                  });

                  if (!assistantId) {
                    throw new Error('No assistant message found!');
                  }

                  const [, assistantMessage] = appendResponseMessages({
                    messages: [message],
                    responseMessages: response.messages,
                  });

                  await saveMessages({
                    messages: [
                      {
                        id: assistantId,
                        chatId: id,
                        role: assistantMessage.role,
                        parts: assistantMessage.parts,
                        attachments:
                          assistantMessage.experimental_attachments ?? [],
                        createdAt: new Date(),
                      },
                    ],
                  });
                } catch (_) {
                  console.error('Failed to save chat');
                }
              }
            },
            experimental_telemetry: {
              isEnabled: isProductionEnvironment,
              functionId: 'stream-text',
            },
          });

          result.consumeStream();

          result.mergeIntoDataStream(dataStream, {
            sendReasoning: true,
          });
        }
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

    const streamContext = getStreamContext();

    if (streamContext) {
      return new Response(
        await streamContext.resumableStream(streamId, () => stream),
      );
    } else {
      return new Response(stream);
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
  }
}

export async function GET(request: Request) {
  const streamContext = getStreamContext();
  const resumeRequestedAt = new Date();

  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  let chat: Chat;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (chat.visibility === 'private' && chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const streamIds = await getStreamIdsByChatId({ chatId });

  if (!streamIds.length) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const emptyDataStream = createDataStream({
    execute: () => {},
  });

  const stream = await streamContext.resumableStream(
    recentStreamId,
    () => emptyDataStream,
  );

  /*
   * For when the generation is streaming during SSR
   * but the resumable stream has concluded at this point.
   */
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId });
    const mostRecentMessage = messages.at(-1);

    if (!mostRecentMessage) {
      return new Response(emptyDataStream, { status: 200 });
    }

    if (mostRecentMessage.role !== 'assistant') {
      return new Response(emptyDataStream, { status: 200 });
    }

    const messageCreatedAt = new Date(mostRecentMessage.createdAt);

    if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
      return new Response(emptyDataStream, { status: 200 });
    }

    const restoredStream = createDataStream({
      execute: (buffer) => {
        buffer.writeData({
          type: 'append-message',
          message: JSON.stringify(mostRecentMessage),
        });
      },
    });

    return new Response(restoredStream, { status: 200 });
  }

  return new Response(stream, { status: 200 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}

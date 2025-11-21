import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Tool to get weather information for a city.
 * Currently returns mock data for demonstration purposes.
 */
export const getWeatherTool = tool(
  async (input: { city: string }) => {
    const city = input.city.toLowerCase();

    if (['sf', 'san francisco'].includes(city)) {
      return "It's always sunny in San Francisco!";
    }

    if (['london', 'uk'].includes(city)) {
      return `The weather in ${input.city} is 15 degrees and rainy.`;
    }

    return `The weather in ${input.city} is 72 degrees and sunny.`;
  },
  {
    name: 'get_weather',
    description: 'Get the weather for a given city',
    schema: z.object({
      city: z.string().describe('The city to get the weather for'),
    }) as any,
  }
);

# Refactor LangGraph Service to use Prebuilt Agent

## Why

The current `LangGraphService` manually constructs a `StateGraph` for the conversation flow. While flexible, this requires more boilerplate code and maintenance.

LangGraph provides prebuilt agents (like `createReactAgent`) that simplify graph construction, standardized tool calling, and built-in best practices for agentic workflows.

Refactoring to use a prebuilt agent will:

- Simplify the codebase by removing manual graph construction logic
- Enable easier integration of new tools
- Align with LangChain/LangGraph best practices
- Provide a standard "getWeather" tool example to demonstrate tool capabilities

## What Changes

1.  **Refactor `LangGraphService`:**

    - Replace manual `StateGraph` construction with `createReactAgent` from `@langchain/langgraph/prebuilt`.
    - Update the initialization logic to create the agent with the model and tools.

2.  **Add Example Tool:**

    - Implement a `getWeather` tool using the `tool` function from `@langchain/core/tools` and `zod` schema.
    - Register this tool with the agent.

3.  **Dependencies:**
    - Ensure `@langchain/langgraph` and `@langchain/core` are up to date (already installed).

## Impact

- **Affected specs:**
  - `chat-ui` - Update implementation details for LangGraph orchestration
- **Affected code:**
  - `apps/server/src/modules/chat-ui/services/langgraph.service.ts` - Major refactor
- **Dependencies:**
  - No new packages (uses existing `@langchain/*` packages)
- **Breaking changes:**
  - None expected in the API contract, but internal implementation changes significantly.

## How It Works

The service will now initialize the agent like this:

```typescript
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// Define tool
const getWeather = tool(
  (input) => {
    if (['sf', 'san francisco'].includes(input.city.toLowerCase())) {
      return "It's always sunny in San Francisco!";
    }
    return `The weather in ${input.city} is 72 degrees and sunny.`;
  },
  {
    name: 'get_weather',
    description: 'Get the weather for a given city',
    schema: z.object({
      city: z.string().describe('The city to get the weather for'),
    }),
  }
);

// Create agent
this.agent = createReactAgent({
  llm: this.model,
  tools: [getWeather, ...otherTools],
  checkpointSaver: this.checkpointer,
});
```

The `streamConversation` method will invoke this agent instead of the manual graph.

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

/**
 * Create a LangChain tool for refining user queries using a Gemini sub-agent.
 *
 * This tool acts as a "thinking" step that:
 * 1. Takes the user's raw/ambiguous request
 * 2. Refines it into a clear, specific instruction
 * 3. Returns the refined instruction for the main agent to execute
 *
 * The main agent should use this tool FIRST, then execute based on the refined output.
 */
export function createQueryRefinementTool() {
  // Create a lightweight Gemini model for the sub-agent (fast, efficient)
  const subAgentModel = new ChatGoogleGenerativeAI({
    model: 'gemini-2.0-flash-lite',
    temperature: 0.3,
  });

  return new DynamicStructuredTool({
    name: 'refine_request',
    description: `Refine and clarify the user's request into a specific, actionable instruction.

Use this tool FIRST when:
- The user's request is vague or ambiguous (e.g., "add something for people")
- The request is complex with multiple parts
- You need to determine specific types and relationships to create
- The user describes a domain without specifying exact schema details

This tool returns a REFINED INSTRUCTION that you should then execute. Do not respond to the user until you have executed the refined instruction.

Example:
- User says: "I need to track projects"
- Call: refine_request({ userMessage: "I need to track projects", packContext: "Empty pack" })
- Tool returns: "Create a Project object type with properties: name (string, required), description (string), status (enum: planned/active/completed), startDate (date), endDate (date). Use icon 'folder-kanban' and color '#3B82F6'."
- You then: Generate the add_object_type suggestion based on this refined instruction.`,
    schema: z.object({
      userMessage: z.string().describe("The user's original message"),
      packContext: z
        .string()
        .optional()
        .describe(
          'Brief context about current pack state (existing types, etc.)'
        ),
    }) as any,
    func: async (input: any): Promise<string> => {
      const { userMessage, packContext } = input;

      const refinementPrompt = `You are a schema design expert. Your job is to take a user's request and refine it into a specific, actionable instruction for creating JSON schemas.

## Current Pack Context
${packContext || 'Empty pack - no types defined yet'}

## User's Original Request
"${userMessage}"

## Your Task
Rewrite the user's request into a clear, specific instruction that specifies EXACTLY what to create. Your refined instruction should include:

1. **Object Types**: For each type, specify:
   - The type name (PascalCase, e.g., "Project", "TeamMember")
   - Properties with their types (string, number, boolean, date, enum)
   - Which properties are required
   - A suggested icon name (use common Lucide icons like: user, users, folder, file-text, briefcase, building, calendar, clock, tag, star, heart, flag, box, package, mail, phone, globe, link, etc.)
   - A suggested color (hex format like #3B82F6)

2. **Relationship Types**: For each relationship, specify:
   - The relationship name (SCREAMING_SNAKE_CASE, e.g., "ASSIGNED_TO", "BELONGS_TO")
   - Source and target types
   - Any properties on the relationship
   - A suggested icon and color

Be specific and complete. The main agent will use your instruction to generate the actual schema suggestions.

## Output Format
Write a clear instruction paragraph (not JSON). Be specific about every detail.

Example output:
"Create the following types: 1) Project with properties: name (string, required), description (string), status (enum: draft/active/completed/archived), dueDate (date). Icon: folder-kanban, Color: #3B82F6. 2) Task with properties: title (string, required), description (string), priority (enum: low/medium/high), completed (boolean). Icon: check-square, Color: #10B981. Then create relationships: CONTAINS from Project to Task (no properties), icon: arrow-right, color: #6B7280."

Now refine the user's request:`;

      try {
        const response = await subAgentModel.invoke([
          { role: 'user', content: refinementPrompt },
        ]);

        const content =
          typeof response.content === 'string'
            ? response.content
            : Array.isArray(response.content)
            ? response.content
                .filter(
                  (c): c is { type: 'text'; text: string } => c.type === 'text'
                )
                .map((c) => c.text)
                .join('')
            : '';

        return content.trim() || userMessage;
      } catch (error) {
        // On error, return the original message so the main agent can still try
        return userMessage;
      }
    },
  });
}

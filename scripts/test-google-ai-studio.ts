#!/usr/bin/env npx tsx
/**
 * Test script for Google AI Studio provider
 *
 * This script tests the Google AI Studio provider to verify it works
 * with simple API key authentication.
 *
 * Usage:
 *   GOOGLE_API_KEY=your-key npx tsx scripts/test-google-ai-studio.ts
 *
 * Or if GOOGLE_API_KEY is already in your .env:
 *   npx tsx scripts/test-google-ai-studio.ts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../apps/server/.env') });

import { GoogleGenAI, Type } from '@google/genai';

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error('❌ GOOGLE_API_KEY not set in environment');
    console.error('');
    console.error('To get an API key:');
    console.error('1. Go to https://aistudio.google.com/apikey');
    console.error('2. Create a new API key');
    console.error('3. Set GOOGLE_API_KEY=your-key in your .env file');
    process.exit(1);
  }

  console.log('🔑 API Key found (length:', apiKey.length, ')');
  console.log('');

  // Initialize the client
  const ai = new GoogleGenAI({ apiKey });

  // Test 1: Simple text generation
  console.log('━'.repeat(60));
  console.log('TEST 1: Simple text generation');
  console.log('━'.repeat(60));

  try {
    const startTime = Date.now();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Say "Hello from Google AI Studio!" in exactly those words.',
    });
    const duration = Date.now() - startTime;

    console.log('✅ Response:', response.text);
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log('📊 Tokens:', response.usageMetadata?.totalTokenCount || 'N/A');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  }

  console.log('');

  // Test 2: Structured output with responseSchema
  console.log('━'.repeat(60));
  console.log('TEST 2: Structured output (responseSchema)');
  console.log('━'.repeat(60));

  try {
    const startTime = Date.now();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents:
        'Extract the person information from this text: "John Smith is a 35-year-old software engineer from San Francisco."',
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: 'Full name of the person' },
            age: { type: Type.NUMBER, description: 'Age of the person' },
            occupation: {
              type: Type.STRING,
              description: 'Job or profession',
            },
            location: {
              type: Type.STRING,
              description: 'City or location',
            },
          },
          required: ['name', 'age', 'occupation', 'location'],
        },
        temperature: 0.1,
      },
    });
    const duration = Date.now() - startTime;

    const parsed = JSON.parse(response.text || '{}');
    console.log('✅ Structured output:', JSON.stringify(parsed, null, 2));
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log('📊 Tokens:', response.usageMetadata?.totalTokenCount || 'N/A');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  }

  console.log('');

  // Test 3: Function calling
  console.log('━'.repeat(60));
  console.log('TEST 3: Function calling');
  console.log('━'.repeat(60));

  try {
    const startTime = Date.now();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents:
        'Extract all the entities from this text: "The Apostle John wrote this letter to the church. He mentions Jesus Christ and warns about false prophets."',
      config: {
        temperature: 0.1,
        tools: [
          {
            functionDeclarations: [
              {
                name: 'extract_entities',
                description: 'Extract named entities from text',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    entities: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: {
                            type: Type.STRING,
                            description: 'Name of the entity',
                          },
                          type: {
                            type: Type.STRING,
                            description:
                              'Type of entity (PERSON, ORGANIZATION, CONCEPT)',
                          },
                          description: {
                            type: Type.STRING,
                            description: 'Brief description',
                          },
                        },
                        required: ['name', 'type'],
                      },
                    },
                  },
                  required: ['entities'],
                },
              },
            ],
          },
        ],
      },
    });
    const duration = Date.now() - startTime;

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      console.log('✅ Function called:', functionCalls[0].name);
      console.log(
        '✅ Arguments:',
        JSON.stringify(functionCalls[0].args, null, 2)
      );
    } else {
      console.log('⚠️  No function calls in response');
      console.log('   Response text:', response.text?.substring(0, 200));
    }
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log('📊 Tokens:', response.usageMetadata?.totalTokenCount || 'N/A');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  }

  console.log('');
  console.log('━'.repeat(60));
  console.log('✅ All tests completed!');
  console.log('━'.repeat(60));
}

main().catch(console.error);

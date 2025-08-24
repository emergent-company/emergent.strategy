import 'dotenv/config';
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

export function makeEmbeddings() {
    if (!process.env.GOOGLE_API_KEY) {
        throw new Error("Missing GOOGLE_API_KEY");
    }
    return new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLE_API_KEY,
        model: "text-embedding-004" // Gemini 1.5 embeddings
    });
}

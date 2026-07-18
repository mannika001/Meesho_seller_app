import {
  GoogleGenAI,
  createUserContent,
  createModelContent,
  createPartFromFunctionResponse,
} from "@google/genai";
import { config } from "../config.js";
import { toolDeclarations, toolImpls, isKnownTool } from "./aiTools.js";

let client = null;
function getClient() {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not set — add it to backend/.env to use AI chat.");
  }
  if (!client) client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  return client;
}

const MAX_TOOL_ROUNDS = 5;

const SYSTEM_INSTRUCTION =
  "You are analyzing one Meesho seller's own order data. Use the provided tools to look up real numbers — never guess, estimate, or answer from general knowledge, even if the question sounds like something you could answer generically. Be concise and give concrete numbers. If the data doesn't contain enough information to answer, say so plainly.";

const INTENT_SYSTEM_INSTRUCTION =
  "You help a Meesho seller understand their own order data. Decide whether their message needs a lookup into their real order/customer data to answer correctly, or whether it's something you can answer directly yourself (greetings, small talk, questions about what you can help with, general definitions unrelated to their specific numbers).\n\n" +
  "If it needs their real data, respond with exactly the single word NEEDS_DATA and nothing else.\n" +
  "Otherwise, answer directly and conversationally in 1-3 sentences. Never invent numbers, statistics, or specifics about their orders/customers/revenue — any question that would require a real number or fact about their business always counts as NEEDS_DATA.";

const CONFIRM_PHRASING_INSTRUCTION =
  "You are about to run a data lookup to answer a small shop owner's question. Given their question and the planned query (JSON — internal field/tool names, not for the user), write ONE short, plain-English sentence confirming what you're about to check, in everyday language a non-technical shop owner would use. " +
  "No technical jargon, no field names, no JSON, no tool names, no row-count/limit numbers — describe the real-world thing you're about to look up. Start with \"I'll\" or \"Let me\".";

// Step 0: is this even a data question? Keeps chit-chat/help questions from
// going through the query-plan-confirm dance at all, and stops the model
// from ever answering a real-data question from guesswork instead of a tool.
async function classifyIntent(question) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    config: { systemInstruction: INTENT_SYSTEM_INSTRUCTION, thinkingConfig: { thinkingBudget: 0 } },
    contents: [createUserContent(question)],
  });
  const text = (response.text || "").trim();
  if (text.toUpperCase() === "NEEDS_DATA") return { needsData: true };
  return { needsData: false, answer: text };
}

// Turn the question into a tool call WITHOUT running it. mode:"ANY" forces
// Gemini to pick one of the declared tools instead of answering directly.
async function planToolCalls(question) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      thinkingConfig: { thinkingBudget: 0 },
      tools: [{ functionDeclarations: toolDeclarations }],
      toolConfig: { functionCallingConfig: { mode: "ANY" } },
    },
    contents: [createUserContent(question)],
  });

  const calls = response.functionCalls;
  if (!calls || calls.length === 0) {
    throw new Error(
      "Couldn't map this to a data lookup — try rephrasing it as a question about your orders or customers."
    );
  }
  return calls.map((c) => ({ tool: c.name, args: c.args || {} }));
}

// Plain-language confirmation sentence, generated per question — not a
// hand-written template per tool, so it never sounds like "orders (up to
// 5 rows)" and doesn't need a new branch every time a tool's args change.
async function describePlanNaturally(question, calls) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    config: { systemInstruction: CONFIRM_PHRASING_INSTRUCTION, thinkingConfig: { thinkingBudget: 0 } },
    contents: [createUserContent(`Question: ${question}\n\nPlanned query: ${JSON.stringify(calls)}`)],
  });
  return (response.text || "").trim();
}

// Full plan step: classify intent first; only data questions go through
// tool-call planning + confirmation-sentence generation. Chit-chat/help
// questions get answered immediately with no data step at all.
export async function planQuestion(question) {
  const intent = await classifyIntent(question);
  if (!intent.needsData) {
    return { needsData: false, answer: intent.answer };
  }
  const calls = await planToolCalls(question);
  const summary = await describePlanNaturally(question, calls);
  return { needsData: true, calls, summary };
}

// Run the confirmed plan for real, then let Gemini write the answer from the
// actual query results (fetching more via the same tools if it decides the
// confirmed plan alone isn't enough — no re-confirmation needed for those
// follow-ups, they're refinements of an already-approved question).
export async function answerWithPlan(question, plannedCalls) {
  if (!Array.isArray(plannedCalls) || plannedCalls.length === 0) {
    throw new Error("No confirmed query to run.");
  }
  const validated = plannedCalls.map(({ tool, args }) => {
    if (!isKnownTool(tool)) throw new Error(`Unknown tool: ${tool}`);
    return { tool, args: args || {} };
  });

  const ai = getClient();
  let lastToolResults = await Promise.all(
    validated.map(async ({ tool, args }) => ({ tool, result: await toolImpls[tool](args) }))
  );

  const contents = [
    createUserContent(
      `Question: ${question}\n\nData already fetched from MongoDB for the confirmed query (real, already filtered — answer using only this, and only fetch more via tools if it's genuinely insufficient):\n${JSON.stringify(
        lastToolResults
      )}`
    ),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingBudget: 0 },
        tools: [{ functionDeclarations: toolDeclarations }],
      },
      contents,
    });

    const calls = response.functionCalls;
    if (!calls || calls.length === 0) {
      return { answer: response.text, data: lastToolResults };
    }

    contents.push(createModelContent(response.candidates[0].content.parts));

    lastToolResults = await Promise.all(
      calls.map(async (call) => {
        const impl = toolImpls[call.name];
        const result = impl ? await impl(call.args) : { error: `Unknown tool: ${call.name}` };
        return { tool: call.name, result };
      })
    );

    const responseParts = lastToolResults.map(({ tool, result }, i) =>
      createPartFromFunctionResponse(calls[i].id, tool, { result })
    );
    contents.push(createUserContent(responseParts));
  }

  throw new Error("AI chat exceeded max tool-call rounds without producing an answer.");
}

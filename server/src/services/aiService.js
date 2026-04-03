const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.5-flash',
  generationConfig: { responseMimeType: 'application/json' }
});

/**
 * AI Tool Generator
 * Generates a full ToolHub-compatible JSON schema from a prompt.
 */
async function generateToolSchema(prompt) {
  const systemPrompt = `
    You are an expert at designing JSON schemas for AI tool calling (like OpenAI functions or Gemini tools).
    Given a prompt or description of a tool, generate a valid JSON object including:
    1. name: snake_case name of the tool.
    2. description: a clear, concise description.
    3. json_schema: a standard JSON schema object (types, properties, required).
    4. category: one of [research, development, communication, data, media, language, storage].
    
    Output ONLY valid JSON.
  `;

  const result = await model.generateContent([systemPrompt, prompt]);
  const response = result.response.text();
  try {
    return JSON.parse(response);
  } catch (err) {
    console.error('AI Schema Generation failed to parse:', response);
    throw new Error('AI failed to generate a valid tool schema.');
  }
}

/**
 * AI Security Auditor
 * Audits a tool's JSON schema for potential vulnerabilities.
 */
async function auditToolSchema(toolName, schema) {
  const systemPrompt = `
    You are a security auditor specialized in AI tool calling systems.
    Analyze the following tool's JSON schema for security risks:
    - Data exfiltration risks.
    - Server-side request forgery (SSRF) potential.
    - Greedy parameter consumption.
    - Lack of bounds checking.
    
    Return a JSON object with:
    1. security_score: 0-100 (100 being perfectly safe).
    2. vulnerabilities: array of strings describing risks.
    3. recommendations: array of strings for improvement.
    
    Output ONLY valid JSON.
  `;

  const content = `Tool: ${toolName}\nSchema: ${JSON.stringify(schema, null, 2)}`;
  const result = await model.generateContent([systemPrompt, content]);
  const response = result.response.text();
  try {
    return JSON.parse(response);
  } catch (err) {
    console.error('AI Security Audit failed to parse:', response);
    return { security_score: 50, vulnerabilities: ['Audit failed'], recommendations: [] };
  }
}

module.exports = { generateToolSchema, auditToolSchema };

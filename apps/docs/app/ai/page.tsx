import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { EndpointCard } from "../components/endpoint-card";
import { Callout } from "../components/callout";
import { Table } from "../components/table";

export const metadata: Metadata = {
  title: "AI — AlecRae API Docs",
  description: "AI compose, voice profile, grammar checking, translation, reply suggestions, and thread summary.",
};

export default function AIPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="AI"
        description="AI-powered email assistance: compose in your voice, grammar checking, translation, reply suggestions, and more. Powered by Claude (Anthropic)."
        badge="Features"
      />

      <Callout type="info" title="AI model selection">
        AlecRae automatically selects the optimal AI model based on task complexity and your plan tier.
        Free plans use Haiku 4.5, Pro plans get Sonnet 4.6, and Enterprise plans access Opus 4.6.
        All AI calls have fallback behavior if the primary model is unavailable.
      </Callout>

      <div className="my-6">
        <Table
          headers={["Plan", "Model", "AI calls / day", "Features"]}
          rows={[
            ["Free", "Haiku 4.5", "5 composes", "Basic compose, grammar"],
            ["Personal", "Haiku 4.5", "Unlimited", "Full AI suite"],
            ["Pro", "Sonnet 4.6", "Unlimited", "Priority AI, voice profile"],
            ["Enterprise", "Opus 4.6", "Unlimited", "All features, custom training"],
          ]}
        />
      </div>

      <section className="space-y-4 mt-8">
        <h2 className="text-2xl font-bold text-white mb-4">Voice Profile</h2>

        <EndpointCard
          method="POST"
          path="/v1/voice/analyze"
          description="Build a voice profile by analyzing your sent emails. The AI learns your writing style, tone, vocabulary, and patterns. Run this once and the profile is used for all subsequent AI compose and draft operations."
          scopes={["messages:read"]}
          parameters={[
            { name: "sampleSize", type: "integer", required: false, description: "Number of sent emails to analyze (default 50, max 200)" },
          ]}
          requestBody={`{
  "sampleSize": 100
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/voice/analyze \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "sampleSize": 100 }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/voice/analyze", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ sampleSize: 100 }),
});

const { data } = await response.json();
console.log("Voice profile built:", data.profileId);`}
          pythonExample={`response = requests.post(
    "https://api.alecrae.com/v1/voice/analyze",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={"sampleSize": 100},
)

profile = response.json()["data"]
print(f"Voice profile built: {profile['profileId']}")`}
          responseExample={`{
  "data": {
    "profileId": "vp_01HX...",
    "samplesAnalyzed": 100,
    "traits": {
      "formality": 0.7,
      "verbosity": 0.4,
      "emotionalTone": "warm-professional",
      "averageSentenceLength": 12,
      "commonPhrases": ["looking forward to", "happy to help", "let me know"]
    },
    "createdAt": "2026-04-09T12:00:00.000Z"
  }
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/voice/profile"
          description="Retrieve your current voice profile data, including detected traits and writing patterns."
          scopes={["messages:read"]}
          curlExample={`curl "https://api.alecrae.com/v1/voice/profile" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/voice/profile", {
  headers: { "Authorization": "Bearer " + process.env.ALECRAE_API_KEY },
});

const { data } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/voice/profile",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
)

profile = response.json()["data"]`}
          responseExample={`{
  "data": {
    "profileId": "vp_01HX...",
    "traits": {
      "formality": 0.7,
      "verbosity": 0.4,
      "emotionalTone": "warm-professional"
    },
    "lastUpdated": "2026-04-09T12:00:00.000Z"
  }
}`}
        />

        <h2 className="text-2xl font-bold text-white mb-4 mt-10">Compose and Draft</h2>

        <EndpointCard
          method="POST"
          path="/v1/voice/draft"
          description="Generate a complete email draft in your writing voice. Provide instructions describing what you want to say, and the AI composes the email matching your style. Optionally include context from a thread you are replying to."
          scopes={["messages:send"]}
          parameters={[
            { name: "instructions", type: "string", required: true, description: "What you want the email to say" },
            { name: "tone", type: "string", required: false, description: "Override tone: professional, casual, friendly, formal, urgent, empathetic, assertive" },
            { name: "length", type: "string", required: false, description: "Target length: brief, moderate, detailed" },
            { name: "recipientName", type: "string", required: false, description: "Recipient name for personalization" },
            { name: "subject", type: "string", required: false, description: "Suggested subject line" },
            { name: "replyTo", type: "object", required: false, description: "Original message context for replies (from, subject, body)" },
          ]}
          requestBody={`{
  "instructions": "Decline the meeting invitation politely. Suggest next week instead.",
  "tone": "professional",
  "length": "brief",
  "recipientName": "Alice",
  "replyTo": {
    "from": "alice@example.com",
    "subject": "Meeting tomorrow?",
    "body": "Can we meet tomorrow at 2pm to discuss the project?"
  }
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/voice/draft \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "instructions": "Decline the meeting politely. Suggest next week instead.",
    "tone": "professional",
    "recipientName": "Alice",
    "replyTo": {
      "from": "alice@example.com",
      "subject": "Meeting tomorrow?",
      "body": "Can we meet tomorrow at 2pm?"
    }
  }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/voice/draft", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    instructions: "Decline the meeting politely. Suggest next week instead.",
    tone: "professional",
    recipientName: "Alice",
    replyTo: {
      from: "alice@example.com",
      subject: "Meeting tomorrow?",
      body: "Can we meet tomorrow at 2pm?",
    },
  }),
});

const { data } = await response.json();
console.log(data.subject, data.body);`}
          pythonExample={`response = requests.post(
    "https://api.alecrae.com/v1/voice/draft",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "instructions": "Decline the meeting politely. Suggest next week instead.",
        "tone": "professional",
        "recipientName": "Alice",
        "replyTo": {
            "from": "alice@example.com",
            "subject": "Meeting tomorrow?",
            "body": "Can we meet tomorrow at 2pm?",
        },
    },
)

draft = response.json()["data"]
print(draft["subject"])
print(draft["body"])`}
          responseExample={`{
  "data": {
    "subject": "Re: Meeting tomorrow?",
    "body": "Hi Alice,\\n\\nThanks for suggesting a meeting. Unfortunately, tomorrow doesn't work for me — I have a few conflicts in the afternoon.\\n\\nWould any time next week work for you? I'm flexible Monday through Wednesday.\\n\\nBest,\\n[Your name]",
    "tone": "professional"
  }
}`}
        />

        <EndpointCard
          method="POST"
          path="/v1/voice/adjust"
          description="Adjust the tone of existing email text. Rewrites the content to match the specified tone while preserving the original meaning."
          scopes={["messages:send"]}
          parameters={[
            { name: "body", type: "string", required: true, description: "The email text to adjust" },
            { name: "tone", type: "string", required: true, description: "Target tone: professional, casual, friendly, formal, urgent, empathetic, assertive" },
          ]}
          requestBody={`{
  "body": "I need this done by Friday. No excuses.",
  "tone": "empathetic"
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/voice/adjust \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "body": "I need this done by Friday. No excuses.",
    "tone": "empathetic"
  }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/voice/adjust", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    body: "I need this done by Friday. No excuses.",
    tone: "empathetic",
  }),
});

const { data } = await response.json();`}
          pythonExample={`response = requests.post(
    "https://api.alecrae.com/v1/voice/adjust",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "body": "I need this done by Friday. No excuses.",
        "tone": "empathetic",
    },
)

adjusted = response.json()["data"]`}
          responseExample={`{
  "data": {
    "body": "I understand things are busy, but this deliverable is important for the team. Could we aim to have it wrapped up by Friday? Let me know if there's anything blocking you — happy to help.",
    "originalTone": "assertive",
    "adjustedTone": "empathetic"
  }
}`}
        />

        <h2 className="text-2xl font-bold text-white mb-4 mt-10">Grammar</h2>

        <EndpointCard
          method="POST"
          path="/v1/grammar/check"
          description="Check text for grammar, spelling, punctuation, and style issues. Returns suggestions with explanations. Replaces Grammarly for email composition."
          scopes={["messages:send"]}
          parameters={[
            { name: "text", type: "string", required: true, description: "Text to check" },
            { name: "language", type: "string", required: false, description: "Language code (default: auto-detect)" },
          ]}
          requestBody={`{
  "text": "Their going to the meeting tommorrow and they dont have the report ready.",
  "language": "en"
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/grammar/check \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "text": "Their going to the meeting tommorrow.", "language": "en" }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/grammar/check", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    text: "Their going to the meeting tommorrow.",
    language: "en",
  }),
});

const { data } = await response.json();`}
          pythonExample={`response = requests.post(
    "https://api.alecrae.com/v1/grammar/check",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={"text": "Their going to the meeting tommorrow.", "language": "en"},
)

suggestions = response.json()["data"]["suggestions"]`}
          responseExample={`{
  "data": {
    "correctedText": "They're going to the meeting tomorrow.",
    "suggestions": [
      {
        "original": "Their",
        "replacement": "They're",
        "offset": 0,
        "length": 5,
        "type": "grammar",
        "explanation": "'Their' is possessive. Use 'They're' (they are) here."
      },
      {
        "original": "tommorrow",
        "replacement": "tomorrow",
        "offset": 27,
        "length": 9,
        "type": "spelling",
        "explanation": "Misspelling of 'tomorrow'."
      }
    ],
    "language": "en",
    "issueCount": 2
  }
}`}
        />

        <h2 className="text-2xl font-bold text-white mb-4 mt-10">Translation</h2>

        <EndpointCard
          method="POST"
          path="/v1/translate"
          description="Translate email text between 35+ languages. Context-aware translation that understands email conventions, greetings, and formality levels."
          scopes={["messages:send"]}
          parameters={[
            { name: "text", type: "string", required: true, description: "Text to translate" },
            { name: "targetLanguage", type: "string", required: true, description: "Target language code (e.g., es, fr, de, ja, zh)" },
            { name: "sourceLanguage", type: "string", required: false, description: "Source language (auto-detected if omitted)" },
            { name: "formality", type: "string", required: false, description: "Formality level: formal, informal, auto" },
          ]}
          requestBody={`{
  "text": "Thank you for your prompt response. I look forward to our meeting next week.",
  "targetLanguage": "es",
  "formality": "formal"
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/translate \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Thank you for your prompt response.",
    "targetLanguage": "es",
    "formality": "formal"
  }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/translate", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    text: "Thank you for your prompt response.",
    targetLanguage: "es",
    formality: "formal",
  }),
});

const { data } = await response.json();`}
          pythonExample={`response = requests.post(
    "https://api.alecrae.com/v1/translate",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "text": "Thank you for your prompt response.",
        "targetLanguage": "es",
        "formality": "formal",
    },
)

translation = response.json()["data"]`}
          responseExample={`{
  "data": {
    "translatedText": "Gracias por su pronta respuesta. Espero con interés nuestra reunión la próxima semana.",
    "sourceLanguage": "en",
    "targetLanguage": "es",
    "formality": "formal",
    "confidence": 0.96
  }
}`}
        />
      </section>
    </div>
  );
}

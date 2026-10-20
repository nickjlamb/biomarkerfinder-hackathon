const functions = require("firebase-functions/v1");
const { defineSecret } = require("firebase-functions/params");
const axios = require("axios");
const OpenAI = require("openai");

// Secrets live in Google Secret Manager (set with: firebase functions:secrets:set NAME)
const OPENAI_KEY = defineSecret("OPENAI_KEY");
const ELEVENLABS_KEY = defineSecret("ELEVENLABS_KEY");

// Runtime limits: cap concurrent instances so a flood can't scale the bill
const RUNTIME = { secrets: [OPENAI_KEY, ELEVENLABS_KEY], maxInstances: 3, timeoutSeconds: 60, memory: "256MB" };

// Only these sites may call the functions
const ALLOWED_ORIGINS = [
  "https://pharmatools.ai",
  "https://www.pharmatools.ai",
  "https://biomarker-matchmaker.web.app",
  "https://biomarker-matchmaker.firebaseapp.com",
];

// The four voices offered in the UI (Rachel, Adam, Bella, Callum)
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
const ALLOWED_VOICES = new Set([
  "21m00Tcm4TlvDq8ikWAM",
  "pNInz6obpgDQGcFmaJgB",
  "EXAVITQu4vr4xnSDxMaL",
  "N2lVS1w4EtoT3dr4eOWO",
]);

const MAX_DISEASE_CHARS = 100;
const MAX_QUESTION_CHARS = 300;

// Simple per-IP rate limit (per instance): 10 requests per minute
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;
const hits = new Map();
function rateLimited(req) {
  const ip = (req.headers["x-forwarded-for"] || req.ip || "unknown").toString().split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT;
}

// CORS allowlist + method + rate-limit gate. Returns true if the request was handled (rejected or preflight).
function gate(req, res) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).json({ error: "Forbidden" });
    return true;
  }
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return true;
  }
  if (rateLimited(req)) {
    res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
    return true;
  }
  return false;
}

// Evidence tags come from Open Targets data, not from the LLM.
// Order = priority used for the network-graph colour.
const EVIDENCE_TAGS = [
  { key: "drug_response", label: "Drug-response biomarker", test: (dt, ds) => (ds.cancer_biomarkers || 0) > 0 },
  { key: "known_drug", label: "Clinical drug target", test: (dt) => (dt.clinical || dt.known_drug || 0) > 0 }, // OT renamed known_drug -> clinical
  { key: "somatic_mutation", label: "Somatic mutation", test: (dt) => (dt.somatic_mutation || 0) > 0 },
  { key: "genetic_association", label: "Genetic association", test: (dt) => (dt.genetic_association || 0) > 0 },
];
function evidenceFor(row) {
  const dt = Object.fromEntries((row.datatypeScores || []).map((x) => [x.id, x.score]));
  const ds = Object.fromEntries((row.datasourceScores || []).map((x) => [x.id, x.score]));
  return EVIDENCE_TAGS.filter((t) => t.test(dt, ds)).map(({ key, label }) => ({ key, label }));
}

let openaiClient;
function getOpenAI() {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: OPENAI_KEY.value() });
  return openaiClient;
}

exports.getBiomarkers = functions.runWith(RUNTIME).https.onRequest((req, res) => {
  if (gate(req, res)) return;
  return (async () => {
    const diseaseName = typeof req.body?.disease === "string" ? req.body.disease.trim() : "";

    if (!diseaseName) {
      return res.status(400).json({ error: "Disease name is required." });
    }
    if (diseaseName.length > MAX_DISEASE_CHARS) {
      return res.status(400).json({ error: `Disease name must be ${MAX_DISEASE_CHARS} characters or fewer.` });
    }

    try {
      // STEP 1: Get EFO ID from disease name
      console.log("🔍 Looking up disease:", diseaseName);

      const efoRes = await axios.post(
        "https://api.platform.opentargets.org/api/v4/graphql",
        {
          query: `
            query Search($term: String!) {
              search(queryString: $term, entityNames: ["disease"]) {
                hits {
                  id
                  name
                  entity
                }
              }
            }
          `,
          variables: { term: diseaseName },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );


      const match = efoRes.data.data.search.hits.find(
        (item) => item.entity === "disease"
      );

      if (!match || !match.id) {
        console.warn("⚠️ No matching EFO ID found for:", diseaseName);
        return res.status(404).json({
          error: `No matching disease found for "${diseaseName}". Try something more specific.`,
        });
      }

      const efoId = match.id;
      console.log("✅ Matched EFO ID:", efoId);

      // STEP 2: Get biomarkers for the disease
      console.log("🔍 Fetching biomarkers for EFO ID:", efoId);

      const query = `
        query DiseaseTargets($efoId: String!) {
          disease(efoId: $efoId) {
            name
            associatedTargets(page: {index: 0, size: 5}) {
              rows {
                target {
                  id
                  approvedSymbol
                  approvedName
                }
                score
                datatypeScores { id score }
                datasourceScores { id score }
              }
            }
          }
        }
      `;

      let otRes;
      try {
        otRes = await axios.post(
          "https://api.platform.opentargets.org/api/v4/graphql",
          { query, variables: { efoId } },
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (gqlErr) {
        console.error("❌ Biomarker GraphQL query failed:", gqlErr.message);
        return res.status(500).json({ error: "GraphQL biomarker query failed." });
      }


      const rows = otRes.data.data.disease?.associatedTargets?.rows || [];

      if (rows.length === 0) {
        console.warn("⚠️ No biomarkers found for EFO ID:", efoId);
        return res
          .status(404)
          .json({ error: `No biomarkers found for ${diseaseName}.` });
      }

      const biomarkerSummaries = await Promise.all(
        rows.map(async (item) => {
          const biomarkerName = item.target.approvedSymbol;
          const geneName = item.target.approvedName || biomarkerName;
          const ensemblId = item.target.id;

          const evidence = evidenceFor(item);
          const evidenceText = evidence.length
            ? evidence.map((e) => e.label.toLowerCase()).join(", ")
            : "literature and other indirect evidence";

          const summaryPrompt = `In 1-2 sentences for a non-expert, explain how the gene ${geneName} (${biomarkerName}) relates to ${diseaseName}.
Open Targets links this gene to the disease through: ${evidenceText}.
Base the explanation on that evidence. Do not claim clinical use (e.g. diagnostic, prognostic or treatment selection) unless it is well established, and do not invent statistics.`;

          let summary = "";
          try {
            const summaryRes = await getOpenAI().chat.completions.create(
              {
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: summaryPrompt }],
                temperature: 0.2,
                max_tokens: 200,
              },
              { timeout: 10000 }
            );
            summary = summaryRes.choices[0].message.content.trim();
          } catch (error) {
            console.error(`❌ Summary error for ${biomarkerName}:`, error.message);
            summary = `${geneName} is associated with ${diseaseName} in Open Targets.`;
          }

          const result = {
            name: biomarkerName,
            geneName: geneName,
            summary: summary,
            summaryIsAI: true,
            evidence: evidence,
            type: evidence.length ? evidence[0].key : "other", // primary evidence, used for graph colour
            openTargetsLink: `https://platform.opentargets.org/evidence/${ensemblId}/${efoId}`,
            score: item.score.toFixed(2),
          };
          
          
          return result;
        })
      );

      res
        .status(200)
        .json({ disease: diseaseName, biomarkers: biomarkerSummaries });
    } catch (error) {
      console.error("🔥 Top-level error:", error.message);
      res.status(500).json({ error: "Failed to fetch biomarker data." });
    }
  })();
});

// Voice Assistant Function
exports.askBiomarkerVoice = functions.runWith(RUNTIME).https.onRequest((req, res) => {
  if (gate(req, res)) return;
  return (async () => {
    try {
      const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
      const voiceId = req.body?.voiceId;

      if (!question) {
        return res.status(400).json({ error: "Question is required" });
      }
      if (question.length > MAX_QUESTION_CHARS) {
        return res.status(400).json({ error: `Question must be ${MAX_QUESTION_CHARS} characters or fewer.` });
      }
      if (voiceId && !ALLOWED_VOICES.has(voiceId)) {
        return res.status(400).json({ error: "Unknown voice." });
      }

      console.log("🎤 Voice question received:", question);
      console.log("🎙️ Voice ID requested:", voiceId || "default");

      // Step 1: Extract disease name from natural language question
      console.log("🧠 Extracting disease name from question...");
      const extractPrompt = `Extract only the disease or condition name from this question: "${question}". Return ONLY the disease name, nothing else. If no disease is mentioned, return "unknown".`;

      const extractRes = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: extractPrompt }],
        temperature: 0,
        max_tokens: 50
      });

      const diseaseName = extractRes.choices[0].message.content.trim();
      console.log("✅ Extracted disease:", diseaseName);

      if (diseaseName.toLowerCase() === "unknown") {
        return res.status(400).json({
          error: "Could not identify a disease in your question. Please mention a specific disease.",
          text: "I couldn't identify a specific disease in your question. Could you please ask about a particular disease or condition?"
        });
      }

      // Step 2: Get EFO ID from Open Targets
      console.log("🔍 Looking up disease:", diseaseName);
      const efoRes = await axios.post(
        "https://api.platform.opentargets.org/api/v4/graphql",
        {
          query: `
            query Search($term: String!) {
              search(queryString: $term, entityNames: ["disease"]) {
                hits {
                  id
                  name
                  entity
                }
              }
            }
          `,
          variables: { term: diseaseName },
        },
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      const match = efoRes.data.data.search.hits.find(
        (item) => item.entity === "disease"
      );

      if (!match || !match.id) {
        console.warn("⚠️ No matching disease found for:", diseaseName);
        return res.status(404).json({
          error: `No matching disease found for "${diseaseName}"`,
          text: `I couldn't find information about "${diseaseName}" in the Open Targets database. Could you try rephrasing or using a more specific disease name?`
        });
      }

      const efoId = match.id;
      const matchedDiseaseName = match.name;
      console.log("✅ Matched disease:", matchedDiseaseName, "EFO ID:", efoId);

      // Step 3: Get biomarkers for the disease
      console.log("🔬 Fetching biomarkers for:", matchedDiseaseName);
      const biomarkerQuery = `
        query DiseaseTargets($efoId: String!) {
          disease(efoId: $efoId) {
            name
            associatedTargets(page: {index: 0, size: 5}) {
              rows {
                target {
                  id
                  approvedSymbol
                  approvedName
                }
                score
                datatypeScores { id score }
                datasourceScores { id score }
              }
            }
          }
        }
      `;

      const biomarkerRes = await axios.post(
        "https://api.platform.opentargets.org/api/v4/graphql",
        { query: biomarkerQuery, variables: { efoId } },
        { headers: { "Content-Type": "application/json" } }
      );

      const biomarkers = biomarkerRes.data.data.disease?.associatedTargets?.rows || [];

      if (biomarkers.length === 0) {
        console.warn("⚠️ No biomarkers found for:", matchedDiseaseName);
        return res.status(404).json({
          error: `No biomarkers found for ${matchedDiseaseName}`,
          text: `I found the disease ${matchedDiseaseName}, but there are no biomarkers currently associated with it in the Open Targets database.`
        });
      }

      console.log(`✅ Found ${biomarkers.length} biomarkers`);

      // Step 4: Create a summary using OpenAI
      console.log("📝 Generating AI summary...");
      const biomarkerList = biomarkers
        .map(b => {
          const ev = evidenceFor(b).map((e) => e.label.toLowerCase()).join(", ") || "other evidence";
          return `${b.target.approvedSymbol} (${b.target.approvedName}; association score ${b.score.toFixed(2)}; Open Targets evidence: ${ev})`;
        })
        .join(", ");

      const summaryPrompt = `You are a medical AI assistant. Answer this question concisely in 2-3 sentences for a medical professional: "${question}"

Context: The genes most strongly associated with ${matchedDiseaseName} in Open Targets are: ${biomarkerList}.
Base your answer only on this evidence. Do not state or imply which genes are, or are not, clinically established biomarkers, and do not invent statistics.

Provide a clear, professional answer that directly addresses the question. Keep it under 100 words.`;

      const summaryRes = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: summaryPrompt }],
        temperature: 0.2,
        max_tokens: 200
      });

      const summary = summaryRes.choices[0].message.content.trim();

      // Step 5: Convert summary to speech with ElevenLabs
      console.log("🔊 Converting to speech...");
      const elevenKey = ELEVENLABS_KEY.value();
      // Use voiceId from request (validated above), fallback to the default voice
      const selectedVoiceId = voiceId || DEFAULT_VOICE;

      console.log("🎙️ Using voice ID:", selectedVoiceId);

      const elevenRes = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
        {
          text: summary,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            "xi-api-key": elevenKey,
            "Content-Type": "application/json"
          },
          responseType: 'arraybuffer'
        }
      );

      // Convert audio to base64 for easy transmission
      const audioBase64 = Buffer.from(elevenRes.data).toString('base64');
      console.log("✅ Audio generated, size:", audioBase64.length, "characters");

      // Return both text and audio
      res.status(200).json({
        text: summary,
        audio: audioBase64,
        disease: matchedDiseaseName,
        biomarkerCount: biomarkers.length
      });

    } catch (error) {
      console.error("🔥 Voice assistant error:", error.message);
      if (error.response) {
      }
      res.status(500).json({
        error: "Failed to process voice request"
      });
    }
  })();
});
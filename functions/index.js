const functions = require("firebase-functions");
const axios = require("axios");
const cors = require('cors')({ origin: true });

const openaiKey = functions.config().openai.key;

const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: openaiKey,
});

// Function to classify a biomarker
exports.classifyBiomarker = functions.https.onRequest((req, res) => {
  // Log the complete request for debugging
  console.log("🔎 Request method:", req.method);
  console.log("🔎 Request headers:", JSON.stringify(req.headers, null, 2));
  // Handle preflight OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }
  return cors(req, res, async () => {
    console.log("📩 Request body:", JSON.stringify(req.body, null, 2));
    
    // Extract parameters from various possible request formats (body or query)
    let biomarkerName = req.body.biomarkerName || req.body.biomarker || req.body.name || 
                        req.query.biomarkerName || req.query.biomarker || req.query.name || "";
                        
    let diseaseName = req.body.diseaseName || req.body.disease || 
                      req.query.diseaseName || req.query.disease || "";
    
    // Also try to parse JSON if it's sent as a string
    if (typeof req.body === 'string') {
      try {
        const parsedBody = JSON.parse(req.body);
        biomarkerName = biomarkerName || parsedBody.biomarkerName || parsedBody.biomarker || parsedBody.name || "";
        diseaseName = diseaseName || parsedBody.diseaseName || parsedBody.disease || "";
      } catch (e) {
        console.log("📝 Body is a string but not valid JSON");
      }
    }
    
    // Log the extracted parameters
    console.log(`📋 Extracted biomarkerName: "${biomarkerName}", diseaseName: "${diseaseName}"`);

    if (!biomarkerName || !diseaseName) {
      return res.status(400).json({ 
        error: "Both biomarkerName and diseaseName are required.",
        receivedParams: req.body
      });
    }

    try {
      console.log(`🔍 Classifying biomarker: ${biomarkerName} for disease: ${diseaseName}`);
      
      const categoryPrompt = `In the context of ${diseaseName}, is the biomarker ${biomarkerName} primarily diagnostic, prognostic, predictive, or pharmacodynamic? 

IMPORTANT: Start your response with just one of these words: "Diagnostic", "Prognostic", "Predictive", "Pharmacodynamic", or "Unknown". Then continue with a brief explanation.

Example formats:
"Diagnostic: This biomarker helps diagnose the condition because..."
"Prognostic: This biomarker helps predict disease progression because..."
"Unknown: There is insufficient evidence to classify this biomarker..."`;

      const categoryRes = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: categoryPrompt }],
        temperature: 0,
        max_tokens: 150
      });

      const fullResponse = categoryRes.choices[0].message.content.trim();
      
      // Match for known category types
      const categoryTypes = ["diagnostic", "prognostic", "predictive", "pharmacodynamic", "unknown"];
      
      // First check if the response starts with a category word
      const firstWord = fullResponse.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
      
      let category = "unknown";
      let explanation = "";
      
      if (categoryTypes.includes(firstWord)) {
        // If the first word is a category, use it
        category = firstWord;
        explanation = fullResponse.substring(firstWord.length).trim().replace(/^[:\-–\s]+/, '');
      } else {
        // Try to find any category word in the text
        const foundCategory = categoryTypes.find(type => 
          fullResponse.toLowerCase().includes(type)
        );
        
        if (foundCategory) {
          category = foundCategory;
          explanation = fullResponse;
        } else {
          category = "unknown";
          explanation = fullResponse;
        }
      }
      
      console.log(`📊 Raw category response: "${fullResponse}"`);
      console.log(`✅ ${biomarkerName} categorized as ${category}`);

      const result = {
        biomarker: biomarkerName,
        disease: diseaseName,
        type: category,
        category: category, // Include both for compatibility
        explanation: explanation
      };
      
      console.log(`📦 Returning classification:`, JSON.stringify(result, null, 2));
      
      res.status(200).json(result);
    } catch (error) {
      console.error("🔥 Error classifying biomarker:", error.message);
      res.status(500).json({ 
        error: "Failed to classify biomarker.",
        details: error.message 
      });
    }
  });
});

exports.getBiomarkers = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    const diseaseName = req.body.disease || "";

    if (!diseaseName) {
      return res.status(400).json({ error: "Disease name is required." });
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

      console.log("📊 Search results:", efoRes.data);

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

      console.log("📥 Biomarker response:", JSON.stringify(otRes.data, null, 2));

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

          const summaryPrompt = `Explain the role of the biomarker ${geneName} in the context of ${diseaseName} in 1-2 sentences. Make it accessible to non-experts.`;

          const categoryPrompt = `In the context of ${diseaseName}, is the biomarker ${geneName} primarily diagnostic, prognostic, predictive, or pharmacodynamic? 

IMPORTANT: Start your response with just one of these words: "Diagnostic", "Prognostic", "Predictive", "Pharmacodynamic", or "Unknown". Then continue with a brief explanation.

Example formats:
"Diagnostic: This biomarker helps diagnose the condition because..."
"Prognostic: This biomarker helps predict disease progression because..."
"Unknown: There is insufficient evidence to classify this biomarker..."`;

          let summary = "";
          let category = "unknown";
          let explanation = "";

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const [summaryRes, categoryRes] = await Promise.all([
              openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: summaryPrompt }],
                temperature: 0.7,
                max_tokens: 200
              }, { signal: controller.signal }),

              openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: categoryPrompt }],
                temperature: 0,
                max_tokens: 100
              }, { signal: controller.signal }),
            ]);

            clearTimeout(timeoutId);

            summary = summaryRes.choices[0].message.content.trim();

            // Get the full response
            const fullResponse = categoryRes.choices[0].message.content.trim();
            
            // Match for known category types
            const categoryTypes = ["diagnostic", "prognostic", "predictive", "pharmacodynamic", "unknown"];
            
            // First check if the response starts with a category word
            const firstWord = fullResponse.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
            
            if (categoryTypes.includes(firstWord)) {
              // If the first word is a category, use it
              category = firstWord;
              explanation = fullResponse.substring(firstWord.length).trim().replace(/^[:\-–\s]+/, '');
            } else {
              // Try to find any category word in the text
              const foundCategory = categoryTypes.find(type => 
                fullResponse.toLowerCase().includes(type)
              );
              
              if (foundCategory) {
                category = foundCategory;
                explanation = fullResponse;
              } else {
                category = "unknown";
                explanation = fullResponse;
              }
            }
            
            console.log(`📊 Raw category response for ${biomarkerName}: "${fullResponse}"`);

            console.log(`✅ ${biomarkerName} categorized as ${category}`);
          } catch (error) {
            console.error(`❌ Error for ${biomarkerName}:`, error.message);
            summary = summary || `${geneName} is a biomarker associated with ${diseaseName}.`;
            category = "unknown";
            explanation = `Categorization could not be determined: ${error.message}`;
            
            console.log(`⚠️ Falling back to default values for ${biomarkerName} due to error`);
          }

          const result = {
            name: biomarkerName,
            geneName: geneName,
            summary: summary,
            category: category,
            explanation: explanation,
            openTargetsLink: `https://platform.opentargets.org/target/${ensemblId}`,
            score: item.score.toFixed(2),
            type: category // Add type field that's equivalent to category
          };
          
          console.log(`📦 Returning biomarker data for ${biomarkerName}:`, JSON.stringify(result, null, 2));
          
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
  });
});
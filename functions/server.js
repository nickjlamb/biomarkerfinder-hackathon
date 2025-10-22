// server.js
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

const OT_ENDPOINT = "https://api.platform.opentargets.org/api/v4/graphql";

// OLS4 base
const OLS4_BASE = "https://www.ebi.ac.uk/ols4/api/ontologies/efo";

/* ------------------ helpers ------------------ */
async function fetchJson(url, init) {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("[HTTP]", r.status, url, j);
    throw new Error(`HTTP ${r.status} for ${url}`);
  }
  return j;
}

// follow HAL pagination using _links.next
async function fetchAllPaged(startUrl) {
  let url = startUrl;
  const out = [];
  while (url) {
    const page = await fetchJson(url);
    const items = page?._embedded?.terms || [];
    out.push(...items);
    url = page?._links?.next?.href || null;
  }
  return out;
}

// Open Targets GraphQL helper
async function callOT(query, variables = {}) {
  const res = await fetch(OT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("[OpenTargets] HTTP error:", res.status, json);
    throw new Error(`OpenTargets HTTP ${res.status}`);
  }
  if (json.errors) {
    console.error("[OpenTargets] GraphQL errors:", JSON.stringify(json.errors, null, 2));
  }
  return json;
}

/* ------------------ routes ------------------ */

/**
 * POST /getBiomarkers
 * Body:
 * {
 *   "disease": "EFO_0000222",
 *   "index": 0,
 *   "size": 25,
 *   "sortBy": "score",
 *   "enableIndirect": true,
 *   "datasources": [ ... ],    // optional
 *   "rowsFilter": [ ... ],     // optional
 *   "facetFilters": [ ... ],   // optional
 *   "entitySearch": "FLT3"     // optional
 * }
 */
app.post("/getBiomarkers", async (req, res) => {
  try {
    const {
      disease,
      index = 0,
      size = 25,
      sortBy = "score",
      enableIndirect = true,
      datasources = null,

      // NEW optional filters
      rowsFilter = null,   // [String!]
      facetFilters = null, // [String!]
      entitySearch = null, // String
    } = req.body || {};

    if (!disease) {
      return res.status(400).json({ error: "Missing 'disease' (EFO id) in body" });
    }

    const query = `
      query DiseaseAssociationsQuery(
        $id: String!
        $index: Int!
        $size: Int!
        $sortBy: String!
        $enableIndirect: Boolean!
        $datasources: [DatasourceSettingsInput!]
        $rowsFilter: [String!]
        $facetFilters: [String!]
        $entitySearch: String
      ) {
        disease(efoId: $id) {
          id
          name
          associatedTargets(
            page: { index: $index, size: $size }
            orderByScore: $sortBy
            enableIndirect: $enableIndirect
            datasources: $datasources
            rowsFilter: $rowsFilter
            facetFilters: $facetFilters
            entitySearch: $entitySearch
          ) {
            count
            rows {
              target {
                id
                approvedSymbol
                approvedName
                prioritisation { items { key value } }
              }
              score
              datasourceScores { componentId: id score }
            }
          }
        }
      }
    `;

    const variables = {
      id: disease,
      index,
      size,
      sortBy,
      enableIndirect,
      datasources,
      rowsFilter,
      facetFilters,
      entitySearch,
    };

    const json = await callOT(query, variables);
    res.json(json);
  } catch (err) {
    console.error("[/getBiomarkers] Error:", err);
    res.status(500).json({ error: "Query failed", message: err.message });
  }
});

/**
 * POST /knownDrugs
 * Body: { efoId: "EFO_...", cursor?: string|null, freeTextQuery?: string|null, size?: number }
 */
app.post("/knownDrugs", async (req, res) => {
  try {
    const { efoId, cursor = null, freeTextQuery = null, size = 10 } = req.body || {};
    if (!efoId) return res.status(400).json({ error: "Missing efoId" });

    const query = `
      query KnownDrugsQuery(
        $efoId: String!
        $cursor: String
        $freeTextQuery: String
        $size: Int = 10
      ) {
        disease(efoId: $efoId) {
          id
          knownDrugs(cursor: $cursor, freeTextQuery: $freeTextQuery, size: $size) {
            count
            cursor
            rows {
              phase
              status
              urls { name url }
              disease { id name }
              drug {
                id              # <-- ChEMBL ID
                name
                mechanismsOfAction {
                  rows { actionType targets { id } }
                }
              }
              drugType
              mechanismOfAction
              target { id approvedName approvedSymbol }
            }
          }
        }
      }
    `;

    const variables = { efoId, cursor, freeTextQuery, size };
    const json = await callOT(query, variables);
    res.json(json);
  } catch (err) {
    console.error("[/knownDrugs] Error:", err);
    res.status(500).json({ error: "KnownDrugs query failed", message: err.message });
  }
});

/**
 * POST /drugWarning
 * Body: { chemblId: "CHEMBL..." }
 */
app.post("/drugWarning", async (req, res) => {
  try {
    const { chemblId } = req.body || {};
    if (!chemblId) return res.status(400).json({ error: "Missing chemblId" });

    const query = `
      query drugApprovalWithdrawnWarningData($chemblId: String!) {
        drug(chemblId: $chemblId) {
          id
          name
          isApproved
          hasBeenWithdrawn
          blackBoxWarning
          drugWarnings {
            warningType
            description
            toxicityClass
            year
            references { id source url }
          }
        }
      }
    `;

    const variables = { chemblId };
    const json = await callOT(query, variables);
    res.json(json);
  } catch (err) {
    console.error("[/drugWarning] Error:", err);
    res.status(500).json({ error: "drugWarning query failed", message: err.message });
  }
});

/**
 * POST /siblings
 * Body: { efoId: "EFO_..." }
 *
 * - Resolve term via /terms?iri=...
 * - Prefer _links.parents → each parent’s _links.children
 *   (fallback to hierarchicalParents → hierarchicalChildren)
 * - Normalize IDs (EFO:xxxx → EFO_xxxx)
 * - Only traverse children for EFO parents (we're under /ontologies/efo/)
 * - Always request size=500 and paginate via _links.next
 * - Also return the queried term's own children (for debugging/visibility)
 */
app.post("/siblings", async (req, res) => {
  try {
    const { efoId } = req.body || {};
    if (!efoId) return res.status(400).json({ error: "Missing efoId" });

    const iri = encodeURIComponent(`http://www.ebi.ac.uk/efo/${efoId}`);
    const termUrl = `${OLS4_BASE}/terms?iri=${iri}`;
    const termResp = await fetchJson(termUrl);
    const term = (termResp?._embedded?.terms || [])[0];

    if (!term) {
      console.warn("[/siblings] No term found for", efoId, "from", termUrl);
      return res.status(404).json({ error: "EFO term not found", efoId });
    }

    const links = term?._links || {};
    console.log(
      "[/siblings] term links:",
      Object.keys(links).filter(k => links[k]?.href).join(", ")
    );

    // helpers
    const withSize = (u) => (u ? (u.includes("?") ? `${u}&size=500` : `${u}?size=500`) : u);

    const fetchAllPagedLocal = async (startUrl) => {
      let url = withSize(startUrl);
      const out = [];
      while (url) {
        const page = await fetchJson(url);
        const items = page?._embedded?.terms || [];
        out.push(...items);
        const next = page?._links?.next?.href || null;
        url = next ? withSize(next) : null;
      }
      return out;
    };

    const norm = (obo_id, short_form) => {
      // Prefer short_form if present (already underscore form)
      if (short_form && /^EFO_\d+/.test(short_form)) return { id: short_form, ontology: "efo" };
      if (obo_id) {
        const [ont, local] = obo_id.split(":");
        if (ont && local && ont.toUpperCase() === "EFO") {
          return { id: `EFO_${local}`, ontology: "efo" };
        }
        // Return as-is for non-EFO so we can list parents, but we won't traverse their children under EFO.
        return { id: obo_id, ontology: (ont || "").toLowerCase() };
      }
      return { id: null, ontology: null };
    };

    // 0) also fetch the term's own children (debugging/visibility)
    const termChildrenHref = links?.children?.href || links?.hierarchicalChildren?.href || null;
    const childrenRaw = termChildrenHref ? await fetchAllPagedLocal(termChildrenHref) : [];
    const children = childrenRaw
      .map(t => {
        const n = norm(t.obo_id, t.short_form);
        return { id: n.id, ontology: n.ontology, name: t.label || "Unnamed" };
      })
      .filter(x => x.id);

    // 1) get parents (direct, fallback hierarchical)
    const parentsHref = links?.parents?.href || links?.hierarchicalParents?.href || null;
    if (!parentsHref) {
      console.warn("[/siblings] No parents/hierarchicalParents link for", efoId);
      return res.json({ efoId, parents: [], siblings: [], children });
    }

    const parentTerms = await fetchAllPagedLocal(parentsHref);
    const parents = parentTerms
      .map(t => {
        const n = norm(t.obo_id, t.short_form);
        return {
          id: n.id,
          ontology: n.ontology,
          name: t.label || "Unnamed",
          _links: t?._links || {}
        };
      })
      .filter(p => p.id);

    console.log("[/siblings] parents found:", parents.length);

    // 2) siblings: union of each parent's children (EFO parents only), excluding the term itself
    const siblingsMap = new Map();

    for (const p of parents) {
      if (p.ontology !== "efo") {
        // We can't traverse children under non-EFO using /ontologies/efo; skip traversal but still return the parent record.
        continue;
      }

      // Use child links on the parent; if missing, resolve the parent term for links
      let childrenHref = p._links?.children?.href || p._links?.hierarchicalChildren?.href || null;
      if (!childrenHref) {
        const pIri = encodeURIComponent(`http://www.ebi.ac.uk/efo/${p.id}`);
        const pTermUrl = `${OLS4_BASE}/terms?iri=${pIri}`;
        const pTermResp = await fetchJson(pTermUrl);
        const pTerm = (pTermResp?._embedded?.terms || [])[0] || {};
        childrenHref = pTerm?._links?.children?.href || pTerm?._links?.hierarchicalChildren?.href || null;
      }
      if (!childrenHref) {
        console.warn("[/siblings] No children links for parent", p.id);
        continue;
      }

      const kids = await fetchAllPagedLocal(childrenHref);
      for (const k of kids) {
        const n = norm(k.obo_id, k.short_form);
        if (!n.id) continue;
        if (n.id === efoId) continue; // exclude self
        if (!siblingsMap.has(n.id)) {
          siblingsMap.set(n.id, { id: n.id, name: k.label || "Unnamed" });
        }
      }
    }

    // Clean parents for output (no _links)
    const parentsOut = parents.map(({ id, ontology, name }) => ({ id, ontology, name }));

    console.log(
      "[/siblings]",
      efoId,
      "parents:", parentsOut.length,
      "siblings:", siblingsMap.size,
      "children:", children.length
    );

    res.json({
      efoId,
      parents: parentsOut,                // may include non-EFO (e.g., MONDO)
      siblings: Array.from(siblingsMap.values()), // only computed via EFO parents
      children                           // children of the queried term (EFO), for debugging/visibility
    });
  } catch (err) {
    console.error("[/siblings] Error:", err);
    res.status(500).json({ error: "siblings lookup failed", message: err.message });
  }
});


/**
 * POST /actionability
 * Body: { efoId: "EFO_...", targetId: "ENSG...", size?: number }
 *
 * Checks parent + sibling EFOs for knownDrugs entries that match the same target.
 */
app.post("/actionability", async (req, res) => {
  try {
    const { efoId, targetId, size = 500 } = req.body || {};
    if (!efoId || !targetId) {
      return res.status(400).json({ error: "Missing efoId or targetId" });
    }

    // 1) get parents + siblings via our own /siblings (loopback)
    const sibResp = await fetchJson(`http://127.0.0.1:${PORT}/siblings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ efoId })
    });

    const candidateDiseases = [
      ...(sibResp.parents || []),
      ...(sibResp.siblings || [])
    ];

    // 2) query knownDrugs for each candidate; if any row has the same target.id, mark actionable
    const query = `
      query KnownDrugsForDisease($efoId: String!, $size: Int!) {
        disease(efoId: $efoId) {
          id
          name
          knownDrugs(size: $size) {
            rows {
              target { id }
            }
          }
        }
      }
    `;

    const actionableIn = [];
    for (const d of candidateDiseases) {
      try {
        const variables = { efoId: d.id, size };
        const j = await callOT(query, variables);
        const rows = j?.data?.disease?.knownDrugs?.rows || [];
        const hasSameTarget = rows.some(r => r?.target?.id === targetId);
        if (hasSameTarget) {
          actionableIn.push({
            id: j?.data?.disease?.id || d.id,
            name: j?.data?.disease?.name || d.name
          });
        }
      } catch (e) {
        console.warn("[/actionability] Skipping candidate due to OT error:", d.id, e?.message);
      }
    }

    res.json({
      efoId,
      targetId,
      actionable: actionableIn.length > 0,
      diseases: actionableIn
    });
  } catch (err) {
    console.error("[/actionability] Error:", err);
    res.status(500).json({ error: "actionability check failed", message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server ready at http://127.0.0.1:${PORT}`);
});

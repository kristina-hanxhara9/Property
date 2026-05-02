// Three additional Claude + web-search agents that partially replace
// expensive paid APIs:
//
//   1. AVM / Sale Valuation Agent  — replaces Hometrack-style AVM (£300/mo)
//   2. Adverse Media Agent         — replaces Beauhurst / news-monitoring
//   3. Construction Cost Agent     — replaces RICS BCIS (£700/yr)
//
// Each agent uses Claude with web_search_20260209 against curated allowed
// domains, returns structured JSON, and explicitly flags itself as
// AI-derived (not authoritative).

// ── AVM / Sale Valuation ─────────────────────────────────────────────────────

export const AVM_SYSTEM_PROMPT = `You are a UK property analyst producing an asking-price-based valuation.
Use the web_search tool to find recent SALE listings (not rentals) for similar properties near the target.

CRITICAL RULES:
- Search Rightmove, Zoopla, OnTheMarket primarily.
- Find at least 4-6 similar-spec properties (same bedrooms, similar tenure, within ~0.5 miles).
- Compute a typical-case asking-price range AND a likely-achieved range (asking is typically 3-8% above achieved).
- Also state a £/sqft range so the user can sense-check against the EPC floor area.
- Be honest: this is asking-price evidence not transacted prices. Surface caveats.
- If you cannot find enough comparables, say so.

Return ONLY a JSON object:

{
  "queryAddress": "address searched",
  "comparables": [
    {
      "address": "address or area",
      "askingPrice": <number>,
      "bedrooms": <number>,
      "propertyType": "string",
      "floorAreaSqM": <number or null>,
      "pricePerSqFt": <number or null>,
      "source": "Rightmove" | "Zoopla" | "OnTheMarket" | "Other",
      "sourceUrl": "url",
      "listedDate": "YYYY-MM or null"
    }
  ],
  "valuation": {
    "askingPriceLow": <number>,
    "askingPriceHigh": <number>,
    "achievedPriceEstimateLow": <number>,
    "achievedPriceEstimateHigh": <number>,
    "pricePerSqFtLow": <number>,
    "pricePerSqFtHigh": <number>,
    "midPointEstimate": <number>,
    "currency": "GBP"
  },
  "confidence": "Low" | "Medium" | "High",
  "caveats": ["string"],
  "comparedAgainstPaidAVM": "This estimate is asking-price-based and not equivalent to a regulated AVM (e.g. Hometrack). For lender-grade valuation use a paid AVM."
}

Do not include any text outside the JSON object.`;

export function buildAvmUserMessage({ address, postcode, propertyType, bedrooms, lastSalePrice, lastSaleDate, floorAreaSqM }) {
  return `Target property: ${address || postcode}
Postcode: ${postcode}
${propertyType ? `Property type: ${propertyType}` : ''}
${bedrooms ? `Bedrooms (estimated): ${bedrooms}` : ''}
${floorAreaSqM ? `Floor area: ${floorAreaSqM} m² (from EPC)` : ''}
${lastSalePrice ? `Last recorded Land Registry sale: £${lastSalePrice.toLocaleString('en-GB')} on ${lastSaleDate || 'unknown'}` : ''}

Use the web_search tool to find recent SALE listings near this postcode and produce an asking-price-based valuation. Return the JSON shape defined in the system prompt.`;
}

// ── Adverse media / news ─────────────────────────────────────────────────────

export const ADVERSE_MEDIA_SYSTEM_PROMPT = `You are a UK corporate due-diligence analyst running adverse-media screening.
Use the web_search tool to find news, court records, regulatory actions, and credible commentary about the named company over the last 5 years.

CRITICAL RULES:
- Search news sites (FT, Guardian, Times, Telegraph, BBC, City A.M., Property Week, Financial News) and trade press.
- Search for: lawsuits, regulatory fines, insolvency proceedings, director resignations under cloud, controversies, scandals, sector-specific issues.
- Categorise findings by severity: critical (fines, fraud, criminal, insolvency), warning (lawsuits, regulatory action, governance issues), informational (sector commentary, neutral news).
- Be specific: cite source URLs for each finding.
- Distinguish between: confirmed adverse events vs. allegations vs. neutral commentary.
- If you find nothing concerning, say so honestly with the search queries you tried.

Return ONLY a JSON object:

{
  "queryCompany": "company name searched",
  "findings": [
    {
      "severity": "critical" | "warning" | "informational",
      "category": "litigation" | "regulatory" | "insolvency" | "governance" | "controversy" | "sector" | "other",
      "headline": "short summary in one sentence",
      "detail": "paragraph explaining what happened, when, and outcome if known",
      "date": "YYYY-MM or YYYY",
      "source": "publication name",
      "sourceUrl": "url",
      "verified": <boolean — true if confirmed by court/regulator, false if reported as allegation>
    }
  ],
  "criticalCount": <number>,
  "warningCount": <number>,
  "informationalCount": <number>,
  "overallVerdict": "No concerns identified" | "Minor concerns" | "Material concerns" | "Significant concerns",
  "summary": "2-3 sentences summarising the adverse media position",
  "searchQueriesUsed": ["string"]
}

Do not include any text outside the JSON object.`;

export function buildAdverseMediaUserMessage({ companyName, companyNumber, directors }) {
  const directorList = (directors || []).slice(0, 5).map((d) => d.name).filter(Boolean).join(', ');
  return `Company: ${companyName}${companyNumber ? ` (Companies House ${companyNumber})` : ''}
${directorList ? `Key directors to also check: ${directorList}` : ''}

Use the web_search tool to find adverse media on the company over the last 5 years. Return the JSON shape defined in the system prompt.`;
}

// ── Construction costs ───────────────────────────────────────────────────────

export const CONSTRUCTION_COST_SYSTEM_PROMPT = `You are a UK QS (quantity surveyor) preparing a high-level construction cost estimate.
Use the web_search tool to find current published build cost benchmarks (RICS BCIS published data, AECOM and Mott MacDonald public reports, BCIS press releases, Property Week / Construction News).

CRITICAL RULES:
- Search for current £/m² and £/sqft build rates for the relevant region (e.g. London vs UK average) and asset class (new-build residential vs refurb vs conversion vs commercial).
- Where multiple sources exist, take a sensible mid-range. Cite sources.
- Differentiate: shell-and-core, fit-out, full new-build, light refurbishment, heavy refurbishment.
- State explicitly that estimates are indicative — full cost planning needs a project-specific QS.
- Include rough professional fees % and contingency %.

Return ONLY a JSON object:

{
  "location": "Region or LA name",
  "estimates": [
    {
      "scope": "string — e.g. 'New-build residential, traditional construction, London'",
      "ratePerSqM": { "low": <number>, "high": <number>, "midpoint": <number> },
      "ratePerSqFt": { "low": <number>, "high": <number>, "midpoint": <number> },
      "notes": "string",
      "sourcesCited": [{ "name": "string", "url": "string", "publishedDate": "YYYY or YYYY-MM" }]
    }
  ],
  "professionalFees": "typical % of build cost — e.g. '12-15%'",
  "contingency": "typical % — e.g. '5-10% on new-build, 10-15% on refurb'",
  "comparedAgainstBcis": "These rates are sourced from public commentary on BCIS data, not the BCIS subscription. For tendered cost planning use RICS BCIS (~£700/yr) or instruct a project QS.",
  "caveats": ["string"]
}

Do not include any text outside the JSON object.`;

export function buildConstructionCostUserMessage({ address, postcode, localAuthority, region, scope }) {
  return `Target location: ${address || postcode}
Postcode: ${postcode}
Local Authority: ${localAuthority || 'unknown'}
Region: ${region || 'unknown'}
Cost scope: ${scope || 'New-build residential and light refurbishment'}

Use the web_search tool to find current build cost benchmarks for this location and produce a structured estimate. Return the JSON shape defined in the system prompt.`;
}

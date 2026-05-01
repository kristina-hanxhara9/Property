// Rule-based fallback report builders.
// Used when ANTHROPIC_API_KEY is missing or Claude synthesis fails — so the
// frontend still gets a useful, structured report from the raw API data.
// The output JSON shape matches what the property/company analysis prompts
// instruct Claude to return.

export function buildPropertyFallbackReport({ address, postcode, rawData }) {
  const meta = rawData?.meta || {};
  const planning = rawData?.planning?.constraints || {};
  const flood = rawData?.flood || {};
  const priceSummary = rawData?.priceSummary || {};
  const transactions = rawData?.pricePaid?.transactions || [];

  const flags = [];
  let riskScore = 3;

  // Listed building
  const listed = planning['listed-building'] || [];
  const listedGrade = listed[0]?.grade || null;
  if (listed.length > 0) {
    riskScore += 2;
    flags.push({
      severity: 'warning',
      category: 'planning',
      title: `Listed Building${listedGrade ? ` (Grade ${listedGrade})` : ''}`,
      detail:
        'Listed status significantly restricts alterations. Listed Building Consent will be required for any external or internal works affecting character.',
    });
  }

  // Conservation area
  const conservation = planning['conservation-area'] || [];
  if (conservation.length > 0) {
    riskScore += 1;
    flags.push({
      severity: 'warning',
      category: 'planning',
      title: `Conservation Area${conservation[0]?.name ? ` — ${conservation[0].name}` : ''}`,
      detail:
        'Permitted development rights are restricted. Most external alterations will require planning consent.',
    });
  }

  // Article 4
  const article4 = planning['article-4-direction-area'] || [];
  if (article4.length > 0) {
    riskScore += 1;
    flags.push({
      severity: 'warning',
      category: 'planning',
      title: 'Article 4 Direction in force',
      detail:
        'Permitted development rights have been removed. Specific changes that would normally not require planning permission now do.',
    });
  }

  // Green belt
  if ((planning['green-belt'] || []).length > 0) {
    riskScore += 2;
    flags.push({
      severity: 'critical',
      category: 'planning',
      title: 'Green Belt designation',
      detail:
        'Green Belt restrictions sharply limit new development. Material change requires demonstrating very special circumstances.',
    });
  }

  // National park / AONB
  if ((planning['national-park'] || []).length > 0) {
    riskScore += 2;
    flags.push({
      severity: 'critical',
      category: 'planning',
      title: 'Within a National Park',
      detail: 'Development is highly constrained by national-park planning policy.',
    });
  }
  if ((planning['area-of-outstanding-natural-beauty'] || []).length > 0) {
    riskScore += 1;
    flags.push({
      severity: 'warning',
      category: 'planning',
      title: 'Area of Outstanding Natural Beauty',
      detail:
        'AONB status weighs heavily against major development. Smaller sympathetic schemes may be possible.',
    });
  }

  // TPO
  if ((planning['tree-preservation-zone'] || []).length > 0) {
    flags.push({
      severity: 'warning',
      category: 'planning',
      title: 'Tree Preservation Order area',
      detail: 'Trees on site or nearby are protected — works affecting them require LPA consent.',
    });
  }

  // Brownfield (positive)
  if ((planning['brownfield-land'] || []).length > 0) {
    flags.push({
      severity: 'ok',
      category: 'planning',
      title: 'Brownfield land register',
      detail: 'Listed on the brownfield register — generally favourable for residential redevelopment.',
    });
  }

  // Heritage extras
  if ((planning['scheduled-monument'] || []).length > 0) {
    riskScore += 2;
    flags.push({
      severity: 'critical',
      category: 'planning',
      title: 'Scheduled Monument',
      detail: 'Scheduled Monument Consent required for any works. Effectively rules out redevelopment.',
    });
  }
  if ((planning['world-heritage-site'] || []).length > 0) {
    riskScore += 1;
    flags.push({
      severity: 'warning',
      category: 'planning',
      title: 'World Heritage Site',
      detail: 'OUV (outstanding universal value) considerations apply to any change.',
    });
  }

  // Flood
  const fz = String(flood.riverAndSea || '').toLowerCase();
  if (fz.includes('zone 3')) {
    riskScore += 3;
    flags.push({
      severity: 'critical',
      category: 'flood',
      title: 'Flood Zone 3 (high probability)',
      detail:
        'Within high-probability river or sea flood zone. Flood-resilient design required; insurance availability and pricing significantly affected.',
    });
  } else if (fz.includes('zone 2')) {
    riskScore += 1;
    flags.push({
      severity: 'warning',
      category: 'flood',
      title: 'Flood Zone 2 (medium probability)',
      detail:
        'Within medium-probability river or sea flood zone. Sequential test applies for new development; a Flood Risk Assessment will be required.',
    });
  }

  const sw = String(flood.surfaceWater || '').toLowerCase();
  if (sw === 'high') {
    riskScore += 2;
    flags.push({
      severity: 'critical',
      category: 'flood',
      title: 'High surface-water flood risk',
      detail: 'Surface-water drainage strategy will be a major design constraint.',
    });
  } else if (sw === 'medium') {
    riskScore += 1;
    flags.push({
      severity: 'warning',
      category: 'flood',
      title: 'Medium surface-water flood risk',
      detail: 'Surface-water flood risk is non-trivial — review SuDS strategy.',
    });
  }

  if (flood.reservoirRisk) {
    flags.push({
      severity: 'warning',
      category: 'flood',
      title: 'Reservoir flood extent',
      detail: 'Within a modelled reservoir flood extent. Low likelihood but high consequence event.',
    });
  }

  // Price growth
  const lastPrice = priceSummary.lastSalePrice;
  const g5 = priceSummary.growth5yr;
  if (g5 && /^\+/.test(g5)) {
    flags.push({
      severity: 'ok',
      category: 'market',
      title: `5-year capital growth ${g5}`,
      detail: 'Local market shows positive nominal capital growth over a 5-year window.',
    });
  } else if (g5 && /^-/.test(g5)) {
    riskScore += 1;
    flags.push({
      severity: 'warning',
      category: 'market',
      title: `5-year capital growth ${g5}`,
      detail: 'Local prices have softened over the last 5 years — diligence the cause.',
    });
  }

  if (transactions.length === 0) {
    flags.push({
      severity: 'warning',
      category: 'market',
      title: 'No sale history found at this postcode',
      detail: 'Land Registry returned no Price Paid records for this postcode in the queried window.',
    });
  }

  riskScore = Math.min(10, Math.max(1, riskScore));
  const riskLevel =
    riskScore >= 8 ? 'critical' : riskScore >= 6 ? 'high' : riskScore >= 4 ? 'medium' : 'low';

  const planningNotes = listToText({
    'Conservation area': conservation.length,
    'Listed building': listed.length,
    'Article 4': article4.length,
    'Green belt': (planning['green-belt'] || []).length,
    AONB: (planning['area-of-outstanding-natural-beauty'] || []).length,
    'National park': (planning['national-park'] || []).length,
    Brownfield: (planning['brownfield-land'] || []).length,
    'Tree preservation': (planning['tree-preservation-zone'] || []).length,
  });

  const lpaName = (planning['local-planning-authority'] || [])[0]?.name || null;

  const summary = buildPropertySummary({
    address,
    postcode,
    riskLevel,
    listed,
    conservation,
    flood,
    priceSummary,
    transactions,
    lpaName,
  });

  const report = {
    reportType: 'property',
    queryInput: address || postcode || 'Unknown',
    generatedAt: new Date().toISOString(),
    riskScore,
    riskLevel,
    riskSummary: buildOneLineSummary(riskLevel, flags),

    titleData: {
      owner: 'Data unavailable — Land Registry Title Register is a paid lookup not enabled in this MVP',
      ownerType: 'unknown',
      ownerAddress: null,
      titleNumber: null,
      tenure: 'Unknown',
      leaseYearsRemaining: null,
      mortgages: [],
      restrictiveCovenants: [],
      easements: [],
      lastRegistrationDate: null,
      dataSource: 'Land Registry Business Gateway (paid £7/lookup) — not enabled',
    },

    priceHistory: transactions.map((t) => ({
      date: t.transactionDate,
      price: t.pricePaid,
      propertyType: t.propertyType,
      tenure: t.estateType,
    })),
    priceGrowth1yr: priceSummary.growth1yr || null,
    priceGrowth5yr: priceSummary.growth5yr || null,
    lastSalePrice: lastPrice ?? null,
    lastSaleDate: priceSummary.lastSaleDate || null,

    planningConstraints: {
      conservationArea: {
        present: conservation.length > 0,
        name: conservation[0]?.name || null,
      },
      listedBuilding: {
        present: listed.length > 0,
        grade: listed[0]?.grade || null,
      },
      greenBelt: (planning['green-belt'] || []).length > 0,
      articleFourDirection: {
        present: article4.length > 0,
        description: article4[0]?.notes || article4[0]?.name || null,
      },
      treePreservationOrder: (planning['tree-preservation-zone'] || []).length > 0,
      brownfieldLand: (planning['brownfield-land'] || []).length > 0,
      nationalPark: {
        present: (planning['national-park'] || []).length > 0,
        name: (planning['national-park'] || [])[0]?.name || null,
      },
      aonb: {
        present: (planning['area-of-outstanding-natural-beauty'] || []).length > 0,
        name: (planning['area-of-outstanding-natural-beauty'] || [])[0]?.name || null,
      },
      ancientWoodland: (planning['ancient-woodland'] || []).length > 0,
      scheduledMonument: (planning['scheduled-monument'] || []).length > 0,
      worldHeritageSite: (planning['world-heritage-site'] || []).length > 0,
      localPlanningAuthority: lpaName,
      planningNotes,
    },

    floodRisk: {
      riverAndSea: flood.riverAndSea || 'Unknown',
      surfaceWater: flood.surfaceWater || 'Unknown',
      groundwater: flood.historicFlooding ? 'Medium' : 'Unknown',
      reservoirRisk: Boolean(flood.reservoirRisk),
      floodInsuranceImplication: insuranceNote(flood),
    },

    groundRisk: {
      stabilityRating: 'See BGS GeoIndex',
      hazardTypes: [],
      radonBand: 'See UK Radon map',
      miningRisk: false,
      links: rawData?.environmentalLinks
        ? [
            rawData.environmentalLinks.radon,
            rawData.environmentalLinks.groundStability,
            rawData.environmentalLinks.mining,
          ]
        : [],
    },

    epcData: buildEpcSummary(rawData?.epcMatch, rawData?.epc),

    marketContext: buildMarketContext({
      postcodeData: rawData?.postcode,
      lpaName,
      imd: rawData?.imd,
      onsRental: rawData?.onsRental,
    }),

    planningHistoryLink: rawData?.environmentalLinks?.planningHistory || null,

    flags,

    keyRisks: pickKeyItems(flags, ['critical', 'warning'], 3),
    keyOpportunities: pickKeyItems(flags, ['ok'], 3),

    aiSummary: summary,

    recommendedNextSteps: buildPropertyNextSteps({ listed, conservation, flood, transactions }),

    dataQuality: {
      apisQueried: meta.apisQueried || 7,
      apisSuccessful: meta.apisSuccessful || 7,
      apisFailed: meta.apisFailed || [],
      dataCompleteness:
        rawData?.epcMatch && rawData?.imd
          ? 'High'
          : rawData?.epcMatch || rawData?.imd
          ? 'Medium'
          : 'Low',
    },
  };

  // IMD flag
  if (rawData?.imd?.decile != null) {
    const d = rawData.imd.decile;
    if (d <= 2) {
      report.flags.unshift({
        severity: 'warning',
        category: 'market',
        title: `IMD decile ${d} — among the most deprived 20% of areas in England`,
        detail: 'High deprivation can affect demand profile and rental tenant mix. Verify against demand evidence locally.',
      });
      report.keyRisks = pickKeyItems(report.flags, ['critical', 'warning'], 3);
    } else if (d >= 8) {
      report.flags.push({
        severity: 'ok',
        category: 'market',
        title: `IMD decile ${d} — among the least deprived 20% of areas in England`,
        detail: 'Low-deprivation areas typically support higher rents and lower void risk.',
      });
      report.keyOpportunities = pickKeyItems(report.flags, ['ok'], 3);
    }
  }

  // EPC flag — sub-D ratings carry MEES rental letting risk
  if (rawData?.epcMatch?.currentRating) {
    const r = String(rawData.epcMatch.currentRating).toUpperCase();
    if (['F', 'G'].includes(r)) {
      report.flags.unshift({
        severity: 'critical',
        category: 'legal',
        title: `EPC rating ${r} — below MEES minimum`,
        detail:
          'Properties below EPC E cannot legally be let on a new tenancy in England (subject to exemptions). Required upgrade before letting.',
      });
      report.riskScore = Math.min(10, report.riskScore + 1);
    } else if (r === 'E') {
      report.flags.push({
        severity: 'warning',
        category: 'legal',
        title: 'EPC rating E — at MEES minimum',
        detail:
          'Currently meets the MEES floor for new tenancies, but the floor is expected to rise to C by 2028 for new lets. Plan upgrades.',
      });
    }
  }

  return report;
}

function buildEpcSummary(epcMatch, epcResult) {
  if (!epcResult) {
    return {
      currentRating: 'Not configured',
      currentScore: null,
      potentialRating: 'Not configured',
      potentialScore: null,
      lodgedDate: null,
      keyRecommendations: [
        'Configure EPC_EMAIL and EPC_API_KEY (free at epc.opendatacommunities.org) to enable EPC lookup.',
      ],
    };
  }
  if (epcResult.configured === false) {
    return {
      currentRating: 'Not configured',
      currentScore: null,
      potentialRating: 'Not configured',
      potentialScore: null,
      lodgedDate: null,
      keyRecommendations: [
        epcResult.note || 'Configure EPC_EMAIL and EPC_API_KEY to enable EPC lookup.',
      ],
    };
  }
  if (!epcMatch) {
    return {
      currentRating: 'No record',
      currentScore: null,
      potentialRating: 'No record',
      potentialScore: null,
      lodgedDate: null,
      keyRecommendations: [
        `Searched the EPC Register for postcode but found no matching record. ${
          epcResult.count ? `${epcResult.count} other certificates exist nearby.` : ''
        }`.trim(),
      ],
    };
  }
  return {
    currentRating: epcMatch.currentRating || 'Unknown',
    currentScore: epcMatch.currentScore,
    potentialRating: epcMatch.potentialRating || 'Unknown',
    potentialScore: epcMatch.potentialScore,
    lodgedDate: epcMatch.lodgementDate,
    propertyType: epcMatch.propertyType,
    builtForm: epcMatch.builtForm,
    totalFloorArea: epcMatch.totalFloorArea,
    mainHeating: epcMatch.mainHeating,
    address: epcMatch.address,
    keyRecommendations: [],
  };
}

function buildMarketContext({ postcodeData, lpaName, imd, onsRental }) {
  const ctx = {
    localAuthority: postcodeData?.adminDistrict || lpaName || 'Unknown',
    avgHouseholdIncome: 'Unknown',
    populationGrowthTrend: 'Unknown',
    employmentRate: 'Unknown',
    deprivationDecile: imd?.decile ?? null,
    deprivationScore: imd?.score ?? null,
    avgRentalYield: 'See market comparables tool',
    avgRent: 'See market comparables tool',
    demandRating: 'Unknown',
  };

  if (onsRental?.indexValue != null) {
    ctx.ukRentalIndex = {
      value: onsRental.indexValue,
      time: onsRental.time,
      area: onsRental.area || 'United Kingdom',
      sourceUrl: onsRental.sourceUrl,
    };
  }

  if (imd?.decile != null) {
    ctx.deprivationContext =
      imd.decile <= 2
        ? 'Most deprived 20% nationally'
        : imd.decile <= 4
        ? 'Below median deprivation'
        : imd.decile <= 6
        ? 'Around national median'
        : imd.decile <= 8
        ? 'Above median (less deprived)'
        : 'Least deprived 20% nationally';
  }

  return ctx;
}

export function buildCompanyFallbackReport({ companyInput, rawData }) {
  const profile = rawData?.profile || {};
  const officersList = rawData?.officers?.items || [];
  const pscList = rawData?.psc?.items || [];
  const charges = rawData?.charges || {};
  const insolvency = rawData?.insolvency || null;

  const flags = [];
  let riskScore = 3;

  const status = profile.company_status || 'Unknown';
  if (['dissolved', 'liquidation', 'administration', 'receivership'].includes(status)) {
    riskScore += 5;
    flags.push({
      severity: 'critical',
      category: 'compliance',
      title: `Company status: ${status}`,
      detail: 'Company is not in normal active trading status. Do not enter a JV without urgent legal review.',
    });
  } else if (status === 'active') {
    flags.push({
      severity: 'ok',
      category: 'compliance',
      title: 'Company is active',
      detail: 'Companies House lists the company as active.',
    });
  }

  const incDate = profile.date_of_creation;
  const tradingAge = incDate ? yearsMonthsBetween(incDate, new Date()) : null;
  if (incDate) {
    const ageYears = (new Date() - new Date(incDate)) / (1000 * 60 * 60 * 24 * 365.25);
    if (ageYears < 2) {
      riskScore += 1;
      flags.push({
        severity: 'warning',
        category: 'compliance',
        title: `Trading for under 2 years (incorporated ${incDate})`,
        detail: 'Short track record — diligence the directors\' previous companies for context.',
      });
    } else if (ageYears > 10) {
      flags.push({
        severity: 'ok',
        category: 'compliance',
        title: `Established over ${Math.floor(ageYears)} years`,
        detail: 'Long trading history is a positive signal.',
      });
    }
  }

  const accounts = profile.accounts || {};
  const overdue = accounts.overdue === true;
  if (overdue) {
    riskScore += 2;
    flags.push({
      severity: 'critical',
      category: 'financial',
      title: 'Accounts are overdue',
      detail: 'Failure to file on time can indicate financial or operational distress.',
    });
  }

  const cs = profile.confirmation_statement || {};
  if (cs.overdue) {
    riskScore += 1;
    flags.push({
      severity: 'warning',
      category: 'compliance',
      title: 'Confirmation statement overdue',
      detail: 'A late confirmation statement signals a lapse in basic compliance.',
    });
  }

  const chargeItems = charges.items || [];
  const outstanding = chargeItems.filter((c) => c.status === 'outstanding').length;
  if (outstanding >= 3) {
    riskScore += 2;
    flags.push({
      severity: 'warning',
      category: 'financial',
      title: `${outstanding} outstanding charges registered`,
      detail: 'Multiple lender charges suggest leverage. Review who has security and over what.',
    });
  } else if (outstanding > 0) {
    flags.push({
      severity: 'warning',
      category: 'financial',
      title: `${outstanding} outstanding charge${outstanding === 1 ? '' : 's'}`,
      detail: 'Existing security interest registered — review the charge document for terms.',
    });
  }

  const insolvencyCases = insolvency?.cases || [];
  if (insolvencyCases.length > 0) {
    riskScore += 4;
    flags.push({
      severity: 'critical',
      category: 'legal',
      title: `${insolvencyCases.length} insolvency proceeding(s) on file`,
      detail: 'Insolvency history is a serious red flag for any JV partnership.',
    });
  }

  const officers = officersList.map((o) => ({
    name: o.name,
    role: o.officer_role
      ? o.officer_role.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
      : 'Unknown',
    appointedDate: o.appointed_on || null,
    resignedDate: o.resigned_on || null,
    nationality: o.nationality || 'Unknown',
    status: o.resigned_on ? 'Resigned' : 'Current',
    otherCompanies: null,
    dissolvingsCompanies: null,
    disqualified: false,
  }));

  const psc = pscList.map((p) => ({
    name: p.name || 'Unknown',
    type: p.kind?.includes('individual') ? 'individual' : 'corporate entity',
    ownershipBand: extractOwnershipBand(p.natures_of_control || []),
    nationality: p.nationality || 'Unknown',
    countryOfResidence: p.country_of_residence || 'Unknown',
    natureOfControl: p.natures_of_control || [],
    appointedDate: p.notified_on || null,
    riskFlag: p.ceased_on ? `Ceased on ${p.ceased_on}` : null,
  }));

  const ownershipStructureRisk =
    psc.length === 0
      ? 'Opaque'
      : psc.length === 1
      ? 'Simple'
      : psc.length <= 3
      ? 'Moderate'
      : 'Complex';

  riskScore = Math.min(10, Math.max(1, riskScore));
  const riskLevel =
    riskScore >= 8 ? 'critical' : riskScore >= 6 ? 'high' : riskScore >= 4 ? 'medium' : 'low';

  return {
    reportType: 'company',
    queryInput: companyInput,
    generatedAt: new Date().toISOString(),
    riskScore,
    riskLevel,
    riskSummary: buildOneLineSummary(riskLevel, flags),

    companyProfile: {
      officialName: profile.company_name || companyInput,
      companyNumber: profile.company_number || 'Unknown',
      companyType: profile.type || 'Unknown',
      status: status,
      incorporatedDate: incDate || 'Unknown',
      tradingAge,
      registeredAddress: formatAddress(profile.registered_office_address),
      sicCodes: (profile.sic_codes || []).map((c) => ({
        code: c,
        description: 'See Companies House for full description',
      })),
    },

    ownership: {
      personsOfSignificantControl: psc,
      ownershipStructureRisk,
    },

    directors: officers,

    financialHealth: {
      lastAccountsDate: accounts.last_accounts?.made_up_to || null,
      accountsFiledOnTime: overdue ? false : null,
      accountsType: accounts.last_accounts?.type || 'Unknown',
      nextAccountsDue: accounts.next_due || null,
      confirmationStatementDue: cs.next_due || null,
      confirmationStatementOverdue: Boolean(cs.overdue),
      chargesTotal: charges.total_count || chargeItems.length,
      chargesOutstanding: outstanding,
      chargesDetails: chargeItems.map((c) => ({
        lender:
          c.persons_entitled?.[0]?.name ||
          c.particulars?.contains_floating_charge
            ? '(see filing)'
            : 'Unknown',
        status: c.status || 'unknown',
        created: c.created_on || null,
      })),
      insolvencyHistory: insolvencyCases.length > 0,
      insolvencyDetails: insolvencyCases.length
        ? `${insolvencyCases.length} case(s) on file — see Companies House insolvency record.`
        : null,
    },

    vatStatus: {
      vatRegistered: null,
      vatNumber: null,
      vatStatus: 'Unknown',
      vatRegisteredName: null,
      vatAddress: null,
    },

    flags,

    keyRisks: pickKeyItems(flags, ['critical', 'warning'], 3),
    keyPositives: pickKeyItems(flags, ['ok'], 3),

    aiSummary: buildCompanySummary({ profile, status, tradingAge, outstanding, insolvencyCases, psc, riskLevel }),

    recommendedDueDiligence: buildCompanyNextSteps({ outstanding, insolvencyCases, psc, status }),

    dataQuality: {
      apisQueried: 6,
      apisSuccessful: rawData?.errors?.length ? 6 - rawData.errors.length : 6,
      dataCompleteness: psc.length > 0 && officers.length > 0 ? 'Medium' : 'Low',
    },
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function listToText(map) {
  const present = Object.entries(map).filter(([, n]) => n > 0);
  if (present.length === 0) return 'No notable planning constraints detected at this point.';
  return `${present.map(([k]) => k).join(', ')} present at this location.`;
}

function buildOneLineSummary(riskLevel, flags) {
  const criticals = flags.filter((f) => f.severity === 'critical');
  if (criticals.length > 0) {
    return `${capitalise(riskLevel)} risk — ${criticals[0].title.toLowerCase()}.`;
  }
  const warnings = flags.filter((f) => f.severity === 'warning');
  if (warnings.length > 0) {
    return `${capitalise(riskLevel)} risk — ${warnings.length} warning${
      warnings.length === 1 ? '' : 's'
    } raised.`;
  }
  return `${capitalise(riskLevel)} risk — no major issues identified from open data.`;
}

function buildPropertySummary({
  address,
  postcode,
  riskLevel,
  listed,
  conservation,
  flood,
  priceSummary,
  transactions,
  lpaName,
}) {
  const parts = [];
  parts.push(
    `Open-data analysis of ${address || postcode} returns an overall ${riskLevel} risk profile based on the constraints visible at this stage.`,
  );

  const constraints = [];
  if (listed.length) constraints.push(`a listed building${listed[0]?.grade ? ` (Grade ${listed[0].grade})` : ''}`);
  if (conservation.length) constraints.push(`a conservation area`);
  if (String(flood.riverAndSea || '').toLowerCase().includes('zone 3')) {
    constraints.push('high-probability river/sea flood risk');
  } else if (String(flood.riverAndSea || '').toLowerCase().includes('zone 2')) {
    constraints.push('medium-probability river/sea flood risk');
  }

  if (constraints.length > 0) {
    parts.push(
      `The most material findings are ${constraints.join(', ')} — these should drive the legal and planning workstream of any acquisition.`,
    );
  } else {
    parts.push(
      'No critical planning or flood constraints were detected from the public datasets queried.',
    );
  }

  if (priceSummary.lastSalePrice) {
    const last = formatGBP(priceSummary.lastSalePrice);
    const date = priceSummary.lastSaleDate || 'unknown date';
    parts.push(`The most recent recorded transaction was ${last} on ${date}.`);
  } else if (transactions.length === 0) {
    parts.push('No Price Paid history was returned for this postcode — request comparable data from agents directly.');
  }

  parts.push(
    `Recommended next steps: commission a full Land Registry Title Register, instruct an EPC and structural survey, and engage with ${
      lpaName || 'the local planning authority'
    } to confirm the constraint picture.`,
  );

  parts.push(
    'Note: this report was generated from open data without AI synthesis. Configure ANTHROPIC_API_KEY on the backend for full senior-analyst commentary.',
  );

  return parts.join(' ');
}

function buildCompanySummary({ profile, status, tradingAge, outstanding, insolvencyCases, psc, riskLevel }) {
  const parts = [];
  parts.push(
    `${profile.company_name || 'This company'} (${profile.company_number || 'unknown number'}) is currently ${status}${
      tradingAge ? `, having traded for ${tradingAge}` : ''
    }. Overall JV-readiness on this snapshot reads as ${riskLevel}.`,
  );

  if (insolvencyCases.length) {
    parts.push(
      `The most material concern is ${insolvencyCases.length} insolvency proceeding(s) on file — until that is fully understood, a JV is not advisable.`,
    );
  } else if (outstanding >= 3) {
    parts.push(
      `Multiple outstanding charges (${outstanding}) indicate meaningful leverage — review each charge document.`,
    );
  } else if (status === 'active' && (psc.length === 1 || psc.length === 2)) {
    parts.push('Ownership is concentrated and reasonably transparent, which simplifies JV governance.');
  }

  parts.push(
    'Before progressing, request 3 years of full statutory accounts, references from past JV partners, and a directors\' personal track record check.',
  );

  parts.push(
    'Note: this report was generated from Companies House data without AI synthesis. Configure ANTHROPIC_API_KEY on the backend for fuller commentary.',
  );

  return parts.join(' ');
}

function buildPropertyNextSteps({ listed, conservation, flood, transactions }) {
  const steps = [
    'Order a full HM Land Registry Title Register (£7) to verify owner, tenure, mortgages, restrictive covenants and easements.',
    'Instruct an EPC review and a RICS Level-2 or Level-3 building survey appropriate to the asset.',
  ];
  if (listed.length || conservation.length) {
    steps.push(
      'Engage a heritage consultant — pre-application advice from the LPA on any planned changes is strongly advised.',
    );
  }
  if (String(flood.riverAndSea || '').toLowerCase().includes('zone')) {
    steps.push(
      'Obtain a flood-specific insurance quote (e.g. Flood Re) and commission a Flood Risk Assessment if any redevelopment is planned.',
    );
  }
  if (transactions.length === 0) {
    steps.push('Request comparable evidence from local agents — the postcode returned no Price Paid history.');
  }
  steps.push(
    'Validate market rent and yield against the local authority average via Rightmove / Zoopla and at least one agent comparable.',
  );
  return steps;
}

function buildCompanyNextSteps({ outstanding, insolvencyCases, psc, status }) {
  const steps = [
    'Request 3 years of full statutory accounts (or management accounts if too recent for filing).',
    'Run a directors\' track record check via Companies House — list every other current and dissolved appointment.',
  ];
  if (outstanding > 0) {
    steps.push(`Inspect each of the ${outstanding} outstanding charge documents — confirm lender, security, and ranking.`);
  }
  if (insolvencyCases.length) {
    steps.push('Request a full explanation in writing of the insolvency proceedings on file — and references covering the period since.');
  }
  if (psc.length === 0 || psc.length > 4) {
    steps.push(
      psc.length === 0
        ? 'PSC register is empty or unclear — request a written ownership chart, including any offshore entities.'
        : 'Multiple PSCs — request a written shareholders\' agreement and confirm voting/decision-making authority.',
    );
  }
  if (status !== 'active') {
    steps.push('Do not progress until the abnormal company status is fully resolved or explained.');
  }
  steps.push('Take up two referee calls from previous JV partners or counterparties before signing any term sheet.');
  return steps;
}

function pickKeyItems(flags, severities, n) {
  return flags
    .filter((f) => severities.includes(f.severity))
    .slice(0, n)
    .map((f) => f.title);
}

function insuranceNote(flood) {
  const fz = String(flood.riverAndSea || '').toLowerCase();
  if (fz.includes('zone 3')) {
    return 'High-probability flood zone — insurance available but premiums and excesses likely elevated. Flood Re may apply for residential.';
  }
  if (fz.includes('zone 2')) {
    return 'Medium-probability flood zone — insurance generally available; expect mild premium loading.';
  }
  if ((flood.surfaceWater || '').toLowerCase() === 'high') {
    return 'High surface-water risk may attract elevated premiums even if river/sea risk is low.';
  }
  return 'No material flood-driven insurance complication expected from this dataset alone.';
}

function extractOwnershipBand(natures = []) {
  for (const n of natures) {
    if (/75-to-100/.test(n)) return '75%+';
    if (/50-to-75/.test(n)) return '50-75%';
    if (/25-to-50/.test(n)) return '25-50%';
  }
  return 'Unknown';
}

function formatAddress(addr) {
  if (!addr || typeof addr !== 'object') return 'Unknown';
  return [
    addr.premises,
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ]
    .filter(Boolean)
    .join(', ');
}

function yearsMonthsBetween(fromIso, to) {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${years} year${years === 1 ? '' : 's'} ${months} month${months === 1 ? '' : 's'}`;
}

function capitalise(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatGBP(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value);
}

// UK SIC 2007 code → description lookup.
//
// This is a curated list focused on the codes most commonly seen for
// UK property, real estate, construction, finance, professional services,
// and JV-relevant sectors. Codes outside this list fall back to a generic
// description with a link to Companies House for the full list.
//
// Source: Companies House SIC 2007 Standard Industrial Classification.

const SIC = {
  // 41 – Construction of buildings
  '41100': 'Development of building projects',
  '41201': 'Construction of commercial buildings',
  '41202': 'Construction of domestic buildings',
  // 42 – Civil engineering
  '42110': 'Construction of roads and motorways',
  '42120': 'Construction of railways and underground railways',
  '42130': 'Construction of bridges and tunnels',
  '42210': 'Construction of utility projects for fluids',
  '42220': 'Construction of utility projects for electricity and telecommunications',
  '42910': 'Construction of water projects',
  '42990': 'Construction of other civil engineering projects n.e.c.',
  // 43 – Specialised construction activities
  '43110': 'Demolition',
  '43120': 'Site preparation',
  '43130': 'Test drilling and boring',
  '43210': 'Electrical installation',
  '43220': 'Plumbing, heat and air-conditioning installation',
  '43290': 'Other construction installation',
  '43310': 'Plastering',
  '43320': 'Joinery installation',
  '43330': 'Floor and wall covering',
  '43341': 'Painting',
  '43342': 'Glazing',
  '43390': 'Other building completion and finishing',
  '43910': 'Roofing activities',
  '43991': 'Scaffold erection',
  '43999': 'Other specialised construction activities n.e.c.',

  // 47 – Retail trade (selected)
  '47110': 'Retail sale in non-specialised stores with food, beverages or tobacco predominating',
  '47190': 'Other retail sale in non-specialised stores',

  // 55 – Accommodation
  '55100': 'Hotels and similar accommodation',
  '55201': 'Holiday centres and villages',
  '55202': 'Youth hostels',
  '55209': 'Other holiday and other collective accommodation',
  '55300': 'Camping grounds, recreational vehicle parks and trailer parks',
  '55900': 'Other accommodation',

  // 56 – Food & beverage service
  '56101': 'Licensed restaurants',
  '56102': 'Unlicensed restaurants and cafes',
  '56103': 'Take-away food shops and mobile food stands',
  '56210': 'Event catering activities',
  '56290': 'Other food service activities',
  '56301': 'Licensed clubs',
  '56302': 'Public houses and bars',

  // 64 – Financial service activities
  '64110': 'Central banking',
  '64191': 'Banks',
  '64192': 'Building societies',
  '64201': 'Activities of agricultural holding companies',
  '64202': 'Activities of production holding companies',
  '64203': 'Activities of construction holding companies',
  '64204': 'Activities of distribution holding companies',
  '64205': 'Activities of financial services holding companies',
  '64209': 'Activities of other holding companies n.e.c.',
  '64301': 'Activities of investment trusts',
  '64302': 'Activities of unit trusts',
  '64303': 'Activities of venture and development capital companies',
  '64304': 'Activities of open-ended investment companies',
  '64305': 'Activities of property unit trusts',
  '64306': 'Activities of real estate investment trusts',
  '64910': 'Financial leasing',
  '64921': 'Credit granting by non-deposit taking finance houses and other specialist consumer credit grantors',
  '64922': 'Activities of mortgage finance companies',
  '64929': 'Other credit granting n.e.c.',
  '64991': 'Security dealing on own account',
  '64992': 'Factoring',
  '64999': 'Financial intermediation not elsewhere classified',

  // 65 – Insurance
  '65110': 'Life insurance',
  '65120': 'Non-life insurance',
  '65201': 'Life reinsurance',
  '65202': 'Non-life reinsurance',
  '65300': 'Pension funding',

  // 66 – Activities auxiliary to financial services
  '66110': 'Administration of financial markets',
  '66120': 'Security and commodity contracts dealing activities',
  '66190': 'Activities auxiliary to financial services, except insurance and pension funding',
  '66210': 'Risk and damage evaluation',
  '66220': 'Activities of insurance agents and brokers',
  '66290': 'Other activities auxiliary to insurance and pension funding',
  '66300': 'Fund management activities',

  // 68 – Real estate activities (the property sector core)
  '68100': 'Buying and selling of own real estate',
  '68201': 'Renting and operating of Housing Association real estate',
  '68202': 'Letting and operating of conference and exhibition centres',
  '68203': 'Other letting and operating of own or leased real estate',
  '68209': 'Other letting and operating of own or leased real estate',
  '68310': 'Real estate agencies',
  '68320': 'Management of real estate on a fee or contract basis',

  // 69 – Legal and accounting
  '69101': 'Barristers at law',
  '69102': 'Solicitors',
  '69109': 'Activities of patent and copyright agents; other legal activities n.e.c.',
  '69201': 'Accounting and auditing activities',
  '69202': 'Bookkeeping activities',
  '69203': 'Tax consultancy',

  // 70 – Activities of head offices; management consultancy
  '70100': 'Activities of head offices',
  '70210': 'Public relations and communication activities',
  '70221': 'Financial management (of companies and enterprises)',
  '70229': 'Management consultancy activities other than financial management',

  // 71 – Architectural and engineering activities
  '71111': 'Architectural activities',
  '71112': 'Urban planning and landscape architectural activities',
  '71121': 'Engineering design activities for industrial process and production',
  '71122': 'Engineering related scientific and technical consulting activities',
  '71129': 'Other engineering activities',
  '71200': 'Technical testing and analysis',

  // 73 – Advertising and market research
  '73110': 'Advertising agencies',
  '73120': 'Media representation services',
  '73200': 'Market research and public opinion polling',

  // 74 – Other professional, scientific and technical activities
  '74100': 'Specialised design activities',
  '74201': 'Portrait photographic activities',
  '74202': 'Other specialist photography',
  '74203': 'Film processing',
  '74209': 'Other photographic activities',
  '74300': 'Translation and interpretation activities',
  '74901': 'Environmental consulting activities',
  '74902': 'Quantity surveying activities',
  '74909': 'Other professional, scientific and technical activities',
  '74990': 'Non-trading company',

  // 77 – Rental and leasing activities
  '77110': 'Renting and leasing of cars and light motor vehicles',
  '77120': 'Renting and leasing of trucks and other heavy vehicles',
  '77310': 'Renting and leasing of agricultural machinery and equipment',
  '77320': 'Renting and leasing of construction and civil engineering machinery and equipment',
  '77330': 'Renting and leasing of office machinery and equipment (including computers)',
  '77390': 'Renting and leasing of other machinery, equipment and tangible goods',

  // 81 – Services to buildings and landscape
  '81100': 'Combined facilities support activities',
  '81210': 'General cleaning of buildings',
  '81221': 'Window cleaning services',
  '81222': 'Specialised cleaning services for reservoirs and tanks',
  '81229': 'Other building and industrial cleaning activities',
  '81291': 'Disinfecting and exterminating services',
  '81299': 'Other cleaning services',
  '81300': 'Landscape service activities',

  // 82 – Office administrative and support
  '82110': 'Combined office administrative service activities',
  '82190': 'Photocopying, document preparation and other specialised office support activities',
  '82200': 'Activities of call centres',
  '82301': 'Activities of exhibition and fair organisers',
  '82302': 'Activities of conference organisers',
  '82911': 'Activities of collection agencies',
  '82912': 'Activities of credit bureaus',
  '82920': 'Packaging activities',
  '82990': 'Other business support service activities n.e.c.',

  // 84 – Public administration
  '84110': 'General public administration activities',

  // 85 – Education (selected)
  '85100': 'Pre-primary education',
  '85200': 'Primary education',
  '85310': 'General secondary education',
  '85320': 'Technical and vocational secondary education',
  '85410': 'Post-secondary non-tertiary education',
  '85421': 'First-degree level higher education',
  '85422': 'Post-graduate level higher education',
  '85510': 'Sports and recreation education',
  '85590': 'Other education n.e.c.',

  // 87 – Residential care
  '87100': 'Residential nursing care activities',
  '87200': 'Residential care activities for learning disabilities, mental health and substance abuse',
  '87300': 'Residential care activities for the elderly and disabled',
  '87900': 'Other residential care activities',

  // 88 – Social work
  '88100': 'Social work activities without accommodation for the elderly and disabled',
  '88910': 'Child day-care activities',
  '88990': 'Other social work activities without accommodation n.e.c.',

  // 96 – Other personal service activities
  '96090': 'Other service activities n.e.c.',

  // 99 – Activities of extraterritorial / dormant
  '98000': 'Residents property management',
  '99000': 'Activities of extraterritorial organisations and bodies',
  '99999': 'Dormant company',
};

export function describeSic(code) {
  if (!code) return null;
  const key = String(code).trim();
  if (SIC[key]) return SIC[key];
  // Fallback: indicate the broad division by first 2 digits
  const division = key.slice(0, 2);
  const divisionMap = {
    '01': 'Agriculture, hunting and related service activities',
    '02': 'Forestry and logging',
    '03': 'Fishing and aquaculture',
    10: 'Manufacture of food products',
    11: 'Manufacture of beverages',
    12: 'Manufacture of tobacco products',
    13: 'Manufacture of textiles',
    14: 'Manufacture of wearing apparel',
    15: 'Manufacture of leather and related products',
    16: 'Manufacture of wood products',
    17: 'Manufacture of paper products',
    18: 'Printing and reproduction',
    19: 'Manufacture of coke and refined petroleum',
    20: 'Manufacture of chemicals',
    21: 'Manufacture of pharmaceuticals',
    22: 'Manufacture of rubber and plastic',
    23: 'Manufacture of other non-metallic minerals',
    24: 'Manufacture of basic metals',
    25: 'Manufacture of fabricated metal products',
    26: 'Manufacture of computer, electronic and optical products',
    27: 'Manufacture of electrical equipment',
    28: 'Manufacture of machinery and equipment',
    29: 'Manufacture of motor vehicles',
    30: 'Manufacture of other transport equipment',
    31: 'Manufacture of furniture',
    32: 'Other manufacturing',
    33: 'Repair and installation of machinery',
    35: 'Electricity, gas, steam and air conditioning supply',
    36: 'Water collection and supply',
    37: 'Sewerage',
    38: 'Waste collection, treatment and disposal',
    39: 'Remediation activities',
    41: 'Construction of buildings',
    42: 'Civil engineering',
    43: 'Specialised construction activities',
    45: 'Wholesale and retail trade and repair of motor vehicles',
    46: 'Wholesale trade',
    47: 'Retail trade',
    49: 'Land transport and transport via pipelines',
    50: 'Water transport',
    51: 'Air transport',
    52: 'Warehousing and support activities for transportation',
    53: 'Postal and courier activities',
    55: 'Accommodation',
    56: 'Food and beverage service activities',
    58: 'Publishing activities',
    59: 'Motion picture and music publishing',
    60: 'Programming and broadcasting activities',
    61: 'Telecommunications',
    62: 'Computer programming, consultancy and related',
    63: 'Information service activities',
    64: 'Financial service activities',
    65: 'Insurance, reinsurance and pension funding',
    66: 'Activities auxiliary to financial services',
    68: 'Real estate activities',
    69: 'Legal and accounting activities',
    70: 'Activities of head offices and management consultancy',
    71: 'Architectural and engineering activities',
    72: 'Scientific research and development',
    73: 'Advertising and market research',
    74: 'Other professional, scientific and technical activities',
    75: 'Veterinary activities',
    77: 'Rental and leasing activities',
    78: 'Employment activities',
    79: 'Travel agency, tour operator and other reservation services',
    80: 'Security and investigation activities',
    81: 'Services to buildings and landscape activities',
    82: 'Office administrative and support activities',
    84: 'Public administration and defence',
    85: 'Education',
    86: 'Human health activities',
    87: 'Residential care activities',
    88: 'Social work activities',
    90: 'Creative, arts and entertainment activities',
    91: 'Libraries, archives, museums and similar',
    92: 'Gambling and betting activities',
    93: 'Sports activities and amusement and recreation activities',
    94: 'Activities of membership organisations',
    95: 'Repair of computers and personal/household goods',
    96: 'Other personal service activities',
    97: 'Activities of households as employers',
    98: 'Undifferentiated goods/services-producing activities of private households',
    99: 'Activities of extraterritorial organisations and bodies',
  };
  return divisionMap[division]
    ? `${divisionMap[division]} (specific code ${key} — see Companies House for full description)`
    : `SIC ${key} (see Companies House for description)`;
}

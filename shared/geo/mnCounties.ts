// Minnesota county reference data (87 counties).
// Generated from tidy-MN/mnreference (MIT): county_schsac_chbs_and_urban_code.csv (MDH SCHSAC regions,
// NCHS 2013 urban-rural codes) and county_populations_acs_2018_2022.csv (ACS 2018-2022 5-year estimates).
// fieldDistrict follows MDH's Field Services Epidemiologist districts (health.state.mn.us/about/org/idepc/epis.html),
// where South Central + Southwest form one "South" district.

export type SchsacRegion =
  | 'Central' | 'Metro' | 'Northeast' | 'Northwest' | 'South Central' | 'Southeast' | 'Southwest' | 'West Central'

export type FieldDistrict = 'Metro' | 'Northwest' | 'Northeast' | 'West Central' | 'Central' | 'South' | 'Southeast'

export interface CountyPopulation {
  total: number
  under6mo: number
  age6moTo4: number
  age5to17: number
  age18to49: number
  age50to64: number
  age65plus: number
}

export interface MnCounty {
  fips: string
  name: string
  schsacRegion: SchsacRegion
  fieldDistrict: FieldDistrict
  urban: string
  urbanCode: number
  pop: CountyPopulation
}

export const MN_COUNTIES: MnCounty[] = [
  { fips: '27001', name: 'Aitkin', schsacRegion: 'Northeast', fieldDistrict: 'Northeast', urban: 'Noncore', urbanCode: 6,
    pop: { total: 15859, under6mo: 58, age6moTo4: 521, age5to17: 2004, age18to49: 4201, age50to64: 3745, age65plus: 5330 } },
  { fips: '27003', name: 'Anoka', schsacRegion: 'Metro', fieldDistrict: 'Metro', urban: 'Large fringe metro', urbanCode: 2,
    pop: { total: 363985, under6mo: 2190, age6moTo4: 19714, age5to17: 64175, age18to49: 150081, age50to64: 74532, age65plus: 53293 } },
  { fips: '27005', name: 'Becker', schsacRegion: 'West Central', fieldDistrict: 'West Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 35202, under6mo: 212, age6moTo4: 1904, age5to17: 6305, age18to49: 12174, age50to64: 7068, age65plus: 7539 } },
  { fips: '27007', name: 'Beltrami', schsacRegion: 'Northwest', fieldDistrict: 'Northwest', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 46274, under6mo: 304, age6moTo4: 2740, age5to17: 8459, age18to49: 19170, age50to64: 7903, age65plus: 7698 } },
  { fips: '27009', name: 'Benton', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Small metro', urbanCode: 4,
    pop: { total: 41300, under6mo: 259, age6moTo4: 2328, age5to17: 7974, age18to49: 17712, age50to64: 7398, age65plus: 5629 } },
  { fips: '27011', name: 'Big Stone', schsacRegion: 'Southwest', fieldDistrict: 'West Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 5161, under6mo: 30, age6moTo4: 267, age5to17: 798, age18to49: 1627, age50to64: 1110, age65plus: 1329 } },
  { fips: '27013', name: 'Blue Earth', schsacRegion: 'South Central', fieldDistrict: 'South', urban: 'Small metro', urbanCode: 4,
    pop: { total: 69022, under6mo: 358, age6moTo4: 3223, age5to17: 9968, age18to49: 35160, age50to64: 10327, age65plus: 9986 } },
  { fips: '27015', name: 'Brown', schsacRegion: 'South Central', fieldDistrict: 'South', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 25880, under6mo: 138, age6moTo4: 1245, age5to17: 4235, age18to49: 9569, age50to64: 5148, age65plus: 5545 } },
  { fips: '27017', name: 'Carlton', schsacRegion: 'Northeast', fieldDistrict: 'Northeast', urban: 'Medium metro', urbanCode: 3,
    pop: { total: 36362, under6mo: 184, age6moTo4: 1653, age5to17: 6185, age18to49: 14196, age50to64: 7650, age65plus: 6494 } },
  { fips: '27019', name: 'Carver', schsacRegion: 'Metro', fieldDistrict: 'Metro', urban: 'Large fringe metro', urbanCode: 2,
    pop: { total: 107216, under6mo: 652, age6moTo4: 5863, age5to17: 21185, age18to49: 43387, age50to64: 21976, age65plus: 14153 } },
  { fips: '27021', name: 'Cass', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 30288, under6mo: 149, age6moTo4: 1339, age5to17: 4770, age18to49: 9259, age50to64: 6768, age65plus: 8003 } },
  { fips: '27023', name: 'Chippewa', schsacRegion: 'Southwest', fieldDistrict: 'West Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 12466, under6mo: 80, age6moTo4: 715, age5to17: 2115, age18to49: 4465, age50to64: 2386, age65plus: 2705 } },
  { fips: '27025', name: 'Chisago', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Large fringe metro', urbanCode: 2,
    pop: { total: 56927, under6mo: 319, age6moTo4: 2870, age5to17: 9648, age18to49: 22567, age50to64: 12429, age65plus: 9094 } },
  { fips: '27027', name: 'Clay', schsacRegion: 'West Central', fieldDistrict: 'West Central', urban: 'Small metro', urbanCode: 4,
    pop: { total: 65307, under6mo: 440, age6moTo4: 3958, age5to17: 11720, age18to49: 30278, age50to64: 10081, age65plus: 8830 } },
  { fips: '27029', name: 'Clearwater', schsacRegion: 'Northwest', fieldDistrict: 'Northwest', urban: 'Noncore', urbanCode: 6,
    pop: { total: 8541, under6mo: 52, age6moTo4: 472, age5to17: 1603, age18to49: 2947, age50to64: 1699, age65plus: 1768 } },
  { fips: '27031', name: 'Cook', schsacRegion: 'Northeast', fieldDistrict: 'Northeast', urban: 'Noncore', urbanCode: 6,
    pop: { total: 5611, under6mo: 23, age6moTo4: 210, age5to17: 606, age18to49: 1837, age50to64: 1291, age65plus: 1644 } },
  { fips: '27033', name: 'Cottonwood', schsacRegion: 'Southwest', fieldDistrict: 'South', urban: 'Noncore', urbanCode: 6,
    pop: { total: 11481, under6mo: 74, age6moTo4: 669, age5to17: 2091, age18to49: 3930, age50to64: 2109, age65plus: 2608 } },
  { fips: '27035', name: 'Crow Wing', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 66558, under6mo: 338, age6moTo4: 3040, age5to17: 10557, age18to49: 23049, age50to64: 13946, age65plus: 15628 } },
  { fips: '27037', name: 'Dakota', schsacRegion: 'Metro', fieldDistrict: 'Metro', urban: 'Large fringe metro', urbanCode: 2,
    pop: { total: 439179, under6mo: 2692, age6moTo4: 24224, age5to17: 78613, age18to49: 180569, age50to64: 87243, age65plus: 65838 } },
  { fips: '27039', name: 'Dodge', schsacRegion: 'Southeast', fieldDistrict: 'Southeast', urban: 'Small metro', urbanCode: 4,
    pop: { total: 20893, under6mo: 128, age6moTo4: 1154, age5to17: 4019, age18to49: 8344, age50to64: 4079, age65plus: 3169 } },
  { fips: '27041', name: 'Douglas', schsacRegion: 'West Central', fieldDistrict: 'West Central', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 39081, under6mo: 223, age6moTo4: 2010, age5to17: 6152, age18to49: 13646, age50to64: 7817, age65plus: 9233 } },
  { fips: '27043', name: 'Faribault', schsacRegion: 'South Central', fieldDistrict: 'South', urban: 'Noncore', urbanCode: 6,
    pop: { total: 13931, under6mo: 72, age6moTo4: 650, age5to17: 2315, age18to49: 4780, age50to64: 2932, age65plus: 3182 } },
  { fips: '27045', name: 'Fillmore', schsacRegion: 'Southeast', fieldDistrict: 'Southeast', urban: 'Small metro', urbanCode: 4,
    pop: { total: 21251, under6mo: 125, age6moTo4: 1127, age5to17: 3947, age18to49: 7264, age50to64: 4229, age65plus: 4559 } },
  { fips: '27047', name: 'Freeborn', schsacRegion: 'Southeast', fieldDistrict: 'Southeast', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 30857, under6mo: 169, age6moTo4: 1517, age5to17: 5059, age18to49: 10715, age50to64: 6497, age65plus: 6900 } },
  { fips: '27049', name: 'Goodhue', schsacRegion: 'Southeast', fieldDistrict: 'Southeast', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 47697, under6mo: 264, age6moTo4: 2374, age5to17: 7899, age18to49: 17599, age50to64: 10053, age65plus: 9508 } },
  { fips: '27051', name: 'Grant', schsacRegion: 'West Central', fieldDistrict: 'West Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 6091, under6mo: 33, age6moTo4: 298, age5to17: 1064, age18to49: 2030, age50to64: 1241, age65plus: 1425 } },
  { fips: '27053', name: 'Hennepin', schsacRegion: 'Metro', fieldDistrict: 'Metro', urban: 'Large central metro', urbanCode: 1,
    pop: { total: 1270787, under6mo: 7696, age6moTo4: 69263, age5to17: 198206, age18to49: 574107, age50to64: 233996, age65plus: 187519 } },
  { fips: '27055', name: 'Houston', schsacRegion: 'Southeast', fieldDistrict: 'Southeast', urban: 'Small metro', urbanCode: 4,
    pop: { total: 18826, under6mo: 100, age6moTo4: 898, age5to17: 3096, age18to49: 6440, age50to64: 4126, age65plus: 4166 } },
  { fips: '27057', name: 'Hubbard', schsacRegion: 'Northwest', fieldDistrict: 'Northwest', urban: 'Noncore', urbanCode: 6,
    pop: { total: 21479, under6mo: 110, age6moTo4: 987, age5to17: 3432, age18to49: 6713, age50to64: 4704, age65plus: 5533 } },
  { fips: '27059', name: 'Isanti', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Large fringe metro', urbanCode: 2,
    pop: { total: 41257, under6mo: 236, age6moTo4: 2124, age5to17: 7223, age18to49: 16141, age50to64: 8664, age65plus: 6869 } },
  { fips: '27061', name: 'Itasca', schsacRegion: 'Northeast', fieldDistrict: 'Northeast', urban: 'Noncore', urbanCode: 6,
    pop: { total: 45054, under6mo: 219, age6moTo4: 1971, age5to17: 6976, age18to49: 15062, age50to64: 9722, age65plus: 11104 } },
  { fips: '27063', name: 'Jackson', schsacRegion: 'Southwest', fieldDistrict: 'South', urban: 'Noncore', urbanCode: 6,
    pop: { total: 9990, under6mo: 60, age6moTo4: 538, age5to17: 1559, age18to49: 3460, age50to64: 2119, age65plus: 2254 } },
  { fips: '27065', name: 'Kanabec', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 16145, under6mo: 84, age6moTo4: 756, age5to17: 2616, age18to49: 5670, age50to64: 3584, age65plus: 3435 } },
  { fips: '27067', name: 'Kandiyohi', schsacRegion: 'Southwest', fieldDistrict: 'West Central', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 43686, under6mo: 289, age6moTo4: 2604, age5to17: 7741, age18to49: 16133, age50to64: 8321, age65plus: 8598 } },
  { fips: '27069', name: 'Kittson', schsacRegion: 'Northwest', fieldDistrict: 'Northwest', urban: 'Noncore', urbanCode: 6,
    pop: { total: 4191, under6mo: 22, age6moTo4: 195, age5to17: 694, age18to49: 1297, age50to64: 882, age65plus: 1101 } },
  { fips: '27071', name: 'Koochiching', schsacRegion: 'Northeast', fieldDistrict: 'Northeast', urban: 'Noncore', urbanCode: 6,
    pop: { total: 12072, under6mo: 47, age6moTo4: 420, age5to17: 1671, age18to49: 3882, age50to64: 2790, age65plus: 3262 } },
  { fips: '27073', name: 'Lac qui Parle', schsacRegion: 'Southwest', fieldDistrict: 'West Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 6736, under6mo: 34, age6moTo4: 305, age5to17: 1072, age18to49: 2078, age50to64: 1416, age65plus: 1831 } },
  { fips: '27075', name: 'Lake', schsacRegion: 'Northeast', fieldDistrict: 'Northeast', urban: 'Noncore', urbanCode: 6,
    pop: { total: 10915, under6mo: 52, age6moTo4: 463, age5to17: 1560, age18to49: 3448, age50to64: 2453, age65plus: 2939 } },
  { fips: '27077', name: 'Lake of the Woods', schsacRegion: 'Northwest', fieldDistrict: 'Northwest', urban: 'Noncore', urbanCode: 6,
    pop: { total: 3786, under6mo: 21, age6moTo4: 187, age5to17: 494, age18to49: 1213, age50to64: 920, age65plus: 951 } },
  { fips: '27079', name: 'Le Sueur', schsacRegion: 'South Central', fieldDistrict: 'Southeast', urban: 'Large fringe metro', urbanCode: 2,
    pop: { total: 28795, under6mo: 169, age6moTo4: 1517, age5to17: 5037, age18to49: 10899, age50to64: 5966, age65plus: 5207 } },
  { fips: '27081', name: 'Lincoln', schsacRegion: 'Southwest', fieldDistrict: 'South', urban: 'Noncore', urbanCode: 6,
    pop: { total: 5630, under6mo: 34, age6moTo4: 303, age5to17: 981, age18to49: 1831, age50to64: 1111, age65plus: 1370 } },
  { fips: '27083', name: 'Lyon', schsacRegion: 'Southwest', fieldDistrict: 'South', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 25352, under6mo: 178, age6moTo4: 1605, age5to17: 4821, age18to49: 9828, age50to64: 4673, age65plus: 4247 } },
  { fips: '27085', name: 'McLeod', schsacRegion: 'South Central', fieldDistrict: 'South', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 36727, under6mo: 199, age6moTo4: 1790, age5to17: 6211, age18to49: 13985, age50to64: 7402, age65plus: 7140 } },
  { fips: '27087', name: 'Mahnomen', schsacRegion: 'Northwest', fieldDistrict: 'Northwest', urban: 'Noncore', urbanCode: 6,
    pop: { total: 5389, under6mo: 44, age6moTo4: 396, age5to17: 1251, age18to49: 1825, age50to64: 945, age65plus: 928 } },
  { fips: '27089', name: 'Marshall', schsacRegion: 'Northwest', fieldDistrict: 'Northwest', urban: 'Noncore', urbanCode: 6,
    pop: { total: 9017, under6mo: 52, age6moTo4: 470, age5to17: 1578, age18to49: 3092, age50to64: 1822, age65plus: 2003 } },
  { fips: '27091', name: 'Martin', schsacRegion: 'South Central', fieldDistrict: 'South', urban: 'Noncore', urbanCode: 6,
    pop: { total: 19960, under6mo: 112, age6moTo4: 1009, age5to17: 3256, age18to49: 6723, age50to64: 4148, age65plus: 4712 } },
  { fips: '27093', name: 'Meeker', schsacRegion: 'South Central', fieldDistrict: 'South', urban: 'Noncore', urbanCode: 6,
    pop: { total: 23352, under6mo: 135, age6moTo4: 1217, age5to17: 4262, age18to49: 8186, age50to64: 4848, age65plus: 4704 } },
  { fips: '27095', name: 'Mille Lacs', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Large fringe metro', urbanCode: 2,
    pop: { total: 26680, under6mo: 157, age6moTo4: 1418, age5to17: 4689, age18to49: 9949, age50to64: 5603, age65plus: 4864 } },
  { fips: '27097', name: 'Morrison', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 34023, under6mo: 192, age6moTo4: 1724, age5to17: 5943, age18to49: 12147, age50to64: 7164, age65plus: 6853 } },
  { fips: '27099', name: 'Mower', schsacRegion: 'Southeast', fieldDistrict: 'Southeast', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 40082, under6mo: 265, age6moTo4: 2386, age5to17: 7508, age18to49: 15390, age50to64: 7135, age65plus: 7398 } },
  { fips: '27101', name: 'Murray', schsacRegion: 'Southwest', fieldDistrict: 'South', urban: 'Noncore', urbanCode: 6,
    pop: { total: 8170, under6mo: 43, age6moTo4: 383, age5to17: 1354, age18to49: 2584, age50to64: 1688, age65plus: 2118 } },
  { fips: '27103', name: 'Nicollet', schsacRegion: 'South Central', fieldDistrict: 'South', urban: 'Small metro', urbanCode: 4,
    pop: { total: 34380, under6mo: 190, age6moTo4: 1711, age5to17: 5550, age18to49: 15028, age50to64: 6088, age65plus: 5813 } },
  { fips: '27105', name: 'Nobles', schsacRegion: 'Southwest', fieldDistrict: 'South', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 22194, under6mo: 179, age6moTo4: 1611, age5to17: 4356, age18to49: 8378, age50to64: 3861, age65plus: 3809 } },
  { fips: '27107', name: 'Norman', schsacRegion: 'Northwest', fieldDistrict: 'Northwest', urban: 'Noncore', urbanCode: 6,
    pop: { total: 6457, under6mo: 37, age6moTo4: 332, age5to17: 1165, age18to49: 2203, age50to64: 1347, age65plus: 1373 } },
  { fips: '27109', name: 'Olmsted', schsacRegion: 'Southeast', fieldDistrict: 'Southeast', urban: 'Small metro', urbanCode: 4,
    pop: { total: 162307, under6mo: 1041, age6moTo4: 9369, age5to17: 28768, age18to49: 67689, age50to64: 29475, age65plus: 25965 } },
  { fips: '27111', name: 'Otter Tail', schsacRegion: 'West Central', fieldDistrict: 'West Central', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 60072, under6mo: 329, age6moTo4: 2961, age5to17: 9719, age18to49: 19671, age50to64: 12741, age65plus: 14651 } },
  { fips: '27113', name: 'Pennington', schsacRegion: 'Northwest', fieldDistrict: 'Northwest', urban: 'Noncore', urbanCode: 6,
    pop: { total: 13995, under6mo: 83, age6moTo4: 746, age5to17: 2319, age18to49: 5484, age50to64: 2782, age65plus: 2581 } },
  { fips: '27115', name: 'Pine', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 29090, under6mo: 134, age6moTo4: 1205, age5to17: 4292, age18to49: 10566, age50to64: 6706, age65plus: 6187 } },
  { fips: '27117', name: 'Pipestone', schsacRegion: 'Southwest', fieldDistrict: 'South', urban: 'Noncore', urbanCode: 6,
    pop: { total: 9380, under6mo: 67, age6moTo4: 603, age5to17: 1871, age18to49: 3160, age50to64: 1762, age65plus: 1917 } },
  { fips: '27119', name: 'Polk', schsacRegion: 'Northwest', fieldDistrict: 'Northwest', urban: 'Small metro', urbanCode: 4,
    pop: { total: 31128, under6mo: 202, age6moTo4: 1821, age5to17: 5606, age18to49: 11707, age50to64: 5969, age65plus: 5823 } },
  { fips: '27121', name: 'Pope', schsacRegion: 'West Central', fieldDistrict: 'West Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 11312, under6mo: 59, age6moTo4: 534, age5to17: 1786, age18to49: 3747, age50to64: 2352, age65plus: 2834 } },
  { fips: '27123', name: 'Ramsey', schsacRegion: 'Metro', fieldDistrict: 'Metro', urban: 'Large central metro', urbanCode: 1,
    pop: { total: 547202, under6mo: 3568, age6moTo4: 32111, age5to17: 90821, age18to49: 243181, age50to64: 95015, age65plus: 82506 } },
  { fips: '27125', name: 'Red Lake', schsacRegion: 'Northwest', fieldDistrict: 'Northwest', urban: 'Noncore', urbanCode: 6,
    pop: { total: 3912, under6mo: 22, age6moTo4: 201, age5to17: 730, age18to49: 1317, age50to64: 790, age65plus: 852 } },
  { fips: '27127', name: 'Redwood', schsacRegion: 'Southwest', fieldDistrict: 'South', urban: 'Noncore', urbanCode: 6,
    pop: { total: 15428, under6mo: 99, age6moTo4: 895, age5to17: 2869, age18to49: 5329, age50to64: 2927, age65plus: 3309 } },
  { fips: '27129', name: 'Renville', schsacRegion: 'Southwest', fieldDistrict: 'West Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 14707, under6mo: 83, age6moTo4: 752, age5to17: 2584, age18to49: 5107, age50to64: 3071, age65plus: 3110 } },
  { fips: '27131', name: 'Rice', schsacRegion: 'Southeast', fieldDistrict: 'Southeast', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 67152, under6mo: 368, age6moTo4: 3308, age5to17: 10729, age18to49: 29518, age50to64: 12363, age65plus: 10866 } },
  { fips: '27133', name: 'Rock', schsacRegion: 'Southwest', fieldDistrict: 'South', urban: 'Noncore', urbanCode: 6,
    pop: { total: 9659, under6mo: 54, age6moTo4: 486, age5to17: 1883, age18to49: 3447, age50to64: 1854, age65plus: 1935 } },
  { fips: '27135', name: 'Roseau', schsacRegion: 'Northwest', fieldDistrict: 'Northwest', urban: 'Noncore', urbanCode: 6,
    pop: { total: 15294, under6mo: 84, age6moTo4: 752, age5to17: 2817, age18to49: 5427, age50to64: 3426, age65plus: 2788 } },
  { fips: '27137', name: 'St. Louis', schsacRegion: 'Northeast', fieldDistrict: 'Northeast', urban: 'Medium metro', urbanCode: 3,
    pop: { total: 200122, under6mo: 954, age6moTo4: 8591, age5to17: 27904, age18to49: 82289, age50to64: 39698, age65plus: 40686 } },
  { fips: '27139', name: 'Scott', schsacRegion: 'Metro', fieldDistrict: 'Metro', urban: 'Large fringe metro', urbanCode: 2,
    pop: { total: 151347, under6mo: 940, age6moTo4: 8461, age5to17: 30754, age18to49: 63626, age50to64: 29645, age65plus: 17921 } },
  { fips: '27141', name: 'Sherburne', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Large fringe metro', urbanCode: 2,
    pop: { total: 97820, under6mo: 638, age6moTo4: 5737, age5to17: 19000, age18to49: 41953, age50to64: 19073, age65plus: 11419 } },
  { fips: '27143', name: 'Sibley', schsacRegion: 'South Central', fieldDistrict: 'South', urban: 'Large fringe metro', urbanCode: 2,
    pop: { total: 14950, under6mo: 86, age6moTo4: 775, age5to17: 2565, age18to49: 5521, age50to64: 3209, age65plus: 2794 } },
  { fips: '27145', name: 'Stearns', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Small metro', urbanCode: 4,
    pop: { total: 158622, under6mo: 1008, age6moTo4: 9075, age5to17: 26721, age18to49: 69562, age50to64: 27681, age65plus: 24575 } },
  { fips: '27147', name: 'Steele', schsacRegion: 'Southeast', fieldDistrict: 'Southeast', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 37396, under6mo: 217, age6moTo4: 1950, age5to17: 7012, age18to49: 14097, age50to64: 7231, age65plus: 6889 } },
  { fips: '27149', name: 'Stevens', schsacRegion: 'West Central', fieldDistrict: 'West Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 9682, under6mo: 58, age6moTo4: 519, age5to17: 1544, age18to49: 4398, age50to64: 1488, age65plus: 1675 } },
  { fips: '27151', name: 'Swift', schsacRegion: 'Southwest', fieldDistrict: 'West Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 9806, under6mo: 57, age6moTo4: 510, age5to17: 1679, age18to49: 3356, age50to64: 1941, age65plus: 2263 } },
  { fips: '27153', name: 'Todd', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 25277, under6mo: 166, age6moTo4: 1495, age5to17: 4365, age18to49: 8354, age50to64: 5317, age65plus: 5580 } },
  { fips: '27155', name: 'Traverse', schsacRegion: 'West Central', fieldDistrict: 'West Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 3345, under6mo: 22, age6moTo4: 198, age5to17: 501, age18to49: 1118, age50to64: 684, age65plus: 822 } },
  { fips: '27157', name: 'Wabasha', schsacRegion: 'Southeast', fieldDistrict: 'Southeast', urban: 'Small metro', urbanCode: 4,
    pop: { total: 21460, under6mo: 114, age6moTo4: 1026, age5to17: 3493, age18to49: 7325, age50to64: 4690, age65plus: 4812 } },
  { fips: '27159', name: 'Wadena', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 14108, under6mo: 93, age6moTo4: 838, age5to17: 2777, age18to49: 4875, age50to64: 2689, age65plus: 2836 } },
  { fips: '27161', name: 'Waseca', schsacRegion: 'South Central', fieldDistrict: 'Southeast', urban: 'Noncore', urbanCode: 6,
    pop: { total: 18953, under6mo: 109, age6moTo4: 982, age5to17: 3278, age18to49: 7534, age50to64: 3615, age65plus: 3435 } },
  { fips: '27163', name: 'Washington', schsacRegion: 'Metro', fieldDistrict: 'Metro', urban: 'Large fringe metro', urbanCode: 2,
    pop: { total: 268651, under6mo: 1525, age6moTo4: 13728, age5to17: 49589, age18to49: 106578, age50to64: 54903, age65plus: 42328 } },
  { fips: '27165', name: 'Watonwan', schsacRegion: 'South Central', fieldDistrict: 'South', urban: 'Noncore', urbanCode: 6,
    pop: { total: 11205, under6mo: 81, age6moTo4: 729, age5to17: 1933, age18to49: 3981, age50to64: 2204, age65plus: 2277 } },
  { fips: '27167', name: 'Wilkin', schsacRegion: 'West Central', fieldDistrict: 'West Central', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 6454, under6mo: 37, age6moTo4: 335, age5to17: 1026, age18to49: 2402, age50to64: 1434, age65plus: 1220 } },
  { fips: '27169', name: 'Winona', schsacRegion: 'Southeast', fieldDistrict: 'Southeast', urban: 'Micropolitan', urbanCode: 5,
    pop: { total: 49792, under6mo: 230, age6moTo4: 2070, age5to17: 6526, age18to49: 23295, age50to64: 8831, age65plus: 8840 } },
  { fips: '27171', name: 'Wright', schsacRegion: 'Central', fieldDistrict: 'Central', urban: 'Large fringe metro', urbanCode: 2,
    pop: { total: 142543, under6mo: 949, age6moTo4: 8546, age5to17: 29658, age18to49: 57545, age50to64: 27295, age65plus: 18550 } },
  { fips: '27173', name: 'Yellow Medicine', schsacRegion: 'Southwest', fieldDistrict: 'West Central', urban: 'Noncore', urbanCode: 6,
    pop: { total: 9569, under6mo: 57, age6moTo4: 513, age5to17: 1651, age18to49: 3447, age50to64: 1942, age65plus: 1959 } },
]

export const MN_STATE_FIPS = '27'

export const MN_COUNTY_BY_FIPS: Record<string, MnCounty> = Object.fromEntries(MN_COUNTIES.map((c) => [c.fips, c]))

const normalizeName = (s: string) =>
  s.toLowerCase().replace(/ county$/, '').replace(/\bsaint\b/g, 'st').replace(/[^a-z]/g, '')

const BY_NAME: Record<string, MnCounty> = Object.fromEntries(MN_COUNTIES.map((c) => [normalizeName(c.name), c]))

/** Look up a county by name, tolerating "County" suffixes, "Saint"/"St.", case and punctuation. */
export function countyByName(name: string): MnCounty | undefined {
  return BY_NAME[normalizeName(name)]
}

export const SCHSAC_REGIONS: SchsacRegion[] = [
  'Metro', 'Central', 'Northeast', 'Northwest', 'West Central', 'South Central', 'Southwest', 'Southeast',
]

export const MN_POPULATION = MN_COUNTIES.reduce((sum, c) => sum + c.pop.total, 0)

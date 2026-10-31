import { HttpError } from "../../../utils/httpError";

/**
 * Live bank lists sent by the provider: AEPS (05 Aug 2026) and Cash Deposit (12 Aug 2026).
 * The provider has no bank-list API, so replace these arrays when it sends a new list.
 * Left out: IIN 900010 (NPCI test bank) and Cash Deposit IIN 607512 (no bank name in the file).
 */
const AEPS_BANKS: readonly (readonly [iin: string, name: string])[] = [
  ["607230", "Mizoram Rural Bank"],
  ["607808", "Jammu and Kashmir Grameen Bank"],
  ["608032", "Paytm Payments Bank"],
  ["508679", "The Vellore District Central Co-Op Bank Ltd"],
  ["508754", "The Angul United Central Co-Op Bank Ltd"],
  ["607063", "West Bengal Gramin Bank"],
  ["607214", "Chhattisgarh Rajya Gramin Bank"],
  ["508755", "The Koraput Central Co-Operative Bank Ltd"],
  ["508759", "The Berhampore Co-Operative Central Bank Ltd"],
  ["508998", "Equitas Small Finance Bank"],
  ["607270", "Karnataka Bank"],
  ["607062", "Manipur Rural Bank"],
  ["508760", "The Keonjhar Central Co-Operative Bank Ltd"],
  ["607119", "Shivalik Mercantile Co-Operative Bank"],
  ["508772", "Nayagarh District Central Co-Operative Bank Ltd"],
  ["508773", "The Aska Co-Operative Central Bank Ltd"],
  ["652150", "The Saraswat Co-Operative Bank Ltd"],
  ["607065", "Tripura Gramin Bank"],
  ["508775", "The Boudh Co-Operative Central Bank Ltd"],
  ["607210", "Jharkhand Rajya Gramin Bank"],
  ["508776", "The Cuttack Central Co-Operative Bank Ltd"],
  ["607082", "Catholic Syrian Bank"],
  ["508777", "The Sambalpur District Co-Operative Central Bank Ltd"],
  ["508778", "The Bhawanipatna Central Co-Operative Bank Ltd"],
  ["607602", "Yavatmal District Central Co-Operative Bank Ltd"],
  ["990320", "Airtel Payments Bank"],
  ["607157", "The Gayatri Co-Operative Urban Bank Ltd"],
  ["508756", "Mayurbhanj Central Co-Operative Bank Ltd"],
  ["508757", "The Sundargarh District Central Co-Op Bank Ltd"],
  ["508758", "The Balasore Bhadrak Central Co-Op Bank Ltd"],
  ["508761", "The Banki Central Co-Operative Bank Ltd"],
  ["508771", "The Khordha Central Co-Op Bank Ltd"],
  ["508782", "The United Puri-Nimapara Central Co-Operative Bank Ltd"],
  ["508910", "Jana Small Finance Bank Ltd"],
  ["607266", "Rajasthan State Co-Op Bank"],
  ["607315", "Maharashtra State Co-Operative Bank"],
  ["607523", "UP State Co-Op Bank"],
  ["607847", "Bhandara District Co-Op Bank"],
  ["607884", "Jio Payments Bank Limited"],
  ["607935", "Odisha State Co-Operative Bank"],
  ["608014", "Utkarsh Small Finance Bank Ltd"],
  ["608194", "The Cosmos Co-Operative Bank Ltd"],
  ["508774", "The Bolangir District Central Co-Operative Bank Ltd"],
  ["608165", "Kerala State Co-Operative Bank Ltd"],
  ["607943", "Solapur District Co-Operative Bank"],
  ["607162", "The Meghalaya Co-Operative Apex Bank Ltd"],
  ["607066", "UCO Bank"],
  ["817304", "Fincare Small Finance Bank"],
  ["652254", "ESAF Small Finance Bank"],
  ["508649", "The Sivagangai District Central Co-Op Bank Ltd"],
  ["607768", "NSDL Payments Bank Limited"],
  ["990558", "Nainital Bank"],
  ["607749", "Kolhapur District Central Co-Operative Bank Ltd"],
  ["607603", "Uttarakhand State Co-Operative Bank Ltd"],
  ["608236", "Ahmedabad District Central Co-Operative Bank"],
  ["608009", "The Gujarat State Co-Operative Bank Ltd"],
  ["508672", "Shri Rajkot District Co-Operative Bank Ltd"],
  ["607399", "Kerala Gramin Bank"],
  ["607400", "Karnataka Grameena Bank"],
  ["508505", "Bank of India"],
  ["508646", "The Coimbatore District Central Co-Op Bank Limited"],
  ["508647", "The Cuddalore District Central Co-Operative Bank"],
  ["508648", "The Salem District Central Co-Operative Bank Ltd"],
  ["508654", "Erode District Central Co-Operative Bank"],
  ["508655", "The Kanyakumari District Central Co-Operative Bank"],
  ["508656", "Pudukottai District Central Co-Operative Bank Ltd"],
  ["508657", "The Tiruvannamalai District Central Co-Op Bank Ltd"],
  ["508658", "Dharmapuri District Central Co-Op Bank Ltd"],
  ["508659", "Dindigul Central Co-Operative Bank Ltd"],
  ["508660", "The Nilgiris District Central Co-Op Bank Ltd"],
  ["508664", "Chennai Central Co-Operative Bank Ltd"],
  ["508665", "Thanjavur Central Co-Op Bank Ltd"],
  ["508676", "The Ramanathapuram District Central Co-Op Bank Ltd"],
  ["508677", "The Tirunelveli District Central Co-Op Bank Ltd"],
  ["508678", "The Thoothukudi District Central Co-Op Bank"],
  ["508680", "The Tiruchirapalli District Central Co-Operative Bank Ltd"],
  ["508681", "The Madurai District Central Co-Operative Bank Ltd"],
  ["508720", "The Kumbakonam Central Co-Operative Bank Ltd"],
  ["508732", "The Virudhunagar District Central Co-Op Bank Ltd"],
  ["508734", "Kancheepuram Central Co-Operative Bank"],
  ["508737", "The Villupuram District Central Co-Op Bank Ltd"],
  ["508991", "Ujjivan Small Finance Bank Limited"],
  ["606993", "Uttar Pradesh Gramin Bank"],
  ["606995", "Gujarat Gramin Bank"],
  ["607000", "Maharashtra Gramin Bank"],
  ["607022", "Madhya Pradesh Gramin Bank"],
  ["607052", "Tamil Nadu Grama Bank"],
  ["607054", "Puduvai Bharathiar Grama Bank"],
  ["607058", "Lakshmi Vilas Bank / DBS Bank India Limited erstwhile LVB"],
  ["607060", "Odisha Grameen Bank"],
  ["607064", "Assam Gramin Vikash Bank"],
  ["607080", "Andhra Pradesh Grameena Bank"],
  ["607087", "Punjab & Sind Bank"],
  ["607094", "State Bank of India"],
  ["607095", "IDBI Bank"],
  ["607131", "Tamil Nadu State Apex Co-Operative Bank Ltd"],
  ["607136", "Bihar Gramin Bank"],
  ["607138", "Punjab Gramin Bank"],
  ["607139", "Sarva Haryana Gramin Bank"],
  ["607140", "Himachal Pradesh Gramin Bank"],
  ["607187", "Tamilnad Mercantile Bank"],
  ["607195", "Telangana Grameena Bank"],
  ["607197", "Uttarakhand Gramin Bank"],
  ["607206", "Meghalaya Rural Bank"],
  ["607387", "Bank of Maharashtra"],
  ["607395", "SBM Bank (INDIA) Limited"],
  ["607509", "Rajasthan Gramin Bank"],
  ["607978", "Tripura State Co-Operative Bank Ltd"],
  ["508534", "ICICI Bank"],
  ["508662", "Karur Vysya Bank"],
  ["606985", "Bank Of Baroda / Dena Bank / Vijaya Bank"],
  ["607027", "Punjab National Bank / Oriental Bank of Commerce / United Bank Of India"],
  ["607105", "Indian Bank / Allahabad Bank"],
  ["607126", "Indian Overseas Bank"],
  ["607152", "HDFC Bank"],
  ["607153", "Axis Bank"],
  ["607161", "Union Bank of India / Corporation Bank / Andhra Bank"],
  ["607189", "IndusInd Bank"],
  ["607264", "Central Bank of India"],
  ["607324", "City Union Bank"],
  ["607363", "Federal Bank"],
  ["607393", "RBL Bank"],
  ["607396", "Canara Bank / Syndicate Bank"],
  ["607439", "South Indian Bank"],
  ["607440", "Jammu & Kashmir Bank"],
  ["607618", "YES Bank"],
  ["608001", "Fino Payments Bank"],
  ["608022", "Suryoday Small Finance Bank"],
  ["608087", "AU Small Finance Bank"],
  ["608117", "IDFC First Bank"],
  ["608314", "India Post Payment Bank"],
  ["990309", "Kotak Mahindra Bank"],
  ["508913", "Capital Small Finance Bank"],
  ["607628", "Pune District Central Co-Operative Bank Ltd"],
  ["607262", "Sindhudurg District Central Co-Operative Bank Ltd"],
];

/** Cash Deposit list; the two banks missing from the AEPS list carry their own names. */
const CASH_DEPOSIT_IINS: readonly string[] = [
  "607264", "608087", "607153", "606985", "508505", "607396", "607080", "607324", "607058", "508998",
  "652254", "607363", "608001", "607152", "607095", "608117", "608314", "607105", "607126", "607440",
  "508910", "607884", "508662", "607768", "607060", "607054", "607087", "607027", "607509", "607393",
  "607053", "607200", "607119", "607052", "508991", "607161", "608014", "607197", "607618", "508758",
  "608194", "607399", "508777", "607387", "508778", "508756", "508782", "607189", "508776", "508757",
  "607808", "508754", "508760", "508771", "508772", "508773", "607943", "608022", "607195", "607262",
  "607315",
];

const CASH_DEPOSIT_ONLY: readonly (readonly [iin: string, name: string])[] = [
  ["607053", "Saptagiri Grameena Bank"],
  ["607200", "Saurashtra Gramin Bank"],
];

const aepsByIin = new Map(AEPS_BANKS);
const cashDepositSet = new Set(CASH_DEPOSIT_IINS);
const cashDepositOnlyByIin = new Map(CASH_DEPOSIT_ONLY);

export interface ProviderBank {
  iin: string;
  name: string;
  aepsEnabled: boolean;
  cashDepositEnabled: boolean;
}

/** Every bank on either list, AEPS order first. */
export function providerBankList(): ProviderBank[] {
  return [
    ...AEPS_BANKS.map(([iin, name]) => ({
      iin,
      name,
      aepsEnabled: true,
      cashDepositEnabled: cashDepositSet.has(iin),
    })),
    ...CASH_DEPOSIT_ONLY.map(([iin, name]) => ({ iin, name, aepsEnabled: false, cashDepositEnabled: true })),
  ];
}

/** Bank name for a withdrawal / balance / statement / Aadhaar Pay; refuses banks not on the live list. */
export function requireAepsBank(iin: string): string {
  const name = aepsByIin.get(iin.trim());
  if (!name) {
    throw new HttpError(
      422,
      "This bank is not available for AEPS right now. Choose another bank from the list.",
      "AEPS_BANK_NOT_LIVE",
    );
  }
  return name;
}

/** Bank name for a cash deposit; refuses banks not on the Cash Deposit list. */
export function requireCashDepositBank(iin: string): string {
  const code = iin.trim();
  const name = cashDepositSet.has(code) ? (aepsByIin.get(code) ?? cashDepositOnlyByIin.get(code)) : undefined;
  if (!name) {
    throw new HttpError(
      422,
      "Cash Deposit is not available for this bank. Choose a bank from the Cash Deposit list.",
      "CASH_DEPOSIT_BANK_NOT_LIVE",
    );
  }
  return name;
}

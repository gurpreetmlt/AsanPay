import { HttpError } from "../../utils/httpError";
import {
  bestApiDthInfo,
  bestApiDthPlans,
  bestApiMobileOffers,
  bestApiMobileOperator,
  bestApiMobilePlans,
  type MobileRechargeInfo,
  type RechargePlanItem,
} from "../providers/bestapi/plans.service";
import {
  vyaparDthInfo,
  vyaparDthPlans,
  vyaparMobileOffers,
  vyaparMobileOperator,
  vyaparMobilePlans,
} from "../providers/vyaparapi/numberInfo";
import { runVerificationChain } from "./verificationRouting.service";

/** Recharge lookups routed through the providers an admin has on, in their chosen order. */

const noPlans = (list: RechargePlanItem[]) => list.length === 0;

export async function lookupMobileRechargeInfo(mobile: string): Promise<MobileRechargeInfo> {
  return runVerificationChain("mobile_operator", {
    bestapi: () => bestApiMobileOperator(mobile),
    vyaparapi: async () => {
      const op = await vyaparMobileOperator(mobile);
      return {
        mobile,
        operatorSource: "vyaparapi",
        operatorCode: op.operatorCode,
        operatorName: op.operatorName,
        circleCode: op.circleCode,
        circleName: op.circleName,
        plans: [],
        offers: [],
        plansSource: null,
        warnings: [],
      };
    },
  });
}

export async function fetchMobilePlans(input: { mobile?: string; operatorCode: string; circleCode: string }) {
  return runVerificationChain(
    "mobile_plans",
    { bestapi: () => bestApiMobilePlans(input), vyaparapi: () => vyaparMobilePlans(input) },
    noPlans,
  );
}

export async function fetchMobileOffers(input: { mobile: string; operatorCode: string; circleCode: string }) {
  return runVerificationChain(
    "mobile_offers",
    { bestapi: () => bestApiMobileOffers(input), vyaparapi: () => vyaparMobileOffers(input) },
    noPlans,
  );
}

export async function fetchDthPlans(operatorCode: string) {
  return runVerificationChain(
    "dth_plans",
    { bestapi: () => bestApiDthPlans(operatorCode), vyaparapi: () => vyaparDthPlans(operatorCode) },
    noPlans,
  );
}

export async function fetchDthInfo(input: { operatorCode: string; number: string }) {
  const number = input.number.replace(/\s+/g, "").trim();
  if (number.length < 8) throw new HttpError(422, "Enter a valid DTH subscriber number", "INVALID_DTH_NUMBER");
  return runVerificationChain(
    "dth_info",
    {
      bestapi: () => bestApiDthInfo({ operatorCode: input.operatorCode, number }),
      vyaparapi: () => vyaparDthInfo({ operatorCode: input.operatorCode, number }),
    },
    (r) => r.plans.length === 0 && r.summary.length === 0,
  );
}

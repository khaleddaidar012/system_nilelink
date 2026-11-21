import {isAccountDocument,complianceState,type ComplianceDocument} from "./compliance/account-health"
export function usableAccountDocument(doc:ComplianceDocument){return isAccountDocument(doc)&&["approved","expiring_soon"].includes(complianceState(doc))}

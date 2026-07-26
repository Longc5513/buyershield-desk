export function policyBoundToExecution(latest_state) {
  const blockedByPolicy = latest_state?.verdict !== "eligible";

  if (latest_state?.verdict === "eligible") {
    return {
      blockedByPolicy,
      latest_state,
      action: "Proceed with refund or support settlement"
    };
  }

  if (latest_state?.verdict === "ineligible") {
    return {
      blockedByPolicy,
      latest_state,
      action: "Hold refund and keep merchant payout blocked for review"
    };
  }

  return {
    blockedByPolicy,
    latest_state,
    action: "Escalate to manual support review"
  };
}

import "../site/app.js";

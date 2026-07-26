import { createClient } from "https://esm.sh/genlayer-js";
import { studionet } from "https://esm.sh/genlayer-js/chains";

export const DEFAULT_CONTRACT_ADDRESS = "0x85D95D6af69Aced80Fee84F5aB5e25aD4e6128ED";
const ACCEPTED_STATUS = "ACCEPTED";

function requireTrimmedValue(value, label, minLength = 1) {
  const normalized = String(value || "").trim();
  if (normalized.length < minLength) {
    throw new Error(`${label} is required${minLength > 1 ? ` and must be at least ${minLength} characters.` : "."}`);
  }
  return normalized;
}

function requireAddress(value, label) {
  const normalized = requireTrimmedValue(value, label);
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    throw new Error(`${label} must be a valid 0x address.`);
  }
  return normalized;
}

function requireHttpsUrl(value, label) {
  const normalized = requireTrimmedValue(value, label, 12);
  const url = new URL(normalized);
  if (url.protocol !== "https:") {
    throw new Error(`${label} must use https.`);
  }
  return normalized;
}

function getExecutionFailure(receipt) {
  const leaderReceipt = receipt?.consensus_data?.leader_receipt;
  if (!leaderReceipt) return null;

  const executionResult = String(leaderReceipt.execution_result || "").toUpperCase();
  if (executionResult && executionResult !== "SUCCESS") {
    return leaderReceipt.error || `Execution result was ${executionResult}.`;
  }

  const eqOutputs = leaderReceipt.eq_outputs?.leader || {};
  for (const raw of Object.values(eqOutputs)) {
    if (typeof raw !== "string") continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.transaction_success === false) {
        return parsed.transaction_error || "Transaction execution returned transaction_success=false.";
      }
    } catch {
      // Ignore malformed diagnostics and keep scanning.
    }
  }
  return null;
}

async function waitForConfirmedExecution(client, txHash) {
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: ACCEPTED_STATUS,
    fullTransaction: true,
    retries: 120,
    interval: 3000
  });

  const statusName = String(receipt?.statusName || receipt?.status || "").toUpperCase();
  if (statusName && statusName !== "ACCEPTED" && statusName !== "FINALIZED") {
    throw new Error(`Transaction reached unexpected status ${statusName}.`);
  }

  const executionFailure = getExecutionFailure(receipt);
  if (executionFailure) {
    throw new Error(`GenLayer execution failed: ${executionFailure}`);
  }

  return receipt;
}

export async function connectStudionetWallet(account) {
  return createClient({
    chain: studionet,
    account: requireAddress(account, "Wallet account")
  });
}

export async function createClaim(params) {
  const txHash = await params.client.writeContract({
    address: requireAddress(params.contractAddress || DEFAULT_CONTRACT_ADDRESS, "Contract address"),
    functionName: "create_claim",
    args: [
      requireTrimmedValue(params.claimId, "Claim ID", 4).toLowerCase(),
      requireTrimmedValue(params.title, "Title", 8),
      requireTrimmedValue(params.merchantName, "Merchant name", 3),
      requireHttpsUrl(params.policyUrl, "Policy URL"),
      requireHttpsUrl(params.productUrl, "Product URL"),
      requireHttpsUrl(params.evidenceUrl, "Evidence URL"),
      requireTrimmedValue(params.orderFacts, "Order facts", 24),
      requireTrimmedValue(params.claimReason, "Claim reason", 16)
    ]
  });

  return waitForConfirmedExecution(params.client, txHash);
}

export async function addMerchantResponse(params) {
  const txHash = await params.client.writeContract({
    address: requireAddress(params.contractAddress || DEFAULT_CONTRACT_ADDRESS, "Contract address"),
    functionName: "add_merchant_response",
    args: [
      requireTrimmedValue(params.claimId, "Claim ID", 4).toLowerCase(),
      requireHttpsUrl(params.merchantResponseUrl, "Merchant response URL")
    ]
  });

  return waitForConfirmedExecution(params.client, txHash);
}

export async function resolveClaim(params) {
  const txHash = await params.client.writeContract({
    address: requireAddress(params.contractAddress || DEFAULT_CONTRACT_ADDRESS, "Contract address"),
    functionName: "resolve_claim",
    args: [requireTrimmedValue(params.claimId, "Claim ID", 4).toLowerCase()]
  });

  return waitForConfirmedExecution(params.client, txHash);
}

export async function readClaim(params) {
  const raw = await params.client.readContract({
    address: requireAddress(params.contractAddress || DEFAULT_CONTRACT_ADDRESS, "Contract address"),
    functionName: "get_claim_json",
    args: [requireTrimmedValue(params.claimId, "Claim ID", 4).toLowerCase()]
  });

  return typeof raw === "string" ? JSON.parse(raw.replace(/'/g, "\"")) : raw;
}

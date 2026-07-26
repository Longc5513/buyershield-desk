import { presets } from "./data/presets.js";
import {
  DEFAULT_CONTRACT_ADDRESS,
  createReadClient,
  connectStudionetWallet,
  createClaim,
  addMerchantResponse,
  resolveClaim,
  readClaim
} from "./lib/oracle-client.js";

const state = {
  readClient: createReadClient(),
  writeClient: null,
  connectedAccount: "",
  recentClaims: JSON.parse(localStorage.getItem("buyershield-recent-claims") || "[]"),
  lastLogFingerprint: ""
};

const els = {
  walletAccount: document.querySelector("#wallet-account"),
  contractAddress: document.querySelector("#contract-address"),
  connectionStatus: document.querySelector("#connection-status"),
  eventLog: document.querySelector("#event-log"),
  clearLogButton: document.querySelector("#clear-log-button"),
  claimOutput: document.querySelector("#claim-output"),
  presetList: document.querySelector("#preset-list"),
  decisionVerdict: document.querySelector("#decision-verdict"),
  decisionAction: document.querySelector("#decision-action"),
  decisionGate: document.querySelector("#decision-gate"),
  connectButton: document.querySelector("#connect-button"),
  useDefaultContract: document.querySelector("#use-default-contract"),
  createClaimForm: document.querySelector("#create-claim-form"),
  merchantResponseForm: document.querySelector("#merchant-response-form"),
  resolveClaimForm: document.querySelector("#resolve-claim-form"),
  readClaimForm: document.querySelector("#read-claim-form")
};

els.contractAddress.value = DEFAULT_CONTRACT_ADDRESS;
els.walletAccount.value = localStorage.getItem("buyershield-wallet-account") || "";

function logEvent(title, detail) {
  const fingerprint = `${title}::${detail}`;
  if (state.lastLogFingerprint === fingerprint) {
    return;
  }
  state.lastLogFingerprint = fingerprint;
  const node = document.createElement("div");
  node.className = "log-item";
  node.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
  els.eventLog.prepend(node);
}

function clearEventLog() {
  els.eventLog.innerHTML = "";
  state.lastLogFingerprint = "";
}

function setConnectionStatus(text, variant = "") {
  els.connectionStatus.textContent = text;
  els.connectionStatus.className = "status-pill";
  if (variant) {
    els.connectionStatus.classList.add(variant);
  }
}

function focusField(field) {
  field?.focus();
  field?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function normalizeErrorMessage(error, fallback) {
  const raw = String(error?.message || fallback || "Request failed.");

  if (raw.includes("No browser wallet was found")) {
    return "No browser wallet was detected. Open this app in MetaMask or another wallet-enabled browser.";
  }
  if (raw.includes("does not match the account currently selected")) {
    return "The address in the field does not match the wallet account you selected. Switch wallet account or clear the field and reconnect.";
  }
  if (raw.includes("not been authorized by the user")) {
    return "Wallet approval was rejected. Approve the transaction in your wallet and try again.";
  }
  if (raw.includes("User rejected")) {
    return "Wallet approval was rejected. Approve the transaction in your wallet and try again.";
  }
  if (raw.includes("Missing or invalid parameters")) {
    return "The contract could not read this claim yet. Check the claim ID and make sure the record exists onchain.";
  }
  if (raw.includes("GenLayer execution failed:")) {
    return raw.replace("GenLayer execution failed:", "Consensus check failed:");
  }
  return raw;
}

function requireFormValue(field, label, minLength = 1, extraHint = "") {
  const normalized = String(field?.value || "").trim();
  if (normalized.length < minLength) {
    const detail = `${label} is required${minLength > 1 ? ` and must be at least ${minLength} characters.` : "."}${extraHint ? ` ${extraHint}` : ""}`;
    throw new Error(detail);
  }
  return normalized;
}

function requireHttpsField(field, label) {
  const normalized = requireFormValue(field, label, 12, "Use a full https URL.");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} must be a valid https URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use https.`);
  }
  return normalized;
}

function saveRecentClaim(claimId) {
  if (!claimId) return;
  state.recentClaims = [claimId, ...state.recentClaims.filter((item) => item !== claimId)].slice(0, 8);
  localStorage.setItem("buyershield-recent-claims", JSON.stringify(state.recentClaims));
}

function updateDecisionPanel(claim) {
  const verdict = claim?.verdict || "No decision";
  els.decisionVerdict.textContent = verdict;

  if (verdict === "eligible") {
    els.decisionAction.textContent = "Proceed with refund or support settlement";
    els.decisionGate.textContent = "Escrow can release buyer-side remedy";
  } else if (verdict === "ineligible") {
    els.decisionAction.textContent = "Hold refund and keep merchant payout blocked for review";
    els.decisionGate.textContent = "Auto-refund should remain blocked";
  } else if (verdict === "needs_review") {
    els.decisionAction.textContent = "Escalate to manual support review";
    els.decisionGate.textContent = "Do not auto-settle";
  } else {
    els.decisionAction.textContent = "Await claim read";
    els.decisionGate.textContent = "Not evaluated";
  }
}

function requireWriteClient() {
  if (!state.writeClient) {
    throw new Error("Connect the desk with a Studionet wallet account first.");
  }
  return state.writeClient;
}

function readClient() {
  return state.readClient;
}

function browserProvider() {
  return window.ethereum;
}

function shortenAddress(address) {
  const normalized = String(address || "").trim();
  if (normalized.length < 12) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function syncConnectedAccount(address) {
  if (!address) return;
  state.connectedAccount = address;
  els.walletAccount.value = address;
  localStorage.setItem("buyershield-wallet-account", address);
}

function contractAddress() {
  return els.contractAddress.value.trim() || DEFAULT_CONTRACT_ADDRESS;
}

function fillPreset(preset) {
  const form = els.createClaimForm;
  form.claimId.value = preset.claimId;
  form.title.value = preset.title;
  form.merchantName.value = preset.merchantName;
  form.policyUrl.value = preset.policyUrl;
  form.productUrl.value = preset.productUrl;
  form.evidenceUrl.value = preset.evidenceUrl;
  form.orderFacts.value = preset.orderFacts;
  form.claimReason.value = preset.claimReason;
  els.merchantResponseForm.claimId.value = preset.claimId;
  els.merchantResponseForm.merchantResponseUrl.value = preset.merchantResponseUrl;
  els.resolveClaimForm.claimId.value = preset.claimId;
  els.readClaimForm.claimId.value = preset.claimId;
  logEvent("Preset loaded", `Loaded ${preset.label}.`);
}

function renderPresets() {
  els.presetList.innerHTML = "";
  for (const preset of presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-button";
    button.innerHTML = `<strong>${preset.label}</strong><small>${preset.title}</small>`;
    button.addEventListener("click", () => fillPreset(preset));
    els.presetList.append(button);
  }
}

els.useDefaultContract.addEventListener("click", () => {
  els.contractAddress.value = DEFAULT_CONTRACT_ADDRESS;
  logEvent("Contract preset", "Loaded the live Buyer Protection Oracle address.");
});

els.clearLogButton?.addEventListener("click", () => {
  clearEventLog();
  logEvent("Activity cleared", "Desk log reset for a clean demo session.");
});

els.connectButton.addEventListener("click", async () => {
  try {
    const walletAccount = els.walletAccount.value.trim();
    const session = await connectStudionetWallet({
      provider: browserProvider(),
      account: walletAccount || undefined
    });
    state.writeClient = session.client;
    syncConnectedAccount(session.account);
    setConnectionStatus("Connected", "success");
    logEvent("Desk connected", `Wallet ${shortenAddress(session.account)} is ready for contract ${contractAddress()}.`);
  } catch (error) {
    state.writeClient = null;
    setConnectionStatus("Connection failed", "error");
    logEvent("Connection failed", normalizeErrorMessage(error, "Wallet connection failed."));
  }
});

els.createClaimForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    requireFormValue(form.claimId, "Claim ID", 4);
    requireFormValue(form.title, "Title", 8);
    requireFormValue(form.merchantName, "Merchant name", 3);
    requireHttpsField(form.policyUrl, "Policy URL");
    requireHttpsField(form.productUrl, "Product URL");
    requireHttpsField(form.evidenceUrl, "Evidence URL");
    requireFormValue(form.orderFacts, "Order facts", 24, "Summarize the buyer timeline and delivery facts.");
    requireFormValue(form.claimReason, "Claim reason", 16, "Explain why the buyer should receive a remedy.");
    const receipt = await createClaim({
      client: requireWriteClient(),
      contractAddress: contractAddress(),
      claimId: form.claimId.value,
      title: form.title.value,
      merchantName: form.merchantName.value,
      policyUrl: form.policyUrl.value,
      productUrl: form.productUrl.value,
      evidenceUrl: form.evidenceUrl.value,
      orderFacts: form.orderFacts.value,
      claimReason: form.claimReason.value
    });
    saveRecentClaim(form.claimId.value.trim().toLowerCase());
    logEvent("Claim written", `create_claim accepted in tx ${receipt.hash || receipt.tx_id || "unknown"}.`);
  } catch (error) {
    logEvent("Claim write failed", normalizeErrorMessage(error, "Claim submission failed."));
    if (!String(form.title.value || "").trim()) {
      focusField(form.title);
    }
  }
});

els.merchantResponseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    requireFormValue(form.claimId, "Claim ID", 4);
    requireHttpsField(form.merchantResponseUrl, "Merchant response URL");
    const receipt = await addMerchantResponse({
      client: requireWriteClient(),
      contractAddress: contractAddress(),
      claimId: form.claimId.value,
      merchantResponseUrl: form.merchantResponseUrl.value
    });
    logEvent("Merchant response written", `add_merchant_response accepted in tx ${receipt.hash || receipt.tx_id || "unknown"}.`);
  } catch (error) {
    logEvent("Merchant response failed", normalizeErrorMessage(error, "Merchant response failed."));
    if (!String(form.merchantResponseUrl.value || "").trim()) {
      focusField(form.merchantResponseUrl);
    }
  }
});

els.resolveClaimForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    requireFormValue(form.claimId, "Claim ID", 4);
    const receipt = await resolveClaim({
      client: requireWriteClient(),
      contractAddress: contractAddress(),
      claimId: form.claimId.value
    });
    logEvent("Claim resolved", `resolve_claim accepted in tx ${receipt.hash || receipt.tx_id || "unknown"}.`);
  } catch (error) {
    logEvent("Resolve failed", normalizeErrorMessage(error, "Claim resolution failed."));
    if (!String(form.claimId.value || "").trim()) {
      focusField(form.claimId);
    }
  }
});

els.readClaimForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    requireFormValue(form.claimId, "Claim ID", 4);
    const claim = await readClaim({
      client: readClient(),
      contractAddress: contractAddress(),
      claimId: form.claimId.value
    });
    els.claimOutput.textContent = JSON.stringify(claim, null, 2);
    updateDecisionPanel(claim);
    saveRecentClaim(form.claimId.value.trim().toLowerCase());
    logEvent("Claim loaded", `Read onchain state for ${form.claimId.value.trim().toLowerCase()}.`);
  } catch (error) {
    logEvent("Read failed", normalizeErrorMessage(error, "Claim read failed."));
    if (!String(form.claimId.value || "").trim()) {
      focusField(form.claimId);
    }
  }
});

renderPresets();
state.recentClaims.forEach((claimId) => logEvent("Recent claim", claimId));

browserProvider()?.on?.("accountsChanged", (accounts) => {
  const nextAccount = Array.isArray(accounts) && accounts[0] ? String(accounts[0]).trim() : "";
  if (!nextAccount) {
    state.writeClient = null;
    state.connectedAccount = "";
    setConnectionStatus("Disconnected", "");
    logEvent("Wallet disconnected", "No browser wallet account is currently selected.");
    return;
  }
  syncConnectedAccount(nextAccount);
  state.writeClient = null;
  setConnectionStatus("Reconnect wallet", "error");
  logEvent("Wallet changed", `Detected account ${shortenAddress(nextAccount)}. Reconnect the desk to continue writing.`);
});

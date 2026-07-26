import { presets } from "./data/presets.js";
import {
  DEFAULT_CONTRACT_ADDRESS,
  connectStudionetWallet,
  createClaim,
  addMerchantResponse,
  resolveClaim,
  readClaim
} from "./lib/oracle-client.js";

const state = {
  client: null,
  recentClaims: JSON.parse(localStorage.getItem("buyershield-recent-claims") || "[]"),
  lastLogFingerprint: ""
};

const els = {
  walletAccount: document.querySelector("#wallet-account"),
  contractAddress: document.querySelector("#contract-address"),
  connectionStatus: document.querySelector("#connection-status"),
  eventLog: document.querySelector("#event-log"),
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

function setConnectionStatus(text, variant = "") {
  els.connectionStatus.textContent = text;
  els.connectionStatus.className = "status-pill";
  if (variant) {
    els.connectionStatus.classList.add(variant);
  }
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

function requireConnectedClient() {
  if (!state.client) {
    throw new Error("Connect the desk with a Studionet wallet account first.");
  }
  return state.client;
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

els.connectButton.addEventListener("click", async () => {
  const walletAccount = els.walletAccount.value.trim();
  if (!walletAccount) {
    setConnectionStatus("Enter wallet first", "error");
    logEvent("Connection blocked", "Enter a Studionet wallet address before connecting the desk.");
    els.walletAccount.focus();
    return;
  }

  try {
    state.client = await connectStudionetWallet(walletAccount);
    localStorage.setItem("buyershield-wallet-account", walletAccount);
    setConnectionStatus("Connected", "success");
    logEvent("Desk connected", `Ready to use contract ${contractAddress()}.`);
  } catch (error) {
    setConnectionStatus("Connection failed", "error");
    logEvent("Connection failed", error.message);
  }
});

els.createClaimForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const receipt = await createClaim({
      client: requireConnectedClient(),
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
    logEvent("Claim write failed", error.message);
  }
});

els.merchantResponseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const receipt = await addMerchantResponse({
      client: requireConnectedClient(),
      contractAddress: contractAddress(),
      claimId: form.claimId.value,
      merchantResponseUrl: form.merchantResponseUrl.value
    });
    logEvent("Merchant response written", `add_merchant_response accepted in tx ${receipt.hash || receipt.tx_id || "unknown"}.`);
  } catch (error) {
    logEvent("Merchant response failed", error.message);
  }
});

els.resolveClaimForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const receipt = await resolveClaim({
      client: requireConnectedClient(),
      contractAddress: contractAddress(),
      claimId: form.claimId.value
    });
    logEvent("Claim resolved", `resolve_claim accepted in tx ${receipt.hash || receipt.tx_id || "unknown"}.`);
  } catch (error) {
    logEvent("Resolve failed", error.message);
  }
});

els.readClaimForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const claim = await readClaim({
      client: requireConnectedClient(),
      contractAddress: contractAddress(),
      claimId: form.claimId.value
    });
    els.claimOutput.textContent = JSON.stringify(claim, null, 2);
    updateDecisionPanel(claim);
    saveRecentClaim(form.claimId.value.trim().toLowerCase());
    logEvent("Claim loaded", `Read onchain state for ${form.claimId.value.trim().toLowerCase()}.`);
  } catch (error) {
    logEvent("Read failed", error.message);
  }
});

renderPresets();
state.recentClaims.forEach((claimId) => logEvent("Recent claim", claimId));

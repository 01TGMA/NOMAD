// Nomad — onboarding.js
// Drives the 4-step onboarding flow: signup → business details →
// bank verification (disbursement account) → Monnify reserved account creation.

import { supabase } from "../shared/supabaseClient.js";

let currentProfileId = null;
let verifiedBankCode = null;
let verifiedAccountNumber = null;

init();

async function init() {
  wireStep1();
  wireStep2();
  wireStep3();
  await loadBankList();
}

// ── Step navigation ──────────────────────────

function goToStep(stepNumber) {
  document.querySelectorAll(".ob-panel").forEach((panel) => {
    panel.hidden = Number(panel.dataset.panel) !== stepNumber;
  });
  document.querySelectorAll(".ob-step").forEach((stepEl) => {
    const n = Number(stepEl.dataset.step);
    stepEl.classList.toggle("active", n === stepNumber);
    stepEl.classList.toggle("complete", n < stepNumber);
  });
}

// ── Step 1: signup ───────────────────────────

function wireStep1() {
  document.getElementById("step1NextBtn").addEventListener("click", async () => {
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const errorEl = document.getElementById("step1Error");
    const btn = document.getElementById("step1NextBtn");

    errorEl.textContent = "";

    if (!email || !password || password.length < 8) {
      errorEl.textContent = "Enter a valid email and a password of at least 8 characters.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Creating account…";

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role: "trader" } },
    });

    btn.disabled = false;
    btn.textContent = "Continue";

    if (error) {
      errorEl.textContent = error.message;
      return;
    }

    currentProfileId = data.user?.id ?? null;
    if (!currentProfileId) {
      errorEl.textContent = "Account created — please check your email to confirm, then return here.";
      return;
    }

    goToStep(2);
  });
}

// ── Step 2: business details + reserved account ──

function wireStep2() {
  document.getElementById("step2NextBtn").addEventListener("click", async () => {
    const businessName = document.getElementById("businessName").value.trim();
    const phone = document.getElementById("businessPhone").value.trim();
    const errorEl = document.getElementById("step2Error");
    const btn = document.getElementById("step2NextBtn");

    errorEl.textContent = "";

    if (!businessName || !phone) {
      errorEl.textContent = "Both fields are required.";
      return;
    }

    if (!currentProfileId) {
      errorEl.textContent = "Something went wrong — please restart signup.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Setting up your account…";

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase.functions.invoke("onboard-trader", {
      body: {
        profile_id: currentProfileId,
        business_name: businessName,
        customer_email: user?.email,
      },
    });

    btn.disabled = false;
    btn.textContent = "Continue";

    if (error) {
      errorEl.textContent = `Couldn't create your collection account: ${error.message}`;
      return;
    }

    // Also persist the phone number directly (onboard-trader only handles
    // the Monnify side of things).
    await supabase.from("profiles").update({ phone }).eq("id", currentProfileId);

    // Stash for the final "done" screen.
    window.__nomadOnboardResult = data;

    goToStep(3);
  });
}

// ── Step 3: bank verification (disbursement account) ──

async function loadBankList() {
  const select = document.getElementById("bankSelect");
  const { data, error } = await supabase.functions.invoke("list-banks");

  if (error || !data?.banks) {
    select.innerHTML = `<option value="">Couldn't load bank list — refresh to retry</option>`;
    return;
  }

  select.innerHTML = data.banks
    .map((b) => `<option value="${b.code}">${escapeHtml(b.name)}</option>`)
    .join("");
}

function wireStep3() {
  document.getElementById("step3NextBtn").addEventListener("click", async () => {
    const bankCode = document.getElementById("bankSelect").value;
    const accountNumber = document.getElementById("bankAccountNumber").value.trim();
    const errorEl = document.getElementById("step3Error");
    const verifiedEl = document.getElementById("verifiedName");
    const btn = document.getElementById("step3NextBtn");

    errorEl.textContent = "";
    verifiedEl.hidden = true;

    if (!bankCode || accountNumber.length !== 10) {
      errorEl.textContent = "Select a bank and enter a valid 10-digit account number.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Verifying…";

    const { data, error } = await supabase.functions.invoke("verify-trader", {
      body: { profile_id: currentProfileId, account_number: accountNumber, bank_code: bankCode },
    });

    btn.disabled = false;
    btn.textContent = "Verify account";

    if (error || !data?.verified) {
      errorEl.textContent = "Couldn't verify that account — double check the number and bank.";
      return;
    }

    verifiedBankCode = bankCode;
    verifiedAccountNumber = accountNumber;
    verifiedEl.hidden = false;
    verifiedEl.textContent = `Verified: ${data.accountName}`;

    setTimeout(() => showFinalStep(), 900);
  });
}

// ── Step 4: done ──────────────────────────────

function showFinalStep() {
  const result = window.__nomadOnboardResult;
  document.getElementById("finalAccountNumber").textContent = result?.accountNumber ?? "—";
  document.getElementById("finalBankName").textContent = result?.bankName ?? "—";
  goToStep(4);
}

// ── Helpers ───────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
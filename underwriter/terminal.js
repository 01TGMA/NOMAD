// Nomad — terminal.js
// Drives the underwriter terminal: live ledger of traders, a scrolling
// ticker of settled transactions, and the loan disbursement panel.

import { supabase } from "../shared/supabaseClient.js";

const SCORE_THRESHOLD = 60; // must match disburse-loan's SCORE_THRESHOLD

let selectedProfileId = null;
let tradersById = new Map(); // profile_id -> { name, score, volume, consistency, velocity }

init();

async function init() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "../auth/login.html";
    return;
  }

  startClock();
  await loadLedger();
  subscribeToLiveUpdates();
  wireDisburseButton();
}

// ── Clock ────────────────────────────────────

function startClock() {
  const clockEl = document.getElementById("termClock");
  const tick = () => {
    clockEl.textContent = new Date().toLocaleTimeString("en-GB", { hour12: false });
  };
  tick();
  setInterval(tick, 1000);
}

// ── Ledger ───────────────────────────────────

async function loadLedger() {
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, business_name")
    .eq("role", "trader");

  if (profileError) {
    console.error("Failed to load traders", profileError);
    return;
  }

  const { data: scores, error: scoreError } = await supabase
    .from("credit_scores")
    .select("profile_id, score, volume_component, consistency_component, velocity_component");

  if (scoreError) {
    console.error("Failed to load scores", scoreError);
    return;
  }

  const scoreByProfile = new Map(scores.map((s) => [s.profile_id, s]));

  tradersById = new Map(
    profiles.map((p) => {
      const s = scoreByProfile.get(p.id);
      return [
        p.id,
        {
          name: p.business_name || "Unnamed trader",
          score: s?.score ?? 0,
          volume: s?.volume_component ?? 0,
          consistency: s?.consistency_component ?? 0,
          velocity: s?.velocity_component ?? 0,
        },
      ];
    }),
  );

  renderLedger();
}

function renderLedger() {
  const body = document.getElementById("ledgerBody");
  const empty = document.getElementById("ledgerEmpty");
  const count = document.getElementById("ledgerCount");

  body.innerHTML = "";
  count.textContent = `${tradersById.size} traders`;

  if (tradersById.size === 0) {
    empty.classList.add("visible");
    return;
  }
  empty.classList.remove("visible");

  // Highest score first — surfaces the traders closest to qualifying.
  const sorted = [...tradersById.entries()].sort((a, b) => b[1].score - a[1].score);

  sorted.forEach(([profileId, trader]) => {
    body.appendChild(buildLedgerRow(profileId, trader));
  });
}

function buildLedgerRow(profileId, trader) {
  const row = document.createElement("tr");
  row.dataset.profileId = profileId;
  if (profileId === selectedProfileId) row.classList.add("selected");

  const qualified = trader.score >= SCORE_THRESHOLD;

  row.innerHTML = `
    <td>${escapeHtml(trader.name)}</td>
    <td>
      <div class="score-cell">
        <div class="score-bar-track">
          <div class="score-bar-fill" style="width:${Math.min(100, trader.score)}%"></div>
        </div>
        <span class="score-value">${Math.round(trader.score)}</span>
      </div>
    </td>
    <td class="col-num">${Math.round(trader.volume)}</td>
    <td class="col-num">${Math.round(trader.consistency)}</td>
    <td class="col-num">${Math.round(trader.velocity)}</td>
    <td><span class="status-pill ${qualified ? "qualified" : ""}">${qualified ? "QUALIFIED" : "—"}</span></td>
    <td><button class="ledger-open-btn" type="button">OPEN</button></td>
  `;

  row.addEventListener("click", () => selectTrader(profileId));
  return row;
}

// ── Loan panel ───────────────────────────────

function selectTrader(profileId) {
  selectedProfileId = profileId;
  const trader = tradersById.get(profileId);
  if (!trader) return;

  renderLedger(); // re-render to update the "selected" row highlight

  document.getElementById("loanPanelEmpty").hidden = true;
  const content = document.getElementById("loanPanelContent");
  content.hidden = false;

  const qualified = trader.score >= SCORE_THRESHOLD;

  document.getElementById("loanTraderName").textContent = trader.name;
  const badge = document.getElementById("loanTraderBadge");
  badge.textContent = qualified ? "QUALIFIED" : "BELOW THRESHOLD";
  badge.classList.toggle("qualified", qualified);

  document.getElementById("loanScoreValue").textContent = Math.round(trader.score);
  document.getElementById("loanVolumeValue").textContent = Math.round(trader.volume);
  document.getElementById("loanConsistencyValue").textContent = Math.round(trader.consistency);
  document.getElementById("loanVelocityValue").textContent = Math.round(trader.velocity);

  const disburseBtn = document.getElementById("loanDisburseBtn");
  disburseBtn.disabled = !qualified;
  document.getElementById("loanStatusMsg").textContent = qualified
    ? ""
    : "This trader hasn't crossed the qualification threshold yet.";
  document.getElementById("loanStatusMsg").className = "loan-status";
}

function wireDisburseButton() {
  document.getElementById("loanDisburseBtn").addEventListener("click", async () => {
    if (!selectedProfileId) return;

    const amount = Number(document.getElementById("loanAmountInput").value);
    const statusEl = document.getElementById("loanStatusMsg");
    const btn = document.getElementById("loanDisburseBtn");

    if (!amount || amount <= 0) {
      statusEl.textContent = "Enter a valid amount.";
      statusEl.className = "loan-status error";
      return;
    }

    // Destination is the trader's OWN bank account (set during onboarding
    // via verify-trader), NOT the Monnify reserved account — that reserved
    // account only collects incoming sales, it can't receive a disbursement.
    const { data: profile } = await supabase
      .from("profiles")
      .select("disbursement_account_number, disbursement_bank_code")
      .eq("id", selectedProfileId)
      .single();

    if (!profile?.disbursement_account_number || !profile?.disbursement_bank_code) {
      statusEl.textContent = "This trader hasn't completed bank verification yet.";
      statusEl.className = "loan-status error";
      return;
    }

    btn.disabled = true;
    statusEl.textContent = "Sending disbursement request…";
    statusEl.className = "loan-status";

    const { data, error } = await supabase.functions.invoke("disburse-loan", {
      body: {
        profile_id: selectedProfileId,
        amount,
        destination_bank_code: profile.disbursement_bank_code,
        destination_account_number: profile.disbursement_account_number,
      },
    });

    btn.disabled = false;

    if (error) {
      statusEl.textContent = `Disbursement failed: ${error.message}`;
      statusEl.className = "loan-status error";
      return;
    }

    if (data?.warning) {
      statusEl.textContent = data.warning;
      statusEl.className = "loan-status error";
      return;
    }

    statusEl.textContent = `Disbursed ₦${amount.toLocaleString()} — loan ${data.loan_id}`;
    statusEl.className = "loan-status success";
  });
}

// ── Ticker + realtime ────────────────────────

function subscribeToLiveUpdates() {
  const liveIndicator = document.getElementById("liveIndicator");

  const channel = supabase
    .channel("underwriter-terminal")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "transactions" },
      async (payload) => {
        await pushTickerItem(payload.new);
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "credit_scores" },
      (payload) => {
        updateTraderScore(payload.new);
      },
    )
    .subscribe((status) => {
      liveIndicator.style.opacity = status === "SUBSCRIBED" ? "1" : "0.4";
    });

  window.addEventListener("beforeunload", () => supabase.removeChannel(channel));
}

async function pushTickerItem(tx) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name")
    .eq("id", tx.profile_id)
    .single();

  const track = document.getElementById("tickerTrack");
  const emptyMsg = track.querySelector(".ticker-empty");
  if (emptyMsg) emptyMsg.remove();

  const item = document.createElement("span");
  item.className = "ticker-item";
  item.innerHTML = `
    <span class="t-arrow">›</span>
    ${escapeHtml(profile?.business_name || "Trader")}
    <span class="t-amount">+₦${Number(tx.amount).toLocaleString()}</span>
  `;
  track.appendChild(item);

  // Keep the ticker from growing unbounded across a long demo session.
  while (track.children.length > 40) {
    track.removeChild(track.firstChild);
  }
}

function updateTraderScore(scoreRow) {
  const trader = tradersById.get(scoreRow.profile_id);
  if (!trader) return; // new trader not yet in the ledger — a full reload would pick them up

  trader.score = scoreRow.score;
  trader.volume = scoreRow.volume_component;
  trader.consistency = scoreRow.consistency_component;
  trader.velocity = scoreRow.velocity_component;

  renderLedger();

  if (scoreRow.profile_id === selectedProfileId) {
    selectTrader(selectedProfileId); // refresh the open panel too
  }
}

// ── Helpers ──────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
// Nomad — trader.js
// Drives the gauge, QR code, and live transaction feed on the trader dashboard.

import { supabase } from "../shared/supabaseClient.js";

// ── Config ──────────────────────────────────
const SCORE_THRESHOLD = 60; // must match disburse-loan's SCORE_THRESHOLD
const GAUGE_START_ANGLE = -210; // degrees, matches the SVG arc's start
const GAUGE_END_ANGLE = 30; // degrees, matches the SVG arc's end
const GAUGE_CENTER = { x: 150, y: 170 };
const GAUGE_RADIUS = 120;

let currentProfileId = null;
let todayCount = 0;

init();

async function init() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "../auth/login.html";
    return;
  }
  currentProfileId = user.id;

  drawGaugeTicks();
  drawRedlineZone();

  await Promise.all([
    loadProfile(currentProfileId),
    loadScore(currentProfileId),
    loadRecentTransactions(currentProfileId),
  ]);

  subscribeToLiveUpdates(currentProfileId);
  wireAccountNumberCopy();
}

// ── Profile + account card ─────────────────

async function loadProfile(profileId) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("monnify_account_number, monnify_bank_name")
    .eq("id", profileId)
    .single();

  if (error || !profile) {
    console.error("Failed to load profile", error);
    return;
  }

  document.getElementById("accountNumberText").textContent =
    profile.monnify_account_number ?? "Not yet assigned";
  document.getElementById("accountBankName").textContent =
    profile.monnify_bank_name ?? "—";

  if (profile.monnify_account_number) {
    renderQrCode(profile.monnify_account_number);
  }
}

function renderQrCode(accountNumber) {
  const container = document.getElementById("qrContainer");
  container.innerHTML = ""; // clear any placeholder
  // eslint-disable-next-line no-undef -- QRCode loaded via CDN script tag
  new QRCode(container, {
    text: accountNumber,
    width: 160,
    height: 160,
    colorDark: "#060606",
    colorLight: "#f5f5f5",
  });
}

function wireAccountNumberCopy() {
  const btn = document.getElementById("accountNumberBtn");
  const hint = document.getElementById("copyHint");

  btn.addEventListener("click", async () => {
    const text = document.getElementById("accountNumberText").textContent;
    if (!text || text.includes("•")) return;

    try {
      await navigator.clipboard.writeText(text);
      hint.textContent = "Copied!";
      setTimeout(() => {
        hint.textContent = "Tap the account number to copy it";
      }, 1800);
    } catch {
      hint.textContent = "Couldn't copy — long-press to select instead";
    }
  });
}

// ── Score gauge ─────────────────────────────

async function loadScore(profileId) {
  const { data: scoreRow } = await supabase
    .from("credit_scores")
    .select("score")
    .eq("profile_id", profileId)
    .maybeSingle();

  setGauge(scoreRow?.score ?? 0);
}

function setGauge(score) {
  const clamped = Math.max(0, Math.min(100, score));

  document.getElementById("gaugeScore").textContent = Math.round(clamped);

  const angle = GAUGE_START_ANGLE + (clamped / 100) * (GAUGE_END_ANGLE - GAUGE_START_ANGLE);
  const needle = document.getElementById("gaugeNeedle");
  needle.style.transform = `rotate(${angle + 90}deg)`;

  const statusEl = document.getElementById("gaugeStatus");
  if (clamped >= SCORE_THRESHOLD) {
    statusEl.textContent = `Qualified for a working-capital advance`;
    statusEl.classList.add("qualified");
  } else {
    const pointsToGo = Math.ceil(SCORE_THRESHOLD - clamped);
    statusEl.textContent = `${pointsToGo} points to your next advance`;
    statusEl.classList.remove("qualified");
  }
}

function drawGaugeTicks() {
  const ticksGroup = document.getElementById("gaugeTicks");
  const tickValues = [0, 20, 40, 60, 80, 100];

  tickValues.forEach((value) => {
    const angleDeg = GAUGE_START_ANGLE + (value / 100) * (GAUGE_END_ANGLE - GAUGE_START_ANGLE);
    const angleRad = (angleDeg * Math.PI) / 180;

    const outer = pointOnCircle(GAUGE_RADIUS + 4, angleRad);
    const inner = pointOnCircle(GAUGE_RADIUS - 8, angleRad);
    const labelPos = pointOnCircle(GAUGE_RADIUS - 24, angleRad);

    const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tick.setAttribute("x1", outer.x);
    tick.setAttribute("y1", outer.y);
    tick.setAttribute("x2", inner.x);
    tick.setAttribute("y2", inner.y);
    tick.setAttribute("class", "gauge-tick");
    ticksGroup.appendChild(tick);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", labelPos.x);
    label.setAttribute("y", labelPos.y);
    label.setAttribute("class", "gauge-tick-label");
    label.textContent = value;
    ticksGroup.appendChild(label);
  });
}

function drawRedlineZone() {
  const startAngleDeg =
    GAUGE_START_ANGLE + (SCORE_THRESHOLD / 100) * (GAUGE_END_ANGLE - GAUGE_START_ANGLE);
  const endAngleDeg = GAUGE_END_ANGLE;

  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad = (endAngleDeg * Math.PI) / 180;

  const start = pointOnCircle(GAUGE_RADIUS, startRad);
  const end = pointOnCircle(GAUGE_RADIUS, endRad);

  const path = document.getElementById("gaugeRedline");
  path.setAttribute(
    "d",
    `M ${start.x} ${start.y} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 ${end.x} ${end.y}`,
  );
}

function pointOnCircle(radius, angleRad) {
  return {
    x: GAUGE_CENTER.x + radius * Math.cos(angleRad),
    y: GAUGE_CENTER.y + radius * Math.sin(angleRad),
  };
}

// ── Transaction feed ────────────────────────

async function loadRecentTransactions(profileId) {
  const { data: txs, error } = await supabase
    .from("transactions")
    .select("amount, settled_at")
    .eq("profile_id", profileId)
    .order("settled_at", { ascending: false })
    .limit(15);

  if (error) {
    console.error("Failed to load transactions", error);
    return;
  }

  renderTransactionList(txs ?? []);
  updateTodayCount(txs ?? []);
}

function renderTransactionList(txs) {
  const list = document.getElementById("receiptList");
  const empty = document.getElementById("receiptEmpty");

  list.innerHTML = "";

  if (txs.length === 0) {
    empty.classList.add("visible");
    return;
  }
  empty.classList.remove("visible");

  txs.forEach((tx) => list.appendChild(buildReceiptRow(tx)));
}

function prependTransactionRow(tx) {
  const list = document.getElementById("receiptList");
  const empty = document.getElementById("receiptEmpty");
  empty.classList.remove("visible");

  list.prepend(buildReceiptRow(tx));

  // Keep the feed capped so it doesn't grow unbounded during a live demo.
  while (list.children.length > 15) {
    list.removeChild(list.lastChild);
  }
}

function buildReceiptRow(tx) {
  const row = document.createElement("li");
  row.className = "receipt-row";

  const amount = document.createElement("span");
  amount.className = "receipt-amount";
  amount.textContent = formatNaira(tx.amount);

  const meta = document.createElement("div");
  meta.className = "receipt-meta";

  const label = document.createElement("span");
  label.className = "receipt-label";
  label.textContent = "TRANSFER";

  const time = document.createElement("span");
  time.className = "receipt-time";
  time.textContent = formatRelativeTime(tx.settled_at);

  meta.appendChild(label);
  meta.appendChild(time);
  row.appendChild(amount);
  row.appendChild(meta);

  return row;
}

function updateTodayCount(txs) {
  const today = new Date().toISOString().slice(0, 10);
  const count = txs.filter((t) => t.settled_at.slice(0, 10) === today).length;
  todayCount = count;
  document.getElementById("receiptCount").textContent = `${count} today`;
}

// ── Realtime subscriptions ──────────────────

function subscribeToLiveUpdates(profileId) {
  const liveIndicator = document.getElementById("liveIndicator");

  const channel = supabase
    .channel(`trader-${profileId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "transactions",
        filter: `profile_id=eq.${profileId}`,
      },
      (payload) => {
        prependTransactionRow(payload.new);
        const settledToday =
          payload.new.settled_at.slice(0, 10) === new Date().toISOString().slice(0, 10);
        if (settledToday) {
          todayCount += 1;
          document.getElementById("receiptCount").textContent = `${todayCount} today`;
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "credit_scores",
        filter: `profile_id=eq.${profileId}`,
      },
      (payload) => {
        setGauge(payload.new.score);
      },
    )
    .subscribe((status) => {
      liveIndicator.style.opacity = status === "SUBSCRIBED" ? "1" : "0.4";
    });

  window.addEventListener("beforeunload", () => supabase.removeChannel(channel));
}

// ── Helpers ─────────────────────────────────

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatRelativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
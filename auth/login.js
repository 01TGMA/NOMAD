// Nomad — login.js
// Signs the user in, then redirects to the correct dashboard based on
// their profile role (trader vs underwriter).

import { supabase } from "../shared/supabaseClient.js";

// If already signed in, skip straight to the right dashboard.
init();

async function init() {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await redirectByRole(user.id);
    return;
  }
  wireLoginButton();
}

function wireLoginButton() {
  const btn = document.getElementById("loginBtn");
  const errorEl = document.getElementById("loginError");

  btn.addEventListener("click", handleLogin);

  // Allow pressing Enter in either field to submit.
  document.getElementById("loginPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });

  async function handleLogin() {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    errorEl.textContent = "";

    if (!email || !password) {
      errorEl.textContent = "Enter both email and password.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Signing in…";

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      btn.disabled = false;
      btn.textContent = "Sign in";
      errorEl.textContent = error.message;
      return;
    }

    await redirectByRole(data.user.id);
  }
}

async function redirectByRole(userId) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    document.getElementById("loginError").textContent =
      "Signed in, but couldn't find your profile. Try again or contact support.";
    return;
  }

  window.location.href =
    profile.role === "underwriter"
      ? "../underwriter/terminal.html"
      : "../trader/trader.html";
}
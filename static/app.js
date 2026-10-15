/* What Can I Make? — frontend (vanilla JS, no build step) */
(() => {
  "use strict";

  // ---------- Catalog ----------
  const INGREDIENTS = [
    { group: "Vegetables & Fruit", items: [
      ["Tomato", "🍅"], ["Potato", "🥔"], ["Onion", "🧅"], ["Garlic", "🧄"], ["Bell pepper", "🫑"], ["Mushroom", "🍄"],
      ["Spinach", "🥬"], ["Carrot", "🥕"], ["Zucchini", "🥒"], ["Broccoli", "🥦"], ["Avocado", "🥑"], ["Lemon", "🍋"], ["Cucumber", "🥒"],
    ]},
    { group: "Protein", items: [
      ["Eggs", "🥚"], ["Chicken", "🍗"], ["Ground beef", "🥩"], ["Tuna", "🐟"], ["Salmon", "🍣"], ["Tofu", "🧈"], ["Chickpeas", "🫘"], ["Lentils", "🫘"],
    ]},
    { group: "Dairy & Alternatives", items: [
      ["Milk", "🥛"], ["Cream", "🍶"], ["Butter", "🧈"], ["Cheese", "🧀"], ["Parmesan", "🧀"], ["Mozzarella", "🧀"], ["Plant-based milk", "🌱"],
    ]},
    { group: "Carbs & Grains", items: [
      ["Pasta", "🍝"], ["Rice", "🍚"], ["Bread", "🍞"], ["Flour", "🌾"], ["Tortillas", "🫓"], ["Oats", "🥣"], ["Couscous", "🌾"], ["Noodles", "🍜"],
    ]},
  ];
  const PANTRY = [
    { group: "Spices", items: [
      ["Salt", "🧂"], ["Black pepper", "⚫"], ["Paprika", "🌶️"], ["Chili flakes", "🌶️"], ["Cumin", "🟤"], ["Turmeric", "🟡"],
      ["Oregano", "🌿"], ["Basil", "🌿"], ["Cinnamon", "🪵"], ["Garlic powder", "🧄"],
    ]},
    { group: "Condiments & Basics", items: [
      ["Olive oil", "🫒"], ["Vegetable oil", "🌻"], ["Soy sauce", "🥢"], ["Ketchup", "🍅"], ["Mayonnaise", "🥚"], ["Mustard", "🌭"],
      ["Tomato paste", "🥫"], ["Honey", "🍯"], ["Vinegar", "🍶"], ["Hot sauce", "🔥"],
    ]},
  ];
  const BASIC_SPICES = ["Salt", "Black pepper", "Paprika", "Chili flakes", "Garlic powder", "Oregano", "Olive oil"];
  const EQUIPMENT = [
    ["Stovetop / gas", "🔥"], ["Oven", "♨️"], ["Microwave", "📦"], ["Air fryer", "🍟"], ["Toaster / sandwich press", "🥪"],
    ["Blender", "🌀"], ["Food processor", "🥣"], ["Rice cooker", "🍚"], ["Slow cooker", "🫕"], ["Grill", "🍖"],
  ];
  const MODES = [
    { id: "practical", emo: "🥗", name: "Practical", desc: "Simple, realistic meals you'd actually make tonight." },
    { id: "creative", emo: "✨", name: "Creative", desc: "Surprising, interesting ideas from what you have." },
    { id: "use_what_i_have", emo: "🆘", name: "Use What I Have", desc: "Use up as much as possible — Use Soon items first." },
  ];
  const TIMES = [[15, "15 min"], [30, "30 min"], [60, "60 min"], [null, "No limit"]];
  const DIFFS = ["Easy", "Medium", "Anything"];
  const DIETS = ["Anything", "Vegetarian", "Vegan", "Gluten-free"];
  const SAMPLE = {
    ingredients: ["Tomato", "Potato", "Onion", "Garlic", "Spinach", "Eggs", "Cheese", "Pasta", "Lemon"],
    useSoon: ["Tomato", "Spinach"],
    pantry: [...BASIC_SPICES, "Butter", "Honey", "Vinegar"].filter((p) => PANTRY_NAMES().includes(p)),
    equipment: ["Stovetop / gas", "Oven", "Microwave"],
  };
  function PANTRY_NAMES() { return PANTRY.flatMap((g) => g.items.map((i) => i[0])); }
  const EMOJI = Object.fromEntries([...INGREDIENTS, ...PANTRY].flatMap((g) => g.items));
  const EQ_EMOJI = Object.fromEntries(EQUIPMENT);

  // On GitHub Pages the API is on a separate server (see config.js); otherwise it's same-origin
  const API_BASE = location.hostname.endsWith("github.io") ? (window.API_BASE || "").replace(/\/$/, "") : "";

  // ---------- State ----------
  const defaults = () => ({
    ingredients: [],           // [{name, soon}]
    customIngredients: [],
    pantry: [],
    customPantry: [],
    equipment: [],
    maxTime: 30, difficulty: "Anything", diet: "Anything", servings: 2, mode: "practical", source: "ai",
    shopping: [],              // [{name, checked, recipe}]
  });
  let state = load();
  let step = 0;
  let recipes = [];
  let seenNames = [];
  let busy = false;
  let justAdded = "";        // name of the last added item, so only it animates in

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem("wcim-state") || "null");
      if (saved && typeof saved === "object") return { ...defaults(), ...saved };
    } catch (_) { /* storage unavailable */ }
    return defaults();
  }
  function save() {
    try { localStorage.setItem("wcim-state", JSON.stringify(state)); } catch (_) { /* ignore */ }
  }

  // ---------- Helpers ----------
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => s.trim().toLowerCase();
  const titleCase = (s) => s.trim().replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase());
  const hasIng = (name) => state.ingredients.some((i) => norm(i.name) === norm(name));
  const hasPantry = (name) => state.pantry.some((p) => norm(p) === norm(name));
  const emojiFor = (name) => EMOJI[name] || "🥄";

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  // ---------- Ingredient / pantry pickers ----------
  function renderPicker(kind) {
    const isIng = kind === "ingredients";
    const catalog = isIng ? INGREDIENTS : PANTRY;
    const custom = isIng ? state.customIngredients : state.customPantry;
    const q = norm($(isIng ? "#ingredientSearch" : "#pantrySearch").value);
    const isOn = isIng ? hasIng : hasPantry;
    const groups = [...catalog, ...(custom.length ? [{ group: "Your additions", items: custom.map((c) => [c, "🥄"]), custom: true }] : [])];

    let html = "", total = 0, exact = false;
    for (const g of groups) {
      const items = g.items.filter(([n]) => !q || norm(n).includes(q));
      if (items.some(([n]) => norm(n) === q)) exact = true;
      if (!items.length) continue;
      total += items.length;
      html += `<div class="group"><div class="group-title">${esc(g.group)}</div><div class="chips">` +
        items.map(([n, e]) => `<button class="chip${isOn(n) ? " on" : ""}${g.custom ? " custom" : ""}" data-name="${esc(n)}"><span class="emo">${e}</span>${esc(n)}</button>`).join("") +
        `</div></div>`;
    }
    if (!total) html = `<p class="no-results">No match for “${esc(q)}”. Press <strong>Enter</strong> to add it to your kitchen.</p>`;
    $(isIng ? "#ingredientGroups" : "#pantryGroups").innerHTML = html;
    const addBtn = $(isIng ? "#ingredientAdd" : "#pantryAdd");
    addBtn.classList.toggle("hidden", !q || exact);
    addBtn.textContent = `+ Add “${titleCase(q || "")}”`;
  }

  function toggleIngredient(name) {
    if (hasIng(name)) state.ingredients = state.ingredients.filter((i) => norm(i.name) !== norm(name));
    else { state.ingredients.push({ name, soon: false }); justAdded = name; }
    commit();
  }
  function togglePantry(name) {
    if (hasPantry(name)) state.pantry = state.pantry.filter((p) => norm(p) !== norm(name));
    else { state.pantry.push(name); justAdded = name; }
    commit();
  }
  function addCustom(kind) {
    const isIng = kind === "ingredients";
    const input = $(isIng ? "#ingredientSearch" : "#pantrySearch");
    const raw = input.value.trim();
    if (!raw) return;
    const catalog = (isIng ? INGREDIENTS : PANTRY).flatMap((g) => g.items.map((i) => i[0]));
    const custom = isIng ? state.customIngredients : state.customPantry;
    const existing = [...catalog, ...custom].find((n) => norm(n) === norm(raw));
    const name = existing || titleCase(raw).slice(0, 40);
    if (!existing) custom.push(name);
    if (isIng ? !hasIng(name) : !hasPantry(name)) (isIng ? toggleIngredient : togglePantry)(name);
    input.value = "";
    toast(`${name} added to your kitchen`);
    commit();
  }

  function renderEquipment() {
    $("#equipmentGrid").innerHTML = EQUIPMENT.map(([n, e]) =>
      `<button class="eq-card${state.equipment.includes(n) ? " on" : ""}" data-name="${esc(n)}"><span class="eq-emo">${e}</span>${esc(n)}</button>`).join("");
  }

  function renderPrefs() {
    $("#modeGrid").innerHTML = MODES.map((m) =>
      `<button class="mode-card${state.mode === m.id ? " on" : ""}" data-mode="${m.id}"><span class="mode-emo">${m.emo}</span><strong>${m.name}</strong><span class="desc">${m.desc}</span></button>`).join("");
    $("#timeSeg").innerHTML = TIMES.map(([v, l]) => `<button data-time="${v}" class="${state.maxTime === v ? "on" : ""}">${l}</button>`).join("");
    $("#diffSeg").innerHTML = DIFFS.map((d) => `<button data-diff="${d}" class="${state.difficulty === d ? "on" : ""}">${d}</button>`).join("");
    $("#dietSeg").innerHTML = DIETS.map((d) => `<button data-diet="${d}" class="${state.diet === d ? "on" : ""}">${d}</button>`).join("");
    $("#servValue").textContent = state.servings;
    $("#servLabel").textContent = state.servings === 1 ? "person" : "people";
  }

  // ---------- My Kitchen ----------
  function renderKitchen() {
    const list = $("#kitchenIngredients");
    const soonFirst = [...state.ingredients].sort((a, b) => Number(b.soon) - Number(a.soon));
    list.innerHTML = soonFirst.length
      ? soonFirst.map((i) => `
        <div class="k-item${i.soon ? " soon" : ""}${i.name === justAdded ? " new" : ""}" data-name="${esc(i.name)}">
          <span>${emojiFor(i.name)}</span>
          <span class="k-name" title="${esc(i.name)}">${esc(i.name)}</span>
          <button class="soon-toggle${i.soon ? " on" : ""}" data-act="soon" title="Close to expiring — prioritize it">⚠️ Use Soon</button>
          <button class="x" data-act="remove" aria-label="Remove ${esc(i.name)}">✕</button>
        </div>`).join("")
      : `<div class="empty">Your kitchen is empty — tap ingredients to add them 🥕</div>`;
    $("#kitchenPantry").innerHTML = state.pantry.length
      ? state.pantry.map((p) => `<span class="mini${p === justAdded ? " new" : ""}">${esc(p)}</span>`).join("")
      : `<span class="muted small">None selected — we won't assume any.</span>`;
    $("#kitchenEquipment").innerHTML = state.equipment.length
      ? state.equipment.map((e) => `<span class="mini">${EQ_EMOJI[e] || ""} ${esc(e)}</span>`).join("")
      : `<span class="muted small">Pick what you can cook with.</span>`;
    $("#ingCount").textContent = state.ingredients.length;
    $("#pantryCount").textContent = state.pantry.length;
    $("#eqCount").textContent = state.equipment.length;
    const mode = MODES.find((m) => m.id === state.mode);
    $("#kitchenSummary").innerHTML = [
      `${mode.emo} ${mode.name}`, `⏱ ${state.maxTime ? `≤ ${state.maxTime} min` : "No time limit"}`,
      `⭐ ${state.difficulty === "Anything" ? "Any difficulty" : state.difficulty}`,
      ...(state.diet !== "Anything" ? [`🥗 ${state.diet}`] : []), `👥 ${state.servings}`,
    ].map((s) => `<span class="mini">${esc(s)}</span>`).join("");

    document.querySelectorAll("#sourceSeg [data-source]").forEach((b) => b.classList.toggle("on", b.dataset.source === state.source));
    const problem = !state.ingredients.length ? "Add at least one ingredient to start."
      : !state.equipment.length ? "Select your kitchen equipment (step 3)." : "";
    $("#generateBtn").disabled = !!problem || busy;
    $("#genHint").textContent = problem || `${state.ingredients.length} ingredients · ${state.pantry.length} spices & condiments · ${state.equipment.length} appliances`;
  }

  function renderStep() {
    document.querySelectorAll(".step").forEach((b, i) => {
      b.classList.toggle("active", i === step);
      const done = [state.ingredients.length, state.pantry.length, state.equipment.length, 0][i] > 0;
      b.classList.toggle("done", i !== step && done);
    });
    document.querySelectorAll(".panel").forEach((p, i) => p.classList.toggle("active", i === step));
    $("#prevBtn").style.visibility = step === 0 ? "hidden" : "visible";
    const next = $("#nextBtn");
    if (step === 3) { next.textContent = "✨ What Can I Make?"; next.className = "btn magic"; }
    else { next.textContent = "Next →"; next.className = "btn dark"; }
    $("#stepHint").textContent = ["Step 1 of 4", "Step 2 of 4", "Step 3 of 4", "Step 4 of 4"][step];
  }

  function commit() {
    save();
    setTimeout(() => { justAdded = ""; }, 0);
    renderPicker("ingredients");
    renderPicker("pantry");
    renderEquipment();
    renderPrefs();
    renderKitchen();
    renderStep();
    renderShopping();
  }

  // ---------- Generation ----------
  const LOADING_STEPS = ["Checking your ingredients…", "Checking your equipment & constraints…", "Finding combinations…", "Creating your recipes…", "Plating up…"];
  let loadingTimer, slowTimer, loadingSkipTimer;
  const REQUEST_TIMEOUT_MS = 45000;

  function startLoading(again) {
    $("#loading").classList.remove("hidden");
    $("#errorBox").classList.add("hidden");
    $("#recipeGrid").innerHTML = "";
    $("#loadingTitle").textContent = again ? "👨‍🍳 Cooking up fresh ideas…" : "👨‍🍳 Looking through your kitchen…";
    const ul = $("#loadingSteps");
    ul.innerHTML = LOADING_STEPS.map((s) => `<li><span class="ico"></span>${s}</li>`).join("");
    const lis = [...ul.children];
    let i = 0;
    const tick = () => {
      lis.forEach((li, j) => {
        li.classList.toggle("done", j < i);
        li.classList.toggle("active", j === i);
        li.querySelector(".ico").textContent = j < i ? "✓" : "";
      });
      if (i < lis.length - 1) { i++; loadingTimer = setTimeout(tick, 1700 + Math.random() * 1200); }
    };
    tick();
    // Reassure during long waits (free servers sleep when idle and take a while to wake up)
    $("#skipBtn").classList.add("hidden");
    loadingSkipTimer = setTimeout(() => $("#skipBtn").classList.remove("hidden"), 6000);
    slowTimer = setTimeout(() => {
      $("#loadingTitle").textContent = API_BASE
        ? "☕ Waking up the kitchen server — the first request can take up to a minute…"
        : "🍲 Still simmering — almost there…";
    }, 15000);
  }
  function stopLoading() {
    clearTimeout(loadingTimer);
    clearTimeout(slowTimer);
    clearTimeout(loadingSkipTimer);
    $("#loading").classList.add("hidden");
  }

  function showResultsView() {
    $("#setupView").classList.add("hidden");
    $("#resultsView").classList.remove("hidden");
    const mode = MODES.find((m) => m.id === state.mode);
    $("#resultsChips").innerHTML = [
      `${mode.emo} ${mode.name}`, `⏱ ${state.maxTime ? `≤ ${state.maxTime} min` : "No time limit"}`,
      `⭐ ${state.difficulty === "Anything" ? "Any difficulty" : state.difficulty}`,
      ...(state.diet !== "Anything" ? [`🥗 ${state.diet}`] : []), `👥 ${state.servings} ${state.servings === 1 ? "person" : "people"}`,
      ...state.equipment.map((e) => `${EQ_EMOJI[e] || ""} ${e}`),
    ].map((s) => `<span class="mini">${esc(s)}</span>`).join("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- ⚡ Instant recipes (built-in collection, matched in the browser) ----------
  const DIET_TAG = { Vegetarian: ["V", "VG"], Vegan: ["VG"], "Gluten-free": ["GF"] };
  const TAG_LABEL = { V: "Vegetarian", VG: "Vegan", GF: "Gluten-free" };

  function instantRecipes(again) {
    const kitchen = new Map(state.ingredients.map((i) => [norm(i.name), i.name]));
    const pantry = new Map(state.pantry.map((p) => [norm(p), p]));
    const soon = new Set(state.ingredients.filter((i) => i.soon).map((i) => norm(i.name)));
    const eqHave = new Set(state.equipment);
    const pick = (alts, map) => alts.split("|").map((a) => map.get(norm(a))).find(Boolean);

    const matches = [];
    for (const R of window.INSTANT_RECIPES || []) {
      if (state.maxTime && R.time > state.maxTime) continue;
      if (state.difficulty === "Easy" && R.diff !== "Easy") continue;
      if (DIET_TAG[state.diet] && !DIET_TAG[state.diet].some((t) => R.tags.includes(t))) continue;
      const equipment = R.eq.map((alts) => alts.split("|").find((e) => eqHave.has(e)));
      if (equipment.some((e) => !e)) continue;

      const ingredients = [], fromKitchen = [], spices = [], missing = [], soonUsed = [];
      for (const [alts, quantity, opt] of R.ing) {
        const k = pick(alts, kitchen), p = !k && pick(alts, pantry);
        if (k) {
          ingredients.push({ name: k, quantity, from_kitchen_item: k, source: "kitchen" });
          fromKitchen.push(k);
          if (soon.has(norm(k))) soonUsed.push(k);
        } else if (p) {
          ingredients.push({ name: p, quantity, from_kitchen_item: p, source: "pantry" });
          spices.push(p);
        } else if (!opt) {
          const name = alts.split("|").join(" or ");
          ingredients.push({ name, quantity, from_kitchen_item: "", source: "missing" });
          missing.push(name);
        }
      }
      if (missing.length > 2 || !fromKitchen.length) continue;

      const useBoost = state.mode === "use_what_i_have" ? 3 : 1;
      const score = fromKitchen.length * 2 * useBoost + soonUsed.length * 5 * useBoost - missing.length * 6
        - (state.mode === "practical" ? R.time / 30 : 0) + Math.random() * (state.mode === "creative" ? 6 : 1.5);
      matches.push({
        score, name: R.name, emoji: R.emoji, description: R.desc, time_minutes: R.time, difficulty: R.diff, servings: 2,
        ingredients, use_soon_used: soonUsed, equipment, basic_tools: [], equipment_note: "", steps: R.steps,
        diet_tags: R.tags.filter((t) => !(t === "V" && R.tags.includes("VG"))).map((t) => TAG_LABEL[t]),
        why_it_works: R.why, uses_from_kitchen: fromKitchen, spices_used: spices, missing,
        status: missing.length ? "almost" : "ready", instant: true,
      });
    }
    matches.sort((a, b) => b.score - a.score);
    const fresh = again ? matches.filter((m) => !seenNames.includes(m.name)) : matches;
    const chosen = [...fresh, ...matches.filter((m) => !fresh.includes(m))].slice(0, 3);
    return chosen;
  }

  function showInstant(again, reason) {
    const list = instantRecipes(again);
    recipes = list;
    seenNames.push(...list.map((r) => r.name));
    stopLoading();
    if (!list.length) {
      $("#errorText").textContent = "None of the built-in recipes fit this kitchen and these constraints. Try adding ingredients or relaxing time, diet or difficulty" + (state.source === "instant" ? " — or switch to ✨ AI chef." : ".");
      $("#errorBox").classList.remove("hidden");
      $("#sourceNote").classList.add("hidden");
      return;
    }
    const note = $("#sourceNote");
    note.innerHTML = (reason ? `<strong>${esc(reason)}</strong> ` : "") + "⚡ Instant recipes from our built-in collection — matched to your kitchen, not AI-generated.";
    note.className = "source-note instant";
    renderRecipes();
  }

  let skipRequested = null;
  let lastWasFallback = false;
  let apiDown = false;   // set when the page-load health check to the remote API fails

  async function generate(again = false) {
    if (busy || !state.ingredients.length || !state.equipment.length) return;
    busy = true;
    if (!again) seenNames = [];
    showResultsView();
    $("#resultsTitle").textContent = "Here's what you can make";
    $("#sourceNote").classList.add("hidden");
    $("#againBtn").disabled = true;
    startLoading(again);
    renderKitchen();

    const quickFallback = state.source === "ai" && (apiDown || (again && lastWasFallback));
    if (state.source === "instant" || quickFallback) {
      await new Promise((r) => setTimeout(r, 900));
      showInstant(again, quickFallback ? "The AI chef isn't available right now." : "");
      lastWasFallback = quickFallback;
      busy = false; $("#againBtn").disabled = false; renderKitchen();
      return;
    }

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
    skipRequested = () => controller.abort("skip");
    try {
      const res = await fetch(`${API_BASE}/api/recipes`, {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: state.ingredients.map((i) => i.name),
          use_soon: state.ingredients.filter((i) => i.soon).map((i) => i.name),
          pantry: state.pantry,
          equipment: state.equipment,
          max_time: state.maxTime,
          difficulty: state.difficulty,
          diet: state.diet,
          servings: state.servings,
          mode: state.mode,
          avoid: again ? seenNames.slice(-15) : [],
        }),
      });
      let data = null;
      try { data = await res.json(); } catch (_) { /* non-JSON error page */ }
      if (!res.ok || !data || !Array.isArray(data.recipes)) {
        const err = new Error((data && data.error) || `Request failed (${res.status})`);
        err.status = res.status;
        throw err;
      }
      recipes = data.recipes;
      seenNames.push(...recipes.map((r) => r.name));
      lastWasFallback = false;
      stopLoading();
      const note = $("#sourceNote");
      note.textContent = "✨ Generated live by AI for your kitchen.";
      note.className = "source-note ai";
      renderRecipes();
    } catch (err) {
      const reason = controller.signal.aborted
        ? (controller.signal.reason === "skip" ? "" : "The AI took too long, so here's a quick alternative.")
        : err.status && err.status < 500 && err.status !== 429 ? null
        : "The AI chef isn't available right now.";
      if (reason !== null) {
        showInstant(again, reason);   // AI unreachable / slow / overloaded → never leave the user with nothing
        lastWasFallback = reason !== "";
      } else {
        stopLoading();
        $("#errorText").textContent = err.message;
        $("#errorBox").classList.remove("hidden");
      }
    } finally {
      clearTimeout(abortTimer);
      skipRequested = null;
      busy = false;
      $("#againBtn").disabled = false;
      renderKitchen();
    }
  }

  function recipeMeta(r) {
    return `<div class="meta">
      <span>⏱ ${esc(r.time_minutes)} min</span><span>⭐ ${esc(r.difficulty)}</span><span>👥 ${esc(r.servings)}</span>
      ${r.diet_tags.map((t) => `<span class="tag">${/vegan|vegetarian/i.test(t) ? "🌱" : /gluten/i.test(t) ? "🌾" : "✓"} ${esc(t)}</span>`).join("")}
    </div>`;
  }
  function statusBadge(r) {
    return r.status === "ready"
      ? `<span class="status ready"><span class="dot"></span>Ready to cook ✓</span>`
      : `<span class="status almost"><span class="dot"></span>Almost there!</span>`;
  }

  function renderRecipes() {
    const ready = recipes.filter((r) => r.status === "ready").length;
    $("#resultsTitle").textContent = ready === recipes.length ? "You can make all of these right now 🎉" : "Here's what you can make";
    $("#recipeGrid").innerHTML = recipes.map((r, idx) => `
      <article class="recipe-card" data-idx="${idx}" tabindex="0" role="button" aria-label="Open ${esc(r.name)}">
        <div class="rc-top g${idx % 3}">
          ${statusBadge(r)}
          <span class="rc-emoji">${esc(r.emoji || "🍽️")}</span>
        </div>
        <div class="rc-body">
          <h3>${esc(r.name)}</h3>
          <p class="rc-desc">${esc(r.description)}</p>
          ${recipeMeta(r)}
          ${r.uses_from_kitchen.length ? `<div><div class="rc-label">Uses from your kitchen</div>
            <div class="uses">${r.uses_from_kitchen.map(esc).join('<span class="sep">·</span>')}</div></div>` : ""}
          ${r.use_soon_used.length ? `<div class="use-soon-banner">⚠️ Uses your ${r.use_soon_used.map((s) => esc(s.toLowerCase())).join(" & ")} marked “Use Soon”</div>` : ""}
          ${r.missing.length ? `<div class="missing-box"><strong>🛒 Missing:</strong> ${r.missing.map(esc).join(", ")}
            <button class="btn soft small" data-shop="${idx}">+ Add missing ingredients to shopping list</button></div>` : ""}
          <div class="rc-foot"><span>View recipe</span><span class="arrow">→</span></div>
        </div>
      </article>`).join("");
  }

  // ---------- Recipe detail ----------
  function openRecipe(idx) {
    const r = recipes[idx];
    if (!r) return;
    const soon = new Set(r.use_soon_used.map(norm));
    const ingRow = (i) => {
      const icon = i.source === "kitchen" ? "✅" : i.source === "pantry" ? "🧂" : "🛒";
      const cls = i.source === "missing" ? "missing" : soon.has(norm(i.from_kitchen_item || "")) ? "soon" : "";
      return `<li class="${cls}"><span class="src">${icon}</span><span>${esc(i.name)}${i.source === "missing" ? ' <strong style="color:var(--amber)">(missing)</strong>' : ""}${cls === "soon" ? " ⚠️" : ""}</span><span class="q">${esc(i.quantity)}</span></li>`;
    };
    $("#modalContent").innerHTML = `
      <div class="m-hero g${idx % 3}">
        <div class="m-emoji">${esc(r.emoji || "🍽️")}</div>
        <div>
          ${statusBadge(r)}
          <h2 id="modalTitle">${esc(r.name)}</h2>
          <p>${esc(r.description)}</p>
          ${recipeMeta(r)}
        </div>
      </div>
      <div class="m-body">
        <div>
          <h3>Ingredients</h3>
          <ul class="ing-list">${r.ingredients.map(ingRow).join("")}</ul>
          <p class="legend">✅ from your kitchen · 🧂 your spices & condiments · 🛒 missing</p>
          ${r.missing.length ? `<button class="btn soft small" data-shop="${idx}" style="width:100%;margin:-.4rem 0 1.4rem">+ Add missing ingredients to shopping list</button>` : ""}
          <h3>Equipment</h3>
          <div class="eq-list">
            ${r.equipment.map((e) => `<span class="mini appliance">${EQ_EMOJI[e] || ""} ${esc(e)}</span>`).join("")}
            ${r.basic_tools.map((t) => `<span class="mini">${esc(t)}</span>`).join("")}
          </div>
        </div>
        <div>
          <h3>Step by step <span class="muted small" style="font-family:var(--body);font-weight:500">— tap a step when done</span></h3>
          <ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
          ${r.equipment_note ? `<div class="note adapt"><strong>🔧 Adapted to your kitchen</strong>${esc(r.equipment_note)}</div>` : ""}
          <div class="note why"><strong>💡 Why this works</strong>${esc(r.why_it_works)}</div>
          ${r.instant && state.servings !== r.servings ? `<div class="note adapt"><strong>📏 Serving size</strong>Quantities are for ${r.servings} — scale them for ${state.servings} ${state.servings === 1 ? "person" : "people"}.</div>` : ""}
        </div>
      </div>`;
    $("#modal").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    $("#modal .modal").scrollTop = 0;
  }
  function closeModal() {
    $("#modal").classList.add("hidden");
    document.body.style.overflow = "";
  }

  // ---------- Shopping list ----------
  function addToShopping(idx) {
    const r = recipes[idx];
    let added = 0;
    for (const m of r.missing) {
      if (!state.shopping.some((s) => norm(s.name) === norm(m))) {
        state.shopping.push({ name: m, checked: false, recipe: r.name, fresh: true });
        added++;
      }
    }
    commit();
    const badge = $("#shoppingCount");
    badge.classList.remove("pop"); void badge.offsetWidth; badge.classList.add("pop");
    toast(added ? `🛒 Added ${added} item${added > 1 ? "s" : ""} to your shopping list` : "Already on your shopping list ✓");
  }
  function renderShopping() {
    const remaining = state.shopping.filter((s) => !s.checked).length;
    const badge = $("#shoppingCount");
    badge.textContent = remaining;
    badge.classList.toggle("zero", remaining === 0);
    $("#shopList").innerHTML = state.shopping.length
      ? state.shopping.map((s, i) => `
        <li class="${s.checked ? "checked" : ""}${s.fresh ? " new" : ""}">
          <label><input type="checkbox" data-check="${i}" ${s.checked ? "checked" : ""}>
            <span><span class="nm">${esc(s.name)}</span>${s.recipe ? `<span class="for">for ${esc(s.recipe)}</span>` : ""}</span></label>
          <button class="x" data-del="${i}" aria-label="Remove ${esc(s.name)}">✕</button>
        </li>`).join("")
      : `<div class="empty">Nothing here yet. Add missing ingredients from a recipe 🛒</div>`;
    state.shopping.forEach((s) => delete s.fresh);
  }
  function openDrawer(open) {
    $("#drawer").classList.toggle("open", open);
    $("#drawerBackdrop").classList.toggle("hidden", !open);
  }

  // ---------- Events ----------
  function bind() {
    $("#ingredientGroups").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      toggleIngredient(chip.dataset.name);
      const again = document.querySelector(`#ingredientGroups .chip[data-name="${CSS.escape(chip.dataset.name)}"]`);
      again && again.classList.add("bump");
    });
    $("#pantryGroups").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      togglePantry(chip.dataset.name);
      const again = document.querySelector(`#pantryGroups .chip[data-name="${CSS.escape(chip.dataset.name)}"]`);
      again && again.classList.add("bump");
    });
    for (const kind of ["ingredients", "pantry"]) {
      const input = $(kind === "ingredients" ? "#ingredientSearch" : "#pantrySearch");
      input.addEventListener("input", () => renderPicker(kind));
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(kind); } });
      $(kind === "ingredients" ? "#ingredientAdd" : "#pantryAdd").addEventListener("click", () => addCustom(kind));
    }
    $("#basicSpicesBtn").addEventListener("click", () => {
      BASIC_SPICES.forEach((s) => { if (!hasPantry(s)) state.pantry.push(s); });
      commit(); toast("🧂 Basic spices added");
    });
    $("#stockedBtn").addEventListener("click", () => {
      PANTRY_NAMES().forEach((s) => { if (!hasPantry(s)) state.pantry.push(s); });
      commit(); toast("🫙 Well-stocked pantry selected");
    });
    $("#clearPantryBtn").addEventListener("click", () => { state.pantry = []; commit(); });

    $("#equipmentGrid").addEventListener("click", (e) => {
      const card = e.target.closest(".eq-card");
      if (!card) return;
      const n = card.dataset.name;
      state.equipment = state.equipment.includes(n) ? state.equipment.filter((x) => x !== n) : [...state.equipment, n];
      commit();
    });
    $("#modeGrid").addEventListener("click", (e) => { const b = e.target.closest("[data-mode]"); if (b) { state.mode = b.dataset.mode; commit(); } });
    $("#timeSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-time]"); if (b) { state.maxTime = b.dataset.time === "null" ? null : Number(b.dataset.time); commit(); } });
    $("#diffSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-diff]"); if (b) { state.difficulty = b.dataset.diff; commit(); } });
    $("#dietSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-diet]"); if (b) { state.diet = b.dataset.diet; commit(); } });
    $("#servMinus").addEventListener("click", () => { state.servings = Math.max(1, state.servings - 1); commit(); });
    $("#servPlus").addEventListener("click", () => { state.servings = Math.min(12, state.servings + 1); commit(); });

    $("#kitchenIngredients").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const name = btn.closest(".k-item").dataset.name;
      const item = state.ingredients.find((i) => i.name === name);
      if (btn.dataset.act === "soon") { item.soon = !item.soon; if (item.soon) toast(`⚠️ ${name} will be prioritized`); }
      else state.ingredients = state.ingredients.filter((i) => i.name !== name);
      commit();
    });
    $("#clearKitchen").addEventListener("click", () => {
      Object.assign(state, { ingredients: [], pantry: [], equipment: [] });
      commit();
    });

    $("#stepper").addEventListener("click", (e) => { const b = e.target.closest("[data-step]"); if (b) { step = Number(b.dataset.step); renderStep(); } });
    $("#prevBtn").addEventListener("click", () => { step = Math.max(0, step - 1); renderStep(); });
    $("#nextBtn").addEventListener("click", () => {
      if (step < 3) { step++; renderStep(); $(".wizard").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
      else if (!state.ingredients.length) { step = 0; renderStep(); toast("Add some ingredients first 🥕"); }
      else if (!state.equipment.length) { step = 2; renderStep(); toast("Select your kitchen equipment first 🍳"); }
      else generate(false);
    });
    $("#generateBtn").addEventListener("click", () => generate(false));
    $("#sourceSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-source]");
      if (b) { state.source = b.dataset.source; commit(); toast(state.source === "ai" ? "✨ Recipes will be generated live by AI" : "⚡ Instant built-in recipes — no waiting"); }
    });
    $("#skipBtn").addEventListener("click", () => skipRequested && skipRequested());
    $("#againBtn").addEventListener("click", () => generate(true));
    $("#retryBtn").addEventListener("click", () => generate(seenNames.length > 0));
    $("#editBtn").addEventListener("click", () => {
      $("#resultsView").classList.add("hidden");
      $("#setupView").classList.remove("hidden");
      window.scrollTo({ top: 0 });
    });
    $("#brandLink").addEventListener("click", (e) => { e.preventDefault(); $("#editBtn").click(); });
    $("#sampleBtn").addEventListener("click", () => {
      state.ingredients = SAMPLE.ingredients.map((n) => ({ name: n, soon: SAMPLE.useSoon.includes(n) }));
      state.pantry = [...SAMPLE.pantry];
      state.equipment = [...SAMPLE.equipment];
      $("#editBtn").click();
      commit();
      toast("🎲 Sample kitchen loaded");
    });

    $("#recipeGrid").addEventListener("click", (e) => {
      const shop = e.target.closest("[data-shop]");
      if (shop) { e.stopPropagation(); addToShopping(Number(shop.dataset.shop)); return; }
      const card = e.target.closest(".recipe-card");
      if (card) openRecipe(Number(card.dataset.idx));
    });
    $("#recipeGrid").addEventListener("keydown", (e) => {
      const card = e.target.closest(".recipe-card");
      if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openRecipe(Number(card.dataset.idx)); }
    });
    $("#modal").addEventListener("click", (e) => {
      if (e.target.id === "modal") return closeModal();
      const shop = e.target.closest("[data-shop]");
      if (shop) return addToShopping(Number(shop.dataset.shop));
      const li = e.target.closest(".steps li");
      if (li) li.classList.toggle("done");
    });
    $("#modalClose").addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); openDrawer(false); } });

    $("#shoppingBtn").addEventListener("click", () => openDrawer(true));
    $("#drawerClose").addEventListener("click", () => openDrawer(false));
    $("#drawerBackdrop").addEventListener("click", () => openDrawer(false));
    $("#shopList").addEventListener("change", (e) => {
      const i = e.target.dataset.check;
      if (i !== undefined) { state.shopping[i].checked = e.target.checked; commit(); }
    });
    $("#shopList").addEventListener("click", (e) => {
      const d = e.target.closest("[data-del]");
      if (d) { state.shopping.splice(Number(d.dataset.del), 1); commit(); }
    });
    $("#shopAddForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = titleCase($("#shopAddInput").value || "");
      if (v && !state.shopping.some((s) => norm(s.name) === norm(v))) state.shopping.push({ name: v, checked: false, recipe: "", fresh: true });
      $("#shopAddInput").value = "";
      commit();
    });
    $("#clearChecked").addEventListener("click", () => { state.shopping = state.shopping.filter((s) => !s.checked); commit(); });
  }

  bind();
  commit();
  // Wake up the free-tier backend (it sleeps when idle) so the first generation is fast
  // Also tells us early if it's unreachable, so clicks can go straight to instant recipes instead of waiting.
  if (API_BASE) {
    const ping = new AbortController();
    setTimeout(() => ping.abort(), 75000);   // a sleeping free server can take ~1 min to wake
    fetch(`${API_BASE}/api/health`, { signal: ping.signal })
      .then((r) => { apiDown = !r.ok; })
      .catch(() => { apiDown = true; });
  }
})();

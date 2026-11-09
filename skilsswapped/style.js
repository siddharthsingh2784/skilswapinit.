import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {getAnalytics} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import {
    getDatabase, ref, push, set, onValue, update, remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAgxyiT5RUELPBtxx_tk9dSgM1NgeXCzGg",
    authDomain: "skill-swap-cce0a.firebaseapp.com",
    databaseURL: "https://skill-swap-cce0a-default-rtdb.firebaseio.com",
    projectId: "skill-swap-cce0a",
    storageBucket: "skill-swap-cce0a.firebasestorage.app",
    messagingSenderId: "34530773126",
    appId: "1:34530773126:web:23c87ae586a872d4dae907",
    measurementId: "G-N6B6H4WQV6"
};

const app = initializeApp(firebaseConfig);
try {getAnalytics(app);} catch (_) { }
const db = getDatabase(app);
const swapsRef = ref(db, "swaps");
const interestsRef = ref(db, "interests");
const themeRef = ref(db, "settings/theme");

const ADMIN_PASS = "swap@rh";
const SESSION_KEY = "skillswap.admin";
const CLIENT_KEY = "skillswap.clientId";
const MY_POSTS_KEY = "skillswap.myPosts";

let clientId = localStorage.getItem(CLIENT_KEY);
if (!clientId) {
    clientId = "c_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(CLIENT_KEY, clientId);
}

let myPosts;
try {myPosts = new Set(JSON.parse(sessionStorage.getItem(MY_POSTS_KEY) || "[]"));}
catch {myPosts = new Set();}
const persistMyPosts = () => sessionStorage.setItem(MY_POSTS_KEY, JSON.stringify([...myPosts]));

/* DOM refs */
const form = document.getElementById("swap-form");
const submitBtn = document.getElementById("swap-submit");
const statusEl = document.getElementById("form-status");
const feedList = document.getElementById("feed-list");

const adminSection = document.getElementById("admin");
const adminGate = document.getElementById("admin-gate");
const adminPanel = document.getElementById("admin-panel");
const adminList = document.getElementById("admin-list");
const adminCount = document.getElementById("admin-count");
const gateForm = document.getElementById("admin-login");
const gatePass = document.getElementById("admin-pass");
const gateStatus = document.getElementById("gate-status");
const adminLock = document.getElementById("admin-lock");

const deckStack = document.getElementById("deck-stack");
const deckEmpty = document.getElementById("deck-empty");
const deckEmptyText = document.getElementById("deck-empty-text");
const deckRemaining = document.getElementById("deck-remaining");
const deckSkipBtn = document.getElementById("deck-skip");
const deckSaveBtn = document.getElementById("deck-save");
const deckSwapBtn = document.getElementById("deck-swap");
const deckUndoBtn = document.getElementById("deck-undo");

const searchForm = document.getElementById("search-form");
const searchGive = document.getElementById("search-give");
const searchTake = document.getElementById("search-take");
const searchCount = document.getElementById("search-count");
const searchClear = document.getElementById("search-clear");

const boardNote = document.getElementById("board-note");
const boardNoteText = document.getElementById("board-note-text");
const boardNoteClear = document.getElementById("board-note-clear");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let latestItems = [];
let interestMap = {};
let pool = [];
let deckQueue = [];
let history = [];
let isDraggingDeck = false;
let activeSearch = {give: "", take: ""};

const HISTORY_CAP = 25;
const REFILL_THRESHOLD = 3;
const VISIBLE_CARDS = 3;

/* ---------- Utilities ---------- */
const isAdminUnlocked = () => sessionStorage.getItem(SESSION_KEY) === "1";
const isLikelyUrl = (v) => !v || /^https?:\/\//i.test(v);
const escapeCSSUrl = (s) => String(s).replace(/["\\]/g, "\\$&").replace(/\n/g, "");
function probeImage(url, cb) {const img = new Image(); img.onload = cb; img.src = url;}
function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function initials(name) {
    const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function initialsAvatar(name) {const s = document.createElement("span"); s.className = "feed__avatar"; s.textContent = initials(name); return s;}
function buildAvatar(name, url) {
    if (!url) return initialsAvatar(name);
    const img = document.createElement("img");
    img.className = "feed__avatar"; img.alt = ""; img.loading = "lazy";
    img.onerror = () => {const fb = initialsAvatar(name); if (img.parentNode) img.parentNode.replaceChild(fb, img);};
    img.src = url;
    return img;
}

/* ================= SECTION THEME BACKGROUNDS ================= */
const themeForm = document.getElementById("theme-form");
const themeStatus = document.getElementById("theme-status");
const themeSave = document.getElementById("theme-save");
const themeReset = document.getElementById("theme-reset");

// One input + one preview per section
const THEME_SECTIONS = [
    {key: "heroURL", target: 'section[data-theme="hero"]', inputId: "theme-hero", previewId: "theme-preview-hero"},
    {key: "signupURL", target: 'section[data-theme="signup"]', inputId: "theme-signup", previewId: "theme-preview-signup"},
    {key: "boardURL", target: 'section[data-theme="board"]', inputId: "theme-board", previewId: "theme-preview-board"},
    {key: "deckURL", target: 'section[data-theme="deck"]', inputId: "theme-deck", previewId: "theme-preview-deck"}
];

THEME_SECTIONS.forEach((s) => {
    s.inputEl = document.getElementById(s.inputId);
    s.previewEl = document.getElementById(s.previewId);
    s.sectionEl = document.querySelector(s.target);
});

const DEFAULT_THEME = {
    heroURL: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1600&q=70",
    signupURL: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1600&q=70",
    boardURL: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1600&q=70",
    deckURL: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=70"
};
let currentTheme = {...DEFAULT_THEME};

function setSectionBg(sectionEl, url) {
    if (!sectionEl) return;
    sectionEl.classList.remove("has-bg");
    sectionEl.style.removeProperty("--bg-image");
    if (!url || !isLikelyUrl(url)) return;

    const img = new Image();
    img.onload = () => {
        sectionEl.style.setProperty("--bg-image", `url("${escapeCSSUrl(url)}")`);
        sectionEl.classList.add("has-bg");
    };
    img.onerror = () => {
        sectionEl.classList.remove("has-bg");
        sectionEl.style.removeProperty("--bg-image");
    };
    img.src = url;
}

function setPreview(previewEl, url) {
    if (!previewEl) return;
    previewEl.style.backgroundImage = "";
    if (!url || !isLikelyUrl(url)) return;
    const img = new Image();
    img.onload = () => {previewEl.style.backgroundImage = `url("${escapeCSSUrl(url)}")`;};
    img.src = url;
}

function applyTheme(theme) {
    currentTheme = {
        heroURL: theme.heroURL || "",
        signupURL: theme.signupURL || "",
        boardURL: theme.boardURL || "",
        deckURL: theme.deckURL || ""
    };
    for (const s of THEME_SECTIONS) {
        setSectionBg(s.sectionEl, currentTheme[s.key]);
        setPreview(s.previewEl, currentTheme[s.key]);
    }
}

function fillThemeInputs(theme) {
    for (const s of THEME_SECTIONS) {
        if (document.activeElement === s.inputEl) continue;
        s.inputEl.value = theme[s.key] || "";
    }
}

// Paint defaults instantly so the page never looks bare.
applyTheme(DEFAULT_THEME);

onValue(themeRef, (snap) => {
    const v = snap.val();
    const theme = v
        ? {
            heroURL: v.heroURL || "",
            signupURL: v.signupURL || "",
            boardURL: v.boardURL || "",
            deckURL: v.deckURL || ""
        }
        : {...DEFAULT_THEME};
    applyTheme(theme);
    fillThemeInputs(theme);
}, (err) => {
    console.warn("[theme] read failed:", err);
    applyTheme(DEFAULT_THEME);
    fillThemeInputs(DEFAULT_THEME);
});

// Live preview while typing
for (const s of THEME_SECTIONS) {
    s.inputEl.addEventListener("input", () => {
        setPreview(s.previewEl, s.inputEl.value.trim());
    });
}

themeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {};
    for (const s of THEME_SECTIONS) {
        const v = s.inputEl.value.trim();
        if (!isLikelyUrl(v)) {
            themeStatus.textContent = "Image URLs must start with http:// or https://";
            themeStatus.dataset.state = "err";
            return;
        }
        payload[s.key] = v;
    }

    themeSave.disabled = true;
    themeStatus.textContent = "Saving…";
    themeStatus.dataset.state = "";

    try {
        await set(themeRef, {...payload, updatedAt: Date.now()});
        themeStatus.textContent = "Theme saved and applied.";
        themeStatus.dataset.state = "ok";
    } catch (err) {
        console.error("[theme] write failed:", err);
        themeStatus.textContent = (err && /permission/i.test(err.message || ""))
            ? 'DB rules blocking writes. Allow ".write" on settings in Realtime Database → Rules.'
            : "Could not save the theme. Try again.";
        themeStatus.dataset.state = "err";
    } finally {
        themeSave.disabled = false;
    }
});

themeReset.addEventListener("click", async () => {
    themeSave.disabled = true;
    themeStatus.textContent = "Resetting…";
    themeStatus.dataset.state = "";
    try {
        await remove(themeRef);
        for (const s of THEME_SECTIONS) s.inputEl.value = "";
        themeStatus.textContent = "Reset to the default set.";
        themeStatus.dataset.state = "ok";
    } catch (err) {
        console.error("[theme] reset failed:", err);
        themeStatus.textContent = "Could not reset. Try again.";
        themeStatus.dataset.state = "err";
    } finally {
        themeSave.disabled = false;
    }
});

/* ---------- Search ---------- */
function itemMatchesSearch(item) {
    const {give, take} = activeSearch;
    if (!give && !take) return true;
    const offers = (item.offers || "").toLowerCase();
    const wants = (item.wants || "").toLowerCase();
    if (give && !wants.includes(give.toLowerCase())) return false;
    if (take && !offers.includes(take.toLowerCase())) return false;
    return true;
}
function searchHasValue() {return !!(activeSearch.give || activeSearch.take);}

function updateSearchUI() {
    const n = latestItems.filter(itemMatchesSearch).length;
    const active = searchHasValue();
    searchCount.textContent = active ? `${n} match${n === 1 ? "" : "es"}` : "—";
    searchCount.dataset.active = active ? "true" : "false";
    searchClear.hidden = !active;

    if (active) {
        boardNote.hidden = false;
        const parts = [];
        if (activeSearch.give) parts.push(`teach "${activeSearch.give}"`);
        if (activeSearch.take) parts.push(`learn "${activeSearch.take}"`);
        boardNoteText.textContent = `${n} match${n === 1 ? "" : "es"} for ${parts.join(" · ")}`;
    } else {
        boardNote.hidden = true;
        boardNoteText.textContent = "";
    }
}

function applySearch() {
    updateSearchUI();
    renderFeed(latestItems);
    rebuildDeck();
}

function readSearchInputs() {
    activeSearch = {give: searchGive.value.trim(), take: searchTake.value.trim()};
}

function clearSearch() {
    activeSearch = {give: "", take: ""};
    searchGive.value = "";
    searchTake.value = "";
    applySearch();
}

searchGive.addEventListener("input", () => {readSearchInputs(); applySearch();});
searchTake.addEventListener("input", () => {readSearchInputs(); applySearch();});

searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    readSearchInputs();
    applySearch();
    document.getElementById("board").scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start"
    });
});

searchClear.addEventListener("click", clearSearch);
boardNoteClear.addEventListener("click", clearSearch);

/* ---------- Swaps listener ---------- */
onValue(swapsRef, (snap) => {
    latestItems = [];
    snap.forEach((c) => {latestItems.push({key: c.key, ...c.val()});});
    latestItems.reverse();
    renderFeed(latestItems);
    renderAdmin();
    rebuildDeck();
    updateSearchUI();
}, (err) => {
    console.error("[swaps] read failed:", err);
    feedList.innerHTML = '<li class="feed__empty">Could not load the board. Check Realtime Database rules.</li>';
});

onValue(interestsRef, (snap) => {
    const map = {};
    snap.forEach((swapChild) => {
        let count = 0;
        swapChild.forEach(() => {count++;});
        if (count > 0) map[swapChild.key] = count;
    });
    interestMap = map;
    renderFeed(latestItems);
    renderAdmin();
}, (err) => {console.warn("[interests] read failed:", err);});

/* ---------- Feed ---------- */
function renderFeed(items) {
    const filtered = items.filter(itemMatchesSearch).slice(0, 24);
    feedList.innerHTML = "";
    if (!filtered.length) {
        const li = document.createElement("li");
        li.className = "feed__empty";
        li.textContent = searchHasValue()
            ? "No swaps match that pair yet. Post yours and see who mirrors it."
            : "No swaps yet. Be the first.";
        feedList.appendChild(li);
        return;
    }
    for (const item of filtered) feedList.appendChild(buildFeedCard(item));
}

function buildFeedCard(item) {
    const li = document.createElement("li");
    li.className = "feed__item";
    if (item.bgURL) probeImage(item.bgURL, () => {
        li.style.backgroundImage = `url("${escapeCSSUrl(item.bgURL)}")`;
        li.classList.add("has-bg");
    });

    const pair = document.createElement("div");
    pair.className = "feed__pair";
    const o = document.createElement("span"); o.textContent = item.offers || "—";
    const a = document.createElement("span"); a.className = "feed__arrow"; a.setAttribute("aria-hidden", "true"); a.textContent = "⇄";
    const w = document.createElement("span"); w.textContent = item.wants || "—";
    pair.append(o, a, w);

    const meta = document.createElement("div");
    meta.className = "feed__meta";

    const who = document.createElement("div");
    who.className = "feed__who";
    who.appendChild(buildAvatar(item.name, item.photoURL));
    const nm = document.createElement("span");
    nm.className = "mono-label"; nm.textContent = item.name || "anonymous";
    who.appendChild(nm);

    const right = document.createElement("div");
    right.className = "feed__right";
    if (interestMap[item.key]) {
        const cnt = document.createElement("span");
        cnt.className = "interest-count";
        cnt.textContent = `${interestMap[item.key]} interested`;
        right.appendChild(cnt);
    }
    const pill = document.createElement("span");
    pill.className = "pill"; pill.textContent = item.status || "open";
    right.appendChild(pill);

    meta.append(who, right);
    li.append(pair, meta);
    return li;
}

/* ---------- Signup ---------- */
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.dataset.state = "";
    statusEl.textContent = "";

    const fd = new FormData(form);
    const payload = {
        name: String(fd.get("name") || "").trim(),
        email: String(fd.get("email") || "").trim(),
        offers: String(fd.get("offers") || "").trim(),
        wants: String(fd.get("wants") || "").trim(),
        photoURL: String(fd.get("photoURL") || "").trim(),
        bgURL: String(fd.get("bgURL") || "").trim()
    };

    if (!payload.name || !payload.email || !payload.offers || !payload.wants) {
        statusEl.textContent = "Fill every required field.";
        statusEl.dataset.state = "err"; return;
    }
    if (!/^\S+@\S+\.\S+$/.test(payload.email)) {
        statusEl.textContent = "That email doesn't look right.";
        statusEl.dataset.state = "err"; return;
    }
    if (!isLikelyUrl(payload.photoURL) || !isLikelyUrl(payload.bgURL)) {
        statusEl.textContent = "Image URLs must start with http:// or https://";
        statusEl.dataset.state = "err"; return;
    }

    submitBtn.disabled = true;
    statusEl.textContent = "Posting…";

    const record = {
        name: payload.name, email: payload.email,
        offers: payload.offers, wants: payload.wants,
        status: "open", createdAt: Date.now()
    };
    if (payload.photoURL) record.photoURL = payload.photoURL;
    if (payload.bgURL) record.bgURL = payload.bgURL;

    try {
        const newRef = push(swapsRef);
        await set(newRef, record);
        if (newRef.key) {myPosts.add(newRef.key); persistMyPosts();}
        form.reset();
        statusEl.textContent = "Posted.";
        statusEl.dataset.state = "ok";
    } catch (err) {
        console.error("[swap] write failed:", err);
        statusEl.textContent = (err && /permission/i.test(err.message || ""))
            ? 'DB rules blocking writes. Set ".read" and ".write" to true in Realtime Database → Rules.'
            : "Could not post. Try again.";
        statusEl.dataset.state = "err";
    } finally {
        submitBtn.disabled = false;
    }
});

/* ================= SWIPE DECK — INFINITE LOOP ================= */

function rebuildDeck() {
    pool = latestItems.filter((it) => !myPosts.has(it.key) && itemMatchesSearch(it));

    const poolKeys = new Set(pool.map((it) => it.key));
    const kept = deckQueue.filter((it) => poolKeys.has(it.key));

    deckQueue = kept.length ? kept : shuffle(pool);

    refillQueue();
    renderDeck();
    updateDeckUI();
}

function refillQueue() {
    if (!pool.length) {deckQueue = []; return;}
    if (deckQueue.length < REFILL_THRESHOLD) {
        deckQueue.push(...shuffle(pool));
    }
}

function renderDeck() {
    if (isDraggingDeck) return;
    deckStack.innerHTML = "";

    if (!deckQueue.length) {
        deckStack.hidden = true;
        deckEmpty.hidden = false;
        deckEmptyText.textContent = searchHasValue()
            ? "No swaps match that pair. Clear the search to keep the loop going."
            : "No swaps in the database yet. Post one above to start the loop.";
        updateDeckUI();
        return;
    }

    deckStack.hidden = false;
    deckEmpty.hidden = true;

    const visible = Math.min(deckQueue.length, VISIBLE_CARDS);
    for (let i = visible - 1; i >= 0; i--) deckStack.appendChild(buildDeckCard(deckQueue[i], i));
    const top = deckStack.querySelector(".deck-card--top");
    if (top) attachDrag(top);
}

function buildDeckCard(item, index) {
    const el = document.createElement("article");
    el.className = "deck-card deck-card--" + (index === 0 ? "top" : index === 1 ? "middle" : "back");
    el.dataset.key = item.key;
    if (item.bgURL) probeImage(item.bgURL, () => {
        el.style.backgroundImage = `url("${escapeCSSUrl(item.bgURL)}")`;
        el.classList.add("has-bg");
    });

    const photo = document.createElement("div");
    photo.className = "deck-card__photo";
    if (item.photoURL) {
        const img = document.createElement("img");
        img.alt = ""; img.loading = "lazy";
        img.onerror = () => {photo.innerHTML = ""; const m = document.createElement("span"); m.className = "deck-card__monogram"; m.textContent = initials(item.name); photo.appendChild(m);};
        img.src = item.photoURL; photo.appendChild(img);
    } else if (item.bgURL) {
        photo.style.backgroundImage = `url("${escapeCSSUrl(item.bgURL)}")`;
    } else {
        const m = document.createElement("span"); m.className = "deck-card__monogram"; m.textContent = initials(item.name); photo.appendChild(m);
    }

    const body = document.createElement("div");
    body.className = "deck-card__body";
    const eyebrow = document.createElement("p"); eyebrow.className = "mono-label"; eyebrow.textContent = "Open swap";
    const name = document.createElement("h3"); name.className = "deck-card__name"; name.textContent = item.name || "anonymous";
    const pair = document.createElement("div"); pair.className = "deck-card__pair";

    const r1 = document.createElement("div"); r1.className = "deck-card__pair-row";
    const l1 = document.createElement("span"); l1.className = "mono-label"; l1.textContent = "Offers";
    const v1 = document.createElement("p"); v1.textContent = item.offers || "—";
    r1.append(l1, v1);

    const arrow = document.createElement("div"); arrow.className = "deck-card__arrow"; arrow.setAttribute("aria-hidden", "true"); arrow.textContent = "⇄";

    const r2 = document.createElement("div"); r2.className = "deck-card__pair-row";
    const l2 = document.createElement("span"); l2.className = "mono-label"; l2.textContent = "Wants";
    const v2 = document.createElement("p"); v2.textContent = item.wants || "—";
    r2.append(l2, v2);

    pair.append(r1, arrow, r2);
    body.append(eyebrow, name, pair);

    const foot = document.createElement("div");
    foot.className = "deck-card__foot";
    const pill = document.createElement("span"); pill.className = "pill"; pill.textContent = item.status || "open";
    const cnt = document.createElement("span"); cnt.className = "mono-label";
    cnt.textContent = interestMap[item.key] ? `${interestMap[item.key]} interested` : "new";
    foot.append(pill, cnt);

    const sSwap = document.createElement("div"); sSwap.className = "deck-card__stamp deck-card__stamp--swap"; sSwap.textContent = "Swap";
    const sSkip = document.createElement("div"); sSkip.className = "deck-card__stamp deck-card__stamp--skip"; sSkip.textContent = "Skip";
    const sSave = document.createElement("div"); sSave.className = "deck-card__stamp deck-card__stamp--save"; sSave.textContent = "Save";

    el.append(photo, body, foot, sSwap, sSkip, sSave);
    return el;
}

function attachDrag(card) {
    let dragging = false, startX = 0, startY = 0, dx = 0, dy = 0, pid = null;
    function onDown(e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        dragging = true; isDraggingDeck = true;
        startX = e.clientX; startY = e.clientY; dx = 0; dy = 0; pid = e.pointerId;
        try {card.setPointerCapture(pid);} catch { }
        card.classList.add("is-dragging"); e.preventDefault();
    }
    function onMove(e) {
        if (!dragging) return;
        dx = e.clientX - startX; dy = e.clientY - startY;
        updateDrag(card, dx, dy);
    }
    function onUp() {
        if (!dragging) return;
        dragging = false; isDraggingDeck = false;
        card.classList.remove("is-dragging");
        try {card.releasePointerCapture(pid);} catch { }
        finishDrag(card, dx, dy); dx = 0; dy = 0;
    }
    card.addEventListener("pointerdown", onDown);
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerup", onUp);
    card.addEventListener("pointercancel", onUp);
}

function updateDrag(card, dx, dy) {
    const rot = reducedMotion ? 0 : dx * 0.06;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
    const sSwap = card.querySelector(".deck-card__stamp--swap");
    const sSkip = card.querySelector(".deck-card__stamp--skip");
    const sSave = card.querySelector(".deck-card__stamp--save");
    if (!sSwap) return;
    let opSwap = 0, opSkip = 0, opSave = 0;
    const absX = Math.abs(dx), up = Math.max(0, -dy);
    if (up > 60 && up > absX) opSave = Math.min(1, (up - 60) / 110);
    else if (dx > 0) opSwap = Math.min(1, dx / 120);
    else if (dx < 0) opSkip = Math.min(1, -dx / 120);
    sSwap.style.opacity = opSwap; sSkip.style.opacity = opSkip; sSave.style.opacity = opSave;
}

function finishDrag(card, dx, dy) {
    const TH_X = 100, TH_Y = 140, up = -dy;
    if (up > TH_Y && up > Math.abs(dx)) flyOut(card, "up", () => takeTop("save"));
    else if (dx > TH_X) flyOut(card, "right", () => takeTop("swap"));
    else if (dx < -TH_X) flyOut(card, "left", () => takeTop("skip"));
    else snapBack(card);
}

function snapBack(card) {
    card.style.transition = reducedMotion ? "none" : "transform 220ms var(--ease)";
    card.style.transform = "translate(0, 0) rotate(0deg)";
    card.querySelectorAll(".deck-card__stamp").forEach((s) => {s.style.opacity = 0;});
    setTimeout(() => {card.style.transition = "";}, 240);
}

function flyOut(card, direction, cb) {
    if (reducedMotion) return cb();
    card.style.transition = "transform 280ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 280ms";
    const w = window.innerWidth, h = window.innerHeight;
    let tx = 0, ty = 0, rot = 0;
    if (direction === "right") {tx = w; rot = 30;}
    else if (direction === "left") {tx = -w; rot = -30;}
    else if (direction === "up") {ty = -h; rot = -6;}
    card.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;
    card.style.opacity = "0";
    setTimeout(cb, 280);
}

async function takeTop(action) {
    if (!deckQueue.length) {refillQueue();}

    const item = deckQueue.shift();
    if (!item) return;

    history.push({item, action});
    if (history.length > HISTORY_CAP) history.shift();

    if (action === "swap" && latestItems.some((x) => x.key === item.key)) {
        try {await set(ref(db, `interests/${item.key}/${clientId}`), {ts: Date.now()});}
        catch (err) {console.warn("[interest] write failed:", err);}
    } else if (action === "save") {
        try {await set(ref(db, `saved/${clientId}/${item.key}`), {ts: Date.now()});}
        catch (err) {console.warn("[save] write failed:", err);}
    }

    refillQueue();
    renderDeck();
    updateDeckUI();
}

async function undoLast() {
    if (!history.length) return;
    const last = history.pop();
    deckQueue.unshift(last.item);

    if (last.action === "swap") {
        try {await remove(ref(db, `interests/${last.item.key}/${clientId}`));} catch (err) {console.warn(err);}
    } else if (last.action === "save") {
        try {await remove(ref(db, `saved/${clientId}/${last.item.key}`));} catch (err) {console.warn(err);}
    }

    renderDeck();
    updateDeckUI();
}

function updateDeckUI() {
    deckRemaining.textContent = pool.length || 0;
    const none = deckQueue.length === 0;
    deckSkipBtn.disabled = none;
    deckSaveBtn.disabled = none;
    deckSwapBtn.disabled = none;
    deckUndoBtn.disabled = history.length === 0;
}

function triggerAction(action) {
    if (!deckQueue.length) return;
    const card = deckStack.querySelector(".deck-card--top");
    if (card) {
        const dir = action === "swap" ? "right" : action === "skip" ? "left" : "up";
        flyOut(card, dir, () => takeTop(action));
    } else takeTop(action);
}

deckSkipBtn.addEventListener("click", () => triggerAction("skip"));
deckSwapBtn.addEventListener("click", () => triggerAction("swap"));
deckSaveBtn.addEventListener("click", () => triggerAction("save"));
deckUndoBtn.addEventListener("click", undoLast);

function deckInView() {
    const el = document.getElementById("deck");
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight * 0.6 && r.bottom > window.innerHeight * 0.4;
}
document.addEventListener("keydown", (e) => {
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    if (!deckInView()) return;
    if (e.key === "ArrowRight") {e.preventDefault(); triggerAction("swap");}
    else if (e.key === "ArrowLeft") {e.preventDefault(); triggerAction("skip");}
    else if (e.key === "ArrowUp") {e.preventDefault(); triggerAction("save");}
    else if (e.key === "Backspace") {e.preventDefault(); undoLast();}
});

/* ---------- Admin ---------- */
gateForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (gatePass.value === ADMIN_PASS) {
        sessionStorage.setItem(SESSION_KEY, "1");
        gateStatus.textContent = ""; gateStatus.dataset.state = "";
        adminGate.hidden = true; adminPanel.hidden = false;
        fillThemeInputs(currentTheme);
        renderAdmin();
    } else {
        gateStatus.textContent = "Wrong passcode."; gateStatus.dataset.state = "err";
    }
});

adminLock.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    adminGate.hidden = false; adminPanel.hidden = true;
    gatePass.value = "";
    gateStatus.textContent = ""; gateStatus.dataset.state = "";
    themeStatus.textContent = ""; themeStatus.dataset.state = "";
});

function refreshAdminVisibility() {
    const show = location.hash === "#admin" || isAdminUnlocked();
    adminSection.classList.toggle("visible", show);
    if (isAdminUnlocked()) {
        adminGate.hidden = true; adminPanel.hidden = false;
        fillThemeInputs(currentTheme);
        renderAdmin();
    } else {
        adminGate.hidden = false; adminPanel.hidden = true;
    }
}
window.addEventListener("hashchange", refreshAdminVisibility);
refreshAdminVisibility();

function isEditingAdmin() {
    const a = document.activeElement;
    return !!(a && a.closest && a.closest("#admin-list") && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}

function renderAdmin() {
    if (!isAdminUnlocked() || isEditingAdmin()) return;
    adminCount.textContent = latestItems.length;
    adminList.innerHTML = "";
    if (!latestItems.length) {
        adminList.innerHTML = '<li class="feed__empty">No swaps yet.</li>';
        return;
    }
    for (const item of latestItems) adminList.appendChild(buildAdminItem(item));
}

function buildAdminItem(item) {
    const details = document.createElement("details");
    details.className = "admin-item";
    details.dataset.key = item.key;

    const summary = document.createElement("summary");
    const main = document.createElement("span");
    main.className = "admin-item__summary-main";
    const pair = document.createElement("span");
    pair.className = "admin-item__pair";
    pair.textContent = `${item.offers || "—"} ⇄ ${item.wants || "—"}`;
    const by = document.createElement("span");
    by.className = "mono-label"; by.textContent = `by ${item.name || "anonymous"}`;
    main.append(pair, by);
    if (interestMap[item.key]) {
        const cnt = document.createElement("span");
        cnt.className = "interest-count"; cnt.textContent = `${interestMap[item.key]} interested`;
        main.appendChild(cnt);
    }
    summary.appendChild(main);
    details.appendChild(summary);

    const editForm = document.createElement("form");
    editForm.className = "admin-item__form";
    const fields = document.createElement("div");
    fields.className = "admin-item__fields";

    const defs = [
        {name: "name", label: "Name", type: "text"},
        {name: "email", label: "Email (private)", type: "email"},
        {name: "offers", label: "Offers", type: "text"},
        {name: "wants", label: "Wants", type: "text"},
        {name: "photoURL", label: "Profile pic URL", type: "url"},
        {name: "bgURL", label: "Card background URL", type: "url"},
        {name: "status", label: "Status", type: "text"}
    ];
    for (const def of defs) {
        const label = document.createElement("label"); label.className = "field";
        const span = document.createElement("span"); span.className = "mono-label"; span.textContent = def.label;
        const input = document.createElement("input");
        input.type = def.type; input.name = def.name; input.value = item[def.name] || "";
        label.append(span, input); fields.appendChild(label);
    }
    editForm.appendChild(fields);

    const actions = document.createElement("div");
    actions.className = "admin-item__actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "submit"; saveBtn.className = "btn btn--primary"; saveBtn.textContent = "Save";

    const delBtn = document.createElement("button");
    delBtn.type = "button"; delBtn.className = "btn btn--danger"; delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
        if (!confirm("Delete this swap?")) return;
        try {await remove(ref(db, `swaps/${item.key}`));}
        catch (err) {alert("Delete failed: " + err.message);}
    });

    actions.append(saveBtn, delBtn);
    editForm.appendChild(actions);

    const status = document.createElement("p");
    status.className = "form__status";
    editForm.appendChild(status);

    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        saveBtn.disabled = true;
        status.textContent = "Saving…"; status.dataset.state = "";
        const fd = new FormData(editForm);
        const patch = {};
        for (const def of defs) {
            const v = String(fd.get(def.name) || "").trim();
            patch[def.name] = v ? v : null;
        }
        for (const req of ["name", "offers", "wants"]) {
            if (!patch[req]) {
                status.textContent = `"${req}" cannot be empty.`; status.dataset.state = "err";
                saveBtn.disabled = false; return;
            }
        }
        if (!isLikelyUrl(patch.photoURL || "") || !isLikelyUrl(patch.bgURL || "")) {
            status.textContent = "Image URLs must start with http(s)://"; status.dataset.state = "err";
            saveBtn.disabled = false; return;
        }
        try {
            await update(ref(db, `swaps/${item.key}`), patch);
            status.textContent = "Saved."; status.dataset.state = "ok";
            setTimeout(() => {details.open = false;}, 400);
        } catch (err) {
            status.textContent = "Save failed: " + err.message; status.dataset.state = "err";
        } finally {saveBtn.disabled = false;}
    });

    details.appendChild(editForm);
    return details;
}

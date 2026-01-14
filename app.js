const STORAGE_KEY = "vybe-workshop-state";
const SUPABASE_URL = "https://yqqwavldvjnrawmzsyvo.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxcXdhdmxkdmpucmF3bXpzeXZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MDg2NzIsImV4cCI6MjA4Mzk4NDY3Mn0.A19R8I77DpEwPRw6fV2qGQh82-q2MUl051ocQ3JqGAA";
const supabase = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const loginGate = document.getElementById("loginGate");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const usernameInput = document.getElementById("usernameInput");
const signInBtn = document.getElementById("signInBtn");
const signUpBtn = document.getElementById("signUpBtn");
const loginNote = document.getElementById("loginNote");
const logoutBtn = document.getElementById("logoutBtn");

const boardList = document.getElementById("boardList");
const newBoardBtn = document.getElementById("newBoardBtn");
const canvas = document.getElementById("canvas");
const addNoteBtn = document.getElementById("addNoteBtn");
const pngInput = document.getElementById("pngInput");

const tabs = document.querySelectorAll(".tab");
const boardPanel = document.getElementById("boardPanel");
const announcementsPanel = document.getElementById("announcementsPanel");
const announcementInput = document.getElementById("announcementInput");
const announcementDisplay = document.getElementById("announcementDisplay");
const saveAnnouncementBtn = document.getElementById("saveAnnouncementBtn");
const announcementLock = document.getElementById("announcementLock");

const chatLog = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

const currentRole = document.getElementById("currentRole");
const currentUser = document.getElementById("currentUser");

let state = loadState();
let draggingCard = null;
let dragOffset = { x: 0, y: 0 };
let chatChannel = null;
let chatMessages = [];

function loadState() {
  const fallback = {
    authed: false,
    role: "member",
    userLabel: "locked",
    userId: null,
    boards: [
      { id: "main", name: "Main Flow", items: [] },
      { id: "refs", name: "References", items: [] },
    ],
    activeBoardId: "main",
    chat: [],
    announcement: "Welcome to the VYBE STUDIOS workshop.",
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...fallback, ...saved, authed: false } : fallback;
  } catch (error) {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function updateLoginUI() {
  loginGate.classList.toggle("hidden", state.authed);
  currentRole.textContent = `Role: ${state.role}`;
  currentUser.textContent = `Access: ${state.authed ? state.userLabel : "locked"}`;
  updateAnnouncementPermissions();
}

function updateAnnouncementPermissions() {
  const ownerOnly = state.role !== "owner";
  announcementInput.disabled = ownerOnly;
  saveAnnouncementBtn.disabled = ownerOnly;
  announcementLock.textContent = ownerOnly
    ? "Owner-only publishing enabled."
    : "Owner access granted.";
}

async function signIn() {
  if (!supabase) {
    loginNote.textContent = "Supabase failed to load. Refresh the page.";
    return;
  }
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) {
    loginNote.textContent = "Email and password required.";
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("invalid login credentials")) {
      loginNote.textContent = "No account found. Please sign up first.";
      return;
    }
    if (message.includes("email not confirmed")) {
      loginNote.textContent = "Check your email to confirm before signing in.";
      return;
    }
    loginNote.textContent = error.message;
    return;
  }
  loginNote.textContent = "";
  passwordInput.value = "";
}

async function signUp() {
  if (!supabase) {
    loginNote.textContent = "Supabase failed to load. Refresh the page.";
    return;
  }
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const username = usernameInput.value.trim();
  if (!email || !password || !username) {
    loginNote.textContent = "Email, password, and username required.";
    return;
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        role: "member",
      },
    },
  });
  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      loginNote.textContent = "Account exists. Please sign in.";
      return;
    }
    loginNote.textContent = error.message;
    return;
  }
  usernameInput.value = "";
  passwordInput.value = "";
  loginNote.textContent = data?.session
    ? "Account created. You're signed in."
    : "Check your email to confirm, then sign in.";
}

async function logout() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

function getActiveBoard() {
  return state.boards.find((board) => board.id === state.activeBoardId);
}

function setActiveBoard(boardId) {
  state.activeBoardId = boardId;
  saveState();
  renderBoards();
  renderCanvas();
}

function renderBoards() {
  boardList.innerHTML = "";
  state.boards.forEach((board) => {
    const btn = document.createElement("button");
    btn.className = `board-item${board.id === state.activeBoardId ? " active" : ""}`;
    btn.textContent = board.name;
    btn.addEventListener("click", () => setActiveBoard(board.id));
    boardList.appendChild(btn);
  });
}

function renderCanvas() {
  canvas.innerHTML = "";
  const board = getActiveBoard();
  if (!board) return;
  board.items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.itemId = item.id;
    card.style.left = `${item.x}px`;
    card.style.top = `${item.y}px`;
    if (item.type === "note") {
      const text = document.createElement("textarea");
      text.value = item.content;
      text.addEventListener("input", (event) => {
        item.content = event.target.value;
        saveState();
      });
      card.appendChild(text);
    }
    if (item.type === "image") {
      const img = document.createElement("img");
      img.src = item.content;
      card.appendChild(img);
    }
    card.addEventListener("mousedown", (event) => startDrag(event, card, item));
    canvas.appendChild(card);
  });
}

function addNote() {
  if (!canEditBoard()) return;
  const board = getActiveBoard();
  if (!board) return;
  board.items.push({
    id: `note-${Date.now()}`,
    type: "note",
    content: "New note...",
    x: 40,
    y: 40,
  });
  saveState();
  renderCanvas();
}

function addImage(file) {
  if (!canEditBoard()) return;
  const reader = new FileReader();
  reader.onload = () => {
    const board = getActiveBoard();
    if (!board) return;
    board.items.push({
      id: `img-${Date.now()}`,
      type: "image",
      content: reader.result,
      x: 60,
      y: 60,
    });
    saveState();
    renderCanvas();
  };
  reader.readAsDataURL(file);
}

function canEditBoard() {
  return state.role !== "viewer";
}

function startDrag(event, card, item) {
  if (!canEditBoard()) return;
  draggingCard = { card, item };
  card.classList.add("dragging");
  const rect = card.getBoundingClientRect();
  dragOffset.x = event.clientX - rect.left;
  dragOffset.y = event.clientY - rect.top;
}

function onDrag(event) {
  if (!draggingCard) return;
  const canvasRect = canvas.getBoundingClientRect();
  const x = event.clientX - canvasRect.left - dragOffset.x;
  const y = event.clientY - canvasRect.top - dragOffset.y;
  draggingCard.card.style.left = `${x}px`;
  draggingCard.card.style.top = `${y}px`;
  draggingCard.item.x = Math.max(0, x);
  draggingCard.item.y = Math.max(0, y);
}

function stopDrag() {
  if (!draggingCard) return;
  draggingCard.card.classList.remove("dragging");
  draggingCard = null;
  saveState();
}

function handleBoardCreate() {
  if (!canEditBoard()) return;
  const name = prompt("Board name?");
  if (!name) return;
  const id = `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  state.boards.push({ id, name, items: [] });
  state.activeBoardId = id;
  saveState();
  renderBoards();
  renderCanvas();
}

function switchTab(tabId) {
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabId));
  boardPanel.classList.toggle("active", tabId === "board");
  announcementsPanel.classList.toggle("active", tabId === "announcements");
}

function renderAnnouncement() {
  announcementInput.value = state.announcement;
  announcementDisplay.textContent = state.announcement;
}

function saveAnnouncement() {
  if (state.role !== "owner") return;
  state.announcement = announcementInput.value.trim() || "No announcements yet.";
  saveState();
  renderAnnouncement();
}

function renderChat() {
  chatLog.innerHTML = "";
  chatMessages.slice(-50).forEach((entry) => {
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    const meta = document.createElement("div");
    meta.className = "meta";
    const time = entry.created_at || entry.time;
    meta.textContent = `${entry.username || entry.role} > ${new Date(time).toLocaleTimeString()}`;
    const text = document.createElement("div");
    text.textContent = entry.text || "";
    bubble.appendChild(meta);
    bubble.appendChild(text);
    chatLog.appendChild(bubble);
  });
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  if (!state.authed || !supabase) {
    return;
  }
  const { error } = await supabase.from("chat_messages").insert({
    text,
    username: state.userLabel,
    user_id: state.userId,
  });
  if (error) {
    console.error("Chat send error", error);
    return;
  }
  chatInput.value = "";
}

async function loadChatHistory() {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id,text,username,created_at")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    console.error("Chat history error", error);
    return;
  }
  chatMessages = data || [];
  renderChat();
}

function connectChat() {
  if (!state.authed || !supabase) return;
  if (chatChannel) {
    supabase.removeChannel(chatChannel);
  }
  chatChannel = supabase
    .channel("chat_messages")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages" },
      (payload) => {
        chatMessages.push(payload.new);
        renderChat();
      }
    )
    .subscribe();
}

function disconnectChat() {
  if (!supabase) return;
  if (chatChannel) {
    supabase.removeChannel(chatChannel);
    chatChannel = null;
  }
}

async function applySession(session) {
  state.authed = !!session;
  state.userId = session?.user?.id || null;
  state.userLabel =
    session?.user?.user_metadata?.username ||
    session?.user?.email ||
    "member";
  state.role = session?.user?.user_metadata?.role || "member";
  saveState();
  updateLoginUI();
  if (state.authed) {
    sendChatBtn.disabled = false;
    chatInput.placeholder = "Message the crew...";
    await loadChatHistory();
    connectChat();
  } else {
    sendChatBtn.disabled = true;
    chatInput.placeholder = "Sign in to chat.";
    disconnectChat();
  }
}

async function initAuth() {
  if (!supabase) {
    loginNote.textContent = "Supabase failed to load. Refresh the page.";
    return;
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  await applySession(session);
  supabase.auth.onAuthStateChange((_event, updatedSession) => {
    applySession(updatedSession);
  });
}

signInBtn.addEventListener("click", signIn);
signUpBtn.addEventListener("click", signUp);
passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") signIn();
});
logoutBtn.addEventListener("click", logout);

newBoardBtn.addEventListener("click", handleBoardCreate);
addNoteBtn.addEventListener("click", addNote);
pngInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) addImage(file);
  pngInput.value = "";
});

tabs.forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
saveAnnouncementBtn.addEventListener("click", saveAnnouncement);

sendChatBtn.addEventListener("click", sendChat);
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") sendChat();
});

window.addEventListener("mousemove", onDrag);
window.addEventListener("mouseup", stopDrag);

renderBoards();
renderCanvas();
renderAnnouncement();
renderChat();
updateLoginUI();
initAuth();

const STORAGE_KEY = 'ceo-habit-os-v1';
const BACKUP_KEY = 'ceo-habit-os-v1-backup';
const AUTH_KEY = 'ceo-habit-os-auth-v1';
const API_BASE = (window.CEO_HABIT_API_URL || '').replace(/\/$/, '');

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const emptyState = () => ({
  theme: 'light',
  top3: [{ text: '', done: false }, { text: '', done: false }, { text: '', done: false }],
  habits: [],
  reflections: {},
  updatedAt: null
});

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') || fallback;
  } catch {
    return fallback;
  }
}

function normalizeState(value) {
  const clean = value && typeof value === 'object' ? value : emptyState();
  return {
    theme: clean.theme === 'dark' ? 'dark' : 'light',
    top3: Array.isArray(clean.top3) && clean.top3.length === 3
      ? clean.top3.map(item => ({ text: String(item?.text || '').slice(0, 80), done: Boolean(item?.done) }))
      : emptyState().top3,
    habits: Array.isArray(clean.habits) ? clean.habits.map(habit => ({
      id: habit.id || crypto.randomUUID(),
      name: String(habit.name || '').slice(0, 50),
      doneDates: Array.isArray(habit.doneDates) ? [...new Set(habit.doneDates.map(String))] : []
    })).filter(habit => habit.name) : [],
    reflections: clean.reflections && typeof clean.reflections === 'object' ? clean.reflections : {},
    updatedAt: typeof clean.updatedAt === 'string' ? clean.updatedAt : null
  };
}

let state = normalizeState(readJson(STORAGE_KEY, emptyState()));
let auth = readJson(AUTH_KEY, null);
let cloudRevision = 0;
let syncTimer = null;
let syncInFlight = false;
let syncAgain = false;
let authMode = 'login';
let toastTimer = null;

function persistLocal({ sync = true } = {}) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (sync && auth?.token) scheduleCloudSync();
}

function saveBackup(value) {
  localStorage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: value }));
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function updateSyncStatus(message, status = 'local') {
  const element = document.getElementById('syncStatus');
  element.textContent = message;
  element.dataset.status = status;
}

function renderAuth() {
  const button = document.getElementById('authBtn');
  button.textContent = auth?.user?.email || 'เข้าสู่ระบบ';
  button.title = auth?.user?.email ? 'ออกจากระบบ' : 'เข้าสู่ระบบเพื่อซิงก์ Cloud';
  if (!auth) updateSyncStatus('บันทึกในเครื่อง', 'local');
}

function dateLabel() {
  return new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
}

function habitDoneToday(habit) {
  return (habit.doneDates || []).includes(localDateKey());
}

function streak(habit) {
  const done = new Set(habit.doneDates || []);
  let count = 0;
  const date = new Date();
  while (done.has(localDateKey(date))) {
    count += 1;
    date.setDate(date.getDate() - 1);
  }
  return count;
}

function bestStreak(habit) {
  const dates = [...(habit.doneDates || [])].sort();
  if (!dates.length) return 0;
  let best = 1;
  let current = 1;
  for (let index = 1; index < dates.length; index += 1) {
    const previous = new Date(`${dates[index - 1]}T00:00:00`);
    const next = new Date(`${dates[index]}T00:00:00`);
    const difference = Math.round((next - previous) / 86400000);
    if (difference === 1) {
      current += 1;
      best = Math.max(best, current);
    } else if (difference > 1) {
      current = 1;
    }
  }
  return best;
}

function renderTop3() {
  const wrap = document.getElementById('top3List');
  wrap.replaceChildren();
  state.top3.forEach((item, index) => {
    const row = document.createElement('label');
    row.className = 'top3-item';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = item.done;
    const text = document.createElement('input');
    text.type = 'text';
    text.maxLength = 80;
    text.placeholder = `Priority ${index + 1}`;
    text.value = item.text;
    check.onchange = () => {
      item.done = check.checked;
      persistLocal();
      renderStats();
    };
    text.oninput = () => {
      item.text = text.value;
      persistLocal();
      renderStats();
    };
    row.append(check, text);
    wrap.appendChild(row);
  });
}

function renderHabits() {
  const wrap = document.getElementById('habitList');
  wrap.replaceChildren();
  state.habits.forEach(habit => {
    const done = habitDoneToday(habit);
    const row = document.createElement('div');
    row.className = `habit${done ? ' done' : ''}`;
    const main = document.createElement('div');
    main.className = 'habit-main';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = done;
    const details = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'habit-name';
    name.textContent = habit.name;
    const meta = document.createElement('div');
    meta.className = 'habit-meta';
    meta.textContent = `🔥 ${streak(habit)} day streak`;
    const remove = document.createElement('button');
    remove.className = 'delete';
    remove.type = 'button';
    remove.title = 'ลบ';
    remove.textContent = '×';
    check.onchange = () => {
      habit.doneDates = habit.doneDates || [];
      const key = localDateKey();
      habit.doneDates = habitDoneToday(habit)
        ? habit.doneDates.filter(date => date !== key)
        : [...habit.doneDates, key];
      persistLocal();
      render();
    };
    remove.onclick = () => {
      state.habits = state.habits.filter(item => item.id !== habit.id);
      persistLocal();
      render();
    };
    details.append(name, meta);
    main.append(check, details);
    row.append(main, remove);
    wrap.appendChild(row);
  });
  document.getElementById('emptyState').style.display = state.habits.length ? 'none' : 'block';
}

function renderStats() {
  const habitDone = state.habits.filter(habitDoneToday).length;
  const topDone = state.top3.filter(item => item.done && item.text.trim()).length;
  const topTotal = state.top3.filter(item => item.text.trim()).length;
  const total = state.habits.length + topTotal;
  const done = habitDone + topDone;
  const score = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('doneCount').textContent = habitDone;
  document.getElementById('totalCount').textContent = state.habits.length;
  document.getElementById('bestStreak').textContent = Math.max(0, ...state.habits.map(bestStreak));
  document.getElementById('habitProgress').textContent = `${habitDone} / ${state.habits.length}`;
  document.getElementById('dailyScore').textContent = `${score}%`;
  document.getElementById('progressBar').style.width = `${score}%`;
  document.getElementById('scoreMessage').textContent = score === 100
    ? 'Excellent — Win the Day สำเร็จ'
    : score >= 70 ? 'ใกล้แล้ว ทำสิ่งสำคัญให้จบ'
      : score >= 40 ? 'กำลังไปได้ดี รักษา Momentum'
        : 'เริ่มจากสิ่งสำคัญที่สุดก่อน';
}

function applyTheme() {
  document.documentElement.classList.toggle('dark', state.theme === 'dark');
  document.getElementById('themeBtn').textContent = state.theme === 'dark' ? '☀' : '☾';
}

function render() {
  renderTop3();
  renderHabits();
  renderStats();
  applyTheme();
  renderAuth();
  document.getElementById('reflection').value = state.reflections[localDateKey()] || '';
}

async function requestJson(path, options = {}) {
  if (!API_BASE) throw new Error('ยังไม่ได้เชื่อมต่อ Cloud API');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'เชื่อมต่อ Cloud ไม่สำเร็จ');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function scheduleCloudSync() {
  updateSyncStatus('กำลังรอซิงก์…', 'local');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushCloudState, 700);
}

async function pushCloudState() {
  if (!auth?.token || !API_BASE) return;
  if (syncInFlight) {
    syncAgain = true;
    return;
  }
  syncInFlight = true;
  updateSyncStatus('กำลังซิงก์…', 'local');
  try {
    const result = await requestJson('/api/state', {
      method: 'PUT',
      body: JSON.stringify({ data: state, baseRevision: cloudRevision })
    });
    cloudRevision = result.revision;
    updateSyncStatus('ซิงก์แล้ว', 'synced');
  } catch (error) {
    if (error.status === 409 && error.data?.state?.data) {
      saveBackup(state);
      state = normalizeState(error.data.state.data);
      cloudRevision = error.data.state.revision;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      updateSyncStatus('รับข้อมูลล่าสุดแล้ว', 'synced');
      showToast('พบข้อมูลใหม่จากอีกอุปกรณ์ จึงรับข้อมูลล่าสุดจาก Cloud');
    } else if (error.status === 401) {
      logout('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    } else {
      updateSyncStatus('Cloud ขัดข้อง · เก็บในเครื่องแล้ว', 'error');
    }
  } finally {
    syncInFlight = false;
    if (syncAgain) {
      syncAgain = false;
      scheduleCloudSync();
    }
  }
}

function hasMeaningfulData(value) {
  return value.habits.length > 0
    || value.top3.some(item => item.text.trim())
    || Object.values(value.reflections).some(text => String(text).trim());
}

async function reconcileCloudState({ newAccount = false } = {}) {
  updateSyncStatus('กำลังโหลด Cloud…', 'local');
  const cloud = await requestJson('/api/state');
  cloudRevision = cloud.revision;
  if (!cloud.data || newAccount) {
    await pushCloudState();
    return;
  }
  const remote = normalizeState(cloud.data);
  const localTime = state.updatedAt ? Date.parse(state.updatedAt) : 0;
  const remoteTime = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;
  if (hasMeaningfulData(state) && localTime > remoteTime) {
    await pushCloudState();
    return;
  }
  if (JSON.stringify(state) !== JSON.stringify(remote)) saveBackup(state);
  state = remote;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
  updateSyncStatus('ซิงก์แล้ว', 'synced');
}

function setAuthMode(mode) {
  authMode = mode;
  const register = mode === 'register';
  document.getElementById('authTitle').textContent = register ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
  document.getElementById('authSubmitBtn').textContent = register ? 'สร้างบัญชีและเปิด Cloud Sync' : 'เข้าสู่ระบบ';
  document.getElementById('switchAuthModeBtn').textContent = register
    ? 'มีบัญชีแล้ว? เข้าสู่ระบบ'
    : 'ยังไม่มีบัญชี? สมัครสมาชิก';
  document.getElementById('passwordInput').autocomplete = register ? 'new-password' : 'current-password';
  document.getElementById('authError').textContent = '';
}

function openAuthDialog() {
  setAuthMode('login');
  document.getElementById('authDialog').showModal();
}

function logout(message = 'ออกจากระบบแล้ว ข้อมูลในเครื่องยังอยู่ครบ') {
  auth = null;
  cloudRevision = 0;
  localStorage.removeItem(AUTH_KEY);
  renderAuth();
  showToast(message);
}

document.getElementById('today').textContent = dateLabel();
document.getElementById('habitForm').onsubmit = event => {
  event.preventDefault();
  const input = document.getElementById('habitInput');
  const name = input.value.trim();
  if (!name) return;
  state.habits.push({ id: crypto.randomUUID(), name, doneDates: [] });
  input.value = '';
  persistLocal();
  render();
};
document.getElementById('themeBtn').onclick = () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  persistLocal();
  applyTheme();
};
document.getElementById('reflection').oninput = event => {
  state.reflections[localDateKey()] = event.target.value;
  persistLocal();
};
document.getElementById('authBtn').onclick = () => {
  if (auth) logout();
  else openAuthDialog();
};
document.getElementById('closeAuthBtn').onclick = () => document.getElementById('authDialog').close();
document.getElementById('switchAuthModeBtn').onclick = () => setAuthMode(authMode === 'login' ? 'register' : 'login');
document.getElementById('authForm').onsubmit = async event => {
  event.preventDefault();
  const submit = document.getElementById('authSubmitBtn');
  const errorElement = document.getElementById('authError');
  submit.disabled = true;
  errorElement.textContent = '';
  try {
    const result = await requestJson(`/api/auth/${authMode}`, {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('emailInput').value.trim(),
        password: document.getElementById('passwordInput').value
      })
    });
    auth = { token: result.token, user: result.user };
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    renderAuth();
    await reconcileCloudState({ newAccount: authMode === 'register' });
    document.getElementById('authDialog').close();
    document.getElementById('authForm').reset();
    showToast(authMode === 'register' ? 'สร้างบัญชีและเปิด Cloud Sync แล้ว' : 'เข้าสู่ระบบและซิงก์แล้ว');
  } catch (error) {
    errorElement.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
};

render();
if (auth?.token && API_BASE) {
  reconcileCloudState().catch(error => {
    if (error.status === 401) logout('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    else updateSyncStatus('Cloud ขัดข้อง · เก็บในเครื่องแล้ว', 'error');
  });
}

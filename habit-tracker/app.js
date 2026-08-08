const STORAGE_KEY='ceo-habit-os-v1';
const todayKey=()=>new Date().toISOString().slice(0,10);
const state=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')||{
  theme:'light',
  top3:[{text:'',done:false},{text:'',done:false},{text:'',done:false}],
  habits:[],
  reflections:{}
};
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
function dateLabel(){return new Intl.DateTimeFormat('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());}
function habitDoneToday(h){return (h.doneDates||[]).includes(todayKey());}
function streak(h){const done=new Set(h.doneDates||[]);let n=0;const d=new Date();while(done.has(d.toISOString().slice(0,10))){n++;d.setDate(d.getDate()-1);}return n;}
function bestStreak(h){const dates=[...(h.doneDates||[])].sort();if(!dates.length)return 0;let best=1,cur=1;for(let i=1;i<dates.length;i++){const a=new Date(dates[i-1]+'T00:00:00'),b=new Date(dates[i]+'T00:00:00');const diff=(b-a)/86400000;if(diff===1){cur++;best=Math.max(best,cur)}else if(diff>1)cur=1;}return best;}
function renderTop3(){const wrap=document.getElementById('top3List');wrap.innerHTML='';state.top3.forEach((item,i)=>{const row=document.createElement('label');row.className='top3-item';row.innerHTML=`<input type="checkbox" ${item.done?'checked':''}><input type="text" maxlength="80" placeholder="Priority ${i+1}" value="${item.text.replaceAll('&','&amp;').replaceAll('"','&quot;')}">`;const [check,text]=row.querySelectorAll('input');check.onchange=()=>{item.done=check.checked;save();renderStats()};text.oninput=()=>{item.text=text.value;save()};wrap.appendChild(row);});}
function renderHabits(){const wrap=document.getElementById('habitList');wrap.innerHTML='';state.habits.forEach(h=>{const done=habitDoneToday(h);const row=document.createElement('div');row.className='habit'+(done?' done':'');row.innerHTML=`<div class="habit-main"><input type="checkbox" ${done?'checked':''}><div><div class="habit-name"></div><div class="habit-meta"><span>🔥 ${streak(h)} day streak</span></div></div></div><button class="delete" title="ลบ">×</button>`;row.querySelector('.habit-name').textContent=h.name;row.querySelector('input').onchange=()=>{h.doneDates=h.doneDates||[];const k=todayKey();if(habitDoneToday(h))h.doneDates=h.doneDates.filter(x=>x!==k);else h.doneDates.push(k);save();render()};row.querySelector('.delete').onclick=()=>{state.habits=state.habits.filter(x=>x.id!==h.id);save();render()};wrap.appendChild(row);});document.getElementById('emptyState').style.display=state.habits.length?'none':'block';}
function renderStats(){const habitDone=state.habits.filter(habitDoneToday).length;const topDone=state.top3.filter(x=>x.done&&x.text.trim()).length;const topTotal=state.top3.filter(x=>x.text.trim()).length;const total=state.habits.length+topTotal;const done=habitDone+topDone;const score=total?Math.round(done/total*100):0;document.getElementById('doneCount').textContent=habitDone;document.getElementById('totalCount').textContent=state.habits.length;document.getElementById('bestStreak').textContent=Math.max(0,...state.habits.map(bestStreak));document.getElementById('habitProgress').textContent=`${habitDone} / ${state.habits.length}`;document.getElementById('dailyScore').textContent=`${score}%`;document.getElementById('progressBar').style.width=`${score}%`;document.getElementById('scoreMessage').textContent=score===100?'Excellent — Win the Day สำเร็จ':score>=70?'ใกล้แล้ว ทำสิ่งสำคัญให้จบ':score>=40?'กำลังไปได้ดี รักษา Momentum':'เริ่มจากสิ่งสำคัญที่สุดก่อน';}
function applyTheme(){document.documentElement.classList.toggle('dark',state.theme==='dark');document.getElementById('themeBtn').textContent=state.theme==='dark'?'☀':'☾';}
function render(){renderTop3();renderHabits();renderStats();applyTheme();}
document.getElementById('today').textContent=dateLabel();
document.getElementById('habitForm').onsubmit=e=>{e.preventDefault();const input=document.getElementById('habitInput');const name=input.value.trim();if(!name)return;state.habits.push({id:Date.now(),name,doneDates:[]});input.value='';save();render();};
document.getElementById('themeBtn').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';save();applyTheme();};
const reflection=document.getElementById('reflection');reflection.value=state.reflections[todayKey()]||'';reflection.oninput=()=>{state.reflections[todayKey()]=reflection.value;save();};
render();

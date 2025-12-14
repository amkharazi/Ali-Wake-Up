/* Ali, Wake Up — minimal horror game
   - Saves profile/settings/progress in localStorage
   - Buddy and villain cannot be the same person
   - Terminal: help, status, reset, cheat happy birthday
   - Ambient loops between two tracks; finale switches to happy track
   - Ambient + SFX do NOT overlap: ambient pauses during SFX then resumes
*/

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // ---------- Avatars + Dialogue ----------
  function slugifyName(name){
    return String(name||"")
      .toLowerCase()
      .trim()
      .replace(/[^\u00C0-\u024F\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "");
  }

  function avatarUrl(name){
    const slug = slugifyName(name);
    return `assets/avatars/${slug}.png`;
  }

  function avatarImg(name){
    const src = avatarUrl(name);
    const fb = "assets/avatars/_placeholder.png";
    return `<img class="avatar" alt="${escapeHtml(name)}" src="${src}" onerror="this.onerror=null;this.src='${fb}'">`;
  }

  function renderDialogue(dialogue){
    if(!Array.isArray(dialogue) || !dialogue.length) return "";
    let out = `<div class="chat">`;
    for(const line of dialogue){
      const type = line.type || "msg";
      if(type === "system"){
        out += `<div class="msg system"><div class="bubble bubble--system">${escapeHtml(line.text || "")}</div></div>`;
        continue;
      }
      const speaker = line.speaker || "";
      const side = (line.side === "right") ? "right" : "left";
      const text = line.text || "";
      out += `
        <div class="msg ${side}">
          ${avatarImg(speaker)}
          <div class="bubble">
            <div class="bubbleLine">
              <span class="speakerTag">${escapeHtml(speaker)}</span>
              <span class="msgText">${escapeHtml(text)}</span>
            </div>
          </div>
        </div>
      `;
    }
    out += `</div>`;
    return out;
  }

  function renderSceneMedia(scene){
    let html = scene.media || "";
    if(scene.dialogue) html += renderDialogue(scene.dialogue);
    return html;
  }

  function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
  function setCookie(name, value, days=365){
    const d = new Date();
    d.setTime(d.getTime() + days*24*60*60*1000);
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
  }
  function getCookie(name){
    const key = encodeURIComponent(name) + "=";
    return document.cookie.split(";").map(s=>s.trim()).find(s=>s.startsWith(key))?.slice(key.length) || "";
  }

  function uniqKeepOrder(arr){
    const seen=new Set(), out=[];
    for(const x of arr){
      const k=String(x||"").trim();
      if(!k||seen.has(k)) continue;
      seen.add(k); out.push(k);
    }
    return out;
  }

  
  // ---------- Mechanics ----------
  function maxForNeed(name){
    if(name === "Trust") return 120;
    if(name === "Resources") return 999;
    if(name === "Clues") return 10;
    if(name === "Keycard") return 1;
    if(name === "Maps") return 5;
    if(name === "Sanity") return 10;
    return 10;
  }

  function clampAll(st){
    const bounded = ["Food","Water","Energy","Sanity"];
    for(const k of bounded){
      st.needs[k] = clamp(Number(st.needs[k]||0), -1, 10);
    }
    st.needs.Bladder = clamp(Number(st.needs.Bladder||0), 0, 6);
    st.needs.Clues = clamp(Number(st.needs.Clues||0), 0, 10);
    st.needs.Maps = clamp(Number(st.needs.Maps||0), 0, 5);
    st.needs.Keycard = clamp(Number(st.needs.Keycard||0), 0, 1);
    st.needs.Resources = clamp(Number(st.needs.Resources||0), 0, 999);
    st.needs.Trust = Number(st.needs.Trust||0);
  }

  function spend(st, obj){
    for(const [k,v] of Object.entries(obj||{})){
      st.needs[k] = Number(st.needs[k]||0) - Number(v||0);
    }
  }

  function gain(st, obj){
    for(const [k,v] of Object.entries(obj||{})){
      st.needs[k] = Number(st.needs[k]||0) + Number(v||0);
    }
  }

  function adjustTrust(st, who, delta){
    st.needs.Trust = Number(st.needs.Trust||0) + delta;
    st.trustBy = st.trustBy || {};
    st.trustBy[who] = Number(st.trustBy[who]||0) + delta;
  }

  function trust(st){ return Number(st.needs.Trust||0); }

  function rollLuck(st){
    const t = trust(st);
    const p = clamp(0.08 + t/300, 0.08, 0.55);
    return Math.random() < p;
  }

  function checkBladder(st){
    if(st.needs.Bladder >= 6){
      st.needs.Bladder = 0;
      adjustTrust(st, "everyone", -12);
      pushDiary(st, "Accident… You embarrassed yourself. Trust -12.");
      toast("You… uh… had an accident. Trust -12.");
    }else if(st.needs.Bladder === 5){
      toast("Bladder is high. Get to your bunker toilet.");
    }
  }

  function faintToBunker(st, reason){
    st.day = Number(st.day||1) + 1;
    st.sceneId = "bunker";
    // restore the collapsed stat to 1, keep others at least 1
    st.needs.Energy = clamp(Number(st.needs.Energy||0), 1, 10);
    st.needs.Sanity = clamp(Number(st.needs.Sanity||0), 1, 10);
    st.needs.Food = clamp(Number(st.needs.Food||0), 1, 10);
    st.needs.Water = clamp(Number(st.needs.Water||0), 1, 10);
    pushDiary(st, `You fainted (${reason}). Day ${st.day}. You wake in your bunker.`);
    toast("You fainted… Next morning, you wake up in your bunker.");
  }

  function checkCollapse(st){
    const crit = ["Food","Water","Energy","Sanity"];
    for(const k of crit){
      if(Number(st.needs[k]||0) <= -1){
        st.needs[k] = 1;
        faintToBunker(st, `${k} depleted`);
        return;
      }
      if(Number(st.needs[k]||0) === 0){
        toast(`${k} is zero. You have little time…`);
      }
    }
  }

  function chooseRandomCandidate(st, exclude=[]){
    const ex = new Set(exclude);
    const pool = CHARACTERS.filter(n => !ex.has(n));
    if(!pool.length) return null;
    return pool[Math.floor(Math.random()*pool.length)];
  }

  function addMissing(st, name){
    st.missing = st.missing || [];
    if(name && !st.missing.includes(name)) st.missing.push(name);
  }

// ---------- Characters ----------
  const CHARACTERS = uniqKeepOrder([
    "Dr.Mansoor Rezghi",
    "Hossein Choubin",
    "Mahdi Amiri",
    "Maryam Pakseresht",
    "Amir Mohammad Kharazi",
    "Hesam Farhang",
    "Hossein Eyvazi",
    "Mohammad Badzohreh",
    "Amir Adabi",
    "Ali Khangoli",
    "Hanieh Esmaeli",
    "Alireza",
    "Mohammad Hossein Soltani",
    "Mahdi",
    "Erfaneh",
    "Reza Dehghani",
    "Faranak",
    "Mojtaba",
    "Usain",
    "M,arshall Mathers",
    "Rana Aszizzadeh",
    "Erfan",
    "Sepandar"
  ]);

  

  const REGIONS = {
    A: [
      "Dr.Mansoor Rezghi",
      "Hossein Choubin",
      "Mahdi Amiri",
      "Maryam Pakseresht",
      "Amir Mohammad Kharazi",
      "Hesam Farhang"
    ],
    B: [
      "Hossein Eyvazi",
      "Mohammad Badzohreh",
      "Amir Adabi",
      "Ali Khangoli",
      "Hanieh Esmaeli",
      "Alireza"
    ],
    C: [
      "Mohammad Hossein Soltani",
      "Mahdi",
      "Erfaneh",
      "Reza Dehghani",
      "Faranak",
      "Mojtaba"
    ],
    D: [
      "Usain",
      "M,arshall Mathers",
      "Rana Aszizzadeh",
      "Erfan",
      "Sepandar"
    ]
  };

  function regionMembers(letter){
    const list = REGIONS[letter] || [];
    // Keep only members that exist in CHARACTERS (safety)
    return list.filter(n => CHARACTERS.includes(n));
  }

// ---------- State ----------
  const STORAGE_KEY = "ali_wake_up_state_v3";

  function defaultState(){
    return {
      profile: {
        name: "Ali Shahrokhi",
        age: 27,
        villain: "Dr.Mansoor Rezghi",
        buddy: "Hossein Choubin",
        job: "SnapPay QA"
      },
      settings: {
        musicOn: true,
        musicVol: 0.6,
        sfxOn: true,
        sfxVol: 0.9
      },
      needs: {
        Food: 5,
        Water: 5,
        Energy: 5,
        Bladder: 0,
        Resources: 0,
        Keycard: 0,
        Clues: 0,
        Maps: 0,
        Sanity: 5,
        Trust: 0
      },
      diary: [],
      day: 1,
      trustBy: {},
      missing: [],
      events: { e1:false, e2:false, hospital:false },
      flags: {
        introDone: false,
        finished: false
      },
      sceneId: "drive"
    };
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      const s = JSON.parse(raw);
      if(!s || typeof s !== "object") return null;
      return s;
    }catch{ return null; }
  }

  function saveState(s){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  function resetAll(){
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

  function pushDiary(s, line){
    if(!line) return;
    s.diary.push(`[${new Date().toLocaleString()}] ${line}`);
    if(s.diary.length > 120) s.diary.splice(0, s.diary.length - 120);
  }

  // ---------- Audio ----------
  // You asked to use THESE links:
  const AMBIENT_LINK_1 = "https://commons.wikimedia.org/wiki/Special:FilePath/Vastopia_-_Dark_Ambient_Music_for_Deep_Relaxation_and_Focus.ogg";
  const AMBIENT_LINK_2 = "https://commons.wikimedia.org/wiki/Special:FilePath/Raspberrymusic_-_Ambient_(10_minutes).flac";
  const HAPPY_LINK     = "https://commons.wikimedia.org/wiki/Special:FilePath/Ain%27t_we_got_fun_-_Billy_Jones.ogg";

  // Fallback direct file URLs from upload.wikimedia.org (often more reliable than Special:FilePath):
  const AMBIENT_FALLBACK_1 = "https://upload.wikimedia.org/wikipedia/commons/8/81/Vastopia_-_Dark_Ambient_Music_for_Deep_Relaxation_and_Focus.ogg";
  const AMBIENT_FALLBACK_2 = "https://upload.wikimedia.org/wikipedia/commons/8/8c/Raspberrymusic_-_Ambient_%2810_minutes%29.flac";
  const HAPPY_FALLBACK     = "https://upload.wikimedia.org/wikipedia/commons/e/ef/Ain%27t_we_got_fun_-_Billy_Jones.ogg";

  const VASTOPIA_MP3 = "https://upload.wikimedia.org/wikipedia/commons/transcoded/8/81/Vastopia_-_Dark_Ambient_Music_for_Deep_Relaxation_and_Focus.ogg/Vastopia_-_Dark_Ambient_Music_for_Deep_Relaxation_and_Focus.ogg.mp3";
  const RASPBERRY_OGG = "https://upload.wikimedia.org/wikipedia/commons/transcoded/8/8c/Raspberrymusic_-_Ambient_%2810_minutes%29.flac/Raspberrymusic_-_Ambient_%2810_minutes%29.flac.ogg";
  const RASPBERRY_MP3 = "https://upload.wikimedia.org/wikipedia/commons/transcoded/8/8c/Raspberrymusic_-_Ambient_%2810_minutes%29.flac/Raspberrymusic_-_Ambient_%2810_minutes%29.flac.mp3";
  const HAPPY_MP3     = "https://upload.wikimedia.org/wikipedia/commons/transcoded/e/ef/Ain%27t_we_got_fun_-_Billy_Jones.ogg/Ain%27t_we_got_fun_-_Billy_Jones.ogg.mp3";

  const AMBIENT_PLAYLIST = [
    { name: "Vastopia", sources: [VASTOPIA_MP3, AMBIENT_FALLBACK_1, AMBIENT_LINK_1] },
    { name: "Raspberrymusic", sources: [RASPBERRY_MP3, RASPBERRY_OGG, AMBIENT_FALLBACK_2, AMBIENT_LINK_2] }
  ];
  const HAPPY_TRACK = { name: "Ain\'t we got fun", sources: [HAPPY_MP3, HAPPY_FALLBACK, HAPPY_LINK] };

  const ambient = new Audio();
  ambient.preload = "auto";
  ambient.loop = false; // playlist loop

  const sfx = new Audio();
  sfx.preload = "auto";
  sfx.loop = false;

  let ambientIndex = 0;
  let ambientArmed = false;
  let ambientWasPlaying = false;

  function setVolumes(st){
    ambient.volume = st.settings.musicOn ? clamp(st.settings.musicVol,0,1) : 0;
    sfx.volume = st.settings.sfxOn ? clamp(st.settings.sfxVol,0,1) : 0;
  }

  async function tryPlay(audioEl, url){
    audioEl.src = url;
    await audioEl.play();
  }

  async function playFromSources(audioEl, sources){
    let lastErr = null;
    for(const url of sources){
      try{
        await tryPlay(audioEl, url);
        return true;
      }catch(e){
        lastErr = e;
      }
    }
    throw lastErr || new Error("No playable source");
  }

  async function startAmbient(st){
    if(!st.settings.musicOn) return;
    const track = AMBIENT_PLAYLIST[ambientIndex % AMBIENT_PLAYLIST.length];
    setVolumes(st);
    await playFromSources(ambient, track.sources);
  }

  async function ensureAmbientForState(st, forceRestart=false){
    if(!st.settings.musicOn) return false;

    const wantHappy = !!(st.flags && st.flags.finished) || st.sceneId === "finale";
    const mode = ambient.dataset.mode || "";

    if(wantHappy){
      // Happy: loop this single track
      if(mode !== "happy" || forceRestart){
        try{
          ambient.pause();
          ambient.currentTime = 0;
        }catch{}
        ambient.loop = true;
        ambient.dataset.mode = "happy";
        setVolumes(st);
        await playFromSources(ambient, HAPPY_TRACK.sources);
        return true;
      }
      // already happy
      ambient.loop = true;
      setVolumes(st);
      if(ambient.paused) { await ambient.play(); }
      return true;
    }else{
      // Ambient playlist mode
      ambient.loop = false;
      if(mode !== "ambient" || forceRestart){
        ambient.dataset.mode = "ambient";
        setVolumes(st);
        const track = AMBIENT_PLAYLIST[ambientIndex % AMBIENT_PLAYLIST.length];
        await playFromSources(ambient, track.sources);
        return true;
      }
      setVolumes(st);
      if(ambient.paused) { await ambient.play(); }
      return true;
    }
  }

  ambient.addEventListener("ended", () => {
    const st = stateRef();
    // Only advance playlist if we're in ambient mode (not happy loop)
    if ((ambient.dataset.mode || "ambient") !== "ambient") return;
    ambientIndex = (ambientIndex + 1) % AMBIENT_PLAYLIST.length;
    startAmbient(st).catch(() => {});
  });

  async function switchToHappy(st){
    try{
      await ensureAmbientForState(st, true);
    }catch{
      
    }
  }

  // No overlap: pause ambient while sfx plays, then resume.
  async function playSfx(st, sources){
    if(!st.settings.sfxOn) return;

    // pause ambient if playing
    ambientWasPlaying = !ambient.paused && !ambient.ended;
    if(ambientWasPlaying){
      ambient.pause();
    }

    try{
      sfx.pause(); sfx.currentTime = 0;
      setVolumes(st);
      await playFromSources(sfx, sources);
    }catch{
      // ignore
    }finally{
      // resume ambient where it left off
      if(ambientWasPlaying && st.settings.musicOn){
        try{ await ambient.play(); }catch{}
      }
    }
  }

  function armAmbientOnce(st){
    // Kept for compatibility with existing button handlers: just try to start/resume.
    kickAmbientIfNeeded(st, false);
  }

  // ---------- UI + Rendering ----------
  let _state = null;
  const stateRef = () => _state;

  // ---------- Autoplay-friendly ambient kick ----------
  // Browsers may block audio until a user gesture. We therefore attempt to start/resume ambient
  // on *any* user interaction (tap/click/keypress), and we keep trying until it succeeds.
  let _ambientStarting = false;
  let _lastAmbientAttemptMs = 0;
  let _autoplayHintShown = false;

  async function kickAmbientIfNeeded(st, forceRestart=false){
    if(!st || !st.settings || !st.settings.musicOn) return false;
    if(_ambientStarting) return false;

    // If already playing, do nothing.
    if(!ambient.paused && !ambient.ended) return true;

    const now = Date.now();
    if(now - _lastAmbientAttemptMs < 350) return false; // small throttle
    _lastAmbientAttemptMs = now;

    _ambientStarting = true;
    try{
      await ensureAmbientForState(st, forceRestart);
      ambientArmed = true;
      return true;
    }catch{
      // Autoplay/CORS can fail; keep allowing retries on subsequent gestures.
      if(!_autoplayHintShown){
        
        _autoplayHintShown = true;
      }
      return false;
    }finally{
      _ambientStarting = false;
    }
  }

  function wireAmbientGestureKick(st){
    const handler = () => { kickAmbientIfNeeded(st, false); };
    document.addEventListener("pointerdown", handler, true);
    document.addEventListener("keydown", handler, true);
  }

  function toast(msg){
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("toast--show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.classList.remove("toast--show");
      el.textContent = ""; el.classList.remove("toast--show");
    }, 4200);
  }

  function renderNeeds(st){
    const host = $("needs");
    host.innerHTML = "";
    const entries = Object.entries(st.needs);

    for(const [name, val] of entries){
      const max = maxForNeed(name);
      const pct = clamp((val/max)*100, 0, 100);
      const card = document.createElement("div");
      card.className = "need";
      card.innerHTML = `
        <div class="need__name">${escapeHtml(name)}</div>
        <div class="need__bar"><div class="need__fill" style="width:${pct}%"></div></div>
        <div class="need__val">${escapeHtml(val)}</div>
      `;
      host.appendChild(card);
    }
  }

  function setBg(url){
    document.documentElement.style.setProperty("--bg-image", `url("${url}")`);
  }

  function setMedia(html){
    const host = $("sceneMedia");
    host.innerHTML = html || "";
  }

  function renderDiary(st){
    $("diary").textContent = st.diary.length ? st.diary.join("\n") : "No entries yet.";
  }

  function applyJobTitle(st){
    // Minimal: keep main title, but meta will show job
    $("brandTitle").textContent = "Ali, Wake Up";
  }

  
  function regionScene(s, letter){
    const members = regionMembers(letter);
    return {
      title: `Region ${letter}`,
      meta: `Bunkers ${letter}1–${letter}${members.length || 6}`,
      text:
`Concrete paths divide the world into Regions.
You follow the path into Region ${letter}.
The air changes — like a room holding its breath.`,
      bg: "assets/bg/bunker_corridor.png",
      media: "",
      dialogue: [
        { type:"system", text:`You are in Region ${letter}.` }
      ],
      choices: [
        ...members.map((name, i) => ({
          label: `${letter}${i+1} • ${name}`,
          sub: (s.missing?.includes(name) ? "Missing" : "Visit bunker"),
          effect: (st) => { st._visit = name; },
          next: "bunker_visit"
        })),
        { label: "Back to crossroads", sub: "", next: "world" }
      ]
    };
  }

// ---------- Scenes (minimal but coherent) ----------
  
const KILL_METHODS = [
  "Keyboard Ninja Star",
  "Weaponized Jira Ticket",
  "Bonk With Water Bottle",
  "Classic Chair Shot",
  "Keycard Shiv (Dramatic)",
  "Trip Into Cable Pile",
  "Yeet the Monitor",
  "Regression Suite Summon",
  "Flashbang Phone Light",
  "PDF Stack Drop",
  "Wet Fish Slap",
  "Closet Lock-In",
  "Stapler Launch",
  "Door Push Combo x10",
  "Aw Shit Energy Burst",
  "Endless Meeting Trap",
  "400 Tabs Crash",
  "Baby Shark Curse",
  "Rolling Chair Downhill",
  "HDMI Whip",
  "Foam Bat",
  "Charging Cable Tripwire",
  "Fake Faint Counterattack",
  "Deodorant Mist",
  "Balloon Distraction",
  "Mug Throw: Best QA",
  "Reverse UNO",
  "Nerf Gun Headshot",
  "Server Rack Drop (Somehow)",
  "Unleash the Bug Backlog"
];

function pickSome(arr, n){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a.slice(0, n);
}

const SCENES = {
  drive: (s) => ({
    title: "Highway / Rain",
    meta: `Subject: ${s.profile.name} • Age: ${s.profile.age} • Job: ${s.profile.job}`,
    text:
`You're driving. The road stretches into the dark.
A few drops hit the windshield… then more.
You haven't slept properly in days.

Your eyes burn.`,
    bg: "assets/bg/drive_rain.png",
    media: "",
    dialogue: [
      { type:"system", text:"Rain starts." },
      { speaker: s.profile.name, side:"right", text:"Just… ten more minutes. Then sleep." }
    ],
    choices: [
      {
        label:"Keep driving",
        sub:"You blink. Too long.",
        sfx:["assets/sfx/rain.wav"],
        effect:(st)=>{ spend(st,{Energy:1, Sanity:1}); },
        next:"sky"
      },
      {
        label:"Pull over (2 minutes)",
        sub:"+1 Energy",
        sfx:["assets/sfx/rain.wav"],
        effect:(st)=>{ gain(st,{Energy:1}); },
        next:"sky"
      }
    ]
  }),

  sky: (s) => ({
    title:"The road glitches",
    meta:"",
    text:
`The road breaks.

Stars.
Silence.
Your car floats.

Then a loud crash —
and everything turns white.`,
    bg:"assets/bg/sky_glitch.png",
    media:"",
    dialogue:[{type:"system", text:"CRASH → everything white."}],
    choices:[
      { label:"Ali… wake up…", sub:"", sfx:["assets/sfx/crash.wav"], next:"bunker_wake" }
    ]
  }),

  bunker_wake: (s) => ({
    title:"Bunker awakening",
    meta:`Day ${s.day} • Buddy: ${s.profile.buddy}`,
    text:
`You wake up on cold concrete. Concrete walls. A dim lamp.
A familiar hum.

${s.profile.buddy} is near you.`,
    bg:"assets/bg/bunker_room.png",
    media:"",
    dialogue:[
      { speaker:s.profile.buddy, side:"left", text:"Ali… you're awake. Thank God." },
      { speaker:s.profile.name, side:"right", text:"Did we crash?" },
      { speaker:s.profile.buddy, side:"left", text:"We all 'died' some way… and woke up here." },
      { type:"system", text:"Your throat is dry. Your hands are shaking." },
        { type:"system", text:"Your throat is dry. Your hands are shaking." },
        { speaker: s.profile.buddy, side:"left", text:"If you panic, it feeds on you. Breathe. Count to four." },
        { speaker: s.profile.name, side:"right", text:"…This can’t be real." }
],
    choices:[
      {
        label:"Stay calm. Ask for rules",
        sub:"+1 Clue",
        effect:(st)=>{
          gain(st,{Clues:1});
          pushDiary(st, `${st.profile.buddy}: 'Explore, trade, build trust. The sky changes before people disappear.'`);
        },
        next:"bunker"
      },
      {
        label:"Panic",
        sub:"Sanity -1",
        effect:(st)=>{ spend(st,{Sanity:1}); },
        next:"bunker"
      }
    ]
  }),

  bunker: (s) => ({
    title:"Your bunker",
    meta:`Day ${s.day} • Trust ${s.needs.Trust} • Clues ${s.needs.Clues} • Resources ${s.needs.Resources}`,
    text:
`Inside your bunker:
• Toilet (relieve yourself)
• Desk (food & water)
• Bed (sleep)

Outside: Regions A, B, C… and bunker doors labeled A1, A2, A3…`,
    bg:"assets/bg/bunker_room.png",
    media:"",
    choices:[
      { label:"Use toilet", sub:"Bladder -> 0", effect:(st)=>{ st.needs.Bladder = 0; pushDiary(st,"Used the bunker toilet."); }, next:"bunker" },
      {
        label:"Eat",
        sub:"Food -> 10 (cost 1 Resource)",
        effect:(st)=>{
          if(st.needs.Resources <= 0){ toast("No Resources."); return; }
          st.needs.Resources -= 1;
          st.needs.Food = 10;
          st.needs.Bladder += 1;
          pushDiary(st,"Ate. Food -> 10.");
        },
        next:"bunker"
      },
      {
        label:"Drink",
        sub:"Water -> 10 (cost 1 Resource)",
        effect:(st)=>{
          if(st.needs.Resources <= 0){ toast("No Resources."); return; }
          st.needs.Resources -= 1;
          st.needs.Water = 10;
          st.needs.Bladder += 2;
          pushDiary(st,"Drank. Water -> 10.");
        },
        next:"bunker"
      },
      {
        label:"Sleep",
        sub:"Energy -> 10 (advance day)",
        effect:(st)=>{
          st.day = Number(st.day||1) + 1;
          st.needs.Energy = 10;
          st.needs.Sanity = clamp(st.needs.Sanity + 1, -1, 10);
          pushDiary(st, `Slept. Day ${st.day}.`);

          st.events = st.events || {e1:false,e2:false,hospital:false};

          if(!st.events.e1 && st.needs.Clues >= 3 && st.needs.Resources >= 30){
            st.events.e1 = true;
            const gone = chooseRandomCandidate(st, [st.profile.buddy, st.profile.villain, ...(st.missing||[])]);
            if(gone) addMissing(st, gone);
            st.sceneId = "event1";
          }else if(st.events.e1 && !st.events.e2 && st.needs.Clues >= 6 && st.needs.Resources >= 60){
            st.events.e2 = true;
            addMissing(st, st.profile.buddy);
            addMissing(st, st.profile.villain);
            while((st.missing||[]).length < 5){
              const g = chooseRandomCandidate(st, [st.profile.buddy, st.profile.villain, ...(st.missing||[])]);
              if(!g) break;
              addMissing(st, g);
            }
            st.sceneId = "event2";
          }
        },
        next:"bunker"
      },
      { label:`Talk to ${s.profile.buddy}`, sub:"", next:"talk_buddy" },
      { label:"Go outside", sub:"Explore regions", effect:(st)=>{ spend(st,{Energy:1, Food:1, Water:1}); st.needs.Bladder += 1; }, next:"world" }
    ]
  }),

  talk_buddy: (s) => ({
    title:`Talk to ${s.profile.buddy}`,
    meta:"",
    text:`Your buddy lowers their voice.`,
    bg:"assets/bg/bunker_room.png",
    media:"",
    onEnter: (st) => {
      // Once per day: talking to your buddy can reveal a clue.
      st.flags = st.flags || {};
      const last = Number(st.flags.buddyClueDay || 0);
      if(Number(st.day||1) !== last){
        st.flags.buddyClueDay = Number(st.day||1);
        st.needs.Clues = (Number(st.needs.Clues||0) + 1);
        pushDiary(st, `Your buddy shared a clue. (Day ${st.day})`);
        toast("Clue gained from your buddy.");
      }
    },
    dialogue:[
      { speaker:s.profile.buddy, side:"left", text:"Help people. Gain trust. Or steal… and lose it." },
      { speaker:s.profile.name, side:"right", text:"Trust helps us?" },
      { speaker:s.profile.buddy, side:"left", text:"It triggers luck. It opens shortcuts. It keeps you alive." },
      { type:"system", text:"Higher Trust increases luck, clue-finds, and hospital shortcuts." },
        { speaker: s.profile.buddy, side:"left", text:"If you need something, ask — don't steal. People remember." },
        { type:"system", text:"Trust opens shortcuts. Low trust makes the world colder." }
],
    choices:[{label:"Back", sub:"", next:"bunker"}]
  }),

  // ----- Regions -----
  region_A: (s) => regionScene(s, "A"),
  region_B: (s) => regionScene(s, "B"),
  region_C: (s) => regionScene(s, "C"),
  region_D: (s) => regionScene(s, "D"),

  world: (s) => ({
    title:"Outside / Regions",
    meta:`Day ${s.day} • Trust ${s.needs.Trust} • Missing ${(s.missing||[]).length}/5`,
    text:
`Concrete paths divide into Regions A, B, C…
Bunker doors are labeled like A1, A2, A3…

You can gather:
• Food at the lake
• Water at the spring
• Resources at the scrapyard`,
    bg:"assets/bg/bunker_corridor.png",
    media:"",
    choices:[
      { label:"Go to Region A", sub:"Bunkers A1…", next:"region_A" },
      { label:"Go to Region B", sub:"Bunkers B1…", next:"region_B" },
      { label:"Go to Region C", sub:"Bunkers C1…", next:"region_C" },
      { label:"Go to Region D", sub:"Bunkers D1…", next:"region_D" },

      { label:"Lake (fish)", sub:"+Food", next:"lake" },
      { label:"Spring (water)", sub:"+Water", next:"spring" },
      { label:"Scrapyard (resources)", sub:"+Resources", next:"scrapyard" },

      { label:"Calm yourself", sub:"+2 Sanity (cost 1 Energy)", effect:(st)=>{ spend(st,{Energy:1}); gain(st,{Sanity:2}); }, next:"world" },

      {
        label:"Investigate the strange signal",
        sub:"Requires Clues ≥ 7 and Map ≥ 1",
        effect:(st)=>{
          if(st.events?.e2 && st.needs.Clues >= 7 && st.needs.Maps >= 1){
            st.events.hospital = true;
            st.sceneId = "hospital";
          }else{
            toast("You need Clues ≥ 7 and at least 1 Map (found in the hospital).");
          }
        },
        next:"world"
      },

      { label:"Back to your bunker", sub:"", next:"bunker" }
    ]
  }),

  lake: (s) => ({
    title: "The Lake",
    meta: "Fog • Still water",
    text: "Cold water. Still surface. Something watches from below.",
    bg: "assets/bg/lake_fog.png",
    media: "",
    choices: [
      { label:"Fish", sub:"+Food (cost Energy+Water)", effect:(st)=>{ spend(st,{Energy:2, Water:1}); const mult = rollLuck(st)?3:1; gain(st,{Food:1*mult}); pushDiary(st,`Fished at the lake. Food +${1*mult}.`); }, next:"world" },
      { label:"Back", sub:"", next:"world" }
    ]
  }),

  spring: (s) => ({
    title: "The Spring",
    meta: "Thin stream • Night air",
    text: "A thin stream, impossibly clean. Your hands shake as you drink.",
    bg: "assets/bg/spring_night.png",
    media: "",
    choices: [
      { label:"Collect water", sub:"+Water (cost Energy)", effect:(st)=>{ spend(st,{Energy:1}); const mult = rollLuck(st)?3:1; gain(st,{Water:1*mult}); pushDiary(st,`Collected water. Water +${1*mult}.`); }, next:"world" },
      { label:"Back", sub:"", next:"world" }
    ]
  }),

  scrapyard: (s) => ({
    title: "Scrapyard",
    meta: "Rust • Broken doors",
    text: "Twisted metal and broken doors. The smell of rust and old screams.",
    bg: "assets/bg/scrapyard_rust.png",
    media: "",
    choices: [
      { label:"Gather", sub:"+Resources (cost Energy+Food+Water)", effect:(st)=>{ spend(st,{Energy:2, Food:1, Water:1}); const mult = rollLuck(st)?3:1; gain(st,{Resources:3*mult}); pushDiary(st,`Gathered resources. Resources +${3*mult}.`); }, next:"world" },
      { label:"Back", sub:"", next:"world" }
    ]
  }),


  pick_bunker: (s) => ({
    title:"Choose a bunker",
    meta:"",
    text:"Which bunker door do you approach?",
    bg:"assets/bg/bunker_corridor.png",
    media:"",
    choices:(() => {
      const alive = CHARACTERS.filter(n => !(s.missing||[]).includes(n));
      const picks = uniqKeepOrder([s.profile.buddy, s.profile.villain, ...alive]).slice(0, 12);
      const out = picks.map((name) => ({
        label:`Bunker of ${name}`,
        sub: (s.missing||[]).includes(name) ? "Missing" : "Talk / help / steal",
        effect:(st)=>{ st._visit = name; },
        next:"bunker_visit"
      }));
      out.push({label:"Back", sub:"", next:"world"});
      return out;
    })()
  }),

  bunker_visit: (s) => ({
    title: s._visit ? `Bunker: ${s._visit}` : "Bunker",
    meta: s._visit ? `Trust with them: ${(s.trustBy||{})[s._visit] || 0}` : "",
    text:
s._visit && (s.missing||[]).includes(s._visit)
? `The door is open. Empty. Cold. Someone scratched a word inside: "HEAVEN".`
: `The door opens. A familiar face stares back.`,
    bg:"assets/bg/bunker_room.png",
    media:"",
    dialogue: (s._visit && !(s.missing||[]).includes(s._visit)) ? [
      { speaker:s._visit, side:"left", text:"You again… what do you want?" },
      { speaker:s.profile.name, side:"right", text:"Just trying to survive. Like you." }
    ] : [{ type:"system", text:"No one answers." }],
    choices:(() => {
      const name = s._visit || "";
      if(!name || (s.missing||[]).includes(name)){
        return [
          { label:"Search quietly", sub:"Chance to find a clue", effect:(st)=>{ const p = clamp(0.12 + trust(st)/400,0.12,0.55); if(Math.random()<p){ gain(st,{Clues:1}); pushDiary(st,`Found a clue in ${name}'s bunker.`); toast("Clue found."); } else { toast("Nothing useful."); } }, next:"world" },
          { label:"Back", sub:"", next:"world" }
        ];
      }
      const stealP = clamp(0.35 - trust(s)/600, 0.08, 0.45);
      return [
        { label:"Help them", sub:"Give 2 Resources (+Trust)", effect:(st)=>{ if(st.needs.Resources < 2){ toast("Not enough Resources."); return; } st.needs.Resources -= 2; adjustTrust(st,name,+8); pushDiary(st,`Helped ${name}. Trust +8.`); }, next:"world" },
        { label:"Search the bunker", sub:"Chance to find a clue", effect:(st)=>{
          const who = name;
          // small base chance, improved by trust and luck
          const p = clamp(0.12 + trust(st)/500, 0.12, 0.55);
          if(Math.random() < p){
            const bonus = rollLuck(st) ? 2 : 1;
            st.needs.Clues = Number(st.needs.Clues||0) + bonus;
            pushDiary(st, `Found ${bonus} clue(s) in ${who}'s bunker.`);
            toast(`Clue +${bonus}`);
          }else{
            toast("You find nothing useful.");
          }
        }, next:"world" },
        { label:"Steal", sub:"Risky (trust may drop)", effect:(st)=>{ if(Math.random()<stealP){ const loot = rollLuck(st)?6:3; st.needs.Resources += loot; adjustTrust(st,name,-10); pushDiary(st,`Stole from ${name}. Resources +${loot}. Trust -10.`); toast("Stole successfully. Trust -10."); } else { adjustTrust(st,name,-18); spend(st,{Sanity:1}); pushDiary(st,`Tried to steal from ${name}. Caught. Trust -18.`); toast("Caught stealing. Trust -18."); } }, next:"world" },
        { label:"Talk", sub:"Hear their story", next:"talk_any" },
        { label:"Back", sub:"", next:"world" }
      ];
    })()
  }),

  talk_any: (s) => ({
    title: "Talk",
    meta: "",
    text: "Their eyes look tired. Their voice sounds… rehearsed.",
    bg: "assets/bg/bunker_room.png",
    media: "",
    dialogue: (() => {
      const who = s._visit || s.profile.buddy;

      // Tiny "personality" buckets so they don't all sound the same
      const VOICE = {
        calm: [
          "Keep your breathing slow. Panic attracts attention.",
          "I marked a safe route. It's not perfect, but it's something.",
          "Everyone here pretends they're okay. They're not."
        ],
        paranoid: [
          "Don't say names too loudly. The walls… remember.",
          "I heard footsteps outside my door. No one was there.",
          "Something mimics voices at night. If you hear me… verify."
        ],
        jokey: [
          "If this is heaven, I want a refund.",
          "At least the coffee is… never mind. There's no coffee.",
          "If we survive, I'm never skipping sleep again. Ever."
        ],
        broken: [
          "I keep replaying the moment I died. Like a looping GIF.",
          "Sometimes I forget what day it is… then I remember: it doesn't matter.",
          "I try not to look at the ceiling. It feels too close."
        ],
        cryptic: [
          "The red light isn't a warning. It's a reset.",
          "Maps lie here. But they lie less than people.",
          "Nothing is real… but consequences are."
        ]
      };

      // Deterministic-ish seed per day + person (so it doesn't change on every render)
      const seedStr = `${who}|${s.day || 1}|${s.profile.villain}|${s.profile.buddy}`;
      let seed = 0;
      for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
      function rng() {
        // xorshift32
        seed ^= seed << 13; seed >>>= 0;
        seed ^= seed >> 17; seed >>>= 0;
        seed ^= seed << 5;  seed >>>= 0;
        return (seed >>> 0) / 4294967296;
      }
      function pick(arr){ return arr[Math.floor(rng() * arr.length)]; }

      // Assign a voice bucket based on name hash (stable per person)
      const buckets = ["calm","paranoid","jokey","broken","cryptic"];
      let h = 0; for (let i=0;i<who.length;i++) h = (h*33 + who.charCodeAt(i)) >>> 0;
      const bucket = buckets[h % buckets.length];

      const opener = pick([
        "You look like you haven't slept in days.",
        "Your face says you saw the sky break.",
        "You came from the crossroads… did it change again?",
        "You smell like rust and rain."
      ]);

      const theirLine1 = pick(VOICE[bucket]);
      const theirLine2 = pick(VOICE[bucket]);

      const base = [
        { type:"system", text: opener },
        { speaker: who, side:"left", text: theirLine1 },
        { speaker: s.profile.name, side:"right", text: pick([
          "Do you think this is the afterlife?",
          "Why do people disappear?",
          "Have you seen the red light?",
          "What do you know about the regions?"
        ])},
        { speaker: who, side:"left", text: theirLine2 }
      ];

      // Small chance to reveal something useful (clue)
      // (Doesn't replace your buddy daily clue — it's extra & rare.)
      const clueChance = Math.min(0.08 + (Number(s.needs.Trust||0) / 1500), 0.20);
      if (who !== s.profile.villain && rng() < clueChance) {
        const clueText = pick([
          "I saw a symbol scratched near the hospital doors.",
          "Someone left a note: 'Nothing is real…' in the corridor.",
          "The signal comes back when the sky turns red.",
          "A map exists. It doesn't appear until you wake in the hospital."
        ]);
        base.push({ type:"system", text: "They hesitate… then whisper:" });
        base.push({ speaker: who, side:"left", text: clueText });
        base.push({ type:"system", text: "You feel something click into place." });
        // Give 1 clue
        base.push({ type:"system", text: "Clue +1" });
        // Apply clue safely via side effect flag; actual apply occurs in onEnter (below)
        s._pendingTalkClue = true;
      }

      // Villain special behavior
      if (who === s.profile.villain) {
        base.push({ type:"system", text:"They smile like they're reading a script." });
        base.push({ speaker: s.profile.villain, side:"left", text: pick([
          "Nothing is real…",
          "You're doing great, Ali. Keep walking the paths.",
          "Clues won't save you. Only endings do."
        ])});
      }

      return base;
    })(),

    onEnter: (st) => {
      // apply pending clue once per talk render
      if (st._pendingTalkClue) {
        st._pendingTalkClue = false;
        st.needs.Clues = Number(st.needs.Clues || 0) + 1;
        pushDiary(st, `A whispered clue from ${st._visit || st.profile.buddy}.`);
        saveState(st);
      }
    },

    choices: [
      { label:"Back", sub:"", next:"world" }
    ]
  }),

  event1: (s) => ({
    title:"Event 1",
    meta:`Day ${s.day}`,
    text:
`Next day…

One of the characters is gone.
They say: "They went to heaven."`,
    bg:"assets/bg/secret_red.png",
    media:"",
    dialogue:[
      { type:"system", text:`Missing: ${(s.missing||[]).join(", ")}` },
      { speaker:s.profile.buddy, side:"left", text:"Ali… this isn't heaven." },
      { speaker:s.profile.name, side:"right", text:"Then what is it?" }
    ],
    choices:[
      { label:"Investigate disappearance", sub:"+1 Clue", effect:(st)=>{ gain(st,{Clues:1}); pushDiary(st,"Found a letter: 'Nothing is real…'"); }, next:"villain_meet" },
      { label:"Back to bunker", sub:"", next:"bunker" }
    ]
  }),

  villain_meet: (s) => ({
    title:"Villain confrontation",
    meta:"",
    text:`You spot ${s.profile.villain}. Calm. Comfortable.`,
    bg:"assets/bg/final_door.png",
    media:"",
    dialogue:[
      { speaker:s.profile.villain, side:"left", text:"You finally started asking the right questions." },
      { speaker:s.profile.name, side:"right", text:"What did you do?" },
      { speaker:s.profile.villain, side:"left", text:"I opened a door." }
    ],
    choices:[
      { label:"Fight", sub:"Cost Energy & Sanity (+1 Clue)", effect:(st)=>{ spend(st,{Energy:2, Sanity:2}); gain(st,{Clues:1}); pushDiary(st,"You fought. You felt watched."); }, next:"world" },
      { label:"Retreat", sub:"", next:"world" }
    ]
  }),

  event2: (s) => ({
    title:"Event 2 — Red light",
    meta:`Day ${s.day}`,
    text:
`A red light blooms in the sky.

Then everyone faints.`,
    bg:"assets/bg/secret_red.png",
    media:"",
    dialogue:[{type:"system", text:"You lose time."}],
    choices:[
      { label:"Wake up", sub:"5 people are missing now…", effect:(st)=>{ spend(st,{Sanity:1}); }, next:"after_red" }
    ]
  }),

  after_red: (s) => ({
    title:"After the red light",
    meta:`Missing ${(s.missing||[]).length}/5`,
    text:
`You wake in your bunker.

Your best friend is missing.
The villain is missing.
Two more are missing.

The air outside is sharper.`,
    bg:"assets/bg/bunker_corridor.png",
    media:"",
    choices:[
      { label:"Go outside", sub:"Search for signs", next:"world" },
      { label:"Back", sub:"", next:"bunker" }
    ]
  }),

  hospital: (s) => ({
    title:"Hospital transition",
    meta:"",
    text:
`While investigating a bunker…

BOOM.

You wake up in an abandoned hospital.

Your buddy is next to you.`,
    bg:"assets/bg/hospital_ward.png",
    media:"",
    dialogue:[
      { speaker:s.profile.buddy, side:"left", text:"Ali… wake up. We have to escape." },
      { type:"system", text:"This place is a maze." }
    ],
    choices:[{label:"Enter the maze", sub:"Trust helps", next:"maze"}]
  }),

  maze: (s) => ({
    title:"Hospital maze",
    meta:`Trust ${s.needs.Trust}`,
    text:"Every hallway feels the same.",
    bg:"assets/bg/hospital_corridor.png",
    media:"",
    choices:(() => {
      const opts = [
        { label:"Left corridor", sub:"", effect:(st)=>spend(st,{Energy:1}), next:"maze2" },
        { label:"Right corridor", sub:"", effect:(st)=>spend(st,{Energy:1}), next:"maze2" },
        { label:"Stairs", sub:"", effect:(st)=>spend(st,{Energy:1}), next:"maze2" }
      ];
      if(trust(s) >= 100){
        opts.unshift({ label:"Trust shortcut", sub:"You finish it faster", effect:(st)=>{ gain(st,{Sanity:1}); }, next:"maze_key" });
      }
      return opts;
    })()
  }),

  maze2: (s) => ({
    title:"Maze",
    meta:"",
    text:"A map is taped to the wall.",
    bg:"assets/bg/hospital_corridor.png",
    media:"",
    choices:[
      { label:"Take the map", sub:"+1 Map", effect:(st)=>{ gain(st,{Maps:1}); pushDiary(st,"Found a map."); }, next:"maze_key" },
      { label:"Ignore it", sub:"", next:"maze_key" }
    ]
  }),

  maze_key: (s) => ({
    title:"Keycard",
    meta:"",
    text:"A keycard is waiting for you like a joke.",
    bg:"assets/bg/hospital_ward.png",
    media:"",
    choices:[
      { label:"Take keycard", sub:"+Keycard", effect:(st)=>{ st.needs.Keycard = 1; pushDiary(st,"Found a keycard."); }, next:"secret_reveal" }
    ]
  }),

  secret_reveal: (s) => ({
    title:"Secret location",
    meta:"",
    text:
`The map shows a hidden place.

Inside…

${s.profile.villain} and the missing people.

They're eating flesh.`,
    bg:"assets/bg/secret_red.png",
    media:"",
    dialogue:[
      { type:"system", text:"This isn't in-between. This is hell." }
    ],
    choices:[
      { label:"Run back", sub:"Warn survivors", next:"warn" },
      { label:"Attack", sub:"Risky", effect:(st)=>{ spend(st,{Energy:2, Sanity:1}); }, next:"warn" }
    ]
  }),

  warn: (s) => ({
    title:"Warn the survivors",
    meta:"",
    text:
`You tell them the truth.

They laugh.
They panic.
They argue.

Trust decides who follows.`,
    bg:"assets/bg/bunker_corridor.png",
    media:"",
    choices:[
      { label:"Go to the secret door", sub:"Trust ≥ 100 → everyone joins", effect:(st)=>{ st._party = trust(st) >= 100 ? "all" : "two"; }, next:"final_door" }
    ]
  }),

  final_door: (s) => ({
    title:"Final door",
    meta:"",
    text:"You swipe the keycard. The lock sighs after the third push.",
    bg:"assets/bg/final_door.png",
    media:"",
    choices:[
      { label:"Enter", sub:"", effect:(st)=>{ if(st.needs.Keycard !== 1){ toast("Need keycard."); st.sceneId="world"; } }, next:"killroom" }
    ]
  }),

  killroom: (s) => ({
    title: "Finish it",
    meta: "",
    text:
`You see ${s.profile.villain}.
No dice rolls. No luck.
Just one choice — and the door out.`,
    bg: "assets/bg/final_door.png",
    media: "",
    choices: [
      {
        label: "Finish him",
        sub: "One clean action.",
        effect:(st)=>{
          pushDiary(st, `You ended ${st.profile.villain}.`);
          // Continue the story chain
          st.sceneId = "tehran";
        },
        next: "tehran"
      }
    ]
  }),


  tehran: (s) => ({
    title:"Tehran twist",
    meta:"",
    text:
`The door opens.

Tehran.
Near your house.

You go inside.

Then you turn back…`,
    bg:"assets/bg/tehran_street.png",
    media:"",
    dialogue:[
      { type:"system", text:"A red glow spreads. The sky turns red." },
      { speaker:s.profile.buddy, side:"left", text:"You need to wake up…" }
    ],
    choices:[{label:"Wake up", sub:"", next:"morning"}]
  }),

  morning: (s) => ({
    title:"Morning",
    meta:"",
    text:"You wake up in your real bed. Morning. No bunker.",
    bg:"assets/bg/house_inside.png",
    media:"",
    choices:[{label:"Go to work", sub:"", next:"work"}]
  }),

  work: (s) => ({
    title:"Work",
    meta:`Job: ${s.profile.job}`,
    text:"You go to work. You try not to think about the nightmare.",
    bg:"assets/bg/work_office.png",
    media: (s.profile.job === "Digipay QA")
      ? `<img alt="meme" src="assets/ui/meme_awshit.svg">`
      : `<img alt="meme" src="assets/ui/meme_happyjob.svg">`,
    choices:[
      { label:"Finish", sub:"", effect:(st)=>{ st.flags.finished = true; }, next:"finale" }
    ]
  }),

  finale: (s) => ({
    title:"Happy Birthday",
    meta:"",
    text:
`🎉 HAPPY BIRTHDAY, ALI! 🎉

From your friends — you woke up.

And from the part of you that still remains in the abyss…

`,
    bg:"assets/bg/finale_birthday.png",
    media:`<img alt="Happy Birthday" src="assets/ui/happy.svg">`,
    onEnter: async (st) => {
      if(!st.flags.finished){
        st.flags.finished = true;
        pushDiary(st, "Finished: Happy Birthday unlocked.");
        saveState(st);
      }
      await switchToHappy(st);
    },
    choices:[
      { label:"Replay", sub:"Start again", next:"drive" }
    ]
  })
};

  function renderScene(st){
    const f = SCENES[st.sceneId];
    if(!f){
      $("sceneTitle").textContent = "Missing scene";
      $("sceneMeta").textContent = "";
      $("sceneText").textContent = `Scene not found: ${st.sceneId}`;
      $("choices").innerHTML = "";
      setMedia("");
      return;
    }

    const scene = f(st);
    setBg(scene.bg || "assets/bg/bunker_room.png");

    $("sceneTitle").textContent = scene.title || "";
    $("sceneMeta").textContent = scene.meta || "";
    $("sceneText").textContent = scene.text || "";
    setMedia(renderSceneMedia(scene));

    const choices = $("choices");
    choices.innerHTML = "";

    if(typeof scene.onEnter === "function"){
      Promise.resolve(scene.onEnter(st)).catch(()=>{});
    }

    (scene.choices || []).forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "choice";

      const labelText = (typeof c.label === "function") ? c.label(st) : (c.label ?? "");
      const subText   = (typeof c.sub === "function") ? c.sub(st) : (c.sub ?? "");
      btn.innerHTML = `${escapeHtml(String(labelText))}${subText ? `<span class="sub">${escapeHtml(String(subText))}</span>` : ""}`;

      btn.addEventListener("click", async () => {
        // user gesture -> start ambient
        armAmbientOnce(st);
      // Ensure ambient actually starts (and keep retrying on future taps if blocked)
      kickAmbientIfNeeded(st, false);

        // sfx (no overlap)
        if(c.sfx){
          try{ await playSfx(st, Array.isArray(c.sfx) ? c.sfx : [String(c.sfx)]); }catch{}
        }

        if(typeof c.effect === "function") c.effect(st);
        // Post-action checks
        clampAll(st);
        checkBladder(st);
        checkCollapse(st);

        if(c.next) st.sceneId = c.next;

        saveState(st);
        renderAll(st);
      });

      choices.appendChild(btn);
    });
  }

  function renderAll(st){
    applyJobTitle(st);
    renderNeeds(st);
    renderDiary(st);
    renderScene(st);
  }

  // ---------- Setup Modal ----------
  function enforceBuddyNotVillain(profile){
    if(profile.buddy !== profile.villain) return profile;
    // fallback: pick default buddy; if conflicts, first different character
    profile.buddy = "Hossein Choubin";
    if(profile.buddy === profile.villain){
      profile.buddy = CHARACTERS.find(n => n !== profile.villain) || profile.buddy;
    }
    return profile;
  }

  function openSetupIfNeeded(st){
    const modal = $("setupModal");
    if(st.flags.introDone){
      modal.style.display = "none";
      return;
    }

    $("inpName").value = st.profile.name || "Ali Shahrokhi";
    $("inpAge").value = Number.isFinite(st.profile.age) ? st.profile.age : 27;

    const selVillain = $("selVillain");
    const selBuddy = $("selBuddy");
    selVillain.innerHTML = "";
    selBuddy.innerHTML = "";

    for(const c of CHARACTERS){
      const o1 = document.createElement("option");
      o1.value = c; o1.textContent = c;
      selVillain.appendChild(o1);

      const o2 = document.createElement("option");
      o2.value = c; o2.textContent = c;
      selBuddy.appendChild(o2);
    }

    selVillain.value = st.profile.villain;
    selBuddy.value = st.profile.buddy;
    $("selJob").value = st.profile.job || "SnapPay QA";

    function syncBuddyOptions(){
      const v = selVillain.value;
      [...selBuddy.options].forEach(opt => { opt.disabled = (opt.value === v); });

      if(selBuddy.value === v){
        const firstValid = [...selBuddy.options].find(o => !o.disabled);
        if(firstValid) selBuddy.value = firstValid.value;
      }
    }
    selVillain.addEventListener("change", syncBuddyOptions);
    syncBuddyOptions();

    $("btnStart").onclick = () => {
      const profile = enforceBuddyNotVillain({
        name: ($("inpName").value || "Ali Shahrokhi").trim(),
        age: clamp(parseInt($("inpAge").value || "27", 10) || 27, 1, 120),
        villain: selVillain.value,
        buddy: selBuddy.value,
        job: $("selJob").value
      });

      st.profile = profile;
      st.flags.introDone = true;
      st.sceneId = "drive";
      setCookie("awu_seen","1",365);
      pushDiary(st, `Profile saved. Buddy=${profile.buddy}, Villain=${profile.villain}, Job=${profile.job}.`);

      // Start ambient right now (user gesture)
      setVolumes(st);
      armAmbientOnce(st);
      // Ensure ambient actually starts (and keep retrying on future taps if blocked)
      kickAmbientIfNeeded(st, false);

      saveState(st);
      modal.style.display = "none";
      renderAll(st);
    };

    modal.style.display = "flex";
  }

  
  function updateSwitchUI(st){
    const swMusic = $("swMusic");
    const swSfx = $("swSfx");
    if(swMusic){
      swMusic.classList.toggle("on", !!st.settings.musicOn);
    }
    if(swSfx){
      swSfx.classList.toggle("on", !!st.settings.sfxOn);
    }
  }

  // ---------- Modals ----------
  function openModal(id){ $(id).hidden = false; }
  function closeModal(id){ $(id).hidden = true; }
function closeAllModals(){
    // Hard safety: make sure nothing starts open
    ["settingsModal","diaryModal","terminalModal","bugModal"].forEach(id => {
      const el = $(id);
      if (el) el.hidden = true;
    });
  }

  function wireBackdropClose(){
    // Click outside the modal to close (backdrop only)
    ["settingsModal","diaryModal","terminalModal","bugModal"].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("click", (e) => {
        if (e.target === el) closeModal(id);
      });
    });

    // ESC closes any open modal
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      ["settingsModal","diaryModal","terminalModal","bugModal"].forEach(id => {
        const el = $(id);
        if (el && !el.hidden) closeModal(id);
      });
    });
  }

  function wireButtons(st){
    $("btnSettings").onclick = () => {
      $("chkMusic").checked = !!st.settings.musicOn;
      $("rngMusic").value = String(clamp(st.settings.musicVol,0,1));
      $("chkSfx").checked = !!st.settings.sfxOn;
      $("rngSfx").value = String(clamp(st.settings.sfxVol,0,1));
      updateSwitchUI(st);
      openModal("settingsModal");
    };
    $("btnCloseSettings").onclick = () => closeModal("settingsModal");

    $("chkMusic").onchange = () => {
      st.settings.musicOn = $("chkMusic").checked;
      setVolumes(st);

      if(st.settings.musicOn){
        // Choose correct track based on progress (finale => happy)
        kickAmbientIfNeeded(st, false);
      }else{
        ambient.pause();
      }

      updateSwitchUI(st);
      saveState(st);
    };
    $("rngMusic").oninput = () => {
      st.settings.musicVol = parseFloat($("rngMusic").value);
      setVolumes(st);
      updateSwitchUI(st);
      saveState(st);
    };

    $("chkSfx").onchange = () => {
      st.settings.sfxOn = $("chkSfx").checked;
      setVolumes(st);
      saveState(st);
    };
    $("rngSfx").oninput = () => {
      st.settings.sfxVol = parseFloat($("rngSfx").value);
      setVolumes(st);
      saveState(st);
    };

    $("btnReset").onclick = () => resetAll();

    $("btnDiary").onclick = () => { renderDiary(st); openModal("diaryModal"); };
    $("btnCloseDiary").onclick = () => closeModal("diaryModal");

    $("btnTerminal").onclick = () => {
      openModal("terminalModal");
      $("termInp").focus();
      termPrint(`Type "help".`);
    };
    $("btnCloseTerminal").onclick = () => closeModal("terminalModal");

    $("btnBug").onclick = () => {
      openModal("bugModal");
    };
    $("btnCloseBug").onclick = () => closeModal("bugModal");
  }

  // ---------- Terminal ----------
  function termPrint(line){
    const log = $("termLog");
    const div = document.createElement("div");
    div.innerHTML = escapeHtml(line);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function runCmd(st, raw){
    const cmd = (raw || "").trim();
    if(!cmd) return;

    const lower = cmd.toLowerCase();

    if(lower === "help"){
      termPrint("Commands:");
      termPrint("- help");
      termPrint("- status");
      termPrint("- reset");
      termPrint("- happy birthday");
      termPrint("- goto finale");
      return;
    }

    if(lower === "status"){
      termPrint(`scene=${st.sceneId}`);
      termPrint(`finished=${st.flags.finished}`);
      termPrint(`buddy=${st.profile.buddy}`);
      termPrint(`villain=${st.profile.villain}`);
      termPrint(`job=${st.profile.job}`);
      termPrint(`needs=${JSON.stringify(st.needs)}`);
      return;
    }

    if(lower === "reset"){
      resetAll();
      return;
    }

    if(lower === "goto finale"){
      // Jump to the villain kill scene (story continues to Tehran -> Work -> Birthday)
      st.needs.Trust = Math.max(Number(st.needs.Trust||0), 110);
      st.needs.Resources = Math.max(Number(st.needs.Resources||0), 80);
      st.needs.Clues = Math.max(Number(st.needs.Clues||0), 20);
      st.needs.Keycard = 1;
      st.needs.Maps = Math.max(Number(st.needs.Maps||0), 2);
      st._party = "all";
      st.events = st.events || {e1:false,e2:false,hospital:false};
      st.events.e1 = true;
      st.events.e2 = true;
      st.events.hospital = true;
      st.sceneId = "killroom";
      pushDiary(st, "CHEAT used: goto finale (killroom unlocked)");
      saveState(st);
      renderAll(st);
      return;
    }

    if(lower === "happy birthday" || lower === "cheat happy birthday"){
      st.flags.finished = true;
      st.sceneId = "finale";
      pushDiary(st, "CHEAT used: happy birthday");
      saveState(st);
      renderAll(st);
      return;
    }

    termPrint("Unknown command. Try: help");
  }

  function wireTerminal(st){
    const inp = $("termInp");
    inp.addEventListener("keydown", (e) => {
      if(e.key !== "Enter") return;
      const v = inp.value;
      inp.value = "";
      termPrint(`> ${v}`);
      runCmd(st, v);
    });
  }

  // ---------- Boot ----------
  function boot(){
    _state = loadState() || defaultState();
    // Always wire ambient kick (it will only play when musicOn).
    wireAmbientGestureKick(_state);
    // Ensure modals are closed on load (prevents 'terminal opened by default')
    closeAllModals();
    wireBackdropClose();

    // enforce buddy != villain even for old saves
    _state.profile = enforceBuddyNotVillain(_state.profile);

    setVolumes(_state);
    wireButtons(_state);
    wireTerminal(_state);

    renderAll(_state);
    openSetupIfNeeded(_state);    // Returning visits: keep trying to start ambient on any gesture.
    if(_state.flags && _state.flags.introDone){
      wireAmbientGestureKick(_state);
      // best-effort silent attempt
      kickAmbientIfNeeded(_state, false);
    }

    // Don't auto-open terminal. Ever.
  }

  document.addEventListener("DOMContentLoaded", boot);
})();

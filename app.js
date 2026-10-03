'use strict';
(() => {
  const defaults = {language:'auto',mode:'both',format:'24',layout:'stacked',timezone:'local',date:true,zone:true,scale:100,theme:'light',font:'sans',dialFont:'serif',accent:'#cf553d',analogSeconds:true,motion:'sweep',markers:'numbers',minuteMarks:true,digitalSeconds:true,blink:false,leadingZero:true};
  const choices = {language:['auto','ja','en'],mode:['both','analog','digital'],format:['24','12'],layout:['stacked','side'],theme:['auto','light','dark','midnight','paper'],font:['sans','serif','mono','rounded'],dialFont:['sans','serif','mono','rounded'],motion:['sweep','tick'],markers:['numbers','roman','minimal']};
  const storageKey = 'still-clock-settings-v1';
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const dialog = $('settingsDialog');
  const zoneChoices = [...$('timezone').options].map(option => option.value);
  const media = matchMedia('(prefers-color-scheme: dark)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let settings = {...defaults};
  let storageAvailable = true;
  let saveMessage = 'Changes save automatically';
  let formatter, dateFormatter, captionFormatter;
  let lastSecond = '';
  let lastDate = '';
  let focus = false;
  let idleTimer, toastTimer;
  let timer;
  let locale = 'en';
  const translations = window.StillLocale.ja;
  const textBindings = [];
  const textWalker = document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while (textWalker.nextNode()) {
    const node = textWalker.currentNode;
    const text = node.nodeValue.trim();
    if (Object.hasOwn(translations,text)) textBindings.push({node,text,leading:node.nodeValue.match(/^\s*/)[0],trailing:node.nodeValue.match(/\s*$/)[0]});
  }
  const attributeBindings = [];
  document.querySelectorAll('[aria-label], [title]').forEach(el => {
    for (const name of ['aria-label','title']) {
      const text = el.getAttribute(name);
      if (text && Object.hasOwn(translations,text)) attributeBindings.push({el,name,text});
    }
  });
  const description = document.querySelector('meta[name="description"]');
  const originalDescription = description.content;
  function t(text) { return locale === 'ja' ? (translations[text] ?? text) : text; }
  function applyLanguage() {
    const deviceLanguage = navigator.language || navigator.languages?.[0] || 'en';
    locale = settings.language === 'auto' ? (/^ja(?:-|$)/i.test(deviceLanguage) ? 'ja' : 'en') : settings.language;
    root.lang = locale;
    textBindings.forEach(({node,text,leading,trailing}) => { node.nodeValue = leading + t(text) + trailing; });
    attributeBindings.forEach(({el,name,text}) => el.setAttribute(name,t(text)));
    document.title = t('Still — Clock');
    description.content = t(originalDescription);
    syncActionLabels();
    $('saveStatus').textContent = t(storageAvailable ? saveMessage : 'Saved for this session only');
  }
  function syncActionLabels() {
    $('focusButton').setAttribute('aria-label',t(focus?'Exit focus mode':'Enter focus mode'));
    $('fullscreenButton').setAttribute('aria-label',t(document.fullscreenElement?'Exit full screen':'Enter full screen'));
  }
  function validate(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Settings must be an object.');
    const result = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.hasOwn(defaults,key)) throw new Error('Unknown setting: ' + key);
      if (choices[key] && !choices[key].includes(value)) throw new Error('Invalid value for ' + key);
      if (typeof defaults[key] === 'boolean' && typeof value !== 'boolean') throw new Error('Invalid value for ' + key);
      if (key === 'scale' && (typeof value !== 'number' || value < 70 || value > 130 || value % 5 !== 0)) throw new Error('Clock size must be between 70 and 130 in increments of 5.');
      if (key === 'timezone' && !zoneChoices.includes(value)) throw new Error('Unsupported time zone.');
      if (key === 'accent' && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))) throw new Error('Accent color must be a six-digit hex color.');
      result[key] = value;
    }
    return result;
  }
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) settings = {...defaults,...validate(JSON.parse(saved))};
  } catch (_) { storageAvailable = false; }
  function save() {
    try { localStorage.setItem(storageKey,JSON.stringify(settings)); storageAvailable = true; }
    catch (_) { storageAvailable = false; }
    saveMessage = storageAvailable ? 'Saved on this device' : 'Saved for this session only';
    $('saveStatus').textContent = t(saveMessage);
  }
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'),2800);
  }
  function zone() { return settings.timezone === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : settings.timezone; }
  function formatters() {
    const timeZone = zone();
    formatter = new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    dateFormatter = new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US',{timeZone,weekday:'long',month:'long',day:'numeric'});
    captionFormatter = new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US',{timeZone,timeZoneName:'short',hour:'numeric'});
    lastSecond = ''; lastDate = '';
  }
  function svgElement(tag,attributes) {
    const el = document.createElementNS('http://www.w3.org/2000/svg',tag);
    for (const [key,value] of Object.entries(attributes)) el.setAttribute(key,String(value));
    return el;
  }
  function drawDial() {
    $('ticks').replaceChildren(); $('numbers').replaceChildren();
    for (let i=0;i<60;i++) {
      const isHour = i % 5 === 0;
      if (!isHour && !settings.minuteMarks) continue;
      $('ticks').append(svgElement('line',{x1:200,y1:18,x2:200,y2:isHour?28:23,transform:`rotate(${i*6} 200 200)`,class:isHour?'tick hour':'tick'}));
    }
    if (settings.markers !== 'minimal') {
      const roman = ['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
      for (let i=0;i<12;i++) {
        const angle = i*Math.PI/6;
        const el = svgElement('text',{x:200+148*Math.sin(angle),y:200-148*Math.cos(angle),class:'dial-number'+(settings.markers==='roman'?' roman':'')});
        el.textContent = settings.markers==='roman'?roman[i]:(i===0?'12':String(i));
        $('numbers').append(el);
      }
    }
  }
  function applySettings() {
    applyLanguage();
    root.dataset.theme = settings.theme === 'auto' ? (media.matches?'dark':'light') : settings.theme;
    root.style.setProperty('--accent',settings.accent);
    root.style.setProperty('--digital-font',`var(--${settings.font})`);
    root.style.setProperty('--dial-font',`var(--${settings.dialFont})`);
    root.style.setProperty('--clock-scale',String(settings.scale/100));
    $('clockMain').dataset.mode = settings.mode;
    $('clockMain').dataset.layout = settings.layout;
    $('dateLine').hidden = !settings.date;
    $('timeCaption').hidden = !settings.zone;
    $('headerZone').hidden = !settings.zone;
    $('digitalSeconds').hidden = !settings.digitalSeconds;
    $('secondHand').style.display = settings.analogSeconds ? '' : 'none';
    $('scaleValue').value = settings.scale + '%';
    $('layout').disabled = settings.mode !== 'both';
    $('motion').disabled = !settings.analogSeconds;
    document.querySelectorAll('[data-setting]').forEach(el => {
      const value = settings[el.dataset.setting];
      if (el.type === 'checkbox') el.checked = value; else el.value = value;
    });
    document.querySelectorAll('[data-mode]').forEach(el => el.setAttribute('aria-pressed',String(el.dataset.mode===settings.mode)));
    document.querySelectorAll('[data-theme]').forEach(el => el.setAttribute('aria-pressed',String(el.dataset.theme===settings.theme)));
    document.querySelectorAll('[data-accent]').forEach(el => el.setAttribute('aria-pressed',String(el.dataset.accent.toLowerCase()===settings.accent.toLowerCase())));
    document.querySelector('meta[name="theme-color"]').content = {light:'#f2f3f1',dark:'#202224',midnight:'#101b2b',paper:'#eee7d8'}[root.dataset.theme];
    formatters(); drawDial(); tick();
  }
  function updateSettings(patch) {
    settings = {...settings,...validate(patch)};
    applySettings(); save();
    return {...settings};
  }
  function tick() {
    const now = new Date();
    const currentSecond = Math.floor(now.getTime()/1000);
    let hour, minute, second;
    if (currentSecond !== lastSecond) {
      const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type,part.value]));
      hour = Number(parts.hour); minute = Number(parts.minute); second = Number(parts.second);
      tick.parts = {hour,minute,second};
      const displayHour = settings.format === '12' ? (hour % 12 || 12) : hour;
      $('hours').textContent = settings.leadingZero ? String(displayHour).padStart(2,'0') : String(displayHour);
      $('minutes').textContent = String(minute).padStart(2,'0');
      $('seconds').textContent = String(second).padStart(2,'0');
      $('period').textContent = settings.format === '12' ? t(hour < 12 ? 'AM' : 'PM') : '';
      $('digitalTime').setAttribute('aria-label',`${t('Digital clock')}, ${displayHour}:${parts.minute}${settings.digitalSeconds?':'+parts.second:''}${settings.format==='12'?' '+t(hour<12?'AM':'PM'):''}`);
      $('analogClock').setAttribute('aria-label',`${t('Analog clock')}, ${parts.hour}:${parts.minute}${settings.analogSeconds?':'+parts.second:''}`);
      $('digitalTime').classList.toggle('blink',settings.blink && second % 2 === 1 && !reducedMotion.matches);
      const dateText = dateFormatter.format(now);
      if (dateText !== lastDate) { $('dateLine').textContent = dateText; lastDate = dateText; }
      const abbr = captionFormatter.formatToParts(now).find(part=>part.type==='timeZoneName').value;
      const city = t(settings.timezone === 'local' ? 'Local time' : settings.timezone === 'UTC' ? 'UTC' : settings.timezone.split('/').pop().replaceAll('_',' '));
      $('headerZone').textContent = `${city} · ${abbr}`;
      $('timeCaption').textContent = `${city.toUpperCase()}${city==='UTC'?'':' / '+abbr}`;
      lastSecond = currentSecond;
    } else ({hour,minute,second} = tick.parts);
    const sweep = settings.motion === 'sweep';
    const preciseSecond = second + (sweep ? now.getMilliseconds()/1000 : 0);
    $('hourHand').setAttribute('transform',`rotate(${(hour%12)*30+minute*.5+preciseSecond/120} 200 200)`);
    $('minuteHand').setAttribute('transform',`rotate(${minute*6+preciseSecond*.1} 200 200)`);
    $('secondHand').setAttribute('transform',`rotate(${preciseSecond*6} 200 200)`);
  }
  function schedule() {
    clearTimeout(timer);
    if (document.hidden) return;
    tick();
    const smooth = settings.mode !== 'digital' && settings.analogSeconds && settings.motion === 'sweep';
    timer = setTimeout(schedule,smooth?16:Math.max(16,1000-Date.now()%1000));
  }
  function openSettings() { if (!dialog.open) dialog.showModal(); }
  function revealFocus() {
    if (!focus) return;
    $('exitFocus').classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (document.activeElement !== $('exitFocus')) $('exitFocus').classList.add('is-idle'); },3000);
  }
  function setFocus(value) {
    focus = value; document.body.classList.toggle('focus-mode',focus);
    $('exitFocus').hidden = !focus;
    $('focusButton').setAttribute('aria-pressed',String(focus));
    syncActionLabels();
    revealFocus();
    if (!focus) $('focusButton').focus({preventScroll:true});
  }
  async function fullScreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.requestFullscreen) await root.requestFullscreen();
      else { setFocus(true); toast(t('Full screen is unavailable. Focus mode is on.')); }
    } catch (_) { setFocus(true); toast(t('Full screen is unavailable. Focus mode is on.')); }
  }
  document.querySelectorAll('[data-setting]').forEach(el => el.addEventListener(el.type==='range'||el.type==='color'?'input':'change',() => {
    const value = el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;
    updateSettings({[el.dataset.setting]:value}); schedule();
  }));
  document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click',()=>{updateSettings({mode:el.dataset.mode});schedule();}));
  document.querySelectorAll('[data-theme]').forEach(el=>el.addEventListener('click',()=>updateSettings({theme:el.dataset.theme})));
  document.querySelectorAll('[data-accent]').forEach(el=>el.addEventListener('click',()=>updateSettings({accent:el.dataset.accent})));
  $('settingsButton').addEventListener('click',openSettings);
  $('footerSettings').addEventListener('click',openSettings);
  $('closeSettings').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  $('resetButton').addEventListener('click',()=>$('resetDialog').showModal());
  $('cancelReset').addEventListener('click',()=>$('resetDialog').close());
  $('confirmReset').addEventListener('click',()=>{settings={...defaults};applySettings();save();schedule();$('resetDialog').close();});
  $('focusButton').addEventListener('click',()=>setFocus(!focus));
  $('exitFocus').addEventListener('click',()=>setFocus(false));
  $('exitFocus').addEventListener('focus',revealFocus);
  $('fullscreenButton').addEventListener('click',fullScreen);
  document.addEventListener('fullscreenchange',syncActionLabels);
  document.addEventListener('pointermove',revealFocus,{passive:true});
  document.addEventListener('pointerdown',revealFocus,{passive:true});
  document.addEventListener('keydown',event=>{
    revealFocus();
    if (event.key === 'Escape' && focus && !dialog.open && !$('resetDialog').open) setFocus(false);
    if (event.ctrlKey||event.metaKey||event.altKey||event.repeat||dialog.open||$('resetDialog').open||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if(event.key.toLowerCase()==='s'){event.preventDefault();openSettings();}
    if(event.key.toLowerCase()==='f'){event.preventDefault();fullScreen();}
  });
  document.addEventListener('visibilitychange',()=>{lastSecond='';schedule();});
  media.addEventListener('change',()=>{if(settings.theme==='auto')applySettings();});
  reducedMotion.addEventListener('change',()=>{lastSecond='';schedule();});
  window.addEventListener('languagechange',()=>{if(settings.language==='auto'){applySettings();schedule();}});
  window.addEventListener('storage',event=>{if(event.key===storageKey){try{settings=event.newValue?{...defaults,...validate(JSON.parse(event.newValue))}:{...defaults};applySettings();schedule();}catch(_){}}});
  applySettings(); schedule();
  if(!storageAvailable)$('saveStatus').textContent=t('Saved for this session only');
  if(document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const schema = {type:'object',additionalProperties:false,properties:Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,choices[key]?{type:'string',enum:choices[key]}:key==='timezone'?{type:'string',enum:zoneChoices}:key==='accent'?{type:'string',pattern:'^#[0-9a-fA-F]{6}$'}:key==='scale'?{type:'number',minimum:70,maximum:130,multipleOf:5}:{type:typeof value}]))};
    const tools = [
      {name:'read_clock_settings',description:'Read the current clock display and appearance settings.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({...settings})},
      {name:'configure_clock',description:'Update clock display and appearance settings. Changes appear immediately and save on this device.',inputSchema:schema,annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{const result=updateSettings(input);schedule();return result;}}
    ];
    for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch(_){}}
    window.addEventListener('pagehide',event=>{if(!event.persisted)lifecycle.abort();},{once:true});
  }
})();

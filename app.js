'use strict';
(() => {
  const fontNames = {sans:'Modern sans',serif:'Classic serif',mono:'Monospace',rounded:'Rounded',lmroman:'LM Roman',slanted:'LM Roman Slanted',demi:'LM Roman Demi',lmsans:'LM Sans',condensed:'LM Sans Condensed',lmmono:'LM Mono',lightmono:'LM Mono Light',dunhill:'LM Dunhill'};
  const themeColors = {light:'#f2f3f1',dark:'#202224',midnight:'#101b2b',paper:'#eee7d8',black:'#050505',forest:'#142b23',plum:'#292035',ocean:'#e2f1f6',rose:'#f5e7ed',terminal:'#08100b',white:'#ffffff',lemon:'#ffe34d',tangerine:'#ffac35',bubblegum:'#ff8ac2',pool:'#39d5ed',lime:'#b6ee45',cobalt:'#76b7ff',coral:'#ff7666'};
  const themeNames = {auto:'Match device',light:'Light',dark:'Dark',midnight:'Midnight',paper:'Paper',black:'Black',forest:'Forest',plum:'Plum',ocean:'Ocean',rose:'Rose',terminal:'Terminal',white:'White',lemon:'Lemon',tangerine:'Tangerine',bubblegum:'Bubblegum',pool:'Pool',lime:'Lime',cobalt:'Cobalt',coral:'Coral',custom:'Custom'};
  const themePreviews = {light:['#f2f3f1','#25282a','#f8f9f6'],dark:['#202224','#eeefeb','#25292a'],midnight:['#101b2b','#dce8f6','#152235'],paper:['#eee7d8','#493f30','#f5f0e5'],black:['#050505','#f4f4f4','#0d0d0d'],forest:['#142b23','#d6efe1','#1b332a'],plum:['#292035','#eadef3','#30263b'],ocean:['#e2f1f6','#1e4a60','#edf7fa'],rose:['#f5e7ed','#543748','#fcf1f6'],terminal:['#08100b','#88dd99','#0d1a12'],white:['#ffffff','#202326','#ffffff'],lemon:['#ffe34d','#382d08','#fff4b8'],tangerine:['#ffac35','#422408','#ffe5bf'],bubblegum:['#ff8ac2','#4c1833','#ffe0ef'],pool:['#39d5ed','#053e4f','#d1f7fc'],lime:['#b6ee45','#293b0c','#e9facb'],cobalt:['#76b7ff','#102c57','#dfedff'],coral:['#ff7666','#481910','#ffded8']};
  const colorSettings = ['accent','customBg','customInk','customDial','customSurface'];
  const customTokens = ['bg','ink','dial','surface','muted','line','subtle','shadow'];
  const defaults = {language:'auto',mode:'both',format:'24',layout:'stacked',timezone:'local',date:true,zone:true,scale:100,theme:'light',customBg:'#f2f3f1',customInk:'#25282a',customDial:'#f8f9f6',customSurface:'#fcfdfb',font:'sans',dialFont:'serif',accent:'#cf553d',analogSeconds:true,motion:'sweep',markers:'numbers',numeralSize:100,minuteMarks:true,digitalSeconds:true,blink:false,leadingZero:true};
  const choices = {language:['auto','ja','en'],mode:['both','analog','digital'],format:['24','12'],layout:['stacked','side'],theme:['auto',...Object.keys(themeColors),'custom'],font:Object.keys(fontNames),dialFont:Object.keys(fontNames),motion:['sweep','tick'],markers:['numbers','roman','minimal']};
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
  let layoutFrame;
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
    const fullscreen = Boolean(document.fullscreenElement);
    $('focusLabel').textContent = t('Clock only');
    $('fullscreenLabel').textContent = t(fullscreen?'Exit full screen':'Full screen');
    $('focusButton').setAttribute('aria-label',t(focus?'Show controls':'Show only the clock'));
    $('fullscreenButton').setAttribute('aria-label',t(fullscreen?'Exit full screen':'Enter full screen'));
    $('exitFocus').textContent = t(fullscreen?'Exit full screen':'Show controls');
  }
  function validate(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Settings must be an object.');
    const result = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.hasOwn(defaults,key)) throw new Error('Unknown setting: ' + key);
      if (choices[key] && !choices[key].includes(value)) throw new Error('Invalid value for ' + key);
      if (typeof defaults[key] === 'boolean' && typeof value !== 'boolean') throw new Error('Invalid value for ' + key);
      if (key === 'scale' && (typeof value !== 'number' || value < 70 || value > 300 || value % 5 !== 0)) throw new Error('Clock size must be between 70 and 300 in increments of 5.');
      if (key === 'numeralSize' && (typeof value !== 'number' || value < 50 || value > 250 || value % 5 !== 0)) throw new Error('Numeral size must be between 50 and 250 in increments of 5.');
      if (key === 'timezone' && !zoneChoices.includes(value)) throw new Error('Unsupported time zone.');
      if (colorSettings.includes(key) && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))) throw new Error('Colors must be six-digit hex values.');
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
        const x = 200+148*Math.sin(angle);
        const y = 200-148*Math.cos(angle);
        const el = svgElement('text',{x,y,class:'dial-number'+(settings.markers==='roman'?' roman':'')});
        if (settings.markers === 'roman') el.setAttribute('transform',`rotate(${i*30} ${x} ${y})`);
        el.textContent = settings.markers==='roman'?roman[i]:(i===0?'12':String(i));
        $('numbers').append(el);
      }
    }
    fitDialNumbers();
  }
  function fitDialNumbers() {
    for (const el of $('numbers').children) {
      if (typeof el.getComputedTextLength !== 'function') continue;
      el.removeAttribute('textLength');
      el.removeAttribute('lengthAdjust');
      const maxWidth = settings.markers === 'roman' ? 68 : 72;
      if (el.getComputedTextLength() > maxWidth) {
        el.setAttribute('textLength',String(maxWidth));
        el.setAttribute('lengthAdjust','spacingAndGlyphs');
      }
    }
  }
  function syncFontPickers() {
    for (const key of ['font','dialFont']) {
      const value = settings[key];
      $(key+'Name').textContent = t(fontNames[value]);
      $(key+'Summary').style.fontFamily = `var(--${value})`;
    }
    document.querySelectorAll('input[data-font-choice]').forEach(el => {
      el.checked = settings[el.dataset.fontChoice] === el.value;
    });
  }
  function mixColor(foreground,background,amount) {
    const channels = hex => [1,3,5].map(index=>parseInt(hex.slice(index,index+2),16));
    const front = channels(foreground), back = channels(background);
    return '#'+front.map((value,index)=>Math.round(value*amount+back[index]*(1-amount)).toString(16).padStart(2,'0')).join('');
  }
  function isLightColor(hex) {
    const channels = [1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
    return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722>.35;
  }
  function applyTheme() {
    for (const token of customTokens) root.style.removeProperty('--'+token);
    root.style.removeProperty('color-scheme');
    root.dataset.theme = settings.theme === 'auto' ? (media.matches?'dark':'light') : settings.theme;
    if (settings.theme === 'custom') {
      const light = isLightColor(settings.customBg);
      const colors = {bg:settings.customBg,ink:settings.customInk,dial:settings.customDial,surface:settings.customSurface,muted:mixColor(settings.customInk,settings.customBg,.7),line:mixColor(settings.customInk,settings.customBg,.18),subtle:mixColor(settings.customInk,settings.customBg,.08),shadow:light?'0 15px 55px #00000012':'0 15px 55px #00000040'};
      for (const [token,value] of Object.entries(colors)) root.style.setProperty('--'+token,value);
      root.style.setProperty('color-scheme',light?'light':'dark');
    }
  }
  function paintThemePreview(id,theme) {
    const resolved = theme === 'auto' ? (media.matches?'dark':'light') : theme;
    const colors = resolved === 'custom' ? [settings.customBg,settings.customInk,settings.customDial] : themePreviews[resolved];
    for (const [index,token] of ['bg','ink','dial'].entries()) $(id).style.setProperty('--preview-'+token,colors[index]);
  }
  function syncThemePicker() {
    $('themeName').textContent = t(themeNames[settings.theme]);
    paintThemePreview('themeSummaryPreview',settings.theme);
    paintThemePreview('autoThemePreview','auto');
    paintThemePreview('customThemePreview','custom');
    document.querySelectorAll('input[data-theme-choice]').forEach(el=>{el.checked = el.value === settings.theme;});
    $('customThemePanel').hidden = settings.theme !== 'custom';
    $('customizeTheme').disabled = settings.theme === 'custom';
    for (const key of colorSettings.filter(key=>key!=='accent')) $(key+'Value').value = settings[key].toUpperCase();
  }
  function applySettings() {
    applyLanguage();
    applyTheme();
    root.style.setProperty('--accent',settings.accent);
    root.style.setProperty('--digital-font',`var(--${settings.font})`);
    root.style.setProperty('--dial-font',`var(--${settings.dialFont})`);
    root.style.setProperty('--clock-scale',String(settings.scale/100));
    root.style.setProperty('--dial-scale',String(settings.numeralSize/100));
    $('clockMain').dataset.mode = settings.mode;
    $('clockMain').dataset.layout = settings.layout;
    $('dateLine').hidden = !settings.date;
    $('timeCaption').hidden = !settings.zone;
    $('headerZone').hidden = !settings.zone;
    $('digitalSeconds').hidden = !settings.digitalSeconds;
    $('secondHand').style.display = settings.analogSeconds ? '' : 'none';
    $('scaleValue').value = settings.scale + '%';
    $('numeralSizeValue').value = settings.numeralSize + '%';
    $('numeralSize').disabled = settings.markers === 'minimal';
    $('layout').disabled = settings.mode !== 'both';
    $('motion').disabled = !settings.analogSeconds;
    document.querySelectorAll('[data-setting]').forEach(el => {
      const value = settings[el.dataset.setting];
      if (el.type === 'checkbox') el.checked = value; else el.value = value;
    });
    document.querySelectorAll('[data-mode]').forEach(el => el.setAttribute('aria-pressed',String(el.dataset.mode===settings.mode)));
    document.querySelectorAll('[data-accent]').forEach(el => el.setAttribute('aria-pressed',String(el.dataset.accent.toLowerCase()===settings.accent.toLowerCase())));
    syncFontPickers();
    syncThemePicker();
    document.querySelector('meta[name="theme-color"]').content = settings.theme === 'custom' ? settings.customBg : themeColors[root.dataset.theme];
    formatters(); drawDial(); tick();
  }
  function updateSettings(patch) {
    settings = {...settings,...validate(patch)};
    applySettings(); save();
    return {...settings};
  }
  function fitClockLayout() {
    const main = $('clockMain');
    const pair = $('clockPair');
    const stage = $('clockStage');
    if (focus) root.style.setProperty('--focus-bottom-space',($('exitFocus').offsetHeight + 40)+'px');
    const style = getComputedStyle(main);
    const px = value => parseFloat(value) || 0;
    const dateSpace = $('dateLine').hidden ? 0 : $('dateLine').offsetHeight + px(getComputedStyle($('dateLine')).marginBottom);
    const width = Math.max(0,main.clientWidth - px(style.paddingLeft) - px(style.paddingRight) - 1);
    const height = Math.max(0,main.clientHeight - px(style.paddingTop) - px(style.paddingBottom) - dateSpace - 1);
    root.style.setProperty('--clock-fit','1');
    const analog = settings.mode === 'digital' ? 0 : $('analogWrap').getBoundingClientRect().width;
    const digits = $('digitalTime').getBoundingClientRect();
    const digitalWidth = settings.mode === 'analog' ? 0 : digits.width;
    const digitalHeight = settings.mode === 'analog' ? 0 : digits.height;
    if (!analog && !digitalWidth) return;
    const caption = settings.mode === 'analog' || $('timeCaption').hidden ? 0 : $('timeCaption').offsetHeight + px(getComputedStyle($('timeCaption')).marginTop);
    const captionWidth = caption ? $('timeCaption').offsetWidth : 0;
    const pairStyle = getComputedStyle(pair);
    const side = pairStyle.flexDirection === 'row';
    const gap = settings.mode === 'both' ? px(pairStyle.gap) : 0;
    const dimensions = ratio => {
      const dial = analog * ratio;
      const digits = digitalWidth * ratio;
      const digital = digitalHeight * ratio + caption;
      return side
        ? {width:dial + Math.max(digits,captionWidth) + gap,height:Math.max(dial,digital)}
        : {width:Math.max(dial,digits,captionWidth),height:dial + digital + gap};
    };
    let low = 0;
    let high = settings.scale === 300 ? Math.max(1,width / (analog || digitalWidth),height / (analog || digitalHeight)) : 1;
    for (let i=0;i<24;i++) {
      const ratio = (low + high) / 2;
      const size = dimensions(ratio);
      if (size.width <= width && size.height <= height) low = ratio; else high = ratio;
    }
    root.style.setProperty('--clock-fit',String(low));
    const fitted = pair.getBoundingClientRect();
    stage.style.width = fitted.width+'px';
    stage.style.height = fitted.height+'px';
  }
  function scheduleLayout() {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => { layoutFrame = null; fitClockLayout(); });
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
      scheduleLayout();
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
    scheduleLayout();
    revealFocus();
    if (!focus) $('focusButton').focus({preventScroll:true});
  }
  async function fullScreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    try {
      if (root.requestFullscreen) { await root.requestFullscreen(); setFocus(true); }
      else { setFocus(true); toast(t('Full screen is unavailable. Focus mode is on.')); }
    } catch (_) { setFocus(true); toast(t('Full screen is unavailable. Focus mode is on.')); }
  }
  function exitClockView() {
    if (document.fullscreenElement) return fullScreen();
    setFocus(false);
  }
  document.querySelectorAll('[data-setting]').forEach(el => el.addEventListener(el.type==='range'||el.type==='color'?'input':'change',() => {
    const value = el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;
    updateSettings({[el.dataset.setting]:value}); schedule();
  }));
  document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click',()=>{updateSettings({mode:el.dataset.mode});schedule();}));
  document.querySelectorAll('input[data-theme-choice]').forEach(el=>el.addEventListener('change',()=>{
    if (!el.checked) return;
    updateSettings({theme:el.value});
    $('themePicker').open = false;
    $('themeSummary').focus({preventScroll:true});
  }));
  $('customizeTheme').addEventListener('click',()=>{
    const colors = getComputedStyle(root);
    const patch = {theme:'custom'};
    for (const [key,token] of Object.entries({customBg:'bg',customInk:'ink',customDial:'dial',customSurface:'surface'})) patch[key] = colors.getPropertyValue('--'+token).trim();
    updateSettings(patch);
  });
  document.querySelectorAll('[data-accent]').forEach(el=>el.addEventListener('click',()=>updateSettings({accent:el.dataset.accent})));
  document.querySelectorAll('input[data-font-choice]').forEach(el => el.addEventListener('change',() => {
    if (!el.checked) return;
    const key = el.dataset.fontChoice;
    updateSettings({[key]:el.value});
    $(key+'Picker').open = false;
    $(key+'Summary').focus({preventScroll:true});
    schedule();
  }));
  for (const key of ['theme','font','dialFont']) {
    $(key+'Picker').addEventListener('toggle',() => {
      if ($(key+'Picker').open) for (const other of ['theme','font','dialFont']) if (other !== key) $(other+'Picker').open = false;
    });
    $(key+'Picker').addEventListener('keydown',event => {
      if (event.key === 'Escape' && $(key+'Picker').open) {
        event.preventDefault();event.stopPropagation();
        $(key+'Picker').open = false;
        $(key+'Summary').focus({preventScroll:true});
      }
    });
  }
  $('settingsButton').addEventListener('click',openSettings);
  $('footerSettings').addEventListener('click',openSettings);
  $('closeSettings').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  $('resetButton').addEventListener('click',()=>$('resetDialog').showModal());
  $('cancelReset').addEventListener('click',()=>$('resetDialog').close());
  $('confirmReset').addEventListener('click',()=>{settings={...defaults};applySettings();save();schedule();$('resetDialog').close();});
  $('focusButton').addEventListener('click',()=>setFocus(!focus));
  $('exitFocus').addEventListener('click',exitClockView);
  $('exitFocus').addEventListener('focus',revealFocus);
  $('fullscreenButton').addEventListener('click',fullScreen);
  document.addEventListener('fullscreenchange',()=>setFocus(Boolean(document.fullscreenElement)));
  document.addEventListener('pointermove',revealFocus,{passive:true});
  document.addEventListener('pointerdown',revealFocus,{passive:true});
  document.addEventListener('keydown',event=>{
    revealFocus();
    if (event.key === 'Escape' && focus && !document.fullscreenElement && !dialog.open && !$('resetDialog').open) setFocus(false);
    if (event.ctrlKey||event.metaKey||event.altKey||event.repeat||dialog.open||$('resetDialog').open||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if(event.key.toLowerCase()==='s'){event.preventDefault();openSettings();}
    if(event.key.toLowerCase()==='f'){event.preventDefault();fullScreen();}
  });
  document.addEventListener('visibilitychange',()=>{lastSecond='';schedule();});
  media.addEventListener('change',()=>{if(settings.theme==='auto')applySettings();});
  reducedMotion.addEventListener('change',()=>{lastSecond='';schedule();});
  window.addEventListener('languagechange',()=>{if(settings.language==='auto'){applySettings();schedule();}});
  window.addEventListener('resize',scheduleLayout,{passive:true});
  window.visualViewport?.addEventListener('resize',scheduleLayout,{passive:true});
  if (typeof ResizeObserver !== 'undefined') {
    const layoutObserver = new ResizeObserver(scheduleLayout);
    for (const id of ['clockMain','dateLine','exitFocus']) layoutObserver.observe($(id));
  }
  window.addEventListener('storage',event=>{if(event.key===storageKey){try{settings=event.newValue?{...defaults,...validate(JSON.parse(event.newValue))}:{...defaults};applySettings();schedule();}catch(_){}}});
  applySettings(); schedule();
  if (document.fonts) {
    const fontsReady = () => { fitDialNumbers(); scheduleLayout(); };
    document.fonts.ready.then(fontsReady).catch(()=>{});
    document.fonts.addEventListener('loadingdone',fontsReady);
  }
  if(!storageAvailable)$('saveStatus').textContent=t('Saved for this session only');
  if(document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const schema = {type:'object',additionalProperties:false,properties:Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,choices[key]?{type:'string',enum:choices[key]}:key==='timezone'?{type:'string',enum:zoneChoices}:colorSettings.includes(key)?{type:'string',pattern:'^#[0-9a-fA-F]{6}$'}:key==='scale'?{type:'number',minimum:70,maximum:300,multipleOf:5}:key==='numeralSize'?{type:'number',minimum:50,maximum:250,multipleOf:5}:{type:typeof value}]))};
    const tools = [
      {name:'read_clock_settings',description:'Read the current clock display and appearance settings.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({...settings})},
      {name:'configure_clock',description:'Update clock display and appearance settings. Changes appear immediately and save on this device.',inputSchema:schema,annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{const result=updateSettings(input);schedule();return result;}}
    ];
    for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch(_){}}
    window.addEventListener('pagehide',event=>{if(!event.persisted)lifecycle.abort();},{once:true});
  }
})();

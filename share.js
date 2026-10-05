'use strict';
(() => {
  // Version 1 has a fixed field order. Future fields must use a new version.
  const fields = ['language','mode','format','layout','timezone','date','dateWeekday','dateMonth','dateDay','dateYear','zone','scale','theme','customBg','customInk','customDial','customSurface','font','dialFont','accent','hourStyle','minuteStyle','secondStyle','analogSeconds','motion','markers','hourPattern','customHours','numeralSize','minuteMarks','digitalSeconds','blink','leadingZero'];
  function encode(settings) {
    const bytes = new TextEncoder().encode(JSON.stringify(fields.map(key => settings[key])));
    return 'STILL1.' + btoa(Array.from(bytes,byte => String.fromCharCode(byte)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decode(input) {
    let code = input.trim();
    if (!code || code.length > 12000) throw new Error('Invalid clock code.');
    if (!code.startsWith('STILL')) {
      const url = new URL(code);
      if (!['http:','https:','file:'].includes(url.protocol)) throw new Error('Invalid share link.');
      code = new URLSearchParams(url.hash.slice(1)).get('clock') || '';
    }
    if (!/^STILL1\.[A-Za-z0-9_-]+$/.test(code)) throw new Error('Invalid clock code or unsupported version.');
    const base64 = code.slice(7).replace(/-/g,'+').replace(/_/g,'/');
    const bytes = Uint8Array.from(atob(base64),char => char.charCodeAt(0));
    const values = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if (!Array.isArray(values) || values.length !== fields.length || values.some(value => value === null)) throw new Error('Incomplete clock code.');
    return Object.fromEntries(fields.map((key,index) => [key,values[index]]));
  }
  function makeURL(code,href) {
    const url = new URL(href);
    if (!['http:','https:'].includes(url.protocol)) return '';
    url.hash = new URLSearchParams({clock:code}).toString();
    return url.href;
  }
  function drawQR(canvas,value) {
    const qr = qrcode(0,'M');
    qr.addData(value,'Byte');
    qr.make();
    const cells = qr.getModuleCount(), border = 4, scale = Math.max(6,Math.ceil(720/(cells+border*2)));
    canvas.width = canvas.height = (cells+border*2)*scale;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('QR image is unavailable.');
    context.fillStyle = '#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
    context.fillStyle = '#000000';
    for (let y=0;y<cells;y++) for (let x=0;x<cells;x++) if(qr.isDark(y,x)) context.fillRect((x+border)*scale,(y+border)*scale,scale,scale);
    return {cells,border,scale};
  }
  window.StillShare = Object.freeze({encode,decode,makeURL,drawQR});
})();

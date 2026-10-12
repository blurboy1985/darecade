import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { fresh } from "../src/state.ts";
import { menuPages } from "../src/lobby-menu.ts";

export function mobileLobbyFixture(
  width: number,
  height: number,
  account = false,
  twoD = false,
  automated: boolean | "wardrobe" | "relay-retired" = true,
  extraScript = "",
) {
  const root = resolve("dist");
  const profile = {
    id: "mobile-qa",
    name: "LongNeighbourNameTest",
    ageBand: "18+",
    privacyVersion: "fixture",
    account: account
      ? { email: "qa@example.test", created: 1, eligibleAt: 1 }
      : null,
    playMedals: {
      day: "2026-10-05",
      today: 1,
      total: 4,
      games: ["noodle"],
      limit: 3,
    },
    progress: {
      ...fresh(),
      xp: 235,
      twoD,
      sound: false,
      music: false,
      light: "day",
    },
  };
  const script = `<script>
  if(new URLSearchParams(location.search).has('audit')) {
    const script=document.createElement('script'); script.src='/qa-audit.js'; document.head.append(script);
  }
  const profile = ${JSON.stringify(profile)};
  const safetyReview=new URLSearchParams(location.search).get('review')==='safety';
  if(safetyReview) profile.ageBand='13-17';
  const muted=[]; const blocked=[];
  const neighbour={id:'review-stranger',name:'Mint Otter 12',look:{...profile.progress,hair:69},activity:'lobby',status:'private',best:{},points:7,incoming:0,outgoing:0,wins:0,x:3,z:10,yaw:0};
  const baseFetch = window.fetch;
  localStorage.setItem('darecade-v1', JSON.stringify(profile.progress));
  localStorage.setItem('playsimi-quality', 'quality'); // Legacy preference must not raise the mobile budget.
  window.fetch = async (input, init) => {
    const url = new URL(String(input), location.href);
    if (!url.pathname.startsWith('/api/')) return baseFetch(input, init);
    const path = url.pathname.slice(5);
    let result = {};
    if (path === 'auth/config') result = { now: Date.now(), privacyVersion: 'fixture', mailMode: 'outbox', origin: location.origin, storageNotice: 'Synthetic local fixture' };
    else if (path === 'auth/session') result = new URLSearchParams(location.search).get('review')==='age' ? null : profile;
    else if (path === 'profile') { Object.assign(profile.progress, JSON.parse(init.body)); result = profile; }
    else if (path === 'auth/me') {if(new URLSearchParams(location.search).get('review')==='age') return new Response('{}',{status:401});result = profile;}
    else if (path === 'state') result = { profile, competitionReady: false, me: profile.id, self: {id: profile.id, name: profile.name, look: {}, activity: 'lobby', status: 'online', best: profile.progress.best, points: ${account ? 12 : 0}}, day:'2026-10-05', nextReset:Date.now()+86400000, week:'', weekly:[], lastWeek:[], dares:[], recentRuns:[], players:safetyReview&&!blocked.length?[neighbour]:[], friends:[], muted, challenged:[], boards:{noodle:[],hop:[],brick:[],swarm:[],coast:[]}, history:[] };
    else if (path === 'finish') {
      result = await baseFetch('/qa-finish', init).then(r=>r.json());
      profile.progress.xp += 20;
      if (result.race?.finished) profile.progress.coastRecord = {version:3,timeTicks:result.race.timeTicks,place:result.race.place};
      profile.playMedals.total += result.playMedal || 0;
      profile.playMedals.today += result.playMedal || 0;
      if (result.playMedal) profile.playMedals.games.push('coast');
      result.profile = profile;
    }
    else if (path === 'run') {const game=JSON.parse(init.body).game;result = game==='coast'?{id: profile.progress.coastRecord.timeTicks ? 'qa-standard' : 'qa-race',seed: profile.progress.coastRecord.timeTicks ? 42 : -43, ranked:false}:{id:'qa-'+game,seed:game==='swarm'?-43:42,ranked:false};}
    else if(path==='payments/config')result={enabled:true,testMode:true,products:[{id:'solar',kind:'set',amount:500,currency:'sgd'}]};
    else if(path==='payments/history')result=[];
    else if(path==='moderate'){const data=JSON.parse(init.body);if(data.action==='block')blocked.push(data.target);else if(data.action==='mute')muted.push(data.target);else muted.splice(muted.indexOf(data.target),1);result={ok:true};}
    else if(path==='report')result={ok:true};
    else if (path === 'world/poll') result = {t:'sync',at:Date.now(),world:'world-1',p:[[0,profile.id,profile.name,profile.progress],...(safetyReview&&!blocked.length?[[1,neighbour.id,neighbour.name,neighbour.look]]:[])],d:[[0,0,1000,0,0,0],...(safetyReview&&!blocked.length?[[1,300,1000,0,0,0,1]]:[])],gone:[]};
    return new Response(JSON.stringify(result), {headers:{'Content-Type':'application/json'}});
  };
  ${
    automated
      ? `
  addEventListener('load', async () => {
    const checks = [];
    const check = (value, message) => { if (!value) throw Error(message); checks.push(message); };
    const find = selector => document.querySelector(selector);
    const wait = async predicate => { for(let i=0; i<250; i++){ if(predicate()) return; await new Promise(r=>setTimeout(r,100)); } throw Error('UI load timeout'); };
    const visible = el => { const r=el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >=0 && r.bottom <=innerHeight && r.left >=0 && r.right <=innerWidth; };
    const hit = el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); };
    try {
      await wait(()=>!find('#loading') && find('#player-name')?.textContent===profile.name);
      {
        const chip=find('.profile');
        check(chip.tagName==='BUTTON' && chip.getBoundingClientRect().height>=44 && hit(chip), 'profile chip is a 44px tap target');
        chip.click();
        check(find('#modal').open && find('#modal h2').textContent===profile.name, 'profile chip opens the profile panel');
        find('#close-modal').click();
        check(!/neighbours/.test(find('.demo-tag').textContent), 'world label does not count example residents');
      }
      find('[data-open="phone-menu"]').click();
      find('[data-open="preferences"]').click();
      check(!find('#setting-quality'), 'graphics modes are removed');
      check(!!find('#setting-sound') && !!find('#setting-reduced'), 'sound and accessibility preferences remain');
      find('#close-modal').click();
      {
        const canvas=find('#world canvas');
        check(!!canvas && canvas.width <= canvas.clientWidth * 1.25 + 1, 'legacy quality preference cannot exceed rendering budget');
      }
      if (${automated === "relay-retired"}) {
        const requests=[];
        const fetch=window.fetch;
        window.fetch=(input,init)=>{requests.push(String(input));return fetch(input,init);};
        const before=JSON.parse(localStorage.getItem('darecade-v1'));
        for(const id of ['arcade','surroundings','soon']) {
          const link=document.createElement('button');link.dataset.open=id;document.body.append(link);link.click();link.remove();
          await wait(()=>find('#modal').open && find('#modal h2')?.textContent==='Play');
          check(!find('[data-open="relay"]') && !find('#modal').textContent.includes('Neighbourhood Relay'), id+' has no Relay');
          check(document.querySelectorAll('[data-game]').length<=3, id+' limits primary game choices');
          find('#play-section').value='outside';find('#play-section').dispatchEvent(new Event('change',{bubbles:true}));
          check(!!find('[data-open="stage"]') && !!find('[data-open="plots"]'), id+' keeps stage and plots');
          find('#play-section').value='arcade';find('#play-section').dispatchEvent(new Event('change',{bubbles:true}));
          check(document.documentElement.scrollWidth<=innerWidth, id+' has no horizontal overflow');
          find('#close-modal').click();
        }
        check(!requests.some(path=>path.includes('/relay/')), 'menus never request the retired game');
        const after=JSON.parse(localStorage.getItem('darecade-v1'));
        for(const key of ['xp','styleSpent','wardrobeOwned','wardrobePurchased','clothing','hair','pet','accessory']) check(JSON.stringify(before[key])===JSON.stringify(after[key]), key+' is preserved');
        check(!find('.plaza-relay') && !find('.relay-game'), 'Relay screens are absent');
        parent.postMessage({result:'pass',report:{width:${width},height:${height},twoD:${twoD},checks}},location.origin);
        return;
      }
      if (${automated === "wardrobe"}) {
      const emotes=find('#quick-emotes'), toggle=find('#quick-emotes-toggle');
      check(emotes.hidden && toggle.getAttribute('aria-expanded')==='false', 'emotes start collapsed');
      check(visible(toggle) && hit(toggle), 'single emote toggle is unobstructed');
      const toggleRect=toggle.getBoundingClientRect();
      check(toggleRect.left>innerWidth/2 && toggleRect.bottom<innerHeight/3, 'emote toggle is at top right');
      check(toggleRect.width>=44 && toggleRect.height>=44, 'emote touch target at least 44px');
      toggle.click();
      check(!emotes.hidden && toggle.getAttribute('aria-expanded')==='true', 'toggle expands emote actions');
      for(const action of emotes.querySelectorAll('button')) check(visible(action)&&hit(action), action.getAttribute('aria-label')+' emote action reachable');
      const wave=emotes.querySelector('[data-emote="wave"]');
      wave.focus(); wave.click();
      check(emotes.hidden && toggle.getAttribute('aria-expanded')==='false', 'choosing an emote collapses actions');
      check(document.activeElement===toggle, 'selection returns focus to emote toggle');
      find('#lobby-jump').click();
      check(emotes.hidden, 'jump does not reopen emotes');
      toggle.click(); toggle.click();
      check(emotes.hidden, 'toggle can close actions');
      toggle.click();
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      check(emotes.hidden && document.activeElement===toggle, 'Escape collapses actions and restores focus');
      toggle.click();
      find('#world').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
      check(emotes.hidden, 'tapping outside collapses actions');
      toggle.click();
      find('#quick-emotes [data-open="emotes"]').click();
      check(emotes.hidden, 'opening More collapses actions');
      check(document.querySelectorAll('#modal-body [data-emote]').length===3, 'More shows three emotes');
      const nextEmotes=[...document.querySelectorAll('[data-page="emotes"]')].find(button=>button.textContent.includes('Next'));nextEmotes.click();
      check(!!find('[data-emote="think"]') && document.querySelectorAll('#modal-body [data-emote]').length===3, 'remaining three emotes reachable');
      find('#close-modal').click();
      find('.lobby-dock [data-open="wardrobe"]').click();
      await wait(()=>find('.wardrobe-controls'));
      const identity=find('.look-identity'), tabs=find('.look-tabs');
        check(identity.getBoundingClientRect().top < tabs.getBoundingClientRect().top, 'settings precede catalogue');
        {
          find('[data-preview-view="face"]').click();
          check(find('[data-preview-view="face"]').getAttribute('aria-pressed')==='true', 'face camera is selected');
          find('[data-preview-view="body"]').click();
        }
        find('[data-expand-preview]').click();
        check(!!find('.fitting-expanded') && !visible(find('.wardrobe-controls')), 'expanded fitting room hides catalogue');
        check(find('.character-preview').getBoundingClientRect().height>120, 'expanded preview has useful height');
        check(hit(find('[data-expand-preview]')), 'expanded preview return button is reachable by touch');
        check(visible(find('[data-reset-look]')) && hit(find('[data-reset-look]')), 'Back to my look is fully visible and tappable when expanded');
        find('[data-expand-preview]').click();
        check(visible(find('.wardrobe-controls')), 'return from expanded preview restores catalogue');
        find('[data-expand-preview]').click();
        find('[data-reset-look]').click();
        check(visible(find('.wardrobe-controls')), 'Back to my look exits larger preview');
        const firstCard=find('[data-try-slot="outfits"][data-try-index="80"]');
      const cardImage=firstCard.querySelector('img');
      const previewCanvas=find('.character-preview canvas');
      firstCard.click();
      check(firstCard.isConnected && find('[data-try-slot="outfits"][data-try-index="80"]')===firstCard, 'selecting an item preserves its card instead of flashing stock art');
      check(firstCard.querySelector('img')===cardImage, 'selection preserves the loaded thumbnail');
      check(!previewCanvas || find('.character-preview canvas')===previewCanvas, 'selection keeps the same preview canvas');
      const controls=find('.wardrobe-controls');
      const scrollBefore=controls.scrollTop;
      find('[data-try-slot="outfits"][data-try-index="82"]').click();
      await wait(()=>JSON.parse(localStorage.getItem('darecade-v1')).clothing===65);
      check(firstCard.isConnected && controls.scrollTop===scrollBefore, 'rapid choices preserve cards and scroll');
      check(find('[data-try-slot="outfits"][data-try-index="82"]').getAttribute('aria-pressed')==='true', 'latest item stays selected');
      check(firstCard.getAttribute('aria-pressed')==='false', 'previous item is deselected');
      find('[data-undo-look]').click();
      check(JSON.parse(localStorage.getItem('darecade-v1')).clothing===64, 'Undo restores the previous outfit');
      const girlLook=JSON.parse(localStorage.getItem('darecade-v1'));
      find('.look-identity').open=true;
      find('[data-body="1"]').click();
      check([...document.querySelectorAll('[data-try-slot="outfits"]')].every(b=>Number(b.dataset.tryIndex)%2===1), 'boy character only sees boy outfits');
      check(!find('[data-try-slot="outfits"][data-try-index="80"]'), 'girl outfit is unavailable for boy');
      find('[data-try-slot="outfits"][data-try-index="83"]').click();
      check(JSON.parse(localStorage.getItem('darecade-v1')).body===1, 'outfit keeps character body');
      find('.look-identity').open=true;
      find('[data-body="0"]').click();
      check([...document.querySelectorAll('[data-try-slot="outfits"]')].every(b=>Number(b.dataset.tryIndex)%2===0), 'girl character only sees girl outfits');
      find('[data-try-slot="outfits"][data-try-index="80"]').click();
      const restoredLook=JSON.parse(localStorage.getItem('darecade-v1'));
      check(restoredLook.hair===girlLook.hair && restoredLook.baseHair===girlLook.baseHair,'complete outfit restores matching hairstyle and headwear');
      check(restoredLook.pet===girlLook.pet && restoredLook.accessory===girlLook.accessory, 'outfit preserves chosen pet and magic');
      find('[data-wardrobe-section="Hair"]').click();
      const hairImage=find('.collection-grid .avatar-thumbnail');
      hairImage.scrollIntoView({block:'center'});
      await wait(()=>hairImage.complete && hairImage.naturalWidth>0);
      check(hairImage.classList.contains('is-ready') && getComputedStyle(hairImage).opacity!=='0', 'hair thumbnail loads and is visible');
      find('[data-try-slot="hairstyle"][data-try-index="112"]').click();
      check(JSON.parse(localStorage.getItem('darecade-v1')).baseHair===112, 'hairstyle equips independently');
      find('[data-wardrobe-section="Headwear"]').click();
      check(!find('.hat-shelf') && !find('#modal-body').textContent.includes('No hats yet'), 'headwear collection has no empty hats notice');
      find('[data-try-slot="hair"][data-try-index="157"]').click();
      check(JSON.parse(localStorage.getItem('darecade-v1')).baseHair===112, 'headwear preserves hairstyle');
      find('[data-wardrobe-section="Clothes"]').click();
      find('[data-try-slot="clothing"][data-try-index="65"]').click();
      check(JSON.parse(localStorage.getItem('darecade-v1')).baseHair===112, 'clothes preserve hairstyle');
      find('.saved-looks').open=true;
      find('[data-save-look="0"]').click();
      check(JSON.parse(localStorage.getItem('darecade-v1')).savedLooks[0].baseHair===112, 'saved look contains the mixed hairstyle');
      find('[data-wardrobe-section="Hair"]').click();
      find('[data-try-slot="hairstyle"][data-try-index="113"]').click();
      find('.saved-looks').open=true;
      find('[data-wear-saved="0"]').click();
      check(JSON.parse(localStorage.getItem('darecade-v1')).baseHair===112, 'saved look reapplies the exact combination');
      for(const section of ['Outfits','Pets','Magic']) {
        find('[data-wardrobe-section="'+section+'"]').click();
        const panel=find('.wardrobe-controls');
        check(panel.scrollHeight>panel.clientHeight, section+' has a bounded scrolling list');
        panel.scrollTop=panel.scrollHeight;
        check(panel.scrollTop>0, section+' scrolls to bottom');
        const done=find('[data-action="done-look"]');
        done.scrollIntoView({block:'nearest'});
        check(visible(done)&&hit(done), section+' Done is reachable at bottom');
        panel.scrollTop=0;
      }
      check(document.querySelectorAll('[data-wardrobe-section]').length===6, 'complete outfits and component sections');
      check(document.querySelectorAll('[data-wardrobe-filter]').length===3, 'only three tiers');
      find('[data-wardrobe-section="Pets"]').click();
      find('[data-wardrobe-filter="Legendary"]').click();
      find('[data-favourite-set="solar"]').click();
      check(find('.favourite-goal').textContent.includes('Style tokens'), 'favourite shows earning progress');
      check(JSON.parse(localStorage.getItem('darecade-v1')).favouriteSet==='solar', 'favourite persists');
      find('.favourite-goal [data-favourite-set]').click();
      const locked=find('[data-try-slot="pet"][data-try-index="26"]');
      const savedPet=JSON.parse(localStorage.getItem('darecade-v1')).pet;
      locked.click();
      check(locked.isConnected && locked.getAttribute('aria-pressed')==='true', 'locked preview preserves its card');
      check(JSON.parse(localStorage.getItem('darecade-v1')).pet===savedPet, 'preview never equips an unowned item');
      check(find('[data-redeem-set="piece:solar:pet"]').disabled && !!find('[data-buy-set="solar"]'), 'insufficient tokens show a cash option');
      find('[data-reset-look]').click();
      check(locked.getAttribute('aria-pressed')==='false', 'reset clears preview selection');
      profile.progress.wardrobePurchased=['solar'];
      window.dispatchEvent(new CustomEvent('account-profile',{detail:profile}));
      find('[data-wardrobe-section="Pets"]').click();
      const purchased=find('[data-try-slot="pet"][data-try-index="26"]');
      purchased.click();
      check(purchased.querySelector('.item-state').textContent==='Purchased · Equipped', 'purchased indicator survives equipping');
      check(!find('[data-buy-set="solar"]') && !find('[data-redeem-set="piece:solar:pet"]'), 'owned set cannot be bought or redeemed again');
      find('[data-wardrobe-filter="Premium"]').click();
      check(document.querySelectorAll('[data-try-slot]').length===22 && !!find('[data-buy-set="aegis-prime"]') && !find('[data-redeem-set]') && !find('[data-buy-set="solar"]'), 'Premium has 22 money-only choices');
      find('[data-wardrobe-section="Outfits"]').click();
      find('[data-wardrobe-filter="${account ? "Legendary" : "Free"}"]').click();
      find('.wardrobe-controls').scrollTop=0;
        parent.postMessage({result:'pass',report:{width:${width},height:${height},account:${account},twoD:${twoD},checks}},location.origin);
        return;
      }
      check(innerWidth===${width} && innerHeight===${height}, 'exact test viewport');
      check(document.documentElement.scrollWidth<=innerWidth, 'no horizontal overflow');
      for(const id of ['level-label']) check(visible(find('#'+id)),id+' visible upfront');
      check(find('#player-account').textContent===${JSON.stringify(account ? "Saved account" : "Guest mode")}, 'correct account status');
      check(find('#level-label').textContent.includes('235 XP') && find('#level-label').textContent.includes('Level 3'), 'level and total XP visible');
      check(find('#medal-points').textContent.includes('4 Play medals') && find('#medal-points').textContent.includes('Ranked'), 'both medal types visible');
      const goal = find('.welcome-panel');
      check(visible(goal), 'first-round goal visible');
      check(goal.getBoundingClientRect().height<=220, 'starter guide fits in a compact card');
      check(visible(find('.starter-guide')), 'movement and game guide visible');
      const dismiss=goal.querySelector('[data-action="welcome-skip"]');
      check(hit(dismiss) && dismiss.getBoundingClientRect().height>=44, 'dismiss target reachable');
      ${`
      const camera=find('#camera-toggle');
      check(visible(camera) && hit(camera), 'camera target unobstructed');
      check(camera.getBoundingClientRect().width>=36 && camera.getBoundingClientRect().height>=36, 'compact camera target at least 36px');
      const initial=camera.getAttribute('aria-pressed');
      camera.click(); check(camera.getAttribute('aria-pressed')!==initial, 'camera toggles to birds eye');
      camera.click(); check(camera.getAttribute('aria-pressed')===initial, 'camera toggles back to third person');
      `}
      dismiss.click();
      const touchControls = !matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (${width} <= 900 && touchControls) {
        const stick=find('#joystick');
        check(visible(stick) && hit(stick), 'world joystick is visible and unobstructed');
        check(getComputedStyle(stick).touchAction==='none', 'world joystick keeps native touch capture');
      }
      const jump=find('#lobby-jump');
      check(!!jump, 'jump control exists');
      {
        check(visible(jump) && hit(jump), 'Jump touch target unobstructed');
        check(jump.textContent==='Jump', 'Jump has a visible word label');
        check(jump.getBoundingClientRect().width>=76 && jump.getBoundingClientRect().height>=76, 'Jump target at least 76px');
        const canvas=find('#world canvas');
        jump.click(); jump.click();
        check(find('#world canvas')===canvas && !find('#modal').open, 'repeated Jump keeps the scene open');
        const nearby=find('#interaction');
        nearby.hidden=false;
        nearby.querySelector('span').textContent='Arcade Row';
        check(hit(jump) && hit(nearby), 'Jump and nearby action both reachable');
        nearby.hidden=true;
        for(const state of ['is-away','is-interacting','inspecting']) {
          document.body.classList.add(state);
          check(!visible(jump), 'Jump hidden during '+state);
          document.body.classList.remove(state);
        }
      }
      check(goal.hidden, 'dismiss clears the scene');
      check(JSON.parse(localStorage.getItem('darecade-v1')).welcomeDismissed, 'dismiss survives saving');
      check(profile.progress.rounds===0,'dismiss does not complete or grant reward');
      const menu=find('.lobby-dock [data-open="phone-menu"]');
      check(visible(menu) && hit(menu), 'Menu touch target unobstructed');
      menu.focus(); menu.click();
      check(!visible(jump), 'Jump hidden behind open menu');
      const items=[...document.querySelectorAll('.simple-menu .menu-choice')];
      check(items.length===${menuPages["phone-menu"].actions.length}, 'all destinations on first menu page');
      check(!find('.simple-menu details') && !find('.simple-menu .choice-pager'), 'no category gates or paging');
      for(const item of items){ item.scrollIntoView({block:'center'}); check(visible(item)&&hit(item)&&item.getBoundingClientRect().height>=44,'reachable menu item: '+item.textContent.trim()); }
      find('.simple-menu [data-open="preferences"]').click();
      check(!!find('#setting-sound'), 'preferences open directly');
      find('.menu-back').click();
      find('[data-open="privacy"]').click();
      await wait(() => find('#export-data'));
      check(find('#account-dialog')?.open && !!find('#export-data') && !!find('#delete-data'), 'privacy data controls open directly');
      find('#account-close')?.click();
      check(!find('#modal').open, 'account opening closes the menu');
      parent.postMessage({result:'pass',report:{width:${width},height:${height},account:${account},twoD:${twoD},checks}},location.origin);
    } catch(error) { parent.postMessage({result:'fail',report:{checks,error:error.stack}},location.origin); }
  });`
      : ""
  }
  </script>`;
  const html = readFileSync(resolve(root, "index.html"), "utf8").replace(
    "<head>",
    "<head>" + script + (extraScript ? `<script>${extraScript}</script>` : ""),
  );
  return createServer((req, res) => {
    const path = new URL(req.url || "/", "http://localhost").pathname;
    if (path === "/fixture" || (!automated && !extraScript && path === "/")) {
      res.setHeader("Content-Type", "text/html");
      res.end(html);
      return;
    }
    if (path === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<!doctype html><html><head><script>addEventListener('message', e=>{if(e.origin!==location.origin||e.source!==document.querySelector('iframe').contentWindow)return;document.body.dataset.result=e.data.result;document.querySelector('pre').textContent=JSON.stringify(e.data.report);});</script></head><body style="margin:0"><iframe src="/fixture" style="width:${width}px;height:${height}px;border:0;display:block"></iframe><pre></pre></body></html>`,
      );
      return;
    }
    const file = resolve(root, "." + path);
    if (!file.startsWith(root + sep) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const mime: Record<string, string> = {
      ".js": "text/javascript",
      ".css": "text/css",
      ".glb": "model/gltf-binary",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
    };
    res.setHeader(
      "Content-Type",
      mime[extname(file)] || "application/octet-stream",
    );
    res.end(readFileSync(file));
  });
}

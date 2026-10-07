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
  automated: boolean | "wardrobe" = true,
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
      find('[data-open="phone-menu"]').click();
      find('[data-open="preferences"]').click();
      check(!find('#setting-quality'), 'graphics modes are removed');
      check(!!find('#setting-sound') && !!find('#setting-reduced'), 'sound and accessibility preferences remain');
      find('#close-modal').click();
      if (!${twoD}) {
        const canvas=find('#world canvas');
        check(!!canvas && canvas.width <= canvas.clientWidth * 1.25 + 1, 'legacy quality preference cannot exceed rendering budget');
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
      check(document.querySelectorAll('#modal-body [data-emote]').length===6, 'More shows all six emotes without Next');
      check(!find('#modal-body [data-page="emotes"]'), 'emotes have no second page');
      find('#close-modal').click();
      find('.lobby-dock [data-open="wardrobe"]').click();
      await wait(()=>find('.wardrobe-controls'));
      for(const section of ['Outfits','Hair','Hats','Full sets']) {
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
      find('#close-modal').click();
        parent.postMessage({result:'pass',report:{width:${width},height:${height},account:${account},twoD:${twoD},checks}},location.origin);
        return;
      }
      check(innerWidth===${width} && innerHeight===${height}, 'exact test viewport');
      check(document.documentElement.scrollWidth<=innerWidth, 'no horizontal overflow');
      for(const id of ['level-label']) check(visible(find('#'+id)),id+' visible upfront');
      check(find('#player-account').textContent===${JSON.stringify(account ? "Saved account" : "Guest mode")}, 'correct account status');
      check(find('#level-label').textContent.includes('235 XP') && find('#level-label').textContent.includes('Level 3'), 'level and total XP visible');
      check(find('#medal-points').textContent.includes('4 Play medals') && find('#medal-points').textContent.includes('Ranked'), 'both medal types visible');
      const goal = find('${twoD ? "#fallback-welcome" : ".welcome-panel"}');
      check(visible(goal), 'first-round goal visible');
      check(goal.getBoundingClientRect().height<=90, 'cap prompt no taller than 90px');
      const dismiss=goal.querySelector('[data-action="welcome-skip"]');
      check(hit(dismiss) && dismiss.getBoundingClientRect().height>=44, 'dismiss target reachable');
      ${
        twoD
          ? `check(find('#camera-toggle').hidden, '2D hides unavailable camera');`
          : `
      const camera=find('#camera-toggle');
      check(visible(camera) && hit(camera), 'camera target unobstructed');
      check(camera.getBoundingClientRect().width>=36 && camera.getBoundingClientRect().height>=36, 'compact camera target at least 36px');
      const initial=camera.getAttribute('aria-pressed');
      camera.click(); check(camera.getAttribute('aria-pressed')!==initial, 'camera toggles to birds eye');
      camera.click(); check(camera.getAttribute('aria-pressed')===initial, 'camera toggles back to third person');
      `
      }
      dismiss.click();
      const touchControls = !matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (!${twoD} && ${width} <= 900 && touchControls) {
        const stick=find('#joystick');
        check(visible(stick) && hit(stick), 'world joystick is visible and unobstructed');
        check(getComputedStyle(stick).touchAction==='none', 'world joystick keeps native touch capture');
      }
      const jump=find('#lobby-jump');
      check(!!jump, 'jump control exists');
      if (!${twoD} && touchControls) {
        check(visible(jump) && hit(jump), 'Jump touch target unobstructed');
        check(jump.getBoundingClientRect().width>=44 && jump.getBoundingClientRect().height>=44, 'Jump touch target at least 44px');
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
      } else check(!visible(jump), 'Jump hidden on desktop or in 2D');
      check(goal.hidden, 'dismiss clears the scene');
      check(JSON.parse(localStorage.getItem('darecade-v1')).welcomeDismissed, 'dismiss survives saving');
      check(profile.progress.rounds===0 && !profile.progress.unlockedHats.includes(2), 'dismiss does not complete or grant reward');
      const menu=find('.lobby-dock [data-open="phone-menu"]');
      check(visible(menu) && hit(menu), 'Menu touch target unobstructed');
      menu.focus(); menu.click();
      check(!visible(jump), 'Jump hidden behind open menu');
      const items=[...document.querySelectorAll('.simple-menu .menu-choice')];
      check(items.length===${menuPages["phone-menu"].actions.length + 1}, 'all destinations on first menu page');
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
    "<head>" + script,
  );
  return createServer((req, res) => {
    const path = new URL(req.url || "/", "http://localhost").pathname;
    if (path === "/fixture" || (!automated && path === "/")) {
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

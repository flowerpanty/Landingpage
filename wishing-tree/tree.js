(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const API = '/api/wishing-tree/letters';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const decorations = [
    { id: 'letter', name: '작은 편지', color: '#e6d6b1' },
    { id: 'star', name: '소원 별', color: '#dab873' },
    { id: 'bauble', name: '빨간 오너먼트', color: '#ad4c44' },
    { id: 'gift', name: '마음 선물', color: '#8eaa8b' }
  ];
  const examples = [
    { id: 'example-1', author: '디어 디셈버', to: '이 편지를 발견한 당신', message: '우연히 이 작은 숲에 도착한 당신을 환영해요.\n\n고마웠던 사람에게, 미래의 나에게, 혹은 아직 만나지 못한 누군가에게. 전하고 싶은 마음을 편지로 남겨주세요.\n\n이 나무는 우리의 마음으로 자랍니다.', decoration: 'letter', example: true },
    { id: 'example-2', author: '디어 디셈버', to: '작은 소원을 가진 당신', message: '아주 커다란 소원이 아니어도 괜찮아요.\n\n따뜻한 밥 한 끼, 오랜만에 듣는 반가운 목소리, 걱정 없이 푹 자는 밤.\n\n당신의 작고 다정한 소원이 이 겨울에 꼭 이루어지기를.', decoration: 'star', example: true },
    { id: 'example-3', author: '디어 디셈버', to: '올해도 애쓴 당신', message: '여기까지 오느라 참 수고 많았어요.\n\n빛나는 날도, 조금은 흐렸던 날도 모두 당신의 한 해였으니까요.\n\n올겨울에는 스스로에게도 다정한 말을 건네주세요. 당신의 크리스마스를 응원할게요.', decoration: 'bauble', example: true },
    { id: 'example-4', author: '디어 디셈버', to: '마음을 나누고 싶은 당신', message: '이곳의 가장 큰 선물은 누군가 남겨둔 진심이에요.\n\n트리에 편지를 달면 이곳에 오는 누구나 읽을 수 있어요. 이름 대신 별명을 남겨도 좋아요.\n\n당신의 작은 편지가 누군가에게 따뜻한 선물이 될 거예요.', decoration: 'gift', example: true },
    { id: 'example-5', author: '디어 디셈버', to: '멀리 있는 소중한 사람', message: '같은 곳에 있지 않아도, 같은 트리를 바라볼 수 있도록.\n\n아래의 ‘이 트리 함께 나누기’로 이 작은 숲의 주소를 전해보세요.\n\n멀리 떨어져 있어도 우리의 마음은 가까이 있으니까요.', decoration: 'letter', example: true },
    { id: 'example-6', author: '디어 디셈버', to: '내일의 나', message: '한 해가 끝나기 전에 나에게 편지를 써보는 건 어때요?\n\n기억하고 싶은 순간, 지키고 싶은 약속, 내년에도 잊지 않을 마음.\n\n나뭇가지 사이에 살며시 걸어두세요.', decoration: 'star', example: true }
  ];
  let letters = [], total = 0, currentPage = 1, pages = 1, loadSequence = 0, loading = false, currentLetter = null, submitting = false;
  let draftId = crypto.randomUUID(), toastTimer, renderedData = '';
  const safeRead = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const safeWrite = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* The session stays usable when storage is unavailable. */ } };
  const savedOwnLetters = safeRead('dear-december-own-letters', {});
  const ownLetters = savedOwnLetters && typeof savedOwnLetters === 'object' && !Array.isArray(savedOwnLetters) ? savedOwnLetters : {};
  const savedDraft = safeRead('dear-december-draft', {});
  const draft = savedDraft && typeof savedDraft === 'object' && !Array.isArray(savedDraft) ? savedDraft : {};
  if (typeof draft.requestId === 'string' && /^[a-f0-9-]{36}$/i.test(draft.requestId)) draftId = draft.requestId;

  function ornamentSvg(type) {
    const top = '<svg viewBox="0 0 60 72" aria-hidden="true"><path d="M30 0v15" stroke="#c9ad72" stroke-width="1" fill="none"/>';
    if (type === 'star') return top + '<path d="m30 14 6.6 14.1 15.4 2.2-11 10.8 2.6 15.3L30 49.2l-13.6 7.2L19 41.1 8 30.3l15.4-2.2Z" fill="#ddbc77" stroke="#f6d894" stroke-width=".7"/><path d="m30 18 0 25-13 10 3.5-14-9-7 16-2Z" fill="#f0d391" opacity=".55"/><path d="m30 18 6 12 13 2-11 7 3 14-11-10Z" fill="#c6a05c" opacity=".6"/><circle cx="30" cy="36" r="2" fill="#ffedb6"/></svg>';
    if (type === 'bauble') return top + '<path d="M24 15h12v7H24Z" rx="2" fill="#bda46a"/><circle cx="30" cy="41" r="21" fill="#a24a43"/><path d="M30 21a20 20 0 0 0 0 40c-16-7-15-31 0-40Z" fill="#c27160" opacity=".65"/><ellipse cx="22" cy="31" rx="3" ry="5" fill="#edbb99" opacity=".4" transform="rotate(30 22 31)"/><path d="m30 29 2.6 7.5 7.9.2-6.2 4.8 2.3 7.5-6.6-4.4-6.6 4.4 2.3-7.5-6.2-4.8 7.9-.2Z" fill="#e3c28b"/><path d="M12 48q18 9 36 0" fill="none" stroke="#d8a975" stroke-width=".65" opacity=".6"/></svg>';
    if (type === 'gift') return top + '<path d="M13 31h34v30H13Z" fill="#78927a"/><path d="M10 27h40v9H10Z" fill="#92a58c"/><path d="M27 27h7v34h-7Z" fill="#dfc58c"/><path d="M30 27C9 28 17 9 27 19l3 8Zm0 0c21 1 13-18 3-8l-3 8Z" fill="none" stroke="#dfc58c" stroke-width="3"/><path d="M30 28 21 41m9-13 10 12" fill="none" stroke="#dfc58c" stroke-width="2"/><path d="M13 59h34v3H13Z" fill="#3e5f49" opacity=".5"/></svg>';
    return top + '<rect x="6" y="25" width="48" height="32" rx="2" fill="#e6d6b1"/><path d="m6 56 19-17h10l19 17" fill="#d6c49e"/><path d="m6 26 24 18 24-18" fill="#f2e6c9" stroke="#c3b18c" stroke-width=".7"/><circle cx="30" cy="44" r="5.8" fill="#99483c"/><path d="m30 40 1 2.3 2.5.3-1.8 1.7.4 2.5-2.1-1.2-2.2 1.2.4-2.5-1.8-1.7 2.5-.3Z" fill="#d3aa72"/></svg>';
  }

  function buildTree() {
    let seed = 20261225;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const svg = ['<defs><linearGradient id="pine" x1="0" y1="0" x2="1" y2=".25"><stop stop-color="#244c39"/><stop offset=".42" stop-color="#365842"/><stop offset=".7" stop-color="#244733"/><stop offset="1" stop-color="#17372a"/></linearGradient><linearGradient id="pine-top" x1="0" x2="1"><stop stop-color="#3c5e43"/><stop offset=".5" stop-color="#507153"/><stop offset="1" stop-color="#254932"/></linearGradient><linearGradient id="pot" x1="0" x2="1"><stop stop-color="#623b30"/><stop offset=".4" stop-color="#8b5340"/><stop offset="1" stop-color="#583a2e"/></linearGradient><radialGradient id="light"><stop stop-color="#fff7c9"/><stop offset=".22" stop-color="#ffe4a2" stop-opacity=".7"/><stop offset="1" stop-color="#eab75d" stop-opacity="0"/></radialGradient><radialGradient id="star-aura"><stop stop-color="#f8cd6d" stop-opacity=".2"/><stop offset="1" stop-color="#e9c879" stop-opacity="0"/></radialGradient><linearGradient id="gold" x1="0" x2=".9" y2="1"><stop stop-color="#ffedba"/><stop offset=".5" stop-color="#dcba71"/><stop offset="1" stop-color="#a87c3b"/></linearGradient></defs>'];
    svg.push('<ellipse cx="303" cy="707" rx="212" ry="23" fill="#091711" opacity=".4"/><ellipse cx="305" cy="701" rx="180" ry="11" fill="#83917c" opacity=".09"/><path d="M282 568h36v105h-36Z" fill="#614a31"/><path d="M254 648h92l-11 63h-70Z" fill="url(#pot)"/><path d="M250 646h100v12H250Z" fill="#9b6850"/><path d="M256 670h87v3h-87Z" fill="#c6a266" opacity=".6"/><path d="M275 661h4v45h-4Zm26 0h3v46h-3Zm24 0h3v45h-3Z" fill="#be8b60" opacity=".18"/>');
    const tiers = [{t:85,b:250,w:85},{t:155,b:335,w:140},{t:235,b:425,w:191},{t:325,b:520,w:234},{t:416,b:620,w:275}];
    for (let n = tiers.length - 1; n >= 0; n--) {
      const {t,b,w} = tiers[n];
      let path = `M300 ${t} Q${300-w*.28} ${t+(b-t)*.48} ${300-w} ${b-4}`;
      for(let j=0;j<14;j++) {
        const x=300-w+(2*w*(j+1)/14), y=b+((j%2)?0:7)+random()*9;
        path+=`q${w/14*.48} 10 ${w/14} -2 Q${x-w/28} ${y-6} ${x} ${y}`;
      }
      path+=`Q${300+w*.28} ${t+(b-t)*.48} 300 ${t}Z`;
      svg.push(`<path d="${path}" fill="url(#pine)"/><path d="M${300-w} ${b}q${w} 46 ${w*2} 0" fill="none" stroke="#0c251b" stroke-width="8" opacity=".28"/>`);
      for(let row=0;row<12;row++) {
        const y=t+20+row*((b-t-28)/12), half=w*((y-t)/(b-t));
        for(const side of [-1,1]) {
          const endX=300+side*half, endY=y+18+random()*9;
          svg.push(`<path d="M300 ${y-8} Q${300+side*half*.55} ${y+20} ${endX} ${endY}" stroke="${side<0?'#6e8660':'#142f20'}" opacity=".38" stroke-width="1.3" fill="none"/>`);
          for(let k=0;k<half/5;k++) {
            const f=k/(half/5), x=300+side*(half*f), yy=y-6+f*26;
            const len=8+random()*18;
            svg.push(`<path d="M${x.toFixed(1)} ${yy.toFixed(1)}l${(side*(len*.65+random()*5)).toFixed(1)} ${(-len*.6+random()*5).toFixed(1)}m${(-side*2).toFixed(1)} 5l${(side*len*.6).toFixed(1)} ${(len*.6).toFixed(1)}" fill="none" stroke="${['#76916a','#52774f','#8b9b6f','#254b32'][Math.floor(random()*4)]}" opacity="${(.16+random()*.35).toFixed(2)}" stroke-width="${(.6+random()*.7).toFixed(1)}" stroke-linecap="round"/>`);
          }
        }
      }
    }
    const swags = [
      [259,193,340,204], [222,279,380,296], [177,371,426,389], [129,465,468,484], [81,561,520,578]
    ];
    for(const [x1,y1,x2,y2] of swags) {
      const cx=(x1+x2)/2, cy=y1+85;
      svg.push(`<path d="M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}" fill="none" stroke="#bc9e59" stroke-width="1.2" opacity=".5"/>`);
      const count=Math.round((x2-x1)/18);
      for(let i=0;i<=count;i++) {
        const t=i/count, x=(1-t)**2*x1+2*(1-t)*t*cx+t*t*x2, y=(1-t)**2*y1+2*(1-t)*t*cy+t*t*y2;
        svg.push(`<g class="fairy-light" style="--duration:${(1.7+random()*2).toFixed(1)}s;--delay:-${(random()*4).toFixed(1)}s"><circle cx="${x}" cy="${y+3}" r="14" fill="url(#light)"/><path d="M${x} ${y}v5" stroke="#9d8b4f" stroke-width="1"/><ellipse cx="${x}" cy="${y+6}" rx="2.1" ry="3" fill="#fff0bb"/></g>`);
      }
    }
    for(const [x,y,r] of [[282,217,6],[335,264,7],[246,331,8],[377,375,7],[208,429,8],[320,454,7],[421,499,9],[168,534,8],[277,563,8],[366,599,8],[473,588,7]]) {
      svg.push(`<path d="M${x} ${y-18}v12" stroke="#b0965a" stroke-width=".7"/><circle cx="${x}" cy="${y}" r="${r}" fill="${random()>.5?'#a35d44':'#ceb37a'}"/><circle cx="${x-2}" cy="${y-2}" r="${r/3}" fill="#f3d49a" opacity=".4"/>`);
    }
    svg.push('<circle cx="300" cy="88" r="65" fill="url(#star-aura)"/><g class="top-star"><path d="m300 57 9.8 20.7 22.7 3.4-16.3 16 3.8 22.7L300 109l-20 10.8 3.8-22.7-16.3-16 22.7-3.4Z" fill="url(#gold)"/><path d="m300 59 0 36-19 22 4-20-15-14 22-3Z" fill="#ffe7ac" opacity=".6"/><path d="m300 59 8 22 23 2-18 14 5 20-18-22Z" fill="#bd944d" opacity=".45"/></g><path d="M300 32v12m0 90v8m-46-54h-10m102 0h10m-89-33-6-6m72 0 6-6" stroke="#d6bb7c" opacity=".5" stroke-width="1"/>');
    svg.push('<g transform="translate(142 649) rotate(-6)"><rect width="57" height="49" y="11" rx="2" fill="#914b3c"/><path d="M-3 9h63v13H-3Z" fill="#ae6650"/><path d="M24 9h9v52h-9Z" fill="#cdb77d"/><path d="M29 9C4 8 11-10 23 0l6 9Zm0 0c25-1 18-19 6-9l-6 9Z" fill="none" stroke="#cfb77d" stroke-width="3"/></g><g transform="translate(380 667) rotate(5)"><path d="M0 0h65v35H0Z" fill="#d0c4a0"/><path d="M-3-3h71v10H-3Z" fill="#e4d6b5"/><path d="M27-3h9v39h-9Z" fill="#7d8f69"/><path d="M31-2C7-2 16-19 25-11l6 9Zm0 0c24 0 15-17 6-9l-6 9Z" fill="none" stroke="#8f9a75" stroke-width="3"/></g><g transform="translate(432 641) rotate(7)"><path d="M0 0h42v59H0Z" fill="#5e7559"/><path d="M-3-3h48v12H-3Z" fill="#7f9170"/><path d="M17-3h7v63h-7Z" fill="#bc9f65"/><path d="M20-3C2-5 8-18 16-11l4 8Zm0 0c18-2 12-15 4-8l-4 8Z" fill="none" stroke="#c7ac74" stroke-width="2.5"/></g>');
    $('#christmas-tree').innerHTML = svg.join('');
    const stars = document.createDocumentFragment(), snow = document.createDocumentFragment();
    for(let i=0;i<65;i++) {
      const el=document.createElement('i');el.className='sky-star';
      el.style.cssText=`left:${random()*100}%;top:${random()*90}%;width:${random()>0.9?3:1.5}px;height:${random()>0.9?3:1.5}px;--opacity:${.2+random()*.5};--duration:${2+random()*5}s`;stars.append(el);
    }
    for(let i=0;i<43;i++) {
      const el=document.createElement('i');el.className='snowflake';
      el.style.cssText=`left:${random()*100}%;--size:${1.5+random()*2.5}px;--duration:${12+random()*20}s;--delay:-${random()*35}s;--opacity:${.12+random()*.35};--drift:${-45+random()*90}px`;snow.append(el);
    }
    $('#stars').append(stars);$('#snow').append(snow);
  }

  function toast(message) { clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>{$('#toast').hidden=true;},4500); }
  const slots = [[50,26],[42,34],[57,36],[35,43],[48,46],[65,45],[28,52],[40,55],[55,54],[70,54],[23,63],[35,65],[48,63],[62,65],[77,64],[16,74],[28,76],[40,75],[53,76],[65,75],[78,76],[35,36],[58,69],[57,59]];
  function renderLetters(newId) {
    const list = total ? letters : examples;
    const fragment=document.createDocumentFragment(), taken = new Set();
    list.forEach((letter,index)=>{
      let slot=total? index: [3,2,12,9,17,20][index];
      while(taken.has(slot)) slot=(slot+1)%slots.length;
      taken.add(slot);
      const [x,y]=slots[slot], button=document.createElement('button');
      button.type='button';button.className='ornament'+(letter.id===newId?' ornament-new':'');
      button.dataset.decoration=letter.decoration;button.dataset.slotX=x;button.dataset.slotY=y;
      button.style.cssText=`--x:${x}%;--y:${y}%;--tilt:${(index%3-1)*8}deg`;
      button.setAttribute('aria-label',`${letter.example?'미리보기: ':''}${letter.author}님의 편지 읽기`);
      button.innerHTML=ornamentSvg(letter.decoration);
      const tooltip=document.createElement('span');tooltip.className='ornament-tooltip';tooltip.textContent=letter.example?'미리보기 편지':`${letter.author}님의 마음`;button.append(tooltip);
      button.addEventListener('click',()=>openLetter(letter));fragment.append(button);
    });
    $('#ornaments').replaceChildren(fragment);
    $('#tree-stage').dispatchEvent(new Event('letterschange'));
    $('#tree-count').replaceChildren();
    if(total) { const strong=document.createElement('strong');strong.textContent=total.toLocaleString('ko-KR');$('#tree-count').append(strong,'개의 마음이 이 겨울을 밝히고 있어요'); }
    else $('#tree-count').textContent='첫 편지를 기다리는 트리 · 장식을 눌러 미리 읽어보세요';
    $('#tree-navigation').hidden=pages<=1;$('#tree-page').textContent=`${currentPage} / ${pages}`;
    $('#previous-tree').disabled=currentPage<=1;$('#next-tree').disabled=currentPage>=pages;
  }

  async function request(url, options={}) {
    const response=await fetch(url,{...options,signal:AbortSignal.timeout(12000)});
    let payload;try { payload=await response.json(); } catch { throw new Error('트리에 연결하지 못했어요. 잠시 뒤 다시 시도해주세요.'); }
    if(!response.ok) throw new Error(payload.message||'마음을 전하지 못했어요. 잠시 뒤 다시 시도해주세요.');
    return payload;
  }
  async function loadLetters({quiet=false,newId}={}) {
    const seq=++loadSequence;loading=true;
    if(!quiet) $('#tree-stage').setAttribute('aria-busy','true');
    try {
      const data=await request(`${API}?page=${currentPage}`);
      if(seq!==loadSequence)return;
      letters=data.items;total=data.total;pages=data.pages;currentPage=data.page;
      const fingerprint=JSON.stringify(data);
      if(fingerprint!==renderedData||newId){renderLetters(newId);renderedData=fingerprint;}
      $('#connection-notice').hidden=true;
    } catch(error) {
      if(seq!==loadSequence)return;
      $('#connection-message').textContent=total?'새 편지를 불러오지 못했어요. 현재 편지는 읽을 수 있어요.':'지금은 미리보기예요. 편지를 남기려면 다시 연결해주세요.';
      $('#connection-notice').hidden=false;
      if(!quiet && !total) renderLetters();
    } finally { if(seq===loadSequence){loading=false;$('#tree-stage').removeAttribute('aria-busy');} }
  }

  function openDialog(dialog) { dialog.showModal();document.body.style.overflow='hidden';document.documentElement.style.overflowY='hidden'; }
  function openLetter(letter) {
    currentLetter=letter;$('#read-decoration').innerHTML=ornamentSvg(letter.decoration);
    $('#read-kicker').textContent=letter.example?'미리보기 편지 · DEAR DECEMBER':'SOMEONE LEFT A LITTLE WARMTH';
    $('#read-to').textContent=`To. ${letter.to||'이 편지를 읽는 당신'}`;$('#read-message').textContent=letter.message;
    $('#read-author').textContent=letter.author;
    $('#read-date').textContent=letter.createdAt?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric'}).format(new Date(letter.createdAt)):'당신을 기다리는 겨울';
    $('#delete-letter').hidden=!ownLetters[letter.id];$('#delete-letter').textContent='내 편지 지우기';$('#delete-letter').disabled=false;
    const available=total?letters:examples;$('#read-another').disabled=available.length<2;
    if(!$('#read-dialog').open)openDialog($('#read-dialog'));
  }
  document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    dialog.addEventListener('close',()=>{if(!document.querySelector('dialog[open]')){document.body.style.overflow='';document.documentElement.style.overflowY='';}});
    dialog.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const controls=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')];
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    });
  });

  $('#decoration-options').innerHTML=decorations.map((d,i)=>`<label class="decoration-option"><input type="radio" name="decoration" value="${d.id}" ${i===0?'checked':''}>${ornamentSvg(d.id)}<span>${d.name}</span></label>`).join('');
  $('#letter-to').value=typeof draft.to==='string'?draft.to:'';$('#letter-from').value=typeof draft.author==='string'?draft.author:'';$('#letter-message').value=typeof draft.message==='string'?draft.message:'';
  if(decorations.some(d=>d.id===draft.decoration)) $(`input[name="decoration"][value="${draft.decoration}"]`).checked=true;
  const readForm=()=>({to:$('#letter-to').value.trim(),author:$('#letter-from').value.trim(),message:$('#letter-message').value.trim(),decoration:$('input[name="decoration"]:checked').value});
  $('#character-count').textContent=$('#letter-message').value.length;
  $('#letter-form').addEventListener('input',()=>{
    draftId=crypto.randomUUID();$('#character-count').textContent=$('#letter-message').value.length;safeWrite('dear-december-draft',{...readForm(),requestId:draftId});$('#form-error').hidden=true;
  });
  $('#write-button').addEventListener('click',()=>{openDialog($('#compose-dialog'));});
  $('#read-another').addEventListener('click',()=>{const available=(total?letters:examples).filter(l=>l.id!==currentLetter?.id);if(available.length)openLetter(available[Math.floor(Math.random()*available.length)]);});
  $('#letter-form').addEventListener('submit',async event=>{
    event.preventDefault();if(submitting)return;
    if(!$('#letter-form').reportValidity())return;
    const fields=readForm();if(fields.message.length<2||!fields.author){$('#form-error').textContent='이름과 두 글자 이상의 마음을 남겨주세요.';$('#form-error').hidden=false;return;}
    submitting=true;$('#letter-form').querySelectorAll('input,textarea,button').forEach(control=>{control.disabled=true;});$('#submit-letter').textContent='마음을 나뭇가지에 걸고 있어요…';$('#form-error').hidden=true;
    const payload={...fields,requestId:draftId,publicConsent:true};
    try {
      const result=await request(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      ownLetters[result.letter.id]=result.deleteToken;safeWrite('dear-december-own-letters',ownLetters);
      $('#compose-dialog').close();$('#letter-message').value='';$('#letter-to').value='';$('#public-consent').checked=false;$('#character-count').textContent='0';draftId=crypto.randomUUID();safeWrite('dear-december-draft',{...readForm(),requestId:draftId});
      currentPage=1;await loadLetters({newId:result.letter.id});toast('당신의 마음이 트리에 걸렸어요. 따뜻한 편지 고마워요.');
    } catch(error) {$('#form-error').textContent=error.message;$('#form-error').hidden=false;}
    finally{submitting=false;$('#letter-form').querySelectorAll('input,textarea,button').forEach(control=>{control.disabled=false;});$('#submit-letter').innerHTML='내 마음 트리에 걸기 <span aria-hidden="true">✧</span>';}
  });
  $('#delete-letter').addEventListener('click',async()=>{
    const letter=currentLetter,token=ownLetters[letter?.id];if(!token)return;
    if($('#delete-letter').textContent!=='한 번 더 눌러 지우기'){$('#delete-letter').textContent='한 번 더 눌러 지우기';return;}
    $('#delete-letter').disabled=true;
    try{await request(`${API}/${encodeURIComponent(letter.id)}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});delete ownLetters[letter.id];safeWrite('dear-december-own-letters',ownLetters);$('#read-dialog').close();await loadLetters();toast('내 편지를 트리에서 내려두었어요.');}
    catch(error){toast(error.message);$('#delete-letter').disabled=false;}
  });
  $('#previous-tree').addEventListener('click',()=>{if(currentPage>1&&!loading){currentPage--;loadLetters();}});
  $('#next-tree').addEventListener('click',()=>{if(currentPage<pages&&!loading){currentPage++;loadLetters();}});
  $('#retry-button').addEventListener('click',()=>loadLetters());
  $('#share-button').addEventListener('click',async()=>{
    const url=new URL('/wishing-tree/',location.origin).href;
    try{if(navigator.share){await navigator.share({title:'Dear December — 우리의 크리스마스트리',text:'이 겨울, 당신의 마음도 걸어주세요.',url});}else{await navigator.clipboard.writeText(url);toast('트리 주소를 복사했어요. 소중한 사람에게 전해주세요.');}}
    catch(error){if(error.name!=='AbortError')toast(`이 주소를 나눠주세요: ${url}`);}
  });
  function setSnow(enabled){document.body.classList.toggle('snow-paused',!enabled);$('#snow-toggle').setAttribute('aria-pressed',String(enabled));$('#snow-toggle').setAttribute('aria-label',enabled?'눈 내리기 끄기':'눈 내리기 켜기');}
  setSnow(safeRead('dear-december-snow',!reducedMotion));
  $('#snow-toggle').addEventListener('click',()=>{const on=$('#snow-toggle').getAttribute('aria-pressed')!=='true';setSnow(on);safeWrite('dear-december-snow',on);if(on&&reducedMotion)toast('기기의 동작 줄이기 설정에 따라 눈 애니메이션은 쉬고 있어요.');});

  // An original music-box arrangement of the public-domain melody Jingle Bells.
  // Synthesis starts only in response to the visitor's music button.
  let audioContext=null,musicTimer=null,musicOn=false,nextNoteTime=0,noteIndex=0;
  const E=76,D=74,C=72,F=77,G=79;
  const melody=[[E,1],[E,1],[E,2],[E,1],[E,1],[E,2],[E,1],[G,1],[C,1.5],[D,.5],[E,4],[F,1],[F,1],[F,1.5],[F,.5],[F,1],[E,1],[E,1],[E,.5],[E,.5],[E,1],[D,1],[D,1],[E,1],[D,2],[G,2],[E,1],[E,1],[E,2],[E,1],[E,1],[E,2],[E,1],[G,1],[C,1.5],[D,.5],[E,4],[F,1],[F,1],[F,1.5],[F,.5],[F,1],[E,1],[E,1],[E,.5],[E,.5],[G,1],[G,1],[F,1],[D,1],[C,4],[null,4]];
  function chime(note,time,length){
    const freq=440*2**((note-69)/12);
    for(const [multiple,level] of [[1,.065],[2,.018],[3,.005]]){
      const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.value=freq*multiple;
      gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(level,time+.008);gain.gain.exponentialRampToValueAtTime(.0001,time+Math.min(2.6,length+1.1));osc.connect(gain);gain.connect(audioContext.destination);osc.start(time);osc.stop(time+Math.min(2.7,length+1.2));
    }
  }
  function scheduleMusic(){if(!musicOn||!audioContext)return;while(nextNoteTime<audioContext.currentTime+.25){const[note,beats]=melody[noteIndex];const length=beats*.38;if(note)chime(note,nextNoteTime,length);nextNoteTime+=length;noteIndex=(noteIndex+1)%melody.length;}}
  async function stopMusic(){musicOn=false;clearInterval(musicTimer);$('#music-toggle').setAttribute('aria-pressed','false');$('#music-label').textContent='캐럴 켜기';const previous=audioContext;audioContext=null;if(previous)await previous.close().catch(()=>{});}
  $('#music-toggle').addEventListener('click',async()=>{
    if(musicOn){await stopMusic();return;}
    try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('audio_unavailable');audioContext=new Audio();await audioContext.resume();musicOn=true;noteIndex=0;nextNoteTime=audioContext.currentTime+.06;scheduleMusic();musicTimer=setInterval(scheduleMusic,100);$('#music-toggle').setAttribute('aria-pressed','true');$('#music-label').textContent='캐럴 끄기';}
    catch{await stopMusic();toast('이 브라우저에서 음악을 재생할 수 없어요. 다시 시도해주세요.');}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&musicOn)stopMusic();if(!document.hidden)loadLetters({quiet:true});});
  window.addEventListener('storage',event=>{if(event.key==='dear-december-own-letters'){Object.keys(ownLetters).forEach(key=>delete ownLetters[key]);Object.assign(ownLetters,safeRead('dear-december-own-letters',{}));}});
  buildTree();loadLetters();setInterval(()=>{if(!document.hidden&&!submitting&&!loading)loadLetters({quiet:true});},15000);
})();

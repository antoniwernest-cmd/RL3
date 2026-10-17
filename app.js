(function(){
 'use strict';
 const D=window.MATH_CLOZE_DATA,O=window.SCHOOL_OBJECTS,C=window.MathClozeCore,$=id=>document.getElementById(id),KEY='rocky-luna-math-v1';
 const palette=['#e3edfc','#ffe4d8','#e1f1eb','#fff0d6','#e9e7fa','#e4f1f9'];
 const voiceSpeeds=['0.5','0.65','0.82','1'];
 const endingWords=new Set(Object.values(D).flatMap(rows=>rows.flatMap(row=>[row.word,...row.blanks.map(b=>b.word)])));
 let state={version:1,selected:'',profiles:{},speed:'0.82'},active=false,profile=null,item=null,entry=null,answers=[],activeBlank=0,choiceOrder=[];
 let drag=null,hoverBlank=null,suppressClickUntil=0,lastTick=0,dateTimer=null,fitPending=false,touchStartY=null;
 let rideProfile='',rideCount=-1,rideToken=0,rideTimers=[];
 try{const saved=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('math-cloze-v2')||localStorage.getItem('math-cloze-v1')||'null');if(saved?.version===1&&saved.profiles&&typeof saved.profiles==='object'){state=saved;if(!C.objectName(O,state.selected))state.selected='';}}catch(e){notice('Saved work could not be opened. You can still play and download Excel.');}
 state.speed=voiceSpeeds.includes(String(state.speed))?String(state.speed):'0.82';
 function notice(text){$('storage-notice').textContent=text;$('storage-notice').hidden=false;requestFit();}
 function requestFit(){if(!active||fitPending)return;fitPending=true;requestAnimationFrame(()=>{fitPending=false;if(active)window.fitMathActivity?.($('activity'));});}
 function refreshDate(){clearTimeout(dateTimer);const now=new Date(),date=window.notebookDate(now);$('notebook-date').textContent=date.text;$('notebook-date').setAttribute('datetime',date.iso);dateTimer=setTimeout(refreshDate,Math.max(1000,new Date(now.getFullYear(),now.getMonth(),now.getDate()+1)-now+100));requestFit();}
 function save(){
  if(active&&entry&&lastTick){const now=performance.now();entry.seconds=(entry.seconds||0)+(now-lastTick)/1000;lastTick=now;}
  try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){notice('This browser cannot save progress. Download Excel before closing.');}
 }
 function getProfile(id){const p=state.profiles[id]??={level:'A',positions:{},orders:{},progress:{},attempts:[]};if(!C.levels.includes(p.level))p.level='A';p.positions??={};p.orders??={};p.progress??={};if(!Array.isArray(p.attempts))p.attempts=[];if(!window.MATH_CLOZE_SECTIONS.some(s=>s.id===p.section))p.section=state.section||'excite';const grade=window.MATH_CLOZE_SECTIONS.find(s=>s.id===p.section).grade;if(!['all',...window.MATH_CLOZE_UNITS.filter(u=>u.grade===grade).map(u=>u.id)].includes(p.unit))p.unit='all';migrateProfile(p);return p;}
 function migrateProfile(p){p.history??={};for(const [id,e]of Object.entries(p.progress)){if((e.contentRevision||1)>=2)continue;const row=window.MATH_CLOZE_PREVIOUS_DATA[id];if(!row)continue;p.history[id+'@'+(e.contentRevision||1)]??={item:id,revision:e.contentRevision||1,entry:JSON.parse(JSON.stringify(e))};delete p.progress[id];}for(const a of p.attempts)a.revision??=1;}
 function orderKey(){return profile.level+'|'+profile.section+'|'+(profile.unit||'all');}
 function list(){return D[profile.level].filter(r=>r.section===profile.section&&(profile.unit==='all'||r.unit===profile.unit));}
 function position(){return Math.max(0,Math.min(list().length-1,Number(profile.positions[orderKey()])||0));}
 function order(){
  const key=orderKey(),rows=list(),n=rows.length;let a=profile.orders[key];
  const valid=Array.isArray(a)&&a.length===n&&new Set(a).size===n&&!a.some(x=>!Number.isInteger(x)||x<0||x>=n);
  profile.orderVersions??={};if(valid&&profile.orderVersions[key]===2)return a;
  const keepCurrent=valid||Number.isInteger(profile.positions[key]),at=position();
  if(keepCurrent){
   const previous=valid?a:Array.from({length:n},(_,i)=>i),prefix=previous.slice(0,at+1),seen=new Set(prefix),remaining=rows.map((_,i)=>i).filter(i=>!seen.has(i));
   a=prefix.concat(C.balancedOrder(remaining.map(i=>rows[i]),null,rows[prefix.at(-1)]?.pattern).map(i=>remaining[i]));
  }else a=C.balancedOrder(rows);
  profile.orders[key]=a;profile.orderVersions[key]=2;profile.positions[key]=keepCurrent?at:0;
  return a;
 }
 function feedback(text,type=''){$('feedback').textContent=text;$('feedback').className='feedback '+type;requestFit();}
 let voiceToken=0,speechTimer=null,currentUtterance=null;
 function voicePageKey(){return active&&item&&profile?[state.selected,profile.section,profile.level,profile.unit,item.id,position(),$('activity').dataset.view||'sentence'].join('|'):'';}
 function stop(showMessage=false){
  voiceToken++;if(speechTimer!==null){clearTimeout(speechTimer);speechTimer=null;}
  if(currentUtterance){currentUtterance.onstart=null;currentUtterance.onend=null;currentUtterance.onerror=null;currentUtterance=null;}
  if('speechSynthesis'in window)window.speechSynthesis.cancel();
  if(showMessage===true)$('voice-note').textContent='Voice stopped. Press Listen to read again.';
 }
 function speak(){
  stop();if(!active||document.hidden||!$('section-gate').hidden)return;
  if(!('speechSynthesis'in window)){$('voice-note').textContent='Voice is unavailable here. A teacher can read the question.';return;}
  const token=voiceToken,key=voicePageKey(),row=item,readingEntry=entry;
  const stem=String(row.format==='multiple-choice'?(row.question||row.sentence):row.sentence).trim();
  // Picture labels are visible; their hidden descriptions belong to other scenes.
  const choices=choiceOrder.map((value,i)=>String.fromCharCode(65+i)+'. '+value).join('. ');
  const labels=choiceOrder.map((_,i)=>String.fromCharCode(65+i)).join(', ');
  const text=stem.replace(/[.!?]$/, '')+(stem.endsWith('?')?'? ':'. ')+(row.format==='picture-match'?'Choose the matching picture. Picture choices: '+labels+'.':'Options. '+choices);
  const rate=Number(state.speed)||.82;
  $('voice-note').textContent='Preparing this question… Press Stop to cancel.';
  // Let native cancellation finish; an outdated page can never start this timer.
  speechTimer=setTimeout(()=>{
   speechTimer=null;
   if(token!==voiceToken||key!==voicePageKey()||document.hidden||!$('section-gate').hidden)return;
   const synth=window.speechSynthesis;synth.cancel();if(synth.paused&&typeof synth.resume==='function')synth.resume();
   const u=new SpeechSynthesisUtterance(text);currentUtterance=u;u.lang='en-CA';u.rate=rate;
   const voices=synth.getVoices();u.voice=voices.find(v=>/^en[-_]CA/i.test(v.lang))||voices.find(v=>/^en[-_](US|GB)/i.test(v.lang))||voices.find(v=>/^en/i.test(v.lang))||null;
   const valid=()=>token===voiceToken&&currentUtterance===u&&key===voicePageKey()&&!document.hidden&&$('section-gate').hidden;
   u.onstart=()=>{if(valid())$('voice-note').textContent='Reading this question… Press Stop at any time.';};
   u.onend=()=>{if(valid()){currentUtterance=null;$('voice-note').textContent='Press Listen to read this question again.';}};
   u.onerror=()=>{if(valid()){currentUtterance=null;$('voice-note').textContent='Press Listen to start this question. Check the volume.';}};
   readingEntry.listens=(readingEntry.listens||0)+1;save();
   try{synth.speak(u);}catch(e){if(valid()){currentUtterance=null;$('voice-note').textContent='Press Listen to start this question. Check the volume.';}}
  },60);
 }

 function changeVoiceSpeed(){
  const wasReading=speechTimer!==null||currentUtterance!==null;
  stop();state.speed=voiceSpeeds.includes($('speed').value)?$('speed').value:'0.82';$('speed').value=state.speed;save();
  if(wasReading)speak();else $('voice-note').textContent='Speed changed. Press Listen to read this question.';
 }

 const sectionCharacters={excite:{name:'Excite',grade:2,cat:'Rocky',image:'assets/rocky.webp?v=3',emoji:'⚡'},inspire:{name:'Inspire',grade:3,cat:'Luna',image:'assets/luna.webp?v=3',emoji:'🌟'}};
 let pendingSection=null,pendingEntry=null,gateReturnFocus=null,confirmedSection=null;
 function requestSection(id,afterConfirm=null,trigger=null){
  const s=sectionCharacters[id];if(!s)return;stop();cancelDrag();pendingSection=id;pendingEntry=afterConfirm;gateReturnFocus=trigger||document.activeElement;
  $('section-gate').dataset.section=id;$('section-gate-cat').src=s.image;$('section-gate-cat').alt=s.cat;$('section-gate-name').textContent=s.cat;
  $('section-gate-grade').textContent=s.emoji+' '+s.name+' · Grade '+s.grade;$('section-gate-title').textContent='You’re entering '+s.name+'!';
  $('section-gate-question').textContent='Would you like to proceed?';$('section-gate-proceed').textContent='Yes, enter '+s.name+' →';
  $('landing').inert=true;$('activity').inert=true;$('section-gate').hidden=false;$('section-gate-proceed').focus?.();
 }
 function closeSectionGate(restoreFocus=true){$('section-gate').hidden=true;$('landing').inert=false;$('activity').inert=false;pendingSection=null;pendingEntry=null;if(restoreFocus)gateReturnFocus?.focus?.();}
 function confirmSection(){const id=pendingSection,enter=pendingEntry;if(!id)return;closeSectionGate(false);chooseSection(id);confirmedSection=id;if(enter)enter();else{gateReturnFocus?.focus?.();requestFit();}}
 function chooseObject(id){if(confirmedSection!==state.section){requestSection(state.section,()=>enterObject(id));return;}enterObject(id);}
 $('section-gate-cancel').onclick=()=>closeSectionGate();$('section-gate-proceed').onclick=confirmSection;
 $('section-gate').onclick=e=>{if(e.target===$('section-gate'))closeSectionGate();};
 document.addEventListener('keydown',e=>{if($('section-gate').hidden)return;if(e.key==='Escape'){e.preventDefault();closeSectionGate();}else if(e.key==='Tab'){e.preventDefault();const next=document.activeElement===$('section-gate-proceed')?$('section-gate-cancel'):$('section-gate-proceed');next.focus?.();}});

 function renderSections(){const section=window.MATH_CLOZE_SECTIONS.find(s=>s.id===state.section);document.querySelectorAll('[data-section]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.section===section.id)));$('app-section-title').textContent=section.name+' · Grade '+section.grade;$('journey-home-cat').src=sectionCharacters[section.id].image;$('journey-home-cat').alt=sectionCharacters[section.id].cat;}
 function chooseSection(id){if(!window.MATH_CLOZE_SECTIONS.some(s=>s.id===id)||id===state.section)return;stop();save();state.section=id;if(active){profile.section=id;profile.unit='all';load();}else{renderSections();save();}}
 function renderObjects(){renderSections();const grid=$('object-grid');grid.replaceChildren();O.forEach((o,i)=>{const b=document.createElement('button');b.className='object-tile'+(state.selected===o.id?' current':'');b.style.setProperty('--tile-bg',palette[i%palette.length]);b.setAttribute('aria-label','Choose '+o.name);const img=document.createElement('img');img.src=o.image;img.alt='';const label=document.createElement('span');label.textContent=o.name;b.append(img,label);b.onclick=()=>chooseObject(o.id);grid.append(b);});}
 function enterObject(id){save();state.selected=id;profile=getProfile(id);if(profile.section!==state.section)profile.unit='all';profile.section=state.section;active=true;$('landing').hidden=true;$('activity').hidden=false;const object=O.find(o=>o.id===id),img=document.createElement('img'),label=document.createElement('span');img.src=object.image;img.alt='';label.textContent=object.name;$('object-badge').replaceChildren(img,label);load();window.scrollTo(0,0);}
 function landing(){stop();confirmedSection=null;save();cancelDrag();stopBalloonFlight();rideProfile='';rideCount=-1;active=false;entry=null;lastTick=0;$('activity').hidden=true;$('landing').hidden=false;renderObjects();window.scrollTo(0,0);}
 function load(read=true){
  stop();setView('sentence');save();cancelDrag();refreshDate();item=list()[order()[position()]];
  entry=profile.progress[item.id]??={started:new Date().toISOString(),choiceAttempts:0,checks:0,hints:0,listens:0,seconds:0,complete:false,teacher:'',blankStats:[],contentRevision:item.contentRevision||1};
  if((item.contentRevision||1)>1&&entry.contentRevision!==item.contentRevision){entry.answers=[];entry.blankStats=[];entry.checkedCurrent=false;entry.lastResponse='';delete entry.choiceOrder;entry.contentRevision=item.contentRevision;}
  entry.blankStats??=[];answers=C.restore(item,entry.answers);entry.answers=answers;activeBlank=C.nextBlank(item,answers);if(activeBlank<0)activeBlank=0;
  choiceOrder=Array.isArray(entry.choiceOrder)&&entry.choiceOrder.length===item.options.length&&new Set(entry.choiceOrder).size===item.options.length&&entry.choiceOrder.every(v=>item.options.includes(v))?entry.choiceOrder:C.shuffle(item.options);entry.choiceOrder=choiceOrder;lastTick=performance.now();
  for(const level of C.levels)document.querySelector('[data-level="'+level+'"]').setAttribute('aria-pressed',String(profile.level===level));
  renderSections();const unitSelect=$('unit-select');unitSelect.replaceChildren();const gradeRows=D[profile.level].filter(r=>r.grade===item.grade);for(const u of [{id:'all',label:'All topics · '+gradeRows.length+' sentences'},...window.MATH_CLOZE_UNITS.filter(u=>u.grade===item.grade)]){const option=document.createElement('option');option.value=u.id;option.textContent=u.label;unitSelect.append(option);}unitSelect.value=profile.unit||'all';$('theme').textContent=item.topic+' · #'+item.sourceId;$('task-eyebrow').textContent='LEVEL '+profile.level+' · '+(position()+1)+'/'+list().length;$('piece-count').textContent=item.blanks.length+' '+(item.blanks.length===1?'blank':'blanks')+' · '+item.options.length+' choices';$('item-count').textContent=(position()+1)+' / '+list().length;
  $('activity-picture').src=item.image;$('activity-picture').alt=item.alt;$('activity-picture').style.maxWidth=item.nativeWidth+'px';$('activity-picture').classList.remove('failed');
  $('picture-frame').style.setProperty('--native-width',item.nativeWidth+'px');$('picture-frame').style.setProperty('--mobile-width',Math.min(74,item.nativeWidth,78*item.nativeWidth/item.nativeHeight)+'px');$('picture-covers').replaceChildren();
  for(const cover of item.covers||[]){const mask=document.createElement('span');mask.className='picture-cover';mask.style.left=cover.left+'%';mask.style.top=cover.top+'%';mask.style.width=cover.width+'%';mask.style.height=cover.height+'%';mask.style.background=cover.fill;$('picture-covers').append(mask);}
  $('previous').disabled=position()===0;['next','next-date','next-choices'].forEach(id=>$(id).disabled=position()===list().length-1);$('hint-display').hidden=true;$('hint').textContent='Show me a hint';$('voice-note').textContent='';
  feedback(entry.complete?'You have completed this activity. You can practise it again.':'');render();renderRating();renderProgress();renderBalloonFlight();save();if(read)speak();
 }
 function selectBlank(i){if(!Number.isInteger(i)||!item.blanks[i])return;activeBlank=i;entry.activeBlank=i;render();save();}
 function allowsEnding(text){const word=text.toLowerCase().replace(/[^a-z]/g,'');return endingWords.has(word)||C.endingPatterns.includes(word);}
 function appendHighlighted(parent,text,includeEnding=allowsEnding(text)){
  for(const part of C.highlights(text,includeEnding)){if(!part.feature){parent.append(document.createTextNode(part.text));continue;}const mark=document.createElement('mark');mark.className='ending-highlight '+part.feature;mark.textContent=part.text;parent.append(mark);}
 }
 function mixedAsset(path){return window.mathClozeAsset?window.mathClozeAsset(path):path;}
 function mixedLabel(format){return format==='picture-match'?'Picture matching':format==='multiple-choice'?'Multiple choice':'Cloze';}
 function mixedText(parent,text){parent.replaceChildren();for(const token of text.split(/\s+/)){const span=document.createElement('span');span.className='cloze-line-word';span.textContent=token;parent.append(span);}}
 function render(){
  const format=item.format||'cloze',picture=format==='picture-match',multiple=format==='multiple-choice';$('activity').dataset.format=format;$('activity').dataset.levelLength=String(item.options.length);$('activity').dataset.answerLayout=multiple&&item.options.every(value=>String(value).length<=26)?'short':'long';
  $('activity-task-title').textContent=picture?'Match the picture':multiple?'Look and choose':'Complete the sentence';
  $('mode-instruction').textContent=picture?'PICTURE MATCHING':multiple?'MULTIPLE CHOICE':'CLOZE · COMPLETE EACH BLANK';
  $('context').setAttribute('aria-label',picture?'Sentence to match':multiple?'Question about the picture':'Sentence with answer blanks');
  $('mixed-prompt').hidden=!picture;$('mixed-prompt').textContent='Tap the matching picture, or drag it onto the sentence.';
  $('matching-photo').hidden=!multiple;if(multiple){$('matching-photo').src=mixedAsset(item.image);$('matching-photo').alt=item.alt;}
  $('matching-placeholder').hidden=!picture||Boolean(answers[0]);$('activity-picture').hidden=picture&&!answers[0];
  $('picture-view').disabled=picture&&!answers[0];if(picture&&!answers[0]&&$('activity').dataset.view==='picture')setView('sentence');if(picture&&answers[0]){$('activity-picture').src=mixedAsset(item.choicePictures[answers[0]].image);$('activity-picture').alt=item.choicePictures[answers[0]].alt;}
  $('clear-blank').textContent=format==='cloze'?'↩ Clear this blank':'↩ Clear answer';
  if(format==='cloze'){delete $('context').dataset.blank;renderCloze();return;}
  $('context').dataset.blank='0';mixedText($('context'),picture?item.sentence:item.question);
  $('piece-count').textContent=mixedLabel(format)+' · '+item.options.length+' choices';
  const joined=$('joined-words');joined.replaceChildren();$('choices').replaceChildren();
  choiceOrder.forEach((value,i)=>{const button=document.createElement('button');button.type='button';button.className='tile cloze-choice mixed-choice'+(picture?' picture-choice':' sentence-choice')+(answers[0]===value?(C.isRight(item,answers,0)?' selected correct':' selected incorrect'):'');button.dataset.choice=value;button.setAttribute('aria-pressed',String(answers[0]===value));
   if(picture){const option=item.choicePictures[value],frame=document.createElement('span'),img=document.createElement('img');frame.className='choice-picture';img.src=mixedAsset(option.image);img.alt=option.alt;frame.append(img);const label=document.createElement('span');label.className='picture-letter';label.textContent=String.fromCharCode(65+i);button.append(frame,label);button.setAttribute('aria-label','Picture '+label.textContent+'. '+option.alt);}else{button.textContent=value;button.setAttribute('aria-label',value);}
   button.addEventListener('pointerdown',pointerDown);button.onclick=()=>{if(performance.now()>=suppressClickUntil)place(value,0,'Tap');};$('choices').append(button);
  });
  $('placed-count').textContent=C.isRight(item,answers,0)?'1 / 1 correct':'0 / 1 correct';$('choice-label').textContent=picture?'PUSH THE MATCHING PICTURE':'PUSH YOUR ANSWER';$('clear-blank').disabled=!answers[0];$('check').disabled=!answers[0]||Boolean(entry.checkedCurrent);requestFit();
 }

 function renderCloze(){
  const context=$('context');context.replaceChildren();
  const makeBlank=i=>{const b=item.blanks[i],blank=document.createElement('button');blank.type='button';blank.dataset.blank=i;
   blank.className='cloze-blank '+b.kind+(i===activeBlank?' current':'')+(answers[i]?(C.isRight(item,answers,i)?' correct':' incorrect'):'');if(answers[i])appendHighlighted(blank,C.display(item,i,answers[i]));else blank.textContent='\u00a0';
   blank.style.setProperty('--blank-width',(b.kind==='word'?Math.max(4.5,Math.min(10,b.answer.length+.6)):Math.max(2.4,Math.min(4,b.answer.length+.2)))+'ch');
   blank.setAttribute('aria-label','Blank '+(i+1)+', '+(b.kind==='word'?'missing whole word':'missing whole word')+(answers[i]?', your answer '+answers[i]:', empty'));
   blank.setAttribute('aria-pressed',String(i===activeBlank));blank.onclick=()=>selectBlank(i);return blank;
  };
  let wordIndex=0;
  for(const token of item.sentence.matchAll(/\S+/g)){
   if(wordIndex++)context.append(document.createTextNode(' '));
   const word=document.createElement('span');word.className='cloze-line-word';let at=token.index;const end=at+token[0].length,includeEnding=allowsEnding(token[0]);
   item.blanks.forEach((b,i)=>{if(b.start>=token.index&&b.end<=end){appendHighlighted(word,item.sentence.slice(at,b.start),false);word.append(makeBlank(i));at=b.end;}});
   appendHighlighted(word,item.sentence.slice(at,end),item.blanks.some(b=>b.start>=token.index&&b.end<=end)?false:includeEnding);context.append(word);
  }
  const joined=$('joined-words');joined.replaceChildren();item.blanks.forEach((b,i)=>{if(!answers[i])return;const word=document.createElement('span');word.className='joined-word'+(C.isRight(item,answers,i)?' correct':' trying');word.dataset.joinedBlank=i;word.setAttribute('role','listitem');appendHighlighted(word,C.joinedWord(item,i,answers[i]),allowsEnding(b.word)||allowsEnding(answers[i]));joined.append(word);});
  if(!joined.children.length){const prompt=document.createElement('span');prompt.className='joined-word-prompt';prompt.textContent='Choose a word to see your answer here.';joined.append(prompt);}
  $('choices').replaceChildren();choiceOrder.forEach(value=>{const b=document.createElement('button');b.type='button';b.className='tile cloze-choice';b.dataset.choice=value;appendHighlighted(b,value);b.setAttribute('aria-label',value+'. Place in selected blank '+(activeBlank+1));b.addEventListener('pointerdown',pointerDown);b.onclick=()=>{if(performance.now()>=suppressClickUntil)place(value,activeBlank,'Tap');};$('choices').append(b);});
  const correct=item.blanks.filter((_,i)=>C.isRight(item,answers,i)).length;$('placed-count').textContent=correct+' / '+item.blanks.length+' correct';$('choice-label').textContent='BLANK '+(activeBlank+1)+' OF '+item.blanks.length+' · '+(item.blanks[activeBlank].kind==='word'?'CHOOSE A WHOLE WORD':'CHOOSE A WHOLE WORD');
  $('clear-blank').disabled=!answers[activeBlank];$('check').disabled=answers.some(v=>v===null)||Boolean(entry.checkedCurrent);requestFit();
 }
 function record(event,index,value,correct,method){
  save();const b=item.blanks[index];profile.attempts.push({timestamp:new Date().toISOString(),revision:2,focus:(b?.focus||[]).join(' | '),format:item.format||'cloze',choiceImage:item.choicePictures?.[value]?.image||'',level:profile.level,item:item.id,event,blank:b?index+1:'',kind:b?b.feature:'Sentence',word:b?b.word:item.word,target:b?b.answer:item.sentence,choice:value,correct,sentence:C.response(item,answers),options:choiceOrder.join(' | '),method,hints:entry.hints,listens:entry.listens,teacher:entry.teacher||'',seconds:Math.round(entry.seconds)});save();
 }
 function markComplete(){if(C.complete(item,answers)&&!entry.complete){entry.complete=true;entry.completedAt??=new Date().toISOString();renderBalloonFlight(true);}}
 function place(value,index,method='Tap'){
  if(!item.options.includes(value)||!Number.isInteger(index)||!item.blanks[index])return;
  activeBlank=index;answers[index]=value;entry.answers=answers;entry.checkedCurrent=false;entry.choiceAttempts=(entry.choiceAttempts||0)+1;
  const right=C.isRight(item,answers,index),stats=entry.blankStats[index]??={attempts:0,correct:0};stats.attempts++;if(right)stats.correct++;
  entry.lastResponse=C.response(item,answers);markComplete();record('Choice',index,value,right,method);
  if(right){const next=C.nextBlank(item,answers);if(next>=0)activeBlank=next;feedback(next<0?(item.format==='picture-match'?'That picture matches!':item.format==='multiple-choice'?'That answer fits the picture!':'You completed the sentence! Great listening and reading.'):'That fits! Complete the next blank.','success');}
  else feedback(item.format==='picture-match'?'Try another picture. You can listen again.':'Try another answer. You can listen again.','error');render();renderProgress();save();
 }
 function check(){if(answers.some(v=>v===null)||entry.checkedCurrent)return;entry.checks=(entry.checks||0)+1;entry.checkedCurrent=true;entry.lastChecked=new Date().toISOString();entry.lastResponse=C.response(item,answers);const correct=C.complete(item,answers);markComplete();record(item.format==='cloze'?'Sentence check':'Answer check',-1,entry.lastResponse,correct,'Check button');feedback(correct?'You completed the activity!':'Listen again and try another choice.',correct?'success':'error');render();renderProgress();save();}
 function clearBlank(){if(!answers[activeBlank])return;cancelDrag();answers[activeBlank]=null;entry.answers=answers;entry.checkedCurrent=false;feedback('This blank is ready for another choice.');render();save();}
 function resetQuestion(){stop();cancelDrag();touchStartY=null;suppressClickUntil=0;answers=item.blanks.map(()=>null);entry.answers=answers;entry.checkedCurrent=false;activeBlank=0;choiceOrder=C.shuffle(item.options);entry.choiceOrder=choiceOrder;$('hint-display').hidden=true;$('hint-display').textContent='';$('hint').textContent='Show me a hint';$('voice-note').textContent='Tap Listen to hear it again.';feedback('Question reset. Listen and try again.');render();save();}
 function pointerDown(e){if(e.button!==undefined&&e.button!==0||drag)return;drag={value:e.currentTarget.dataset.choice,target:e.currentTarget,pointer:e.pointerId,x:e.clientX,y:e.clientY,moving:false};e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.addEventListener('pointermove',pointerMove);e.currentTarget.addEventListener('pointerup',pointerUp);e.currentTarget.addEventListener('pointercancel',cancelDrag);}
 function findDrop(x,y){return document.elementFromPoint(x,y)?.closest('[data-blank]')||null;}
 function pointerMove(e){if(!drag||drag.pointer!==e.pointerId)return;if(!drag.moving&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;e.preventDefault();drag.moving=true;drag.target.classList.add('dragging');const ghost=$('drag-ghost');ghost.dataset.format=item.format||'cloze';ghost.textContent=drag.value;if(item.format==='picture-match'){ghost.replaceChildren();const img=document.createElement('img');img.src=mixedAsset(item.choicePictures[drag.value].image);img.alt='';ghost.append(img);}ghost.hidden=false;ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';if(hoverBlank)hoverBlank.classList.remove('drop-target');hoverBlank=findDrop(e.clientX,e.clientY);if(hoverBlank)hoverBlank.classList.add('drop-target');}
 function pointerUp(e){if(!drag||drag.pointer!==e.pointerId)return;const moving=drag.moving,value=drag.value,target=moving?findDrop(e.clientX,e.clientY):null;cancelDrag();if(moving){suppressClickUntil=performance.now()+400;if(target)place(value,Number(target.dataset.blank),'Drag');else feedback('Drop on a sentence blank. Your choice is still in the bank.');}}
 function cancelDrag(){if(drag){const t=drag.target;t.classList.remove('dragging');t.removeEventListener('pointermove',pointerMove);t.removeEventListener('pointerup',pointerUp);t.removeEventListener('pointercancel',cancelDrag);try{if(t.hasPointerCapture(drag.pointer))t.releasePointerCapture(drag.pointer);}catch(e){}drag=null;}if(hoverBlank)hoverBlank.classList.remove('drop-target');hoverBlank=null;$('drag-ghost').hidden=true;}
 function renderRating(){document.querySelectorAll('[data-rating]').forEach(b=>b.setAttribute('aria-pressed',String(entry.teacher===b.dataset.rating)));}
 function renderProgress(){const rows=list(),completed=rows.filter(r=>profile.progress[r.id]?.complete).length;$('progress').textContent=C.objectName(O,state.selected)+' · '+completed+' / '+rows.length+' completed in '+profile.level+' · Saved here';}
 function stopBalloonFlight(){rideToken++;rideTimers.forEach(clearTimeout);rideTimers=[];$('balloon-rig').classList.remove('is-moving');}
 function renderBalloonFlight(animate=false){
  if(!active)return;const count=C.correctCount(profile),sameProfile=rideProfile===state.selected,previous=rideCount;
  if(sameProfile&&previous===count)return;
  stopBalloonFlight();rideProfile=state.selected;rideCount=count;const token=rideToken,rig=$('balloon-rig'),step=C.rideStep(count);
  $('balloon-count').textContent=String(count);$('balloon-flight').setAttribute('aria-label',C.objectName(O,state.selected)+': '+count+' correct questions. A new balloon starts every 20.');
  $('flight-status').textContent=count+' correct questions. '+step+' of 20 on this balloon flight.';
  const setStep=n=>rig.style.setProperty('--rise-progress',n*5+'%');
  const colour=n=>rig.dataset.flight=String(Math.floor(n/20)+1);
  const later=(fn,ms)=>rideTimers.push(setTimeout(()=>{if(token===rideToken)fn();},ms));
  const reveal=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token===rideToken)rig.classList.remove('resetting');}));
  if(!animate||!sameProfile||count<=previous){rig.classList.add('resetting');colour(count);setStep(step);reveal();return;}
  const move=()=>{rig.classList.remove('resetting');colour(count-1);setStep(step||20);rig.classList.add('is-moving');later(()=>rig.classList.remove('is-moving'),1050);
   if(step===0)later(()=>{rig.classList.add('resetting');colour(count);setStep(0);$('flight-status').textContent=count+' correct questions. A new balloon is ready at the bottom.';reveal();},1500);
  };
  if(previous>0&&C.rideStep(previous)===0){rig.classList.add('resetting');colour(count);setStep(0);later(move,60);}else move();
 }
 function changeLevel(level){if(profile.level===level)return;stop();save();profile.level=level;load();}
 function nav(delta){stop();save();profile.positions[orderKey()]=Math.max(0,Math.min(list().length-1,position()+delta));load();}
 function exportAssessment(all){
  save();const ids=all?O.map(o=>o.id):[state.selected];if(!ids[0])return;
  const sections=window.MATH_CLOZE_SECTIONS,legacy=window.MATH_CLOZE_PREVIOUS_DATA||{};
  const summary=[['School supply','Level','Available','Started','Completed','Choice attempts','Sentence checks','Hints','Listens','Independent','With help','Practising','Section','Grade','Earlier completed','Earlier choice attempts']];
  const progress=[['School supply','Level','Activity','Target word','Sentence','Current student sentence','Correct choices','Choices offered','Blanks','Filled','Correct now','Status','Choice attempts','Sentence checks','Hints','Listens','Teacher support','First started (UTC)','Completed (UTC)','Active seconds','Picture file','Grade','Math topic','Source sentence','Section','Word features','Content revision','Activity type']];
  const blanks=[['School supply','Level','Activity','Blank','Kind','Word','Correct choice','Student choice','Correct now','Choice attempts','Correct selections','Choices offered','Word features','Content revision','Activity type']];
  const attempts=[['School supply','Time (UTC)','Level','Activity','Event','Blank','Answer type','Word','Correct choice or sentence','Student choice or sentence','Correct','Student sentence','Choices offered','Method','Hints so far','Listens so far','Teacher support','Active seconds','Word features','Content revision','Activity type','Selected picture file']];
  for(const id of ids){const name=C.objectName(O,id),p=state.profiles[id]?getProfile(id):{progress:{},attempts:[],history:{}},history=Object.values(p.history||{}).map(h=>({...h,row:h.row||legacy[h.item]})).filter(h=>h.row);
   function append(r,e,revision){const current=C.restore(r,e?.answers),offered=e?.choiceOrder||r.options,section=sections.find(s=>s.id===r.section)?.name||(r.grade===2?'Excite':'Inspire');progress.push([name,r.level,r.id,r.word,r.sentence,C.response(r,current),r.blanks.map(b=>b.answer).join(' | '),offered.join(' | '),r.blanks.length,current.filter(Boolean).length,r.blanks.filter((_,i)=>C.isRight(r,current,i)).length,e?.complete?'Completed':e?'Practising':'Not started',e?.choiceAttempts||0,e?.checks||0,e?.hints||0,e?.listens||0,e?.teacher||'',e?.started||'',e?.completedAt||'',Math.round(e?.seconds||0),r.image,r.grade,r.topic,r.sourceId,section,r.blanks.flatMap(b=>b.focus||[]).join(' | '),revision,mixedLabel(r.format)]);r.blanks.forEach((b,i)=>blanks.push([name,r.level,r.id,i+1,b.feature,b.word,b.answer,current[i]||'',C.isRight(r,current,i)?'Yes':'No',e?.blankStats?.[i]?.attempts||0,e?.blankStats?.[i]?.correct||0,offered.join(' | '),(b.focus||[]).join(' | '),revision,mixedLabel(r.format)]));}
   for(const level of C.levels){const rows=D[level];for(const section of sections){const sr=rows.filter(r=>r.section===section.id),es=sr.map(r=>p.progress[r.id]).filter(Boolean),old=history.filter(h=>h.row.level===level&&h.row.section===section.id);summary.push([name,level,sr.length,es.length,es.filter(e=>e.complete).length,es.reduce((n,e)=>n+(e.choiceAttempts||0),0),es.reduce((n,e)=>n+(e.checks||0),0),es.reduce((n,e)=>n+(e.hints||0),0),es.reduce((n,e)=>n+(e.listens||0),0),...['Independent','With help','Practising'].map(v=>es.filter(e=>e.teacher===v).length),section.name,section.grade,old.filter(h=>h.entry.complete).length,old.reduce((n,h)=>n+(h.entry.choiceAttempts||0),0)]);}
    for(const r of rows){const e=p.progress[r.id];if(!all||e)append(r,e,r.contentRevision||2);}
    for(const h of history.filter(h=>h.row.level===level))append(h.row,h.entry,h.entry.contentRevision||1);
   }
   for(const a of p.attempts||[]){const revision=a.revision||1,row=revision===1?legacy[a.item]:D[a.level]?.find(r=>r.id===a.item),focus=a.focus??(a.blank?(row?.blanks[a.blank-1]?.focus||[]).join(' | '):'');attempts.push([name,a.timestamp,a.level,a.item,a.event,a.blank,a.kind,a.word,a.target,a.choice,a.correct?'Yes':'No',a.sentence,a.options,a.method,a.hints,a.listens,a.teacher,a.seconds,focus,revision,mixedLabel(a.format||row?.format),a.choiceImage||'']);}
  }
  const guide=[['Rocky and Luna’s Math Journey assessment','Details'],['Exported (UTC)',new Date().toISOString()],['Sections','Excite Grade 2: 240 sentences, source IDs 1–200 and 441–480. Inspire Grade 3: 240 sentences, source IDs 201–440. Both contain A, B, C, AA, BB and CC and three topics: number sense, data and probability, repeating patterns.'],['Mixed activities','Picture matching, cloze and multiple choice alternate in one sequence. Every grade has 80 of each activity type per level. There are no separate activity-type sections.'],['Levels','A/B/C offer three choices; AA/BB/CC offer five. Cloze has one blank at A/B/C, two at AA, three at BB and four at CC. Picture matching and multiple choice each require one selection.'],['Word practice','A favours initial blends, B vowel neighbours, C word endings. AA/BB/CC mix these with maths vocabulary. All buttons remain whole words. Word features are recorded per blank; they describe visible letter patterns without claiming one pronunciation for every word.'],['Illustrations','421 distinct sentence pictures: 240 within each grade, with 59 closely matching pairs shared across grades. All 80 new pattern sentences have their own unique illustration, with everyday applications where appropriate. Inspire bar-graph illustrations compare two groups with paired bars, a legend and labelled axes. Six levels of the same sentence share its picture. No picture is repeated for different sentences within one grade.'],['Content revision','Revision 2 adds sentence-specific pictures and refreshed language. Earlier answers and attempts remain in the export under revision 1. Earlier completions remain in the cumulative balloon score.'],['Earlier work','Progress and Blanks include archived revision 1 records when present. Use Activity plus Content revision to match them with Attempts. Summary separates earlier completions and choice attempts from current content.'],['Attempts','Choice attempts count every tap or drop, including wrong choices. Sentence checks are separate. Attempts retains the actual target, selected word, correctness, method, hints, listens, support and active time.'],['Voice','Listen reads the current sentence or picture question and visible answer choices. Picture matching reads the visible picture letters, without narrating other scenes. Moving to another question immediately cancels current and queued speech; only the new question can start. Stop, switching views, leaving the tab and opening a grade popup cancel reading.'],['Balloon','One first completed question per revision earns one step; every 20 starts a new flight at the bottom while retaining the cumulative total.'],['Reset','Question reset preserves history and rewards. Confirmed school-supply reset clears only the selected profile.'],['Storage','Local key rocky-luna-math-v1 imports earlier math-cloze-v2 or math-cloze-v1 work without changing those keys. Other reading-project keys are untouched. Twenty school-supply profiles, no student identity fields.'],['Layout','One viewport, no page or panel scrolling. Picture enlarges the illustration; Question returns to the notebook.']];
  save();const blob=window.SpellingExcel.workbook([{name:'Summary',rows:summary},{name:'Progress',rows:progress},{name:'Blanks',rows:blanks},{name:'Attempts',rows:attempts},{name:'Guide',rows:guide}]);
  const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='Rocky-and-Lunas-Math-Journey-'+(all?'all-objects':state.selected)+'-'+window.notebookDate(new Date()).iso+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 }

 C.levels.forEach((level,i)=>{const b=document.createElement('button');b.textContent=level;b.dataset.level=level;b.setAttribute('aria-label','Level '+level);b.onclick=()=>changeLevel(level);$(i<3?'levels-one':'levels-two').append(b);});
 document.querySelectorAll('[data-rating]').forEach(b=>b.onclick=()=>{entry.teacher=entry.teacher===b.dataset.rating?'':b.dataset.rating;save();renderRating();});
 $('home').onclick=landing;$('object-badge').onclick=landing;$('listen').onclick=speak;$('stop').onclick=()=>stop(true);$('speed').value=state.speed;$('speed').onchange=changeVoiceSpeed;
 $('check').onclick=check;$('reset-question').onclick=resetQuestion;$('clear-blank').onclick=clearBlank;$('previous').onclick=()=>nav(-1);['next','next-date','next-choices'].forEach(id=>$(id).onclick=()=>nav(1));
 $('hint').onclick=()=>{if(!$('hint-display').hidden){$('hint-display').hidden=true;$('hint').textContent='Show me a hint';requestFit();return;}entry.hints=(entry.hints||0)+1;$('hint-display').textContent=item.sentence;$('hint-display').hidden=false;$('hint').textContent='Hide the hint';save();requestFit();};
 $('shuffle-activities').onclick=()=>{stop();save();profile.orders[orderKey()]=C.balancedOrder(list(),Math.random);profile.orderVersions??={};profile.positions[orderKey()]=0;profile.orderVersions[orderKey()]=2;load();};$('export-current').onclick=()=>exportAssessment(false);$('export-all').onclick=()=>exportAssessment(true);
 $('reset-all').onclick=()=>{if(window.confirm('Reset all saved Rocky and Luna’s Math Journey progress for '+C.objectName(O,state.selected)+'? Other school supplies keep their progress.')){stop();cancelDrag();active=false;entry=null;lastTick=0;delete state.profiles[state.selected];profile=getProfile(state.selected);active=true;load();}};
 $('activity-picture').onload=requestFit;$('activity-picture').onerror=()=>notice('A picture could not load. Keep the complete Math-Cloze folder together.');
 document.addEventListener('touchstart',e=>{touchStartY=active&&e.touches.length===1?e.touches[0].clientY:null;},{passive:true});
 document.addEventListener('touchmove',e=>{if(!active||touchStartY===null||e.touches.length!==1)return;const inWork=Boolean(e.target.closest('[data-area]')),inMenu=Boolean(e.target.closest('[data-scrollable]')),pulling=window.scrollY<=0&&e.touches[0].clientY>touchStartY;if(e.cancelable&&(drag||inWork||(!inMenu&&pulling)))e.preventDefault();},{passive:false});
 document.addEventListener('touchend',()=>{touchStartY=null;},{passive:true});document.addEventListener('touchcancel',()=>{touchStartY=null;},{passive:true});
 window.addEventListener('resize',requestFit);if('ResizeObserver'in window)new window.ResizeObserver(requestFit).observe($('activity'));
 window.addEventListener('pagehide',()=>{stop();save();cancelDrag();stopBalloonFlight();rideProfile='';rideCount=-1;clearTimeout(dateTimer);});window.addEventListener('pageshow',()=>{refreshDate();renderBalloonFlight();});window.addEventListener('focus',refreshDate);window.addEventListener('blur',()=>stop());
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();save();cancelDrag();stopBalloonFlight();rideProfile='';rideCount=-1;lastTick=0;}else{refreshDate();if(active){lastTick=performance.now();renderBalloonFlight();}}});
 $('unit-select').onchange=()=>{stop();save();profile.unit=$('unit-select').value;load();};
 function setView(view){if($('activity').dataset.view!==view)stop(true);$('activity').dataset.view=view;$('sentence-view').setAttribute('aria-pressed',String(view==='sentence'));$('picture-view').setAttribute('aria-pressed',String(view==='picture'));requestFit();}
 $('sentence-view').onclick=()=>setView('sentence');$('picture-view').onclick=()=>setView('picture');
 if(['#excite','#inspire'].includes(window.location?.hash))state.section=window.location.hash.slice(1);if(!window.MATH_CLOZE_SECTIONS.some(s=>s.id===state.section))state.section='excite';
 document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>requestSection(b.dataset.section,null,b));
 refreshDate();renderObjects();
})();

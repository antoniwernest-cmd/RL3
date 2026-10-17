(function(){
 'use strict';
 function fit(activity){
  activity.style.setProperty('--math-scale','1');activity.dataset.fit='standard';
  const notice=document.getElementById('storage-notice'),noticeHeight=notice&&!notice.hidden?notice.getBoundingClientRect().height:0,available=Math.max(1,window.innerHeight-noticeHeight);
  activity.style.setProperty('--math-height',available+'px');activity.style.top=noticeHeight+'px';
  const height=()=>Math.max((activity.scrollHeight||0)*(Number(activity.style.getPropertyValue('--math-scale'))||1),activity.getBoundingClientRect().height);
  if(height()>available+1)activity.dataset.fit='compact';if(height()>available+1)activity.dataset.fit='tight';
  // Last-resort fitting for short browser windows. Reflow first, then contain any remaining overflow.
  for(let turn=0;turn<3&&height()>available+1;turn++){
   const current=Number(activity.style.getPropertyValue('--math-scale'))||1;
   activity.style.setProperty('--math-scale',String(Math.min(current,current*available/height())));
  }
 }
 window.fitMathActivity=fit;
})();

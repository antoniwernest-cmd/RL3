window.notebookDate=function notebookDate(date=new Date()){
  const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const year=date.getFullYear(),month=date.getMonth(),day=date.getDate();
  const suffix=day%100>=11&&day%100<=13?'th':({1:'st',2:'nd',3:'rd'}[day%10]||'th');
  // Local calendar fields follow the student's device, including dates near UTC midnight.
  return{iso:String(year).padStart(4,'0')+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'),text:weekdays[date.getDay()]+' '+months[month]+' '+day+suffix+', '+year};
 };

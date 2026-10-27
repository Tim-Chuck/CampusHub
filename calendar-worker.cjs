const {parentPort,workerData}=require('node:worker_threads');
const {parseCalendar}=require('./calendar-import.cjs');
try{parentPort.postMessage({ok:true,...parseCalendar(workerData.text,workerData.from,workerData.to)})}catch(error){parentPort.postMessage({ok:false,error:error.message})}

import { paginateEstimateActivities } from './estimatePagination.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import logoUrl from '../assets/beitzell-fence-company-logo.png';

export function newEstimateNumber(storage = globalThis.localStorage, random = globalThis.crypto) {
  const key = 'opentakeoff.estimate-numbers';
  const used = new Set(JSON.parse(storage?.getItem(key) || '[]'));
  if (used.size >= 900000) throw new Error('All six-digit estimate numbers have been used.');
  const bytes = new Uint32Array(1);
  // Rejection sampling avoids modulo bias across the 900,000 available numbers.
  let number;
  do {
    do { random.getRandomValues(bytes); } while (bytes[0] >= 4294800000);
    number = String(100000 + bytes[0] % 900000);
  } while (used.has(number));
  used.add(number);
  storage?.setItem(key, JSON.stringify([...used]));
  return number;
}

export function newEstimateDocument(now = new Date()) {
  const expiration = new Date(now);
  expiration.setDate(expiration.getDate() + 7);
  return { number: newEstimateNumber(), date: `${now.getMonth()+1}/${now.getDate()}/${now.getFullYear()}`, expires: `${expiration.getMonth()+1}/${expiration.getDate()}/${expiration.getFullYear()}`, address: '', salesRep: '', signature: '', project: '', acceptedBy: '', acceptedDate: '', lines: [{ description: '', amount: '' }, { description: '', amount: '' }, { description: '', amount: '' }] };
}
export async function estimateDocumentPdf(data) {
  const pdf=await PDFDocument.create(); let page;
  const regular=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo=await pdf.embedPng(await (await fetch(logoUrl)).arrayBuffer());
  const ink=rgb(0,0,0), rose=rgb(.87,.81,.83), burgundy=rgb(.49,.10,.16), border=rgb(.78,.78,.78);
  const text=(value,x,top,size=12,font=regular,color=ink)=>page.drawText(String(value || '').replace(/[^\x20-\x7E\n]/g,'-'),{x,y:792-top-size,size,font,color});
  const box=(x,top,w,h,fill)=>page.drawRectangle({x,y:792-top-h,width:w,height:h,borderWidth:.6,borderColor:border,...(fill?{color:fill}:{})});
  const wrap=(value,width,size=12)=>{
    const lines=[];
    for(const paragraph of String(value||'').split('\n')) {
      let line='';
      for(const word of paragraph.split(/\s+/)) {
        let safe=word.replace(/[^\x20-\x7E]/g,'-');
        if (regular.widthOfTextAtSize(safe,size)>width) {
          if(line){lines.push(line);line='';}
          let chunk='';
          for(const character of safe){
            if(chunk && regular.widthOfTextAtSize(chunk+character,size)>width){lines.push(chunk);chunk='';}
            chunk+=character;
          }
          safe=chunk;
        }
        if(regular.widthOfTextAtSize(`${line} ${safe}`.trim(),size)>width && line){lines.push(line);line=safe;}else line=`${line} ${safe}`.trim();
      }
      lines.push(line);
    }
    return lines;
  };
  const activityPages = paginateEstimateActivities(data.lines, line => Math.max(38, wrap(line.description,370).length*13+12));
  let total = 0;
  for (let pageIndex=0; pageIndex<activityPages.length; pageIndex++) {
  page=pdf.addPage([612,792]);
  const lastPage = pageIndex === activityPages.length-1;
  if (pageIndex === 0) {
  const logoSize=logo.scaleToFit(95,70); page.drawImage(logo,{x:40,y:792-40-logoSize.height,...logoSize});
  text('Beitzell Fence Co',143,40,12,bold);
  ['16351 Lee HWY','Gainesville, VA  20155 USA','+17037540011','www.beitzellfence.com'].forEach((line,i)=>text(line,143,57+i*16));
  text('Estimate',496,40,17,bold);
  box(92,130,175,96);box(92,130,175,13,rose);text('ADDRESS',97,131,8,bold,burgundy);
  wrap(data.address,162).slice(0,5).forEach((line,i)=>text(line,97,145+i*14));
  const columns=[[38,98,'ESTIMATE #',data.number],[136,92,'DATE',data.date],[228,88,'EXPIRATION DATE',data.expires]];
  columns.forEach(([x,w,label,value])=>{box(x,230,w,32);box(x,230,w,15,rose);text(label,x+4,232,8,bold,burgundy);
    if(label==='ESTIMATE #' && String(value).length>20) {
      const compact=String(value).replace(/-/g,'');const half=Math.ceil(compact.length/2);
      text(compact.slice(0,half),x+4,246,7);text(compact.slice(half),x+4,254,7);
    } else text(value,x+4,247,11);
  });
  text('SALES REP',42,271,12,bold);text('SIGNATURE',150,271,12,bold);text(data.salesRep,42,288,12);text(data.signature,150,288,12);
  }
  const tableTop = pageIndex === 0 ? 324 : 40;
  box(38,tableTop,536,20,rose);text('ACTIVITY',42,tableTop+2,11,regular,burgundy);text('AMOUNT',525,tableTop+2,11,regular,burgundy);
  if (pageIndex === 0) text(`Project: ${data.project}`,42,tableTop+23,12);
  let top=tableTop+56;
  for(const {line,height} of activityPages[pageIndex]) {
    if(!line.description && !line.amount) continue;
    const lines=wrap(line.description,370);

    lines.forEach((value,i)=>text(value,42,top+i*13));
    const amount=Number(String(line.amount).replace(/[$,]/g,''));
    if(!Number.isFinite(amount)) throw new Error('Enter a valid amount for each activity.');
    total+=amount;
    const formatted=amount.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    text(formatted,571-regular.widthOfTextAtSize(formatted,12),top,12);
    top+=height;
  }
  const bottom=Math.max(tableTop+200,top+4);box(38,tableTop+20,385,bottom-tableTop-20);box(423,tableTop+20,151,bottom-tableTop-20);
  if (lastPage) {
  text('TOTAL',320,bottom+7,12);
  const totalText=total.toLocaleString('en-US',{style:'currency',currency:'USD'});text(totalText,574-bold.widthOfTextAtSize(totalText,16),bottom+7,16,bold);
  text('Accepted By',38,700,12);text(data.acceptedBy,38,718,12);text('Accepted Date',323,700,12);text(data.acceptedDate,323,718,12);
  }
  const footer='Fax 571-248-6809 | www.beitzellfence.com | Class A License # 2705 061599A';
  text(footer,(612-regular.widthOfTextAtSize(footer,8))/2,778,8);
  text(`Page ${pageIndex+1} of ${activityPages.length}`,520,760,8);
  }
  return pdf.save();
}

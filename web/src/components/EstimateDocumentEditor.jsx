import { paginateEstimateActivities } from '../lib/estimatePagination.js';
import { Button } from './ui/button.jsx';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import logo from '../assets/beitzell-fence-company-logo.png';
import '../styles/estimateDocument.css';

export default function EstimateDocumentEditor({ initial, onSave, onClose }) {
  const [value,setValue]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const field=(key,label,style,multiline=false)=><label className="estimate-paper-field" style={style} key={key}>{multiline?<textarea aria-label={label} placeholder={label} maxLength={key==='address'?200:300} value={value[key]} onChange={e=>setValue({...value,[key]:e.target.value})}/>:<input aria-label={label} placeholder={label} value={value[key]} maxLength={120} onChange={e=>setValue({...value,[key]:e.target.value})}/>}</label>;
  const pages = paginateEstimateActivities(value.lines);
  const canAddActivity = value.lines.length < 200;
  const total=value.lines.reduce((sum,line)=>sum+(Number(String(line.amount).replace(/[$,]/g,''))||0),0);
  return createPortal(<div className="estimate-editor-shade estimate-paper-shade" onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}><form className="estimate-editor estimate-paper-editor" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await onSave(value);}catch(err){setError(err.message);}finally{setBusy(false);}}}>
    <header className="estimate-paper-toolbar"><strong>Estimate Document</strong><div><Button variant="outline" size="sm" type="button" disabled={busy || !canAddActivity} title={canAddActivity ? "Add activity" : "Activity area is full. Shorten or remove an activity to add another."} onClick={()=>setValue({...value,lines:[...value.lines,{description:'',amount:''}]})}>+ Activity</Button><Button variant="outline" size="sm" type="button" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="default" size="sm" type="submit" disabled={busy}>{busy?'Savingâ€¦':'Save estimate'}</Button></div></header>
    {error&&<p role="alert" className="estimate-paper-error">{error}</p>}
    <div className="estimate-paper-scroll">{pages.map((entries,pageIndex) => { const activityHeight = Math.max(180, entries.reduce((sum, entry) => sum + entry.height, 0) + 36); const lastPage = pageIndex === pages.length - 1; return <section key={pageIndex} className="estimate-paper" aria-label="Editable Beitzell Fence estimate">
      {pageIndex === 0 && <><img className="estimate-paper-logo" src={logo} alt="Beitzell Fence Company"/>
      <div className="estimate-paper-company"><strong>Beitzell Fence Co</strong><br/>16351 Lee HWY<br/>Gainesville, VA&nbsp; 20155 USA<br/>+17037540011<br/>www.beitzellfence.com</div>
      <h1>Estimate</h1>
      <div className="estimate-paper-address"><div className="estimate-paper-band">ADDRESS</div>{field('address','Customer address',{left:4,top:14,width:165,height:78},true)}</div>
      <div className="estimate-paper-meta"><div><span className="estimate-paper-band">ESTIMATE #</span><span className="estimate-paper-number" title={value.number}>{value.number}</span></div><div><span className="estimate-paper-band">DATE</span>{field('date','Date',{left:2,top:15,width:87,height:16})}</div><div><span className="estimate-paper-band">EXPIRATION DATE</span>{field('expires','Expiration date',{left:2,top:15,width:83,height:16})}</div></div>
      <strong className="estimate-paper-sales-label">SALES REP</strong><strong className="estimate-paper-sign-label">SIGNATURE</strong>
      {field('salesRep','Sales rep',{left:42,top:287,width:105,height:20})}{field('signature','Signature',{left:150,top:287,width:230,height:20})}
      </>}
      <div className="estimate-paper-activities" style={{height:activityHeight+20, top: pageIndex === 0 ? 324 : 40}}><div className="estimate-paper-activity-head"><span>ACTIVITY</span><span>AMOUNT</span></div>
        {pageIndex === 0 && <div className="estimate-paper-project">Project: {field('project','Project',{left:44,top:0,width:330,height:22})}</div>}
        <div className="estimate-paper-lines" style={{ overflow: "visible" }}>{entries.map(({line,index,height})=><div className="estimate-paper-line" style={{height}} key={index}><textarea aria-label={`Activity ${index+1}`} placeholder="Activity description" maxLength={500} value={line.description} onChange={e=>setValue({...value,lines:value.lines.map((old,i)=>i===index?{...old,description:e.target.value}:old)})}/><input aria-label={`Amount ${index+1}`} placeholder="0.00" inputMode="decimal" value={line.amount} onChange={e=>setValue({...value,lines:value.lines.map((old,i)=>i===index?{...old,amount:e.target.value}:old)})}/><Button variant="outline" size="sm" type="button" className="estimate-paper-remove" aria-label={`Remove activity ${index+1}`} onClick={()=>setValue({...value,lines:value.lines.filter((_,i)=>i!==index)})}>Ã—</Button></div>)}</div>
      </div>
      {lastPage && <><div className="estimate-paper-total" style={{top:(pageIndex === 0 ? 324 : 40)+activityHeight+26}}><span>TOTAL</span><strong>{total.toLocaleString('en-US',{style:'currency',currency:'USD'})}</strong></div>
      <span className="estimate-paper-accept-label">Accepted By</span><span className="estimate-paper-date-label">Accepted Date</span></>}
      
      <div className="estimate-paper-footer">Fax 571-248-6809 | www.beitzellfence.com | Class A License # 2705 061599A</div>
    <span className="estimate-paper-page-number">Page {pageIndex + 1} of {pages.length}</span></section>; })}</div>
  </form></div>,document.body);
}

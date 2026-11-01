import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui/button.jsx';
import { DEFAULT_SUPPLIERS, supplierUrl } from '../lib/suppliers.js';
import '../styles/suppliers.css';
const KEY='opentakeoff.custom-suppliers.v1';
const empty={name:'',website:'',phone:'',email:'',contact:'',logo:''};
const validLogo=value=>!value || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value);
async function readLogo(file){
  if(!file)return '';
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('Choose a PNG, JPEG, WebP or GIF image.');
  if(file.size>500*1024)throw new Error('Choose an image smaller than 500 KB.');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read this image.'));reader.readAsDataURL(file);});
  await new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=()=>reject(new Error('This image could not be opened.'));img.src=data;});
  return data;
}
function Logo({supplier}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[supplier.logo]);
  return <div className={`supplier-logo supplier-logo-${supplier.id}`}>{supplier.logo&&!failed?<img src={supplier.logo} alt={`${supplier.name} logo`} onError={()=>setFailed(true)} loading="lazy" referrerPolicy="no-referrer"/>:<strong>{supplier.name}</strong>}</div>;
}
export default function SupplierList({onClose,readOnly}) {
  const [custom,setCustom]=useState(()=>{try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value)?value.filter(s=>{try{return s && typeof s.id==='string' && typeof s.name==='string' && ['website','contact'].every(key=>!s[key]||supplierUrl(s[key]));}catch{return false;}}).map(s=>({...s,phone:String(s.phone||''),email:String(s.email||''),logo:(validLogo(s.logo)||/^\/suppliers\/[a-z0-9.-]+$/.test(s.logo||''))?s.logo:''})):[];}catch{return [];}});
  const [query,setQuery]=useState(''),[adding,setAdding]=useState(false),[draft,setDraft]=useState(empty),[error,setError]=useState('');
  const [editing,setEditing]=useState(null);
  const [logos,setLogos]=useState(()=>{try{const v=JSON.parse(localStorage.getItem(KEY+'.logos')||'{}');return Object.fromEntries(Object.entries(v).filter(([,value])=>typeof value==='string'&&validLogo(value)));}catch{return {};}});
  async function upload(file,apply){try{const logo=await readLogo(file);apply(logo);setError('');}catch(err){setError(err.message);}}
  const root=useRef(null);
  useEffect(()=>{const previous=document.activeElement;root.current?.focus();return()=>previous?.focus?.();},[]);
  function persist(next){try{localStorage.setItem(KEY,JSON.stringify(next));setCustom(next);setError('');return true;}catch{setError('Could not save suppliers in this browser.');return false;}}
  const suppliers=[...DEFAULT_SUPPLIERS.map(s=>({...s,...custom.find(c=>c.id===s.id)})),...custom.filter(c=>!DEFAULT_SUPPLIERS.some(s=>s.id===c.id))].map(s=>({...s,logo:logos[s.id]||s.logo})).filter(s=>`${s.name} ${s.phone} ${s.email}`.toLowerCase().includes(query.toLowerCase()));
  return createPortal(<div className="supplier-shade" onPointerDown={e=>e.stopPropagation()}><section className="supplier-dialog" role="dialog" aria-modal="true" aria-labelledby="supplier-title" tabIndex={-1} ref={root} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')onClose();if(e.key==='Tab'){const nodes=[...root.current.querySelectorAll('button:not(:disabled),a[href],input')];if(e.shiftKey&&(document.activeElement===nodes[0]||document.activeElement===root.current)){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}}}>
    <header><div><h2 id="supplier-title">Supplier list</h2><p>Fence, gate, security and site furnishing suppliers</p></div><Button variant="ghost" size="icon" aria-label="Close supplier list" onClick={onClose}>{String.fromCharCode(215)}</Button></header>
    <div className="supplier-tools"><input aria-label="Search suppliers" placeholder="Search suppliers..." value={query} onChange={e=>setQuery(e.target.value)}/><Button disabled={readOnly} variant="outline" onClick={()=>{setEditing(null);setDraft(empty);setAdding(!adding);}}>+ Add supplier</Button></div>
    {error&&<p role="alert">{error}</p>}
    {adding&&<form className="supplier-form" onSubmit={e=>{e.preventDefault();try{const next={...draft,id:editing||crypto.randomUUID(),name:draft.name.trim(),website:supplierUrl(draft.website),contact:supplierUrl(draft.contact),logo:draft.logo};if(!next.name)throw new Error('Enter the supplier name.');if(persist([...custom.filter(s=>s.id!==next.id),next])){setDraft(empty);setAdding(false);setEditing(null);const remaining={...logos};delete remaining[next.id];try{localStorage.setItem(KEY+'.logos',JSON.stringify(remaining));setLogos(remaining);}catch{/* Keep existing stored logo if browser storage is unavailable. */}}}catch(err){setError(err.message);}}}>{[['name','Company name'],['website','Website URL'],['phone','Phone'],['email','Email'],['contact','Contact page URL']].map(([key,label])=><label key={key}>{label}<input type={key==='email'?'email':'text'} maxLength={500} required={key==='name'} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}<label>Logo image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>upload(e.target.files[0],logo=>setDraft(current=>({...current,logo})))}/>{draft.logo&&<img className="supplier-upload-preview" src={draft.logo} alt="Selected logo"/>}<small>PNG, JPEG, WebP or GIF · up to 500 KB</small></label><Button type="submit">{editing?'Save changes':'Save supplier'}</Button><Button variant="ghost" onClick={()=>setAdding(false)}>Cancel</Button></form>}
    <div className="supplier-grid">{suppliers.map(s=><article className="supplier-card" key={s.id}><Logo supplier={s}/><h3>{s.name}</h3>{!readOnly&&<Button variant="outline" onClick={()=>{setEditing(s.id);setDraft({...empty,...s});setAdding(true);setError('');root.current?.scrollTo({top:0,behavior:'smooth'});}}>Edit</Button>}<div className="supplier-links">{s.website&&<a href={supplierUrl(s.website)} target="_blank" rel="noopener noreferrer">Website {String.fromCharCode(8599)}</a>}{s.contact&&<a href={supplierUrl(s.contact)} target="_blank" rel="noopener noreferrer">Contact {String.fromCharCode(8599)}</a>}</div>{s.phone&&<a href={`tel:${s.phone.replace(/[^+\d]/g,'')}`}>{s.phone}</a>}{s.email&&<a href={`mailto:${s.email}`}>{s.email}</a>}{!s.verified&&<Button variant="ghost" disabled={readOnly} onClick={()=>persist(custom.filter(item=>item.id!==s.id))}>Remove</Button>}</article>)}</div>
  </section></div>,document.body);
}

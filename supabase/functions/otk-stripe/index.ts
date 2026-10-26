import Stripe from 'npm:stripe@23.0.1';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { BillingError, createStripeBilling, STRIPE_PLANS } from '../_shared/stripe-billing.js';
const env = (name: string) => Deno.env.get(name) || '';
const origins = env('OTK_BILLING_ALLOWED_ORIGINS').split(',').map(s=>s.trim()).filter(Boolean);
const key = env('STRIPE_TEST_SECRET_KEY'), webhookSecret = env('STRIPE_TEST_WEBHOOK_SECRET');
// This endpoint intentionally cannot charge live cards, even if misconfigured.
const configured = /^(sk|rk)_test_/.test(key);
const stripe = configured ? new Stripe(key, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2, timeout: 15000 }) : null;
const db = createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
async function result(query: any) { const { data,error }=await query; if(error) throw new BillingError('OTK_BILLING_DATABASE',503); return data; }
const store = {
 customer: (id: string) => result(db.from('otk_stripe_customers').select('*').eq('user_id',id).maybeSingle()),
 saveCustomer: (id: string,customer: string) => result(db.from('otk_stripe_customers').upsert({user_id:id,customer_id:customer},{onConflict:'user_id'})),
 userForCustomer: (id: string) => result(db.from('otk_stripe_customers').select('user_id').eq('customer_id',id).maybeSingle()),
 subscription: (id: string) => result(db.from('otk_subscriptions').select('*').eq('user_id',id).maybeSingle()),
 saveSubscription: (row: any) => result(db.from('otk_subscriptions').upsert(row,{onConflict:'user_id'})),
 saveEvent: (row: any) => result(db.from('otk_billing_events').upsert(row,{onConflict:'id',ignoreDuplicates:true})),
};
const billing = stripe ? createStripeBilling({stripe,store,origins,namespace:env('SUPABASE_URL')}) : null;
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin') || '';
 const headers:Record<string,string>={'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version,stripe-signature','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
 if(origins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json'}});
 try {
  if(origin && !origins.includes(origin))return json({code:'OTK_ACCESS'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json({code:'OTK_BILLING_REQUEST'},405);
  if(Number(req.headers.get('content-length') || 0)>262144)return json({code:'OTK_BILLING_SIZE'},413);
  const raw=await req.text(); if(raw.length>262144)return json({code:'OTK_BILLING_SIZE'},413);
  if(new URL(req.url).searchParams.get('action')==='webhook') {
   if(!stripe || !billing || !webhookSecret)return json({code:'OTK_BILLING_SETUP'},503);
   let event;try {event=await stripe.webhooks.constructEventAsync(raw,req.headers.get('stripe-signature') || '',webhookSecret,undefined,Stripe.createSubtleCryptoProvider());}catch{return json({code:'OTK_BILLING_SIGNATURE'},401);}
   await billing.webhook(event);return json({received:true});
  }
  const bearer=/^Bearer (.+)$/i.exec(req.headers.get('authorization') || '')?.[1];
  if(!bearer)return json({code:'OTK_AUTH'},401);
  const {data,error}=await db.auth.getUser(bearer);if(error || !data.user)return json({code:'OTK_AUTH'},401);
  let body;try{body=JSON.parse(raw || '{}');}catch{return json({code:'OTK_BILLING_JSON'},400);}
  if(body.action==='plans')return json({configured,testMode:true,webhookConfigured:!!webhookSecret,plans:Object.entries(STRIPE_PLANS).map(([id,p])=>({id,price:p.amount/100,interval:p.interval,currency:'USD',checkoutAvailable:configured,testMode:true}))});
  if(!billing)return json({code:'OTK_STRIPE_TEST_SETUP'},503);
  if(body.action==='checkout')return json(await billing.checkout(data.user,body.planId,body.returnUrl));
  if(body.action==='portal')return json(await billing.portal(data.user,body.returnUrl));
  if(body.action==='refresh')return json({subscription:await billing.refresh(data.user)});
  return json({code:'OTK_BILLING_ACTION'},400);
 }catch(error){
  // Never log Stripe exception messages: they can contain request/account data.
  console.error('otk-stripe request failed',{code:error instanceof BillingError?error.code:'OTK_STRIPE_REQUEST'});
  return json({code:error instanceof BillingError?error.code:'OTK_STRIPE_REQUEST'},error instanceof BillingError?error.status:502);
 }
});

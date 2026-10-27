import test from 'node:test';
import assert from 'node:assert/strict';
import { createStripeBilling, stripeRecord, stripeReturn, STRIPE_PLANS } from '../../supabase/functions/_shared/stripe-billing.js';

const user={id:'11111111-1111-4111-8111-111111111111',email:'test@example.com'};
const origins=['http://127.0.0.1:5173'];
function subscription(overrides:any={}) { return {id:'sub_test',customer:'cus_test',livemode:false,status:'active',created:1,metadata:{otk_user_id:user.id,otk_plan_id:'estimating_pro_monthly'},items:{data:[{current_period_end:Math.floor(Date.now()/1000)+2592000,price:{id:'price_test',currency:'usd',unit_amount:4000,recurring:{interval:'month',interval_count:1}}}]},...overrides}; }
function fixture() {
 let record:any=null,customer:any=null,sessions:any[]=[],subscriptions:any[]=[];let writes=0;
 const stripe:any={customers:{create:async()=>({id:'cus_test'})},subscriptions:{list:async()=>({data:subscriptions})},checkout:{sessions:{create:async(input:any)=>{sessions.push(input);return {url:'https://checkout.stripe.com/c/pay/cs_test',livemode:false};}}},billingPortal:{sessions:{create:async()=>({url:'https://billing.stripe.com/p/session/test'})}}};
 const store:any={customer:async()=>customer,saveCustomer:async(id:string,cid:string)=>{customer={user_id:id,customer_id:cid};},subscription:async()=>record,saveSubscription:async(row:any)=>{record=row;writes++;},userForCustomer:async()=>customer,saveEvent:async()=>{}};
 return {api:createStripeBilling({stripe,store,origins,namespace:'test'}),stripe,sessions,set subscriptions(v:any[]){subscriptions=v;},get record(){return record;},set record(v:any){record=v;},get writes(){return writes;}};
}
test('Stripe checkout uses fixed server prices and binds subscription ownership',async()=>{
 const h=fixture();
 await h.api.checkout(user,'estimating_pro_monthly',origins[0]+'/?localProject=project');
 assert.equal(h.record,null,'checkout navigation never grants access');
 assert.equal(h.sessions[0].line_items[0].price_data.unit_amount,4000);
 assert.equal(h.sessions[0].subscription_data.metadata.otk_user_id,user.id);
 assert.match(h.sessions[0].success_url,/localProject=project/);
 assert.equal(h.sessions[0].mode,'subscription');
 await h.api.checkout(user,'estimating_pro_yearly',origins[0]);
 assert.equal(h.sessions[1].line_items[0].price_data.unit_amount,40000);
 assert.equal(h.sessions[1].line_items[0].price_data.recurring.interval,'year');
 await assert.rejects(()=>h.api.checkout(user,'cheap',origins[0]));
});
test('Stripe redirects reject untrusted origins and URL credentials',()=>{
 for(const value of ['https://evil.example/','http://attacker@127.0.0.1:5173/','javascript:alert(1)'])assert.throws(()=>stripeReturn(value,origins));
});
test('Stripe entitlements reject live mode, another owner, and wrong prices',()=>{
 for(const s of [subscription({livemode:true}),subscription({customer:'cus_other'}),subscription({metadata:{otk_user_id:'other',otk_plan_id:'estimating_pro_monthly'}}),subscription({items:{data:[{price:{currency:'usd',unit_amount:1,recurring:{interval:'month'}}}]}})]) assert.throws(()=>stripeRecord(user.id,s,'cus_test'));
 assert.equal(Object.keys(STRIPE_PLANS).length,2);
});
test('Verified refresh activates sandbox access; duplicate events do not create rows or replay stale state',async()=>{
 const h=fixture();await h.api.checkout(user,'estimating_pro_monthly',origins[0]);
 h.subscriptions=[subscription()];
 await h.api.refresh(user);assert.equal(h.record.status,'active');assert.equal(h.record.environment,'sandbox');
 h.subscriptions=[subscription({status:'canceled'})];
 const old={id:'evt_old',livemode:false,type:'customer.subscription.updated',data:{object:{customer:'cus_test',status:'active'}}};
 await h.api.webhook(old);await h.api.webhook(old);
 assert.equal(h.record.status,'expired','always reread Stripe rather than trusting old event payload');
 await assert.rejects(()=>h.api.webhook({...old,livemode:true}));
});
test('Sandbox checkout cannot replace production entitlements or duplicate active subscriptions',async()=>{
 const h=fixture();h.record={environment:'production',status:'active'};
 await assert.rejects(()=>h.api.checkout(user,'estimating_pro_monthly',origins[0]),/OTK_BILLING_LIVE_ACCOUNT/);
 h.record=null;h.subscriptions=[subscription()];
 await assert.rejects(()=>h.api.checkout(user,'estimating_pro_monthly',origins[0]),/OTK_BILLING_ALREADY_ACTIVE/);
 assert.equal(h.sessions.length,0);
});

import { Capacitor } from '@capacitor/core';
import { createRevenueCatBillingAdapter } from './revenueCatBilling.js';

export function stripeSubscription(row) {
 return row ? { subscriptionStatus:row.status, subscriptionPlan:row.plan_id, subscriptionProvider:row.provider, subscriptionCustomerId:row.revenuecat_customer_id, subscriptionId:row.subscription_id, subscriptionCurrentPeriodEnd:row.current_period_end, subscriptionEnvironment:row.environment, subscriptionWillRenew:row.will_renew } : null;
}
export function createStripeBillingAdapter(client, navigate = (url) => window.location.assign(url), returnUrl = () => window.location.href) {
 if(!client)return null;
 async function invoke(action,body={}) {
  const {data,error}=await client.functions.invoke('otk-stripe',{body:{...body,action}});
  if(error || data?.code) {
   let code=data?.code;try{if(!code && error?.context?.json)code=(await error.context.json()).code;}catch{/* network error */}
   const messages={OTK_STRIPE_TEST_SETUP:'Stripe sandbox checkout is not configured on the server yet.',OTK_BILLING_ALREADY_ACTIVE:'You already have an active subscription. Use Manage Subscription.',OTK_BILLING_LIVE_ACCOUNT:'This account has a production subscription. Use a separate account for sandbox testing.',OTK_AUTH:'Sign in again to use Stripe checkout.'};
   throw new Error(messages[code] || `Stripe test checkout is unavailable${code?` (${code})`:''}. Please try again.`);
  }
  return data;
 }
 async function open(action,body={}) {
  const data=await invoke(action,{...body,returnUrl:returnUrl()});
  const url=new URL(data.url);
  if(data.testMode!==true || url.protocol!=='https:' || !['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw new Error('Invalid Stripe checkout destination.');
  navigate(url.href);
 }
 return {
  configured:true, canRestore:false,
  async getPlans(){return (await invoke('plans')).plans;},
  async getSubscription(){
   const data = await invoke('refresh');
   if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    if (url.searchParams.has('stripe_checkout') || url.searchParams.has('stripe_session')) {
     url.searchParams.delete('stripe_checkout'); url.searchParams.delete('stripe_session');
     window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
   }
   return stripeSubscription(data.subscription);
  },
  checkout:(_user,planId)=>open('checkout',{planId}),
  manageSubscription:()=>open('portal'),
  async refreshSubscription(){return stripeSubscription((await invoke('refresh')).subscription);},
  async claimLicenseSession(_user,device){
   await invoke('refresh');
   const {data,error}=await client.functions.invoke('otk-billing',{body:{action:'session',device_id:device.deviceId,device_name:device.deviceName}});
   if(error)throw error;
   return {subscription:stripeSubscription(data.subscription),session:{granted:data.session?.granted===true,reason:data.session?.reason || '',activeDeviceName:data.session?.active_device_name || '',leaseExpiresAt:data.session?.lease_expires_at}};
  },
 };
}
export function createAppBillingAdapter(client) {
 return Capacitor.isNativePlatform()?createRevenueCatBillingAdapter(client):createStripeBillingAdapter(client);
}

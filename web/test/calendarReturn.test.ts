import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarReturnUrl, driveReturnResult } from '../src/lib/supabase/driveConnection.js';
import { restoreGoogleReturn } from '../src/lib/supabase/auth.js';
import { returnUrl } from '../../supabase/functions/_shared/drive-security.js';
import { sandboxLicensesAllowed, hasActiveLicense } from '../src/lib/license.js';

test('Calendar return preserves the project, strips Stripe return markers, and retains Calendar context',()=>{
 const input='http://127.0.0.1:5173/?localProject=project&stripe_checkout=success&stripe_session=cs_test&otkGoogle=1';
 const frontend=new URL(calendarReturnUrl(input));
 assert.equal(frontend.searchParams.get('localProject'),'project');
 assert.equal(frontend.searchParams.get('otkCalendar'),'1');
 assert.equal(frontend.searchParams.has('stripe_session'),false);
 const server=new URL(returnUrl(frontend.href,['http://127.0.0.1:5173']));
 assert.equal(server.searchParams.get('otkCalendar'),'1');
 assert.deepEqual(driveReturnResult(server.href),{calendar:true,error:''});
});
test('Calendar callback is not consumed as a new app sign-in',async()=>{
 const client={auth:{exchangeCodeForSession:()=>{throw Error('Calendar must not exchange app auth code');}}};
 assert.equal(await restoreGoogleReturn(client,'http://127.0.0.1:5173/?otkCalendar=1&otkDrive=connected&otkGoogle=1',()=>{}),null);
});
test('Sandbox license default is restricted to local development; production still rejects it',()=>{
 assert.equal(sandboxLicensesAllowed({DEV:true},'http://127.0.0.1:5173'),true);
 assert.equal(sandboxLicensesAllowed({DEV:true},'https://example.com'),false);
 assert.equal(sandboxLicensesAllowed({DEV:false},'http://127.0.0.1:5173'),false);
 assert.equal(hasActiveLicense({subscriptionStatus:'active',subscriptionEnvironment:'sandbox'},Date.now(),false),false);
});

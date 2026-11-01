const supplier = (id,name,website,phone,email,contact,logo) => ({id,name,website,phone,email,contact,logo,verified:'2026-11-01'});
export const DEFAULT_SUPPLIERS = [
  supplier('master-halco','Master Halco','https://www.masterhalco.com/','800-883-8384','contact@masterhalco.com','https://www.masterhalco.com/about','/suppliers/master-halco-provided.png'),
  supplier('stephens','Stephens Pipe & Steel','https://www.spsfence.com/','800-451-2612','','https://www.spsfence.com/','/suppliers/stephens-provided.png'),
  supplier('ameristar','Ameristar Fence','https://www.ameristarperimeter.com/us/en','888-333-3422','','https://www.ameristarperimeter.com/us/en/contact','/suppliers/ameristar-provided.png'),
  supplier('iron-world','Iron World Fence','https://ironworldfencing.com/','866-310-2747','info@ironworldfencing.com','https://ironworldfencing.com/contact/','/suppliers/iron-world.png'),
  supplier('tymetal','TYMETAL','https://www.tymetal.com/','888-978-4283','gates@tymetal.com','https://www.tymetal.com/','/suppliers/tymetal.svg'),
  supplier('gibraltar','Gibraltar','https://gibraltarus.com/','800-495-8957','info@gibraltarus.com','https://gibraltarus.com/contact/','/suppliers/gibraltar-provided.png'),
  supplier('merchants','Merchants Metals','https://www.merchantsmetals.com/','770-741-0300','','https://www.merchantsmetals.com/contact-form/','/suppliers/merchants.png'),
  supplier('wallace','Wallace Perimeter Security','https://www.wallaceperimetersecurity.com/','866-300-1110','info@wallaceperimetersecurity.com','https://www.wallaceperimetersecurity.com/contact','/suppliers/wallace.png'),
  supplier('hysecurity','HySecurity','https://hysecurity.com/','800-321-9947','techsupport@hysecurity.com','https://hysecurity.com/about/contact/','/suppliers/hysecurity.svg'),
  supplier('liftmaster','LiftMaster','https://www.liftmaster.com/','800-528-5880','','https://www.liftmaster.com/about-liftmaster/orders-and-returns','/suppliers/liftmaster-provided.png'),
  supplier('landscape-forms','Landscape Forms','https://www.landscapeforms.com/','800-430-6209','specify@landscapeforms.com','https://www.landscapeforms.com/contact','/suppliers/landscape-forms.png'),
];
export function supplierUrl(value) {
  if (!String(value||'').trim()) return '';
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an http or https website URL.');
  return url.href;
}

(()=>{
  'use strict';
  const bookingUrl='https://claritygridaccountingadvisory.zohobookings.com/portal-embed#/5012580000000035009';
  const privacyUrl='/privacy/';
  const consentKey='claritygrid-visitor-tools-consent-v1';
  let initialized=false;
  let salesIqLoaded=false;

  const loadSalesIQ=()=>{
    if(salesIqLoaded)return;
    salesIqLoaded=true;
    window.$zoho=window.$zoho||{};
    window.$zoho.salesiq=window.$zoho.salesiq||{ready:function(){}};
    const script=document.createElement('script');
    script.id='zsiqscript';
    script.src='https://salesiq.zoho.com/widget?wc=siq1f4216c0bf057189b097378946c7f1729105b21c13ddb3add1f7322f0ae3d95f54d8d3fbe88bf554502fd5cf5857f4ff';
    script.defer=true;
    document.body.appendChild(script);
  };

  const consentBanner=document.createElement('section');
  consentBanner.className='cg-consent';
  consentBanner.setAttribute('role','dialog');
  consentBanner.setAttribute('aria-modal','false');
  consentBanner.setAttribute('aria-labelledby','cg-consent-title');
  consentBanner.hidden=true;
  consentBanner.innerHTML='<div><strong id="cg-consent-title">Your privacy choices</strong><p>With your permission, ClarityGrid uses Zoho SalesIQ for visitor analytics and live chat. The appointment calendar remains available without analytics consent.</p><a href="'+privacyUrl+'">Read the privacy policy</a></div><div class="cg-consent-actions"><button type="button" data-consent="declined">Use necessary only</button><button class="cg-consent-accept" type="button" data-consent="accepted">Allow chat &amp; analytics</button></div>';
  const privacyChoices=document.createElement('button');
  privacyChoices.type='button';
  privacyChoices.className='cg-privacy-choices';
  privacyChoices.textContent='Privacy choices';

  const setConsent=value=>{
    try{localStorage.setItem(consentKey,value);}catch(error){}
    consentBanner.hidden=true;
    privacyChoices.hidden=false;
    if(value==='accepted')loadSalesIQ();
    privacyChoices.focus();
  };
  consentBanner.addEventListener('click',event=>{
    const button=event.target.closest('[data-consent]');
    if(button)setConsent(button.dataset.consent);
  });
  privacyChoices.addEventListener('click',()=>{
    consentBanner.hidden=false;
    privacyChoices.hidden=true;
    consentBanner.querySelector('button')?.focus();
  });

  const launch=document.createElement('button');
  launch.type='button';
  launch.className='cg-booking-launch';
  launch.setAttribute('aria-haspopup','dialog');
  launch.setAttribute('aria-controls','cg-booking-dialog');
  launch.innerHTML='<span aria-hidden="true">◷</span><span>Schedule consultation</span>';

  const dialog=document.createElement('dialog');
  dialog.id='cg-booking-dialog';
  dialog.className='cg-booking-dialog';
  dialog.setAttribute('aria-labelledby','cg-booking-title');
  dialog.innerHTML='<div class="cg-booking-shell"><header class="cg-booking-head"><div><p class="cg-booking-kicker">ClarityGrid consultation</p><p class="cg-booking-title" id="cg-booking-title">Choose an available appointment</p></div><button class="cg-booking-close" type="button" aria-label="Close appointment scheduler">×</button></header><div class="cg-booking-body"><div class="cg-booking-status" id="cg-booking-status" role="status"><strong>Loading secure appointment calendar…</strong><span>Select a time that works for you.</span></div><div id="inline-container"></div><p class="cg-booking-fallback">Calendar not displaying? <a href="'+bookingUrl+'" target="_blank" rel="noopener noreferrer">Open Zoho Bookings in a new window</a>.</p></div></div>';

  document.body.append(dialog,launch,consentBanner,privacyChoices);
  let savedConsent='';
  try{savedConsent=localStorage.getItem(consentKey)||'';}catch(error){}
  if(savedConsent==='accepted')loadSalesIQ();
  else if(savedConsent==='declined')privacyChoices.hidden=false;
  else{consentBanner.hidden=false;privacyChoices.hidden=true;}
  const close=dialog.querySelector('.cg-booking-close');
  const status=dialog.querySelector('#cg-booking-status');

  const initialize=()=>{
    if(initialized)return;
    const iframe=document.createElement('iframe');
    iframe.src=bookingUrl;
    iframe.title='Schedule a ClarityGrid consultation';
    iframe.loading='eager';
    iframe.referrerPolicy='strict-origin-when-cross-origin';
    iframe.style.cssText='display:block;width:100%;height:600px;border:0';
    iframe.addEventListener('load',()=>{status.hidden=true;},{once:true});
    iframe.addEventListener('error',()=>{status.innerHTML='<strong>The embedded calendar could not load.</strong><span>Use the secure new-window link below to schedule.</span>';},{once:true});
    dialog.querySelector('#inline-container').appendChild(iframe);
    initialized=true;
  };

  launch.addEventListener('click',()=>{dialog.showModal();initialize();});
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>launch.focus());
})();

(()=>{
  'use strict';
  const bookingUrl='https://claritygridaccountingadvisory.zohobookings.com/portal-embed#/5012580000000035009';
  let initialized=false;

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

  document.body.append(dialog,launch);
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

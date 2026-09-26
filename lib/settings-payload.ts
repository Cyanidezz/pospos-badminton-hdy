import {parseHours} from './shop-hours';

// What the "ตั้งค่าร้าน" panels save. Fields that were not touched fall back to the saved config, and the
// new columns are only sent once the database has them (i.e. after the migration was applied).
export function settingsPayload(form:any,config:any){
  const payload:any={shop:form.shop??config.shop,lineOa:form.lineOa??config.line_oa,showEarnings:form.showEarnings??!!config.show_earnings};
  if('bank_name' in config){
    payload.contactPhone=form.contactPhone??config.contact_phone;
    payload.contactFacebook=form.contactFacebook??config.contact_facebook;
    payload.openingHours=form.hours??parseHours(config.opening_hours);
    payload.bankName=form.bankName??config.bank_name;
    payload.bankAccountName=form.bankAccountName??config.bank_account_name;
    payload.bankAccountNo=form.bankAccountNo??config.bank_account_no;
    payload.bankQr=form.bankQr??config.bank_qr??'';
  }
  if('member_stamps_required' in config){
    payload.memberStampsRequired=form.memberStampsRequired??config.member_stamps_required;
    payload.memberRewardCap=form.memberRewardCap??(config.member_reward_cap===null||config.member_reward_cap===undefined?'':config.member_reward_cap/100);
  }
  if('member_socks_stamps_required' in config){
    payload.memberSocksStampsRequired=form.memberSocksStampsRequired??config.member_socks_stamps_required;
    payload.memberSocksProductId=form.memberSocksProductId??(config.member_socks_product_id||'');
  }
  if('member_promo_enabled' in config){
    payload.memberPromoEnabled=form.memberPromoEnabled??!!config.member_promo_enabled;
    payload.memberPromoStart=form.memberPromoStart??(config.member_promo_start||'');
    payload.memberPromoEnd=form.memberPromoEnd??(config.member_promo_end||'');
  }
  if('member_pos_min_amount' in config)payload.memberPosMinAmount=form.memberPosMinAmount??(config.member_pos_min_amount||0)/100;
  return payload;
}


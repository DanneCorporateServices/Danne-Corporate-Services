/* ========= HELPER ========= */
function naira(n) { return "₦" + Number(n || 0).toLocaleString(); }
function show(el){ if(el) el.classList.remove('hidden'); }
function hide(el){ if(el) el.classList.add('hidden'); }

/* ========= FORM SWITCH ========= */
const taxType = document.getElementById('taxType');
const forms = {
  paye: document.getElementById('form-paye'),
  vat: document.getElementById('form-vat'),
  wht: document.getElementById('form-wht'),
  cit: document.getElementById('form-cit'),
  pit: document.getElementById('form-pit'),
  sme: document.getElementById('form-sme'),
  informal: document.getElementById('form-informal')
};
function hideAllForms(){ Object.values(forms).forEach(f => hide(f)); }
function showForm(key){ hideAllForms(); if(forms[key]) show(forms[key]); }
taxType.addEventListener('change', e => showForm(e.target.value));
showForm('paye');

/* ========= PAYE HELPERS (2026) ========= */
function computeCRA(gross){
  gross = Number(gross||0);
  const optionA = 200000;
  const optionB = (0.01 * gross) + (0.20 * gross); // 1% + 20% of gross
  return Math.round(Math.max(optionA, optionB));
}
function pensionOfBasic(basic){
  basic = Number(basic||0);
  return Math.round(basic * 0.08); // 8% of basic
}

/* Compute PAYE using 2026 brackets.
   taxableAfterExemption = amount after removing exemption (i.e., amount > 800k)
   We compute on absolute thresholds using exemption as lower bound.
*/
function computePAYEFromTaxable(amountAboveExemption){ // amountAboveExemption >=0
  let tax = 0;
  let remaining = Number(amountAboveExemption||0);
  const thresholds = [
    { limit: 1600000, rate: 0.15 },
    { limit: 5000000, rate: 0.19 },
    { limit: 10000000, rate: 0.20 },
    { limit: 20000000, rate: 0.22 },
    { limit: 30000000, rate: 0.24 },
    { limit: Infinity, rate: 0.25 }
  ];
  let lower = 800000; // absolute lower bound (exemption)
  for(let i=0;i<thresholds.length && remaining>0;i++){
    const band = thresholds[i];
    const bandSize = band.limit - lower;
    const taxableInBand = Math.max(0, Math.min(remaining, bandSize));
    tax += taxableInBand * band.rate;
    remaining -= taxableInBand;
    lower = band.limit;
  }
  return Math.round(tax);
}

/* ========= PAYE CALC ========= */
function calculatePAYE(){
  const gross = Number(document.getElementById('paye_gross').value || 0);
  const basic = Number(document.getElementById('paye_basic').value || 0);
  const housing = Number(document.getElementById('paye_housing').value || 0);
  const transport = Number(document.getElementById('paye_transport').value || 0);
  const utility = Number(document.getElementById('paye_utility').value || 0);
  const leaveAmt = Number(document.getElementById('paye_leave').value || 0);
  const other = Number(document.getElementById('paye_other').value || 0);
  const nhis = Number(document.getElementById('paye_nhis').value || 0);
  const life = Number(document.getElementById('paye_life').value || 0);

  const pension = pensionOfBasic(basic); // auto 8% of basic
  const cra = computeCRA(gross);

  // Rent relief: lower of ₦500,000 or 20% of rent paid (we treat housing input as rent paid)
  const rentRelief = Math.min(500000, housing * 0.20);

  // Taxable before exemption: gross minus reliefs/deductions (CRA, pension, NHIS, life, rentRelief, other allowances)
  let taxableBeforeExemption = Math.max(0, gross - cra - pension - nhis - life - rentRelief - other);

  // Exemption: first ₦800,000 tax-free
  const exemption = 800000;
  let taxableAfterExemption = Math.max(0, taxableBeforeExemption - exemption);

  // Annual tax using progressive brackets (2026)
  const annualTax = computePAYEFromTaxable(taxableAfterExemption + exemption); // computePAYEFromTaxable expects absolute thresholds with exemption lower bound logic
  // Note: function uses 'amountAboveExemption' mental model; passing taxableAfterExemption + exemption ensures threshold math aligns with earlier design.
  // But simpler: we can compute properly by just passing taxableAfterExemption and using logic in computePAYEFromTaxable. To avoid confusion, we'll recompute using clearer approach below.

  // Recompute properly:
  const annualTaxProper = computePAYEFromTaxable(taxableAfterExemption); // pass amount above exemption
  const monthlyTax = Math.round(annualTaxProper / 12);

  const effectiveRate = gross > 0 ? Math.round((annualTaxProper / gross) * 10000) / 100 : 0;

  return {
    gross, basic, housing, transport, utility, leaveAmt, other,
    pension, cra, nhis, life,
    rentRelief,
    taxableBeforeExemption,
    taxableAfterExemption,
    annualTax: annualTaxProper,
    monthlyTax,
    effectiveRate
  };
}

/* Hook to PAYE button */
document.getElementById('calc_paye').addEventListener('click', ()=>{
  const res = calculatePAYE();
  const out = document.getElementById('paye_result');

  out.innerHTML = `
    Gross Salary: ${naira(res.gross)}<br>
    Pension (8% of basic): ${naira(res.pension)}<br>
    CRA Applied: ${naira(res.cra)}<br>
    NHIS: ${naira(res.nhis)} &nbsp; Life Assurance: ${naira(res.life)}<br>
    Rent Relief (claimed): ${naira(res.rentRelief)}<br>
    <hr>
    Taxable before exemption & deductions: ${naira(res.taxableBeforeExemption)}<br>
    Taxable after ₦800,000 exemption: ${naira(res.taxableAfterExemption)}<br><br>
    <strong style="font-size:18px;color:#1e3c72">Annual PAYE: ${naira(res.annualTax)}</strong><br>
    Monthly PAYE (approx): ${naira(res.monthlyTax)}<br>
    Effective tax rate (on gross): ${res.effectiveRate}%
  `;
  show(out);
});

/* ========= VAT ========= */
function calculateVAT(amount, ratePct, zeroRated){
  amount = Number(amount||0); ratePct = Number(ratePct||7.5);
  if(zeroRated) return { vat:0, note:"Zero-rated (no VAT charged)" };
  return { vat: Math.round(amount * ratePct/100), note:"Standard VAT applied" };
}
document.getElementById('calc_vat').addEventListener('click', ()=>{
  const amt = Number(document.getElementById('vat_amount').value || 0);
  const rate = Number(document.getElementById('vat_rate').value || 7.5);
  const zero = document.getElementById('vat_zero').value === 'yes';
  const r = calculateVAT(amt, rate, zero);
  const out = document.getElementById('vat_result');
  out.innerHTML = `${r.note}<br><strong>VAT = ${naira(r.vat)}</strong>`;
  show(out);
});

/* ========= WHT ========= */
function calculateWHT(amount, type){
  amount = Number(amount||0);
  const map = { contract:0.05, consultancy:0.05, rent:0.10, dividend:0.10, interest:0.10 };
  const rate = map[type] !== undefined ? map[type] : 0.05;
  return { wht: Math.round(amount * rate), rate: rate*100 };
}
document.getElementById('calc_wht').addEventListener('click', ()=>{
  const type = document.getElementById('wht_type').value;
  const amount = Number(document.getElementById('wht_amount').value || 0);
  const r = calculateWHT(amount, type);
  const out = document.getElementById('wht_result');
  out.innerHTML = `WHT Rate: ${r.rate}%<br><strong>WHT = ${naira(r.wht)}</strong>`;
  show(out);
});

/* ========= CIT ========= */
function calculateCIT(turnover){
  turnover = Number(turnover||0);
  if(turnover <= 25000000) return { cit:0 };
  if(turnover <= 100000000) return { cit: Math.round(turnover * 0.20) };
  return { cit: Math.round(turnover * 0.30) };
}
document.getElementById('calc_cit').addEventListener('click', ()=>{
  const t = Number(document.getElementById('cit_turnover').value || 0);
  const r = calculateCIT(t);
  const out = document.getElementById('cit_result');
  out.innerHTML = `<strong>CIT payable = ${naira(r.cit)}</strong>`;
  show(out);
});

/* ========= PIT ========= */
document.getElementById('calc_pit').addEventListener('click', ()=>{
  const inc = Number(document.getElementById('pit_income').value || 0);
  const pit = Math.round(inc * 0.10);
  const out = document.getElementById('pit_result');
  out.innerHTML = `<strong>PIT payable = ${naira(pit)}</strong>`;
  show(out);
});

/* ========= SME ========= */
function calculateSME(turnover, assets){
  turnover = Number(turnover||0); assets = Number(assets||0);
  if(turnover <= 25000000) return { cit:0, note:"Micro business — 0% CIT" };
  if(turnover <= 100000000) return { cit: Math.round(turnover * 0.20), note:"SME bracket 20% CIT" };
  return { cit: Math.round(turnover * 0.30), note:"Standard CIT 30%" };
}
document.getElementById('calc_sme').addEventListener('click', ()=>{
  const t = Number(document.getElementById('sme_turnover').value || 0);
  const a = Number(document.getElementById('sme_assets').value || 0);
  const r = calculateSME(t, a);
  const out = document.getElementById('sme_result');
  out.innerHTML = `${r.note}<br><strong>Estimated CIT = ${naira(r.cit)}</strong>`;
  show(out);
});

/* ========= INFORMAL ========= */
const informalConfig = {
  lagos:{ micro:8100, small:12000, medium:24000 },
  oyo:{ micro:500, small:5000, medium:50000 }
};
document.getElementById('calc_informal').addEventListener('click', ()=>{
  const state = document.getElementById('informal_state').value;
  const cat = document.getElementById('informal_cat').value;
  const out = document.getElementById('informal_result');
  if(!informalConfig[state]) {
    out.innerHTML = `No presumptive schedule for this state. Please consult your state IRS.`;
  } else {
    out.innerHTML = `Using ${state.toUpperCase()} schedule<br><strong>Annual Presumptive Tax = ${naira(informalConfig[state][cat])}</strong>`;
  }
  show(out);
});

/* ========= RESET BUTTONS ========= */
document.getElementById('reset_paye').addEventListener('click', ()=>{
  ['paye_gross','paye_basic','paye_housing','paye_transport','paye_utility','paye_leave','paye_other','paye_nhis','paye_life'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value='';});
  hide(document.getElementById('paye_result'));
});
document.getElementById('reset_vat').addEventListener('click', ()=>{ document.getElementById('vat_amount').value=''; hide(document.getElementById('vat_result'));});
document.getElementById('reset_wht').addEventListener('click', ()=>{ document.getElementById('wht_amount').value=''; hide(document.getElementById('wht_result'));});
document.getElementById('reset_cit').addEventListener('click', ()=>{ document.getElementById('cit_turnover').value=''; hide(document.getElementById('cit_result'));});
document.getElementById('reset_pit').addEventListener('click', ()=>{ document.getElementById('pit_income').value=''; hide(document.getElementById('pit_result'));});
document.getElementById('reset_sme').addEventListener('click', ()=>{ document.getElementById('sme_turnover').value=''; document.getElementById('sme_assets').value=''; hide(document.getElementById('sme_result'));});
document.getElementById('reset_informal').addEventListener('click', ()=>{ hide(document.getElementById('informal_result'));});

/* ========= DISCLAIMER POPUP ========= */
window.addEventListener('load', function(){
  const box = document.createElement('div');
  box.style.position='fixed'; box.style.top='0'; box.style.left='0'; box.style.width='100vw'; box.style.height='100vh';
  box.style.background='rgba(0,0,0,0.55)'; box.style.display='flex'; box.style.alignItems='center'; box.style.justifyContent='center'; box.style.zIndex='9999';
  box.innerHTML=`
    <div style="background:white;padding:22px;max-width:420px;border-radius:12px;text-align:center;font-family:Segoe UI,Arial">
      <h3 style="color:#1e3c72;margin-top:0">Legal Notice</h3>
      <p style="color:#333;font-size:14px;line-height:1.4">The tax calculations on this site are estimates and not legal or tax advice. Contact <strong>Danne Corporate Services</strong> for personalised help.</p>
      <button id="closeDisclaimer" style="margin-top:12px;padding:10px 14px;background:#1e3c72;color:#fff;border:none;border-radius:8px;cursor:pointer">I Understand</button>
    </div>
  `;
  document.body.appendChild(box);
  document.getElementById('closeDisclaimer').onclick = ()=> box.remove();
});

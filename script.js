// script.js

const els = {
    age:           document.getElementById('age'),
    retireAge:     document.getElementById('retireAge'),
    endAge:        document.getElementById('endAge'),
    monthlySpending: document.getElementById('monthlySpending'),
    currentInvestment: document.getElementById('currentInvestment'),
    annualSavings: document.getElementById('annualSavings'),
    inflation:     document.getElementById('inflation'),
    swr:           document.getElementById('swr'),
    returnScenario:   document.getElementById('returnScenario'),
    returnRate:    document.getElementById('returnRate'),
    extraSavings:  document.getElementById('extraSavings'),
    baselineIntro: document.getElementById('baselineIntro'),
    baselineResult: document.getElementById('baselineResult'),
    scenarioIntro: document.getElementById('scenarioIntro'),
    scenarioResult: document.getElementById('scenarioResult'),
    baselineChart: document.getElementById('baselineChart').getContext('2d'),
    scenarioChart: document.getElementById('scenarioChart').getContext('2d')
  };
  let chart0, chart1;
  
  // — Currency formatting (unchanged) :contentReference[oaicite:0]{index=0}&#8203;:contentReference[oaicite:1]{index=1}
  function formatCurrency(e) {
    const el = e.target;
    const digits = el.value.replace(/[^\d]/g, '');
    el._num = digits ? parseInt(digits,10) : 0;
    el.value = el._num.toLocaleString();
    recalc();
  }
  document.querySelectorAll('.currency').forEach(el => {
    const d = el.value.replace(/[^\d]/g,'');
    el._num = d ? parseInt(d,10) : 0;
    el.value = el._num.toLocaleString();
    el.addEventListener('input', formatCurrency);
  });
  document.querySelectorAll('input:not(.currency), select')
          .forEach(el=>el.addEventListener('input', recalc));
  
  function recalc() {
    // 1) read inputs
    const age0    = +els.age.value     || 0;
    const retire  = +els.retireAge.value || 0;
    const endA    = +els.endAge.value  || 0;
    const mSpend  = els.monthlySpending._num || 0;
    const port0   = els.currentInvestment._num || 0;
    const annSav  = els.annualSavings._num || 0;
    const infl    = parseFloat(els.inflation.value)/100||0;
    const extra   = els.extraSavings._num||0;
  
    // 2) validate
    if (age0>=retire||retire>=endA||age0>=endA) {
      els.baselineResult.textContent = els.scenarioResult.textContent = "Invalid ages";
      if(chart0) chart0.destroy();
      if(chart1) chart1.destroy();
      return;
    }
  
    // 3) SWR schedule (years in retirement = endA–retire) :contentReference[oaicite:2]{index=2}&#8203;:contentReference[oaicite:3]{index=3}
    const planYears = endA - retire;
    const swrVal = planYears<=30 ? 4.00
                 : planYears<=40 ? 3.50
                 : planYears<=50 ? 3.00
                 : 2.50;
    els.swr.value = swrVal.toFixed(2)+'%';
    const swrNum = swrVal/100;
  
    // 4) build **nominal** target series
    const totalMonths = (endA - age0)*12;
    const baseTargetToday = swrNum===0?Infinity:(mSpend*12)/swrNum;
    const targetForCalculation = Array.from({length:totalMonths+1},(_,m)=>{
      const yrs = Math.floor(m/12);
      return baseTargetToday * Math.pow(1+infl, yrs);
    });
  
    // **Use the exact same** series for the chart, so graph & number always match
    const targetForGraph = targetForCalculation;
  
    // 5) return assumptions
    let baseR = age0<=20 ?0.10
              : age0>=65?0.055
              : 0.10 - 0.001*(age0-20);
    const scenario  = +els.returnScenario.value;
    const annualR   = baseR + scenario*0.01;
    els.returnRate.value = (annualR*100).toFixed(2)+'%';
    const monthlyRate = Math.pow(1+annualR,1/12)-1;
  
    // 6) build **nominal** portfolio curves
    const monthlySaving = annSav/12;
    const comb0=[port0], comb1=[port0];
    let w0=port0, w1=port0;
    for(let m=1; m<=totalMonths; m++){
      w0 *= 1+monthlyRate;
      w1 *= 1+monthlyRate;
      const ageDec = age0 + m/12;
      if(ageDec<retire){
        w0 += monthlySaving;
        w1 += monthlySaving + extra;
      }
      comb0.push(w0);
      comb1.push(w1);
    }
  
    // 7) intersect nominal series
    function intersect(series, target){
      for(let i=1;i<series.length;i++){
        const d0 = target[i-1] - series[i-1];
        const d1 = target[i]   - series[i];
        if(d0>=0 && d1<=0){
          const frac = d0/(d0-d1);
          const age  = age0 + ((i-1)+frac)/12;
          const val  = series[i-1] + frac*(series[i]-series[i-1]);
          return { age, val };
        }
      }
      return null;
    }
    const basePt = intersect(comb0, targetForCalculation);
    const newPt  = intersect(comb1, targetForCalculation);
  
    // 8) update panels
    els.baselineIntro.textContent = 'Based on the data and assumptions entered above, you may need';
    els.baselineResult.textContent = basePt
      ? `$${Math.round(basePt.val).toLocaleString()} at age ${basePt.age.toFixed(1)}`
      : `No FI by age ${endA}`;
  
    els.scenarioIntro.textContent = `If you can increase your monthly savings by $${extra.toLocaleString()}`;
    els.scenarioResult.textContent = basePt&&newPt
      ? `${(basePt.age-newPt.age).toFixed(1)} years sooner and your new number is $${Math.round(newPt.val).toLocaleString()}`
      : `No earlier FI by age ${endA}`;
  
    // 9) redraw charts :contentReference[oaicite:4]{index=4}&#8203;:contentReference[oaicite:5]{index=5}
    function draw(ctx, oldChart, targ, series, ix){
      if(oldChart) oldChart.destroy();
      const monthsToRetire = (retire-age0)*12,
            limit = monthsToRetire+1;
      const displayTarg   = targ.slice(0,limit),
            displaySeries = series.slice(0,limit),
            labels        = Array.from({length:limit},(_,i)=> (age0+i/12).toFixed(1) );
      const datasets = [
        {
          label:'FI Target',
          data: displayTarg.map((y,i)=>({x:age0+i/12,y})),
          borderWidth:2, 
          fill:'origin', tension:0.1, pointRadius:0
        },{
          label:'Portfolio + Savings',
          data: displaySeries.map((y,i)=>({x:age0+i/12,y})),
          borderWidth:2, fill:'origin', tension:0.1, pointRadius:0
        }
      ];
      if(ix && ix.age>=age0&&ix.age<=retire){
        datasets.push({
          label:'FI Achieved',
          data:[{x:ix.age,y:ix.val}],
          pointRadius:6, showLine:false
        });
      }
      return new Chart(ctx,{
        type:'line',
        data:{ labels, datasets },
        options:{
          scales:{
            y:{ beginAtZero:true, ticks:{callback:v=>`$${v.toLocaleString()}`} },
            x:{ type:'linear', min:age0, max:retire }
          },
          plugins:{ tooltip:{ mode:'index', intersect:false } },
          responsive:true, maintainAspectRatio:false
        }
      });
    }
  
    chart0 = draw(els.baselineChart, chart0, targetForGraph, comb0, basePt);
    chart1 = draw(els.scenarioChart, chart1, targetForGraph, comb1, newPt);
  }
  
  recalc();
  
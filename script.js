document.addEventListener('DOMContentLoaded', function() {
    const els = {
        age: document.getElementById('age'),
        retireAge: document.getElementById('retireAge'),
        endAge: document.getElementById('endAge'),
        monthlySpending: document.getElementById('monthlySpending'), // Used to calculate target base
        currentInvestment: document.getElementById('currentInvestment'),
        annualSavings: document.getElementById('annualSavings'),
        inflation: document.getElementById('inflation'),
        swr: document.getElementById('swr'), // SWR is calculated and displayed based on plan years
        returnScenario: document.getElementById('returnScenario'),
        returnRate: document.getElementById('returnRate'),
        extraSavings: document.getElementById('extraSavings'),
        baselineIntro: document.getElementById('baselineIntro'),
        baselineResult: document.getElementById('baselineResult'),
        scenarioIntro: document.getElementById('scenarioIntro'),
        scenarioResult: document.getElementById('scenarioResult'),
        baselineChart: document.getElementById('baselineChart').getContext('2d'),
        scenarioChart: document.getElementById('scenarioChart').getContext('2d')
    };
    let chart0, chart1; // Variables to hold Chart.js instances

    /**
     * Formats currency input fields by removing non-digits and adding commas.
     * Stores the numeric value in a custom '_num' property.
     * @param {Event} e - The input event.
     */
    function formatCurrency(e) {
        const el = e.target;
        const digits = el.value.replace(/[^\d]/g, '');
        el._num = digits ? parseInt(digits, 10) : 0;
        el.value = el._num.toLocaleString(); // Format with commas for display
        recalc(); // Recalculate when a currency input changes
    }

    // Attach currency formatting and input listeners
    document.querySelectorAll('.currency').forEach(el => {
        // Initialize _num with current value
        const d = el.value.replace(/[^\d]/g, '');
        el._num = d ? parseInt(d, 10) : 0;
        el.value = el._num.toLocaleString(); // Format initial value
        el.addEventListener('input', formatCurrency);
    });

    // Attach input listener to other form elements
    document.querySelectorAll('input:not(.currency), select').forEach(el =>
        el.addEventListener('input', recalc)
    );

    /**
     * Performs all retirement calculations and updates the UI.
     */
    function recalc() {
        console.clear(); // Clear console for fresh calculation log

        // 1) Read inputs, defaulting to 0 if invalid or empty
        const age0 = Number(els.age.value) || 0;
        const retire = Number(els.retireAge.value) || 0;
        const endA = Number(els.endAge.value) || 0;
        // Currency inputs use the stored numeric value
        const mSpend = els.monthlySpending._num || 0; // Used to calculate target base
        const port0 = els.currentInvestment._num || 0;
        const annSav = els.annualSavings._num || 0;
        const infl = parseFloat(els.inflation.value) / 100 || 0;
        const extra = els.extraSavings._num || 0; // Extra monthly savings
        const scenario = +els.returnScenario.value;

        console.log("Inputs:", { age0, retire, endA, mSpend, port0, annSav, infl, extra, scenario });

        // Validate basic age constraints
        if (age0 >= retire || retire >= endA || age0 >= endA) {
            console.error("Invalid age inputs: age0 >= retire or retire >= endA");
            els.baselineResult.textContent = "Invalid ages";
            els.scenarioResult.textContent = "Invalid ages";
            if (chart0) chart0.destroy();
            if (chart1) chart1.destroy();
            return; // Stop calculation
        }

        // 2) Compute SWR based on plan length (years in retirement)
        // This SWR is used for the *calculation* target base
        const planYears = endA - retire;
        const swrVal = planYears <= 30 ? 4.00 :
            planYears <= 40 ? 3.50 :
            planYears <= 50 ? 3.00 :
            2.50; // Default for plan > 50 years
        els.swr.value = swrVal.toFixed(2) + '%';
        const swrNum = swrVal / 100;
        console.log('SWR:', swrVal, swrNum);

        // 3) Build FI target curves (TWO of them)
        const totalYears = endA - age0;

        // Target 1: For Calculation (based on initial spending and inflation)
        const annualSpending = mSpend * 12;
        const initialFITarget = annualSpending / swrNum;
        const targetForCalculation = [initialFITarget];
        for (let y = 1; y <= totalYears; y++) {
            targetForCalculation.push(targetForCalculation[y - 1] * (1 + infl));
        }
        console.log('Initial FI Target (age0):', Math.round(targetForCalculation[0]).toLocaleString());

        // 4) Determine the investment return scenario factor
        console.log('scenario:', scenario);

        // 5) Compute current-age based annualR
        let annualR;
        // Assuming the value '2' in the dropdown corresponds to "Our Estimate" (9.60%)
        // **IMPORTANT: Please verify if '2' is the correct value for "Our Estimate" in your HTML**
        if (scenario === 2) {
            annualR = 0.096; // Use the 9.60% return rate directly
        } else {
            let baseR;
            if (age0 <= 20) baseR = 0.10;
            else if (age0 >= 65) baseR = 0.055;
            else baseR = 0.10 - 0.001 * (age0 - 20);
            annualR = baseR + scenario * 0.01;
        }

        els.returnRate.value = (annualR * 100).toFixed(2) + '%';
        console.log('annualR:', annualR.toFixed(4));

        // 6) Build portfolio curves (baseline and scenario) - Annual Calculation
        const comb0 = [port0]; // Baseline portfolio value over time
        const comb1 = [port0]; // Scenario portfolio value over time
        let w0 = port0;
        let w1 = port0;
        const annualSaving = annSav; // Use annual saving directly

        for (let y = 1; y <= totalYears; y++) {
            if (age0 + y < retire) {
                w0 += annualSaving;
                w1 += annualSaving + extra * 12; // Extra monthly to annual
            }
            w0 *= (1 + annualR);
            w1 *= (1 + annualR);
            comb0.push(w0);
            comb1.push(w1);
        }

        // 7) Find the intersection point (Annual Interpolation)
        function intersectAnnual(series, target_series, startAge) {
            for (let i = 1; i < series.length; i++) {
                if (series[i - 1] < target_series[i - 1] && series[i] >= target_series[i]) {
                    const diffTarget = target_series[i] - target_series[i - 1];
                    const diffSeries = series[i] - series[i - 1];
                    const frac = (target_series[i] - series[i]) / (diffSeries - diffTarget);
                    const age = startAge + i - 1 + (1 - frac); // Adjusted age calculation
                    const val = series[i - 1] + frac * diffSeries;
                    return { age, val };
                }
            }
            return null;
        }

        const basePt = intersectAnnual(comb0, targetForCalculation, age0);
        const newPt = intersectAnnual(comb1, targetForCalculation, age0);
        console.log('basePt (annual):', basePt, 'newPt (annual):', newPt);

        // 8) Update results panels
        els.baselineIntro.textContent = 'Based on the data and assumptions entered above, you may need';
        els.baselineResult.textContent = basePt ?
            `$${Math.round(basePt.val).toLocaleString()} at age ${basePt.age.toFixed(1)}` :
            `No FI by age ${endA}`;

        els.scenarioIntro.textContent = `If you can increase your monthly savings by $${extra.toLocaleString()}`;
        els.scenarioResult.textContent = basePt && newPt ?
            `${(basePt.age - newPt.age).toFixed(1)} years sooner and your new number is $${Math.round(newPt.val).toLocaleString()}` :
            `No earlier FI by age ${endA}`;

        // 9) Draw charts (adjusting for annual data)
        function drawAnnual(ctx, oldChart, targ_for_display, series, intersection, startAge, retireAge) {
            if (oldChart) oldChart.destroy();

            const yearsToRetire = retireAge - startAge;
            const displayLimit = yearsToRetire + 1;
            const displayTarg = targ_for_display.slice(0, displayLimit);
            const displaySeries = series.slice(0, displayLimit);
            const displayLabels = Array.from({ length: displayLimit }, (_, i) => (startAge + i).toFixed(1));

            const datasets = [{
                label: 'FI Target',
                data: displayTarg.map((y, i) => ({ x: startAge + i, y: y })),
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 192, 0.2)',
                borderWidth: 2,
                fill: 'origin',
                tension: 0.1,
                pointRadius: 0
            }, {
                label: 'Portfolio + Savings',
                data: displaySeries.map((y, i) => ({ x: startAge + i, y: y })),
                borderColor: 'rgb(54, 162, 235)',
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderWidth: 2,
                fill: 'origin',
                tension: 0.1,
                pointRadius: 0
            }];

            if (intersection && intersection.age >= startAge && intersection.age <= retireAge) {
                datasets.push({
                    label: 'FI Achieved',
                    data: [{ x: intersection.age, y: intersection.val }],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgb(75, 192, 192)',
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    showLine: false
                });
            }

            return new Chart(ctx, {
                type: 'line',
                data: { labels: displayLabels, datasets: datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { ticks: { callback: v => `$${v.toLocaleString()}` }, title: { display: true, text: 'Value ($)' }, beginAtZero: true },
                        x: { type: 'linear', position: 'bottom', title: { display: true, text: 'Age' }, ticks: { stepSize: 1 }, min: startAge, max: retireAge }
                    },
                    plugins: { tooltip: { mode: 'index', intersect: false, callbacks: { label: (ctx) => `${ctx.dataset.label}: $${Math.round(ctx.parsed.y).toLocaleString()}`, title: (ctx) => `Age: ${ctx[0].parsed.x.toFixed(1)}` } } },
                    hover: { mode: 'index', intersect: false }
                }
            });
        }

        chart0 = drawAnnual(els.baselineChart, chart0, targetForCalculation, comb0, basePt, age0, retire);
        chart1 = drawAnnual(els.scenarioChart, chart1, targetForCalculation, comb1, newPt, age0, retire);
    }

    // Initial calculation and drawing when the page loads
    recalc();
});

// FV future value
// PV present value
// PMT payment (saving on monthly basis so dived the total by 12)
// r = rate of return
// k = factor monthly compounding / monthly savings
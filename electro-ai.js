/**
 * ElectroAI - Hybrid AI for Electrical Calculations
 * 100% Client-side, Zero API Cost
 * Integrasi dengan ElectroCalc existing
 */

class ElectroAI {
    constructor() {
        // Konstanta Fisika & Material
        this.CONSTANTS = {
            COPPER_RESISTIVITY: 0.0172, // Ω·mm²/m @ 20°C
            ALUMINUM_RESISTIVITY: 0.0282,
            DEFAULT_EFFICIENCY: 0.85,
            DEFAULT_PF: 0.85,
            SLOT_FILL_FACTOR_MAX: 0.75, // 75% maksimum untuk hand winding
            WIRE_TABLES: this.generateWireTables()
        };
        
        // Pattern untuk Intent Classification
        this.INTENT_PATTERNS = {
            calculation: {
                patterns: [
                    /(\d+\.?\d*)\s*(hp|kw|horsepower|kilowatt)/i,
                    /(hitung|calculate|compute|berapa)\s*(lilitan|turns|wire|kawat|ampere)/i,
                    /(rewind|gulung\s*ulang|reparasi)/i,
                    /(\d+\.?\d*)\s*(volt|v)\s+(\d+\.?\d*)\s*(ampere|a)/i
                ],
                confidence: 0
            },
            conceptual: {
                patterns: [
                    /(apa|what|kenapa|why|bagaimana|how)\s*(itu|adalah|does|is)/i,
                    /(fill\s*factor|faktor\s*isi|flux\s*density)/i,
                    /(bedanya|difference|versus|vs)/i
                ],
                confidence: 0
            }
        };
    }

    /**
     * Intent Classifier - Deterministic, no LLM needed
     */
    classifyIntent(input) {
        const text = input.toLowerCase();
        let maxConfidence = 0;
        let detectedType = 'general';
        
        // Cek pola kalkulasi
        for (let [type, config] of Object.entries(this.INTENT_PATTERNS)) {
            let matches = 0;
            config.patterns.forEach(pattern => {
                if (pattern.test(text)) matches++;
            });
            
            let confidence = matches / config.patterns.length;
            if (confidence > maxConfidence) {
                maxConfidence = confidence;
                detectedType = type;
            }
        }
        
        // Extract parameters untuk kalkulasi
        const params = this.extractParameters(text);
        
        return {
            type: detectedType,
            confidence: maxConfidence,
            params: params,
            original: input
        };
    }

    /**
     * Parameter Extractor - Regex based entity extraction
     */
    extractParameters(text) {
        const params = {
            power: null, unit: 'HP', voltage: 380, phase: 3,
            poles: 4, frequency: 50, slot: null, originalWire: null
        };

        // Extract Power (HP or kW)
        const hpMatch = text.match(/(\d+\.?\d*)\s*(hp|horsepower|pk)/i);
        const kwMatch = text.match(/(\d+\.?\d*)\s*(kw|kilowatt)/i);
        
        if (hpMatch) {
            params.power = parseFloat(hpMatch[1]);
            params.unit = 'HP';
        } else if (kwMatch) {
            params.power = parseFloat(kwMatch[1]);
            params.unit = 'kW';
        }

        // Extract Voltage
        const voltMatch = text.match(/(\d{2,3})\s*(volt|v)/i);
        if (voltMatch) params.voltage = parseInt(voltMatch[1]);

        // Extract Phase
        if (/(\b1\s*phase|\bmono|\bsingle)/i.test(text)) params.phase = 1;
        else if (/(\b3\s*phase|\btiga)/i.test(text)) params.phase = 3;

        // Extract Poles
        const poleMatch = text.match(/(\d)\s*(kutub|pole)/i);
        if (poleMatch) params.poles = parseInt(poleMatch[1]);

        // Extract Wire size jika ada
        const wireMatch = text.match(/(diameter|kawat|wire)\s*(\d+\.?\d*)\s*mm/i);
        if (wireMatch) params.originalWire = parseFloat(wireMatch[2]);

        return params;
    }

    /**
     * Hybrid Query Processor
     */
    async processQuery(userInput) {
        const intent = this.classifyIntent(userInput);
        
        if (intent.type === 'calculation' && intent.confidence > 0.2) {
            return await this.preciseCalculation(intent);
        } else {
            return this.conceptualResponse(intent);
        }
    }

    /**
     * Precise Calculation Engine - Math exact
     */
    async preciseCalculation(intent) {
        const p = intent.params;
        
        try {
            // 1. Konversi ke kW jika HP
            let powerKW = p.unit === 'HP' ? p.power * 0.746 : p.power;
            
            // 2. Hitung Arus (I = P / (V × η × cos φ × √3))
            const efficiency = this.CONSTANTS.DEFAULT_EFFICIENCY;
            const pf = this.CONSTANTS.DEFAULT_PF;
            const sqrt3 = Math.sqrt(3);
            
            let current = p.phase === 3 
                ? (powerKW * 1000) / (p.voltage * efficiency * pf * sqrt3)
                : (powerKW * 1000) / (p.voltage * efficiency * pf);
            
            current = Math.round(current * 10) / 10;

            // 3. Hitung Wire Size (berdasarkan ampacity copper, 4A/mm²)
            const wireArea = current / 4; // 4 A/mm² standar winding
            const wireDiameter = Math.sqrt((4 * wireArea) / Math.PI);
            
            // 4. Pilih standar wire terdekat (SWG/AWG)
            const standardWire = this.selectStandardWire(wireDiameter);
            
            // 5. Hitung Kecepatan Sinkron
            const syncSpeed = (120 * p.frequency) / p.poles; // RPM
            
            // 6. Estimasi Turns per Coil (sederhana berdasarkan V/turn)
            // Asumsi tegangan per turn ~ 2-5V untuk motor kecil
            const voltPerTurn = 3.5; // Adjustable
            const totalTurns = Math.round((p.voltage * 0.9) / voltPerTurn);
            const turnsPerCoil = Math.round(totalTurns / (p.poles * p.phase));

            // 7. Fill Factor Check (jika dimensi slot diketahui)
            let fillFactor = null;
            if (p.slot) {
                fillFactor = this.calculateFillFactor(standardWire.area, turnsPerCoil, p.slot);
            }

            // Format Response
            let response = {
                type: 'calculation',
                title: `Analisis Motor ${p.power}${p.unit} ${p.voltage}V ${p.phase}Phase`,
                data: {
                    arus: { value: current, unit: 'A', formula: 'P/(V×η×cosφ×√3)' },
                    kawat: { 
                        diameter: { value: wireDiameter.toFixed(3), unit: 'mm' },
                        standar: standardWire.gauge,
                        area: { value: wireArea.toFixed(2), unit: 'mm²' }
                    },
                    lilitan: { perCoil: turnsPerCoil, total: totalTurns },
                    kecepatan: { sync: syncSpeed, unit: 'RPM' }
                },
                recommendations: []
            };

            // Validasi & Recommendations
            if (fillFactor && fillFactor > 0.75) {
                response.recommendations.push(
                    `⚠️ Fill factor ${(fillFactor*100).toFixed(1)}% melebihi 75%. ` +
                    `Saran: Gunakan paralel ${Math.ceil(fillFactor/0.7)} lintasan atau naikkan ukuran slot.`
                );
            }
            
            if (current > 100 && p.power < 10) {
                response.recommendations.push(
                    `ℹ️ Arus tinggi (${current}A). Pastikan koneksi terminal kuat.`
                );
            }

            return response;

        } catch (error) {
            return {
                type: 'error',
                message: 'Error perhitungan: ' + error.message,
                fallback: 'Coba masukkan data: [Power HP] [Voltase] [Phase] [Pole]'
            };
        }
    }

    /**
     * Conceptual Response - Template based
     */
    conceptualResponse(intent) {
        const text = intent.original.toLowerCase();
        let response = {
            type: 'conceptual',
            content: '',
            relatedFormulas: []
        };

        if (text.includes('fill factor') || text.includes('faktor isi')) {
            response.content = `
**Fill Factor (Faktor Isi Slot)** adalah perbandingan antara luas penampang konduktor 
aktual terhadap luas total slot stator.

**Rumus:** 
\`Fill Factor = (N × A_wire) / A_slot\`

Dimana:
- N = Jumlah lilitan per slot
- A_wire = Luas penampang kawat (mm²)
- A_slot = Luas slot stator (mm²)

**Standar:**
- Hand winding: Maksimum 70-75%
- Machine winding: Bisa sampai 85%

Jika fill factor > 75%, kawat sulit masuk dan risiko isolasi terkikis tinggi.
            `;
            response.relatedFormulas = ['Fill Factor = N × (πd²/4) / A_slot'];
        }
        else if (text.includes('turn') || text.includes('lilitan')) {
            response.content = `
**Menghitung Jumlah Lilitan (Turns):**

Prinsip dasar: Tegangan per lilitan (V/turn) tergantung:
- Ukuran stator (diameter bore)
- Panjang inti besi
- Kualitas material magnetic (Bmax)

**Rumus Empiris:**
\`Turns/Coil = (V_line × 0.9) / (Poles × Phase × V_per_turn)\`

V_per_turn biasanya 2-5V untuk motor 1-10HP.

**Tips:** Jika mengubah tegangan, rasio lilitan berbanding lurus.
Contoh: 380V → 220V (ratio 1.73), lilitan dikurangi 1.73x.
            `;
        }
        else {
            response.content = `
Saya bisa membantu perhitungan:

**Cara Pakai:**
1. "Hitung motor 5HP 380V 3 phase 4 pole"
2. "Kawat diameter 0.8mm untuk 2HP 220V"
3. "Apa itu fill factor?"

**Parameter yang didukung:**
- Daya: HP atau kW
- Tegangan: 110V, 220V, 380V, 415V
- Phase: 1 atau 3
- Kutub: 2, 4, 6, 8 pole
- Material kawat: Tembaga default (Aluminum support soon)

Masukkan data motor Anda untuk analisis presisi.
            `;
        }

        return response;
    }

    /**
     * Utility: Generate Wire Tables (SWG/AWG)
     */
    generateWireTables() {
        // Data sederhana SWG standar yang umum di Indonesia
        return [
            { gauge: 'SWG 20', diameter: 0.914, area: 0.656, ampacity: 2.6 },
            { gauge: 'SWG 19', diameter: 1.016, area: 0.811, ampacity: 3.2 },
            { gauge: 'SWG 18', diameter: 1.219, area: 1.167, ampacity: 4.7 },
            { gauge: 'SWG 17', diameter: 1.422, area: 1.589, ampacity: 6.4 },
            { gauge: 'SWG 16', diameter: 1.626, area: 2.075, ampacity: 8.3 },
            { gauge: 'SWG 15', diameter: 1.829, area: 2.626, ampacity: 10.5 },
            { gauge: 'AWG 14', diameter: 1.628, area: 2.081, ampacity: 8.3 },
            { gauge: 'AWG 13', diameter: 1.828, area: 2.624, ampacity: 10.5 },
            { gauge: 'AWG 12', diameter: 2.053, area: 3.309, ampacity: 13.2 }
        ];
    }

    selectStandardWire(calculatedDia) {
        // Pilih wire terdekat yang tersedia di pasaran
        let closest = this.CONSTANTS.WIRE_TABLES[0];
        let minDiff = Math.abs(calculatedDia - closest.diameter);

        for (let wire of this.CONSTANTS.WIRE_TABLES) {
            const diff = Math.abs(calculatedDia - wire.diameter);
            if (diff < minDiff) {
                minDiff = diff;
                closest = wire;
            }
        }
        return closest;
    }

    calculateFillFactor(wireArea, turns, slotDimensions) {
        // Asumsi slot rectangular: width x height (mm)
        // Jika slotDimensions tidak provided, return null
        if (!slotDimensions || !slotDimensions.width) return null;
        
        const slotArea = slotDimensions.width * slotDimensions.height;
        const totalWireArea = turns * wireArea;
        return totalWireArea / slotArea;
    }
}

// Export untuk modular system
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ElectroAI;
              }

// =========================================================
// ImmunoTwin - Beyza'nın Uygulama Mantığı & Simülasyon Katmanı
// Gereksinimler: UI-01, UI-02, UI-03, UI-04 & 3 Kullanıcı Profili
// =========================================================

let currentPersona = 'tester'; // Varsayılan: Test Ekibi (Tüm paneller görünür)
let deviceStatus = 'READY';    // READY | MEASURING | LOW_BATTERY | SENSOR_ERROR
let batteryLevel = 92;
let crpChart = null;

// Örnek geçmiş veriler (UI-03 Line Chart'ın ilk açılışta dolu görünmesi için)
const defaultMeasurements = [
  { time: '10 Kas 09:15', patientId: 'HST-2026-042', crp: 2.1, ldr: 3522, risk: 'NORMAL' },
  { time: '11 Kas 14:30', patientId: 'HST-2026-042', crp: 3.8, ldr: 3058, risk: 'SINIRDA' },
  { time: '12 Kas 11:05', patientId: 'HST-2026-042', crp: 8.4, ldr: 1802, risk: 'YUKSEK' },
  { time: '13 Kas 16:45', patientId: 'HST-2026-042', crp: 6.2, ldr: 2402, risk: 'YUKSEK' },
  { time: '14 Kas 10:20', patientId: 'HST-2026-042', crp: 2.9, ldr: 3303, risk: 'NORMAL' }
];

let measurements = JSON.parse(localStorage.getItem('immunotwin_logs')) || [...defaultMeasurements];

// Sayfa yüklendiğinde başlat
document.addEventListener('DOMContentLoaded', () => {
  setPersona('tester');
  initChart();
  renderHistoryTable();
  updateTopSummary();
  logSerial('Sistem baslatildi. ESP32-Wokwi baglantisi hazir.');
});

// Canlı saat
setInterval(() => {
  const clockEl = document.getElementById('clock');
  if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('tr-TR');
}, 1000);

// ---------------------------------------------------------
// 1. KULLANICI PROFİLİ (PERSONA) YÖNETİMİ
// ---------------------------------------------------------
function setPersona(persona) {
  currentPersona = persona;
  document.body.setAttribute('data-persona', persona);

  document.querySelectorAll('.persona-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.persona === persona);
  });

  const roleLabels = {
    patient: 'Hasta / Ev Kullanıcısı Modu (Sade Görünüm)',
    doctor: 'Sağlık Personeli / Doktor Modu (Klinik Takip)',
    tester: 'Yazılım & Test Ekibi Modu (Tam Simülatör Kontrolü)'
  };
  logSerial(`Profil degistirildi -> ${roleLabels[persona]}`);
}

// ---------------------------------------------------------
// 2. UI-01: ÖLÇÜM EKRANI & PROGRESS BAR ALGORİTMASI
// ---------------------------------------------------------
function startMeasurement() {
  if (deviceStatus === 'MEASURING') return;

  if (deviceStatus === 'SENSOR_ERROR') {
    alert('Sensör Hatası! Lütfen önce simülatör panelinden cihazı sıfırlayın.');
    logSerial('[HATA] Olcum reddedildi: Optik sensor (GPIO 34) yanit vermiyor.');
    return;
  }

  deviceStatus = 'MEASURING';
  const btn = document.getElementById('btn-start-measure');
  const progressWrapper = document.getElementById('progress-wrapper');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const progressTimer = document.getElementById('progress-timer');

  btn.disabled = true;
  btn.textContent = 'Analiz Ediliyor...';
  progressWrapper.classList.remove('hidden');
  updateTopSummary('Analiz Ediliyor...');

  // Betül'ün ESP32 kodundaki delay(1500) süresini birebir simüle ediyoruz
  const totalDuration = 1500;
  const intervalStep = 50;
  let elapsed = 0;

  logSerial('Butona basildi (GPIO 12 HIGH). Analiz baslatiliyor...');

  const timer = setInterval(() => {
    elapsed += intervalStep;
    const percent = Math.min(100, Math.round((elapsed / totalDuration) * 100));
    const remainingSec = Math.max(0, ((totalDuration - elapsed) / 1000)).toFixed(1);

    progressBar.style.width = `${percent}%`;
    progressTimer.textContent = `${remainingSec} sn`;

    if (percent < 40) {
      progressText.textContent = 'Optik sensör kalibre ediliyor...';
    } else if (percent < 85) {
      progressText.textContent = 'Lateks bulanıklık yoğunluğu ölçülüyor...';
    } else {
      progressText.textContent = 'CRP konsantrasyonu hesaplanıyor...';
    }

    if (elapsed >= totalDuration) {
      clearInterval(timer);

      // Simülatör slider'ındaki mevcut LDR değerini oku
      const currentLdr = parseInt(document.getElementById('sim-ldr-input').value, 10);
      const calculatedCrp = ldrToCrp(currentLdr);

      // Cihaz durumunu önceki hata/pil durumuna geri döndür
      deviceStatus = batteryLevel <= 15 ? 'LOW_BATTERY' : 'READY';
      btn.disabled = false;
      btn.textContent = 'Ölçümü Başlat';

      setTimeout(() => {
        progressWrapper.classList.add('hidden');
        progressBar.style.width = '0%';
      }, 600);

      updateCRPData(calculatedCrp, currentLdr);
    }
  }, intervalStep);
}

// ---------------------------------------------------------
// 3. UI-02 & ENTEGRASYON: VERİ GÜNCELLEME VE RENK KODLAMA
// (Wokwi / ESP32'den canlı veri geldiğinde bu fonksiyon çağrılır)
// ---------------------------------------------------------
function updateCRPData(crpValue, rawLux = '-') {
  const numericCRP = parseFloat(crpValue);
  const formattedCRP = numericCRP.toFixed(1);

  const valueEl = document.getElementById('crp-value');
  const bannerEl = document.getElementById('status-banner');
  const noteEl = document.getElementById('clinical-note');
  const luxEl = document.getElementById('raw-lux');
  const resultCard = document.getElementById('result-card');

  valueEl.textContent = formattedCRP;
  luxEl.textContent = rawLux;
  resultCard.classList.remove('state-normal', 'state-warning', 'state-danger');

  // Hasta profili için Yeşil / Sarı / Kırmızı + Betül'ün 5.0 mg/L kritik eşiği
  let riskCategory = 'NORMAL';

  if (numericCRP >= 5.0) {
    riskCategory = 'YUKSEK';
    valueEl.style.color = '#dc2626';
    resultCard.classList.add('state-danger');
    bannerEl.className = 'status-banner danger';
    bannerEl.textContent = 'DURUM: YÜKSEK RİSK (>= 5.0 mg/L) - KRİTİK UYARI';
    noteEl.textContent = 'Akut inflamasyon veya enfeksiyon şüphesi. Lütfen doktorunuza başvurun.';
  } else if (numericCRP >= 3.0) {
    riskCategory = 'SINIRDA';
    valueEl.style.color = '#d97706';
    resultCard.classList.add('state-warning');
    bannerEl.className = 'status-banner warning';
    bannerEl.textContent = 'DURUM: SINIRDA DEĞER (3.0 - 4.9 mg/L) - TAKİP ÖNERİLİR';
    noteEl.textContent = 'Değer normal üst sınırına yakın. 24 saat içinde tekrar ölçüm önerilir.';
  } else {
    riskCategory = 'NORMAL';
    valueEl.style.color = '#16a34a';
    resultCard.classList.add('state-normal');
    bannerEl.className = 'status-banner normal';
    bannerEl.textContent = 'DURUM: NORMAL (< 3.0 mg/L)';
    noteEl.textContent = 'CRP konsantrasyonu güvenli referans aralığındadır.';
  }

  logSerial(`Okunan Lux (Raw): ${rawLux} | Hesaplanan CRP: ${formattedCRP} mg/L -> ${riskCategory}`);

  // Kayıt ekle ve grafiği güncelle
  const patientId = document.getElementById('patient-id').value || 'HST-2026-042';
  const nowStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  measurements.push({
    time: nowStr,
    patientId: patientId,
    crp: parseFloat(formattedCRP),
    ldr: rawLux,
    risk: riskCategory
  });

  localStorage.setItem('immunotwin_logs', JSON.stringify(measurements));
  renderHistoryTable();
  updateChart();
  updateTopSummary('Analiz Tamamlandı');
}

// ---------------------------------------------------------
// 4. UI-04: SİMÜLATÖR KONTROL PANELİ (SLIDER & HATA SİMÜLASYONU)
// Betül'ün formülü: map(ldrValue, 0, 4095, 150, 0)
// ---------------------------------------------------------
function ldrToCrp(ldr) {
  const crp = ((4095 - ldr) / 4095) * 150;
  return Math.max(0, Math.min(150, crp));
}

function crpToLdr(crp) {
  const ldr = Math.round(4095 - (crp / 150) * 4095);
  return Math.max(0, Math.min(4095, ldr));
}

function syncFromCRP(crpVal) {
  const clamped = Math.max(0, Math.min(150, parseFloat(crpVal) || 0));
  const ldr = crpToLdr(clamped);

  document.getElementById('sim-crp-slider').value = clamped;
  document.getElementById('sim-crp-input').value = clamped.toFixed(1);
  document.getElementById('sim-ldr-slider').value = ldr;
  document.getElementById('sim-ldr-input').value = ldr;
}

function syncFromLDR(ldrVal) {
  const clamped = Math.max(0, Math.min(4095, parseInt(ldrVal, 10) || 0));
  const crp = ldrToCrp(clamped);

  document.getElementById('sim-ldr-slider').value = clamped;
  document.getElementById('sim-ldr-input').value = clamped;
  document.getElementById('sim-crp-slider').value = crp.toFixed(1);
  document.getElementById('sim-crp-input').value = crp.toFixed(1);
}

function simulateFault(type) {
  const badge = document.getElementById('connection-badge');
  const batEl = document.getElementById('battery-indicator');

  if (type === 'LOW_BATTERY') {
    deviceStatus = 'LOW_BATTERY';
    batteryLevel = 12;
    badge.className = 'badge warning';
    badge.textContent = 'ESP32 Uyarı: Düşük Pil (%12)';
    batEl.textContent = 'Pil: %12 (Kritik)';
    updateTopSummary('Düşük Pil Uyarısı');
    logSerial('[UYARI] Batarya seviyesi kritik (%12). Cihazi sarja baglayin.');
  } else if (type === 'SENSOR_ERROR') {
    deviceStatus = 'SENSOR_ERROR';
    badge.className = 'badge danger';
    badge.textContent = 'HATA: Optik Sensör (GPIO 34) Yok';
    updateTopSummary('Sensör Hatası (ERR-04)');
    logSerial('[KRITIK HATA] LDR optik sensorunden sinyal alinamiyor! Kablolari kontrol edin.');
  } else {
    deviceStatus = 'READY';
    batteryLevel = 92;
    badge.className = 'badge online';
    badge.textContent = 'ESP32 Simülasyon: Hazır';
    batEl.textContent = 'Pil: %92';
    updateTopSummary('Kaset Takılı - Hazır');
    logSerial('[BILGI] Cihaz sifirlandi. Normal calisma moduna donuldu.');
  }
}

// ---------------------------------------------------------
// 5. UI-03: GEÇMİŞ VERİ GRAFİĞİ (CHART.JS) & TABLO
// ---------------------------------------------------------
function initChart() {
  const ctx = document.getElementById('crpChart').getContext('2d');
  crpChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: measurements.map(m => m.time),
      datasets: [
        {
          label: 'CRP Konsantrasyonu (mg/L)',
          data: measurements.map(m => m.crp),
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.12)',
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: measurements.map(m => m.crp >= 5.0 ? '#dc2626' : '#16a34a'),
          tension: 0.3,
          fill: true
        },
        {
          label: 'Kritik Eşik (5.0 mg/L)',
          data: measurements.map(() => 5.0),
          borderColor: '#dc2626',
          borderDash: [6, 6],
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'mg/L' } }
      }
    }
  });
}

function updateChart() {
  if (!crpChart) return;
  crpChart.data.labels = measurements.map(m => m.time);
  crpChart.data.datasets[0].data = measurements.map(m => m.crp);
  crpChart.data.datasets[0].pointBackgroundColor = measurements.map(m => m.crp >= 5.0 ? '#dc2626' : '#16a34a');
  crpChart.data.datasets[1].data = measurements.map(() => 5.0);
  crpChart.update();
}

function renderHistoryTable() {
  const tbody = document.getElementById('history-body');
  tbody.innerHTML = '';

  [...measurements].reverse().forEach(item => {
    const color = item.risk === 'YUKSEK' ? '#dc2626' : (item.risk === 'SINIRDA' ? '#d97706' : '#16a34a');
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.time}</td>
      <td>${item.patientId}</td>
      <td><strong>${item.crp.toFixed(1)} mg/L</strong></td>
      <td>${item.ldr}</td>
      <td style="color:${color}; font-weight:700;">${item.risk}</td>
    `;
    tbody.appendChild(row);
  });
}

function resetHistory() {
  measurements = [...defaultMeasurements];
  localStorage.setItem('immunotwin_logs', JSON.stringify(measurements));
  renderHistoryTable();
  updateChart();
  updateTopSummary();
  logSerial('Olcum gecmisi varsayilan kayitlara sifirlandi.');
}

function updateTopSummary(customState) {
  const last = measurements[measurements.length - 1];
  if (last) {
    document.getElementById('summary-last-crp').textContent = `${last.crp.toFixed(1)} mg/L`;
    const riskEl = document.getElementById('summary-risk-badge');
    riskEl.textContent = last.risk;
    riskEl.style.color = last.crp >= 5.0 ? '#dc2626' : (last.crp >= 3.0 ? '#d97706' : '#16a34a');
  }
  document.getElementById('summary-total-tests').textContent = `${measurements.length} Kayıt`;
  if (customState) {
    document.getElementById('summary-device-state').textContent = customState;
  }
}

function logSerial(msg) {
  const box = document.getElementById('serial-console');
  if (!box) return;
  const t = new Date().toLocaleTimeString('tr-TR');
  box.innerHTML += `<div>[${t}] ${msg}</div>`;
  box.scrollTop = box.scrollHeight;
}
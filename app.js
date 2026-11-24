// Canlı saat göstergesi
setInterval(() => {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('tr-TR');
}, 1000);

/**
 * BEYZANUR İÇİN ENTEGRASYON FONKSİYONU:
 * ESP32 / Wokwi'den Wi-Fi, HTTP veya WebSocket ile veri geldiğinde
 * sadece bu fonksiyonu (crpValue, rawLux) parametreleriyle çağırması yeterlidir.
 */
function updateCRPData(crpValue, rawLux = "-") {
  const valueEl = document.getElementById('crp-value');
  const bannerEl = document.getElementById('status-banner');
  const noteEl = document.getElementById('clinical-note');
  const luxEl = document.getElementById('raw-lux');
  const stateEl = document.getElementById('device-state');

  const numericCRP = parseFloat(crpValue).toFixed(1);
  valueEl.textContent = numericCRP;
  luxEl.textContent = rawLux;
  stateEl.value = "Analiz Tamamlandı";

  // Betül'ün ESP32 kodundaki 5.0 mg/L kritik eşik mantığı ile birebir uyumlu
  const isHighRisk = numericCRP >= 5.0;

  if (isHighRisk) {
    valueEl.style.color = "#dc2626";
    bannerEl.className = "status-banner danger";
    bannerEl.textContent = "DURUM: YÜKSEK RİSK (>= 5.0 mg/L) - OTOMATİK KLİNİK UYARI";
    noteEl.textContent = "Akut inflamasyon veya enfeksiyon şüphesi. Hekim değerlendirmesi önerilir.";
  } else {
    valueEl.style.color = "#16a34a";
    bannerEl.className = "status-banner normal";
    bannerEl.textContent = "DURUM: NORMAL (< 5.0 mg/L)";
    noteEl.textContent = "CRP konsantrasyonu referans aralık içerisindedir.";
  }

  addHistoryRow(numericCRP, isHighRisk);
}

function addHistoryRow(crp, isHighRisk) {
  const tbody = document.getElementById('history-body');
  const patientId = document.getElementById('patient-id').value || "Bilinmeyen Hasta";
  const time = new Date().toLocaleTimeString('tr-TR');

  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${time}</td>
    <td>${patientId}</td>
    <td><strong>${crp} mg/L</strong></td>
    <td>${isHighRisk ? 'Yüksek Risk / İnflamasyon' : 'Normal Aralık'}</td>
    <td style="color: ${isHighRisk ? '#dc2626' : '#16a34a'}; font-weight: bold;">
      ${isHighRisk ? 'KRİTİK UYARI' : 'UYGUN'}
    </td>
  `;
  tbody.prepend(row);
}
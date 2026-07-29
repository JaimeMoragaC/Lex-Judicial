import { REAL_DISK_DATA } from '../realDiskData';

export function findDiscoFolder(casoObj) {
  if (!casoObj) return null;
  const cliente = casoObj.cliente || '';
  
  // MÉTODO 1 (PRIORITARIO): Extraer nombre exacto de carpeta desde la marca 📁 inyectada por importar_excel_pjud.py
  const markerMatch = cliente.match(/📁 \(Expediente en Disco: (.+?)\)/);
  if (markerMatch) {
    const exactFolderName = markerMatch[1].trim();
    const found = REAL_DISK_DATA.find(d => d.folderName.trim().toLowerCase() === exactFolderName.toLowerCase());
    if (found) return found;
  }
  
  // MÉTODO 2 (FALLBACK): buscar por nombre de cliente limpio (Solo coincidencia EXACTA o muy precisa)
  const cleanClient = cliente.replace(/📁.*$/, '').trim().toLowerCase();
  if (cleanClient && cleanClient.length > 3 && cleanClient !== 'causa propia / en reserva (pjud)') {
    const found = REAL_DISK_DATA.find(d => {
      const fl = d.folderName.toLowerCase().trim();
      return fl === cleanClient;
    });
    if (found) return found;
  }
  
  // MÉTODO 3 (HEURÍSTICO): Cruzar palabras significativas de cliente + contraparte + carátula
  const STOP = new Set(['contra','juzgado','tribunal','corte','region','comuna','municipal','corporacion','ministerio','publico','laboral','penal','civil','familia','garantia','letras','otros','parte','causa','propia','reserva','pjud','ingreso','resolución','ordena','vista','presente','cuenta','tramitacion']);
  const allText = `${cleanClient} ${casoObj.contraparte || ''} ${casoObj.caratula || ''}`.toLowerCase();
  const words = [...new Set(allText.match(/[a-záéíóúñü]{5,}/g) || [])].filter(w => !STOP.has(w));
  
  if (words.length >= 2) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const d of REAL_DISK_DATA) {
      const fl = d.folderName.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (fl.includes(w)) score++;
      }
      if (score >= 2 && score > bestScore) {
        bestScore = score;
        bestMatch = d;
      }
    }
    
    if (bestMatch) return bestMatch;
  }
  
  return null;
}

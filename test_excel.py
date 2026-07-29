import pandas as pd
import os

path_causas = "/home/jaime/Descargas/Causas_8328581-8.xlsx"
path_ed = "/home/jaime/Descargas/EstadoDiario8328581-8_25_07_2026.xls"

print("="*60)
print("📊 ANALIZANDO EXCEL MAESTRO DE CAUSAS PJUD")
print("="*60)
xl_c = pd.ExcelFile(path_causas)
total_c = 0
todas_causas = []

for sheet in xl_c.sheet_names:
    df = xl_c.parse(sheet)
    print(f"  🏛️ Jurisdicción {sheet}: {len(df)} causas oficiales")
    total_c += len(df)
    for idx, row in df.iterrows():
        todas_causas.append({
            "jurisdiccion": sheet,
            "rol": f"{row.get('Rol', '')}-{row.get('Era', '')}",
            "caratulado": str(row.get('Caratulado', '--')),
            "estado": str(row.get('Estado Causa', 'En Tramitación')),
            "fecha_ingreso": str(row.get('Fecha Ingreso', ''))
        })

print(f"\n🎯 TOTAL ABSOLUTO DE CAUSAS EN PJUD: {total_c}")

print("\n" + "="*60)
print("📰 ANALIZANDO EXCEL DE ESTADO DIARIO")
print("="*60)
if os.path.exists(path_ed):
    xl_e = pd.ExcelFile(path_ed)
    total_e = 0
    for sheet in xl_e.sheet_names:
        df_e = xl_e.parse(sheet)
        if len(df_e) > 0:
            print(f"  🔔 {sheet}: {len(df_e)} publicaciones hoy")
            total_e += len(df_e)
    print(f"🎯 TOTAL PUBLICACIONES ESTADO DIARIO HOY: {total_e}")
else:
    print("No se encontró el archivo de Estado Diario en esa ruta.")

print("\n🔍 EJEMPLO DE LAS 5 CAUSAS MÁS RECIENTES:")
for c in todas_causas[:5]:
    print(f"  ▪ [{c['jurisdiccion']}] Rol: {c['rol']} | Estado: {c['estado']} | Carátula: {c['caratulado'][:60]}")

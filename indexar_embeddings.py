#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LexControl - Índice semántico (embeddings) de los expedientes
================================================================
Genera un vector nomic-embed-text (768 dim, vía Ollama local, sin costo ni
internet) para cada documento que indexar_pdfs.py ya extrajo, reutilizando ese
texto -no vuelve a abrir los PDF-, y lo guarda en la misma base
data/indice_texto.sqlite (tabla `embeddings`). Esto habilita /buscar_semantico:
encontrar documentos por significado ("despido sin causa justificada") en vez
de sólo por frase exacta, que es lo que hace /buscar_texto (FTS5 literal).

Es incremental igual que indexar_pdfs.py: sólo procesa lo que falta o cambió
desde la última corrida (compara indexar_pdfs.abrir_indice/`archivos.indexado`
contra `embeddings.generado`). Se puede interrumpir con Ctrl-C y retomar donde iba.

    python3 indexar_embeddings.py              # vectoriza lo que falte
    python3 indexar_embeddings.py --rehacer    # recalcula todos los vectores
    python3 indexar_embeddings.py --limite 200 # sólo los primeros 200 (para probar)

Requiere que indexar_pdfs.py ya se haya corrido al menos una vez (el índice de
texto tiene que existir) y que Ollama esté corriendo con "ollama pull nomic-embed-text".
"""
import argparse
import sys
import time
import urllib.request

import indexar_pdfs


def main():
    parser = argparse.ArgumentParser(description="Índice semántico (embeddings) de expedientes")
    parser.add_argument("--rehacer", action="store_true", help="Borra los embeddings y los recalcula todos")
    parser.add_argument("--limite", type=int, default=0, help="Límite de documentos a procesar")
    args = parser.parse_args()

    try:
        with urllib.request.urlopen(f"{indexar_pdfs.OLLAMA_HOST}/api/tags", timeout=2) as r:
            if r.status != 200:
                raise ConnectionError
    except Exception:
        print(f"❌ Ollama no responde en {indexar_pdfs.OLLAMA_HOST}. ¿Está corriendo? (ollama serve)")
        sys.exit(1)

    if not indexar_pdfs.INDICE.exists():
        print("❌ No existe el índice de texto todavía. Corre primero: python3 indexar_pdfs.py")
        sys.exit(1)

    con = indexar_pdfs.abrir_indice()

    if args.rehacer:
        print("⚠️  Borrando embeddings anteriores")
        con.execute("DELETE FROM embeddings")
        con.commit()

    pendientes = con.execute("""
        SELECT a.ruta, t.contenido
        FROM archivos a
        JOIN textos t ON t.ruta = a.ruta
        LEFT JOIN embeddings e ON e.ruta = a.ruta
        WHERE e.ruta IS NULL OR e.generado < a.indexado
    """).fetchall()

    if args.limite:
        pendientes = pendientes[: args.limite]

    total_docs = con.execute("SELECT COUNT(*) FROM archivos").fetchone()[0]
    print(f"🔎 {len(pendientes)} documentos por vectorizar ({total_docs - len(pendientes)} ya al día de {total_docs}).")
    if not pendientes:
        print("✅ El índice semántico está 100% al día.")
        con.close()
        return

    inicio = time.time()
    hechos = fallidos = 0
    try:
        for n, (ruta, contenido) in enumerate(pendientes, 1):
            if not contenido or len(contenido.strip()) < 20:
                fallidos += 1
                continue
            vector = indexar_pdfs.embeber_texto(contenido)
            if not vector:
                fallidos += 1
                continue
            indexar_pdfs.guardar_embedding(con, ruta, vector)
            hechos += 1

            if n % 50 == 0:
                con.commit()
                transcurrido = time.time() - inicio
                ritmo = n / transcurrido if transcurrido else 0
                faltan = (len(pendientes) - n) / ritmo if ritmo else 0
                print(f"   {n}/{len(pendientes)}  ({ritmo:.1f} doc/s, faltan ~{faltan/60:.1f} min)")
    except KeyboardInterrupt:
        print("\n⏸️  Interrumpido. Lo vectorizado queda guardado; vuelve a correrlo para continuar.")
    finally:
        con.commit()
        con.close()

    total = time.time() - inicio
    print(f"\n✅ {hechos} documentos vectorizados en {total/60:.1f} min. {fallidos} sin texto suficiente/con error.")


if __name__ == "__main__":
    main()

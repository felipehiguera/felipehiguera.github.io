/**
 * Genera los archivos de prueba: portadas WebP, planos PDF y un GLB válido.
 * Todo marcado como PRUEBA. Nada de esto finge ser trabajo real.
 *
 * Uso: `node scripts/generar-pruebas.mjs` (requiere python3 + Pillow + PyMuPDF)
 * Salida: `seed/` (gitignored, solo vive para la carga inicial).
 */
import { execFileSync } from "node:child_process";

const PY = `import struct, math
from PIL import Image, ImageDraw, ImageFont
import fitz
import os

os.makedirs("seed", exist_ok=True)
FB = "C:/Windows/Fonts/arialbd.ttf"
FR = "C:/Windows/Fonts/arial.ttf"

def portada(nombre, titulo, sub):
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), "#f2f4f8")
    d = ImageDraw.Draw(img)
    for x in range(0, W, 24):
        d.line([(x, 0), (x, H)], fill="#dfe3ea")
    for y in range(0, H, 24):
        d.line([(0, y), (W, y)], fill="#dfe3ea")
    d.rectangle([40, 40, W-40, H-40], outline="#0f4c81", width=6)
    fT = ImageFont.truetype(FB, 64)
    fS = ImageFont.truetype(FR, 36)
    d.text((90, 200), titulo, font=fT, fill="#1b1e24")
    d.text((90, 300), sub, font=fS, fill="#0f4c81")
    d.text((90, 360), "IMAGEN DE PRUEBA - no es trabajo real", font=fS, fill="#b3261e")
    img.save(f"seed/{nombre}.webp", quality=82)
    print("portada", nombre)

def plano(nombre, titulo):
    doc = fitz.open()
    pg = doc.new_page(width=841, height=594)  # A4 apaisado en puntos
    pg.draw_rect(fitz.Rect(20, 20, 821, 574), color=(0.06, 0.3, 0.51), width=3)
    pg.draw_rect(fitz.Rect(521, 474, 801, 554), color=(0.06, 0.3, 0.51), width=1.5)
    pg.insert_text((40, 60), titulo, fontsize=26, color=(0.1, 0.11, 0.14))
    pg.insert_text((40, 90), "PLANO DE PRUEBA - sin validez técnica", fontsize=14, color=(0.7, 0.15, 0.11))
    # pieza de ejemplo: placa con taladro + cotas
    pg.draw_rect(fitz.Rect(120, 180, 420, 380), color=(0.06, 0.3, 0.51), width=2)
    pg.draw_circle(fitz.Point(270, 280), 60, color=(0.06, 0.3, 0.51), width=2)
    pg.draw_circle(fitz.Point(270, 280), 20, color=(0.06, 0.3, 0.51), width=2)
    pg.draw_line(fitz.Point(120, 420), fitz.Point(420, 420), color=(0.35, 0.38, 0.44), width=1)
    pg.insert_text((245, 445), "300 (ejemplo)", fontsize=12, color=(0.35, 0.38, 0.44))
    pg.draw_line(fitz.Point(460, 180), fitz.Point(460, 380), color=(0.35, 0.38, 0.44), width=1)
    pg.insert_text((470, 290), "200 (ejemplo)", fontsize=12, color=(0.35, 0.38, 0.44))
    for i, txt in enumerate(["Proyectó: PRUEBA", "Escala 1:5 (ficticia)", "Hoja 1/1"]):
        pg.insert_text((531, 494 + i * 20), txt, fontsize=11, color=(0.1, 0.11, 0.14))
    doc.save(f"seed/{nombre}.pdf")
    print("plano", nombre)

def glb_caja(nombre):
    # Caja 1x1x1 con normales: 24 vértices, 36 índices. Válido glTF 2.0.
    caras = [
        ([0,0,1],[1,0,1],[1,1,1],[0,1,1], [0,0,1]),
        ([1,0,0],[0,0,0],[0,1,0],[1,1,0], [0,0,-1]),
        ([1,0,1],[1,0,0],[1,1,0],[1,1,1], [1,0,0]),
        ([0,0,0],[0,0,1],[0,1,1],[0,1,0], [-1,0,0]),
        ([0,1,1],[1,1,1],[1,1,0],[0,1,0], [0,1,0]),
        ([0,0,0],[1,0,0],[1,0,1],[0,0,1], [0,-1,0]),
    ]
    pos, nor, idx = [], [], []
    for v0, v1, v2, v3, n in caras:
        base = len(pos)
        for v in (v0, v1, v2, v3):
            pos += [c - 0.5 for c in v]
            nor += n
        idx += [base, base+1, base+2, base, base+2, base+3]
    buf_pos = struct.pack("<%df" % len(pos), *pos)
    buf_nor = struct.pack("<%df" % len(nor), *nor)
    buf_idx = struct.pack("<%dH" % len(idx), *idx)
    binario = buf_pos + buf_nor + buf_idx
    import json as J
    gltf = {
        "asset": {"version": "2.0", "generator": "seed-prueba"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "CajaPrueba"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2}]}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 24, "type": "VEC3", "max": [0.5]*3, "min": [-0.5]*3},
            {"bufferView": 1, "componentType": 5126, "count": 24, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5123, "count": 36, "type": "SCALAR"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(buf_pos)},
            {"buffer": 0, "byteOffset": len(buf_pos), "byteLength": len(buf_nor)},
            {"buffer": 0, "byteOffset": len(buf_pos)+len(buf_nor), "byteLength": len(buf_idx)},
        ],
        "buffers": [{"byteLength": len(binario)}],
    }
    js = J.dumps(gltf, separators=(",", ":")).encode()
    while len(js) % 4: js += b" "
    while len(binario) % 4: binario += b"\\x00"
    total = 12 + 8 + len(js) + 8 + len(binario)
    out = struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(binario), 0x004E4942) + binario
    open(f"seed/{nombre}.glb", "wb").write(out)
    print("glb", nombre, len(out), "bytes")

portada("test-portada-planimetria", "Planimetría de prueba", "Dibujo técnico · vistas y cortes")
portada("test-portada-cnc", "Corte CNC de prueba", "CAD/CAM · mobiliario")
portada("test-portada-soporte", "Soporte de prueba", "Inventario de equipos")
plano("test-plano-lamina-01", "LÁMINA 01 - PLACA DE PRUEBA")
plano("test-plano-mueble-rta", "MUEBLE RTA - DESPIECE DE PRUEBA")
glb_caja("test-modelo-caja")
print("OK - 3 portadas, 2 planos, 1 glb")
`;

execFileSync("python3", ["-c", PY], { stdio: "inherit", cwd: process.cwd() });
